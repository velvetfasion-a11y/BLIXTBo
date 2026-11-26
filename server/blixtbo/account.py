"""Account deletion.

Stripe and Firebase run before the local rows are removed. A failure there leaves the database
unchanged. Firestore and the Firebase Auth user are removed after the database commit, and a
retry continues from the journal so a crash does not stop halfway.

Erasure anonymises the Stripe customer and keeps invoices and charges (bokföringslagen).
It does not call Customer.delete.
"""

import re

from sqlalchemy.orm import Session

from blixtbo.billing import is_stripe_secret_key
from blixtbo.config import settings
from blixtbo.models import Approval, AuditLog, DeletionJournal, Job, LandlordLogin, Notice, User, utcnow
from blixtbo.support_models import purge_support

CONFIRMATION = "RADERA"
RECENT_LOGIN_SECONDS = 5 * 60
SCOPES = ("account", "erasure", "links")
LINK_JOBS = ("store_session", "create_account", "renew")
_UID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_TOMBSTONE_DOMAIN = "@deleted.blixtbo.invalid"
_STRIPE_DOMAIN = "@anonymised.invalid"


class AccountError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def recent_enough(auth_time: int, now: float) -> bool:
    if auth_time <= 0:
        return False
    return now - float(auth_time) <= RECENT_LOGIN_SECONDS


def valid_uid(uid: str) -> bool:
    return bool(_UID.fullmatch(uid or ""))


def _personal_email(value: str) -> str:
    email = (value or "").strip().lower()
    if "@" not in email or email.endswith(_TOMBSTONE_DOMAIN) or email.endswith(_STRIPE_DOMAIN):
        return ""
    return email


def _load_stripe():
    import stripe

    return stripe


class StripeGateway:
    def __init__(self, client=None):
        self.client = client

    def _client(self):
        if not settings.stripe_secret_key:
            return None
        if not is_stripe_secret_key(settings.stripe_secret_key):
            raise AccountError(503, "Stripe-nyckeln är ogiltig.")
        stripe = self.client or _load_stripe()
        stripe.api_key = settings.stripe_secret_key
        return stripe

    def locate(self, uid: str, known_customer_id: str) -> dict:
        stripe = self._client()
        if stripe is None:
            return {"state": "skipped", "customerId": ""}
        try:
            customer_id = find_customer_id(stripe, uid, known_customer_id)
        except AccountError:
            raise
        except Exception:
            raise AccountError(502, "Stripe gick inte att nå. Inget annat är raderat.")
        if not customer_id:
            return {"state": "none", "customerId": ""}
        return {"state": "pending", "customerId": customer_id}

    def anonymise(self, customer_id: str) -> None:
        stripe = self._client()
        if stripe is None or not customer_id:
            return
        try:
            anonymise_customer(stripe, customer_id)
        except AccountError:
            raise
        except Exception:
            raise AccountError(502, "Stripe gick inte att anonymisera. Inget annat är raderat.")


class FirebaseGateway:
    def delete_user(self, uid: str) -> str:
        if not uid:
            return "absent"
        from firebase_admin import auth

        from blixtbo.firebase_app import init_firebase

        init_firebase()
        try:
            auth.delete_user(uid)
        except auth.UserNotFoundError:
            return "absent"
        return "deleted"

    def unlink_providers(self, uid: str) -> str:
        if not uid:
            return "absent"
        from firebase_admin import auth

        from blixtbo.firebase_app import init_firebase

        init_firebase()
        try:
            record = auth.get_user(uid)
        except auth.UserNotFoundError:
            return "absent"
        linked = {item.provider_id for item in record.provider_data}
        remove = [provider for provider in ("google.com", "apple.com") if provider in linked]
        if not remove:
            return "unchanged"
        auth.update_user(uid, providers_to_delete=remove)
        return "unlinked"


class FirestoreGateway:
    def _client(self):
        if settings.data_backend != "firestore":
            return None
        from blixtbo.firebase_app import firestore_client

        return firestore_client()

    def clear_account(self, uid: str) -> None:
        client = self._client()
        if client is None or not uid:
            return
        client.collection("users").document(uid).set(
            {"accountDeleted": True, "name": "", "email": "", "method": "deleted"},
            merge=True,
        )

    def purge_user(self, uid: str) -> None:
        client = self._client()
        if client is None or not uid:
            return
        _purge_ref(client.collection("users").document(uid))
        self.purge_credentials(uid)

    def purge_credentials(self, uid: str) -> None:
        client = self._client()
        if client is None or not uid:
            return
        _purge_ref(client.collection("credentials").document(uid))

    def delete_reviews(self, uid: str) -> None:
        from blixtbo.reviews import delete_firestore_reviews

        delete_firestore_reviews(uid)


def _purge_ref(ref) -> None:
    for collection in ref.collections():
        for snapshot in collection.stream():
            _purge_ref(snapshot.reference)
    ref.delete()


def find_customer_id(stripe, uid: str, known_customer_id: str) -> str:
    if known_customer_id:
        try:
            found = stripe.Customer.retrieve(known_customer_id)
        except Exception as exc:
            if _missing(exc):
                return ""
            raise
        raw = found if isinstance(found, dict) else found.to_dict()
        if raw.get("deleted"):
            return ""
        return known_customer_id
    found = stripe.Customer.search(query=f"metadata['firebaseUid']:'{uid}'", limit=1)
    data = found.data if hasattr(found, "data") else []
    if not data:
        return ""
    first = data[0]
    return first.id if hasattr(first, "id") else first["id"]


def _missing(exc: Exception) -> bool:
    code = getattr(exc, "code", "")
    return code == "resource_missing"


def anonymise_customer(stripe, customer_id: str) -> None:
    """Cancel subscriptions and strip the customer. Invoices and charges are not touched."""
    listed = stripe.Subscription.list(customer=customer_id, status="all", limit=100)
    for item in listed.data:
        raw = item if isinstance(item, dict) else item.to_dict()
        status = str(raw.get("status") or getattr(item, "status", "") or "")
        if status in ("canceled", "incomplete_expired"):
            continue
        sub_id = raw.get("id") or getattr(item, "id", "")
        stripe.Subscription.cancel(sub_id)
    for method_type in ("card", "link"):
        methods = stripe.PaymentMethod.list(customer=customer_id, type=method_type, limit=100)
        for method in methods.data:
            method_id = method.id if hasattr(method, "id") else method["id"]
            stripe.PaymentMethod.detach(method_id)
    stripe.Customer.modify(
        customer_id,
        name="Anonymiserad",
        email=f"deleted-{customer_id}{_STRIPE_DOMAIN}",
        phone="",
        description="Anonymiserad. Betalunderlag behålls enligt bokföringslagen.",
        metadata={"firebaseUid": "", "anonymised": "true"},
    )


def _commit(db: Session) -> None:
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def resolve_user(db: Session, uid: str, email: str) -> User | None:
    user = db.query(User).filter_by(firebase_uid=uid).one_or_none()
    if user is not None:
        return user
    journal = (
        db.query(DeletionJournal)
        .filter(DeletionJournal.firebase_uid == uid, DeletionJournal.user_id != "")
        .order_by(DeletionJournal.id.desc())
        .first()
    )
    if journal is not None:
        found = db.get(User, journal.user_id)
        if found is not None:
            return found
    personal = _personal_email(email)
    if not personal:
        return None
    return db.query(User).filter_by(email=personal).filter(User.auth_method != "deleted").one_or_none()


def _journal(db: Session, uid: str, scope: str, user: User | None, email: str) -> DeletionJournal:
    row = (
        db.query(DeletionJournal)
        .filter_by(firebase_uid=uid, scope=scope)
        .order_by(DeletionJournal.id.desc())
        .first()
    )
    if row is not None and row.phase == "finished" and user is not None and row.user_id and row.user_id != user.id:
        row = None
    if row is None:
        row = DeletionJournal(
            firebase_uid=uid,
            user_id=user.id if user is not None else "",
            scope=scope,
            prior_email=_personal_email(email) or _personal_email(user.email if user is not None else ""),
            phase="started",
        )
        db.add(row)
        _commit(db)
        return row
    if user is not None and not row.user_id:
        row.user_id = user.id
    if not row.prior_email:
        row.prior_email = _personal_email(email) or _personal_email(user.email if user is not None else "")
    _commit(db)
    return row


def _log_emails(db: Session, uid: str, token_email: str, user: User | None) -> set[str]:
    values = {_personal_email(token_email)}
    if user is not None:
        values.add(_personal_email(user.email))
    for row in db.query(DeletionJournal).filter_by(firebase_uid=uid):
        values.add(_personal_email(row.prior_email))
    values.discard("")
    return values


def _tombstone(user: User) -> None:
    user.email = f"deleted-{user.id}{_TOMBSTONE_DOMAIN}"
    user.name = ""
    user.google_sub = None
    user.firebase_uid = None
    user.dek_nonce = None
    user.dek_wrapped = None
    user.totp_secret = None
    user.auth_method = "deleted"
    user.deleted_at = utcnow()


def _delete_children(db: Session, user: User, *, jobs: str) -> None:
    db.query(LandlordLogin).filter_by(user_id=user.id).delete(synchronize_session=False)
    db.query(Approval).filter_by(user_id=user.id).delete(synchronize_session=False)
    query = db.query(Job).filter_by(user_id=user.id)
    if jobs == "links":
        query = query.filter(Job.kind.in_(LINK_JOBS))
    query.delete(synchronize_session=False)
    if jobs == "all":
        db.query(Notice).filter_by(user_id=user.id).delete(synchronize_session=False)


def _finish(journal: DeletionJournal) -> None:
    journal.phase = "finished"
    journal.finished_at = utcnow()


def _result(scope: str, *, stripe: str, firebase_auth: str, already: bool) -> dict:
    status = "unlinked" if scope == "links" else "deleted"
    return {"ok": True, "scope": scope, "status": status, "stripe": stripe, "firebaseAuth": firebase_auth, "already": already}


def run_deletion(db: Session, *, uid: str, email: str, scope: str, stripe: StripeGateway, firebase: FirebaseGateway, firestore: FirestoreGateway) -> dict:
    if scope not in SCOPES:
        raise AccountError(400, "Välj vad som ska raderas.")
    if not valid_uid(uid):
        raise AccountError(401, "Ogiltig inloggning.")
    user = resolve_user(db, uid, email)
    journal = _journal(db, uid, scope, user, email)
    if scope == "account" and journal.phase == "finished" and (user is None or user.auth_method == "deleted"):
        return _result(scope, stripe="unchanged", firebase_auth="unchanged", already=True)
    if scope == "erasure" and journal.phase == "finished" and user is None:
        return _result(scope, stripe="anonymised" if journal.stripe_customer_id else "none", firebase_auth="deleted", already=True)
    if scope == "account":
        return _delete_account(db, journal, user, uid, firestore)
    if scope == "links":
        return _unlink(db, journal, user, uid, firebase, firestore)
    return _erase(db, journal, user, uid, email, stripe, firebase, firestore)


def _delete_account(db: Session, journal: DeletionJournal, user: User | None, uid: str, firestore: FirestoreGateway) -> dict:
    # Reviews and the Firestore identity go first. If that fails, the Postgres account is still intact.
    from blixtbo.reviews import delete_sql_reviews

    firestore.delete_reviews(uid)
    firestore.clear_account(uid)
    delete_sql_reviews(db, user_id=user.id if user is not None else "", firebase_uid=uid)
    if user is not None and user.auth_method != "deleted":
        purge_support(db, user_id=user.id, firebase_uid=uid, emails={_personal_email(user.email)})
        _tombstone(user)
    else:
        purge_support(db, firebase_uid=uid)
    _finish(journal)
    _commit(db)
    return _result("account", stripe="unchanged", firebase_auth="unchanged", already=False)


def _unlink(db: Session, journal: DeletionJournal, user: User | None, uid: str, firebase: FirebaseGateway, firestore: FirestoreGateway) -> dict:
    # Provider unlink first. Landlord passwords stay until this succeeds.
    try:
        firebase_auth = firebase.unlink_providers(uid)
    except AccountError:
        raise
    except Exception:
        raise AccountError(502, "Google och Apple gick inte att koppla bort. Inget annat är raderat.")
    if user is not None:
        _delete_children(db, user, jobs="links")
        user.google_sub = None
    try:
        firestore.purge_credentials(uid)
    except Exception:
        _commit(db)
        journal.phase = "local_done"
        _commit(db)
        raise AccountError(502, "Hyresvärdarnas inloggning i databasen är borttagen. Molnkopian kunde inte raderas. Försök igen.")
    _finish(journal)
    _commit(db)
    return _result("links", stripe="unchanged", firebase_auth=firebase_auth, already=False)


def _erase(
    db: Session,
    journal: DeletionJournal,
    user: User | None,
    uid: str,
    email: str,
    stripe: StripeGateway,
    firebase: FirebaseGateway,
    firestore: FirestoreGateway,
) -> dict:
    # Stripe before the database. A retry after the database commit must not depend on Stripe,
    # and must not tell the user that nothing was removed.
    if journal.phase != "local_done":
        located = stripe.locate(uid, journal.stripe_customer_id)
        stripe_state = located["state"]
        if located["customerId"] and located["customerId"] != journal.stripe_customer_id:
            journal.stripe_customer_id = located["customerId"]
            _commit(db)
        if located["customerId"]:
            stripe.anonymise(located["customerId"])
            stripe_state = "anonymised"
        emails = _log_emails(db, uid, email, user)
        from blixtbo.reviews import delete_sql_reviews

        delete_sql_reviews(db, user_id=user.id if user is not None else "", firebase_uid=uid)
        purge_support(db, user_id=user.id if user is not None else "", firebase_uid=uid, emails=emails)
        if user is not None:
            _delete_children(db, user, jobs="all")
            if emails:
                db.query(AuditLog).filter(AuditLog.actor_email.in_(emails)).delete(synchronize_session=False)
            db.delete(user)
        elif emails:
            db.query(AuditLog).filter(AuditLog.actor_email.in_(emails)).delete(synchronize_session=False)
        db.query(DeletionJournal).filter_by(firebase_uid=uid).update({DeletionJournal.prior_email: ""}, synchronize_session=False)
        journal.phase = "local_done"
        _commit(db)
    else:
        purge_support(db, firebase_uid=uid)
        stripe_state = "anonymised" if journal.stripe_customer_id else "none"
    try:
        firestore.purge_user(uid)
    except Exception:
        raise AccountError(502, "Kontot i databasen är raderat. Molnkopian kunde inte raderas. Försök igen.")
    try:
        firebase_auth = firebase.delete_user(uid)
    except Exception:
        raise AccountError(502, "Uppgifterna är raderade. Firebase-kontot kunde inte tas bort. Försök igen.")
    _finish(journal)
    _commit(db)
    return _result("erasure", stripe=stripe_state, firebase_auth=firebase_auth, already=False)
