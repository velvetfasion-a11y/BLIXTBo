import os
import time

os.environ["DATABASE_URL"] = "sqlite:////tmp/blixtbo-account-test.db"
os.environ["STRIPE_SECRET_KEY"] = "sk_test_account"
os.environ["DATA_BACKEND"] = "postgres"
os.environ["FIREBASE_PROJECT_ID"] = "blixtbo-test"

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from blixtbo.account import AccountError, anonymise_customer, recent_enough, run_deletion
from blixtbo.config import settings
from blixtbo.models import Approval, AuditLog, Base, DeletionJournal, Job, LandlordLogin, Notice, User

settings.database_url = os.environ["DATABASE_URL"]
settings.stripe_secret_key = "sk_test_account"
settings.data_backend = "postgres"
settings.firebase_project_id = "blixtbo-test"

_DB_PATH = "/tmp/blixtbo-account-unit.db"
if os.path.exists(_DB_PATH):
    os.remove(_DB_PATH)
engine = create_engine(f"sqlite:///{_DB_PATH}", connect_args={"check_same_thread": False})
Base.metadata.create_all(engine)
Session = sessionmaker(engine, expire_on_commit=False)


class Row:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)

    def to_dict(self):
        return dict(self.__dict__)


class Page:
    def __init__(self, data):
        self.data = data


class StripeFake:
    def __init__(self, fail=False):
        self.fail = fail
        self.calls = []
        self.customer_id = "cus_1"
        self.subs = [{"id": "sub_1", "status": "active"}]
        self.cards = [{"id": "pm_1"}]
        self.Subscription = self._Subs(self)
        self.PaymentMethod = self._Methods(self)
        self.Customer = self._Customers(self)
        self.Invoice = self._Invoices()

    class _Subs:
        def __init__(self, owner):
            self.owner = owner

        def list(self, **kwargs):
            self.owner.calls.append(("Subscription.list", kwargs))
            return Page([Row(**item) for item in self.owner.subs])

        def cancel(self, sub_id):
            self.owner.calls.append(("Subscription.cancel", sub_id))
            for item in self.owner.subs:
                if item["id"] == sub_id:
                    item["status"] = "canceled"

    class _Methods:
        def __init__(self, owner):
            self.owner = owner

        def list(self, **kwargs):
            self.owner.calls.append(("PaymentMethod.list", kwargs.get("type")))
            rows = self.owner.cards if kwargs.get("type") == "card" else []
            return Page([Row(id=item["id"]) for item in rows])

        def detach(self, method_id):
            self.owner.calls.append(("PaymentMethod.detach", method_id))
            self.owner.cards = [item for item in self.owner.cards if item["id"] != method_id]

    class _Customers:
        def __init__(self, owner):
            self.owner = owner

        def search(self, **kwargs):
            self.owner.calls.append(("Customer.search", kwargs["query"]))
            return Page([Row(id=self.owner.customer_id)])

        def retrieve(self, customer_id):
            self.owner.calls.append(("Customer.retrieve", customer_id))
            return {"id": customer_id, "deleted": False}

        def modify(self, customer_id, **kwargs):
            self.owner.calls.append(("Customer.modify", customer_id, kwargs))
            if self.owner.fail:
                raise RuntimeError("stripe down")

        def delete(self, customer_id):
            raise AssertionError("the customer is anonymised, not deleted")

    class _Invoices:
        def delete(self, *args, **kwargs):
            raise AssertionError("payment records stay")

        def void_invoice(self, *args, **kwargs):
            raise AssertionError("payment records stay")


class Gateway:
    def __init__(self, client=None, fail_delete=False, fail_unlink=False, fail_firestore=False, fail_clear=False):
        self.client = client or StripeFake()
        self.fail_delete = fail_delete
        self.fail_unlink = fail_unlink
        self.fail_firestore = fail_firestore
        self.fail_clear = fail_clear
        self.log = []

    def locate(self, uid, known):
        from blixtbo.account import StripeGateway

        return StripeGateway(self.client).locate(uid, known)

    def anonymise(self, customer_id):
        from blixtbo.account import StripeGateway

        StripeGateway(self.client).anonymise(customer_id)
        self.log.append("stripe")

    def delete_user(self, uid):
        self.log.append("auth-delete")
        if self.fail_delete:
            raise RuntimeError("firebase down")
        return "deleted"

    def unlink_providers(self, uid):
        self.log.append("unlink")
        if self.fail_unlink:
            raise RuntimeError("unlink down")
        return "unlinked"

    def clear_account(self, uid):
        self.log.append("clear")
        if self.fail_clear:
            raise RuntimeError("firestore down")

    def purge_user(self, uid):
        self.log.append(("purge", uid))
        if self.fail_firestore:
            raise RuntimeError("firestore down")

    def purge_credentials(self, uid):
        self.log.append(("credentials", uid))
        if self.fail_firestore:
            raise RuntimeError("firestore down")


def _db():
    return Session()


def _user(db, uid="uid-1", email="anna@example.com"):
    user = User(email=email, name="Anna Lindström", auth_method="google", firebase_uid=uid, google_sub=f"google-{uid}")
    db.add(user)
    db.commit()
    return user


def _rows(db, user):
    db.add(LandlordLogin(user_id=user.id, source_id="homeq", username="anna@homeq.se", secret_ciphertext=b"secret"))
    db.add(Approval(user_id=user.id, source_id="homeq", method="google", purpose="create_account"))
    db.add(Job(user_id=user.id, source_id="homeq", kind="store_session", payload='{"cookie":"sess"}'))
    db.add(Job(user_id=user.id, source_id="homeq", kind="apply", payload="{}"))
    db.add(Notice(user_id=user.id, kind="listing", title="Ny bostad", body="Blekingegatan"))
    db.add(AuditLog(actor_email=user.email, action="login", target=user.id))
    db.commit()


def _run(db, scope, uid="uid-1", email="anna@example.com", gateway=None):
    gateway = gateway or Gateway()
    result = run_deletion(db, uid=uid, email=email, scope=scope, stripe=gateway, firebase=gateway, firestore=gateway)
    return result, gateway


def test_recent_login_window_is_five_minutes():
    now = 1_700_000_000
    assert recent_enough(now - 60, now) is True
    assert recent_enough(now - 5 * 60, now) is True
    assert recent_enough(now - 5 * 60 - 1, now) is False
    assert recent_enough(0, now) is False


def test_anonymise_cancels_and_keeps_payment_records():
    stripe = StripeFake()
    anonymise_customer(stripe, "cus_1")
    anonymise_customer(stripe, "cus_1")
    names = [call[0] for call in stripe.calls]
    assert names.count("Subscription.cancel") == 1
    assert "Customer.delete" not in names
    modify = [call for call in stripe.calls if call[0] == "Customer.modify"][-1]
    assert modify[2]["metadata"]["firebaseUid"] == ""
    assert modify[2]["metadata"]["anonymised"] == "true"
    assert modify[2]["email"].endswith("@anonymised.invalid")
    assert "Invoice" not in names


def test_account_delete_closes_sign_in_and_keeps_the_rest():
    db = _db()
    user = _user(db, uid="uid-account", email="account@example.com")
    _rows(db, user)
    result, gateway = _run(db, "account", uid="uid-account", email="account@example.com")
    assert result["status"] == "deleted"
    assert result["firebaseAuth"] == "unchanged"
    assert "stripe" not in gateway.log
    assert "auth-delete" not in gateway.log
    db.expire_all()
    saved = db.get(User, user.id)
    assert saved.auth_method == "deleted"
    assert saved.firebase_uid is None
    assert saved.name == ""
    assert saved.email.endswith("@deleted.blixtbo.invalid")
    assert saved.deleted_at is not None
    assert db.query(LandlordLogin).filter_by(user_id=user.id).count() == 1
    assert db.query(Notice).filter_by(user_id=user.id).count() == 1
    assert db.query(AuditLog).filter_by(actor_email="account@example.com").count() == 1
    assert "clear" in gateway.log
    again, _ = _run(db, "account", uid="uid-account", email="account@example.com")
    assert again["already"] is True


def test_account_delete_stops_when_firestore_fails():
    db = _db()
    user = _user(db, uid="uid-clear", email="clear@example.com")
    gateway = Gateway(fail_clear=True)
    try:
        _run(db, "account", uid="uid-clear", email="clear@example.com", gateway=gateway)
        raise AssertionError("expected failure")
    except RuntimeError:
        pass
    db.expire_all()
    saved = db.get(User, user.id)
    assert saved.auth_method == "google"
    assert saved.firebase_uid == "uid-clear"
    assert saved.name == "Anna Lindström"


def test_erasure_removes_personal_data_and_anonymises_stripe():
    db = _db()
    user = _user(db, uid="uid-erase", email="erase@example.com")
    _rows(db, user)
    result, gateway = _run(db, "erasure", uid="uid-erase", email="erase@example.com")
    assert result["stripe"] == "anonymised"
    assert result["firebaseAuth"] == "deleted"
    assert gateway.log[0] == "stripe"
    assert ("purge", "uid-erase") in gateway.log
    assert gateway.log[-1] == "auth-delete"
    db.expire_all()
    assert db.get(User, user.id) is None
    assert db.query(LandlordLogin).filter_by(user_id=user.id).count() == 0
    assert db.query(Notice).filter_by(user_id=user.id).count() == 0
    assert db.query(Job).filter_by(user_id=user.id).count() == 0
    assert db.query(Approval).filter_by(user_id=user.id).count() == 0
    assert db.query(AuditLog).filter_by(actor_email="erase@example.com").count() == 0
    assert "Customer.delete" not in [call[0] for call in gateway.client.calls]
    again, gateway_again = _run(db, "erasure", uid="uid-erase", email="erase@example.com", gateway=Gateway(client=gateway.client))
    assert again["already"] is True
    assert gateway_again.log == []


def test_stripe_failure_leaves_the_database_unchanged():
    db = _db()
    user = _user(db, uid="uid-stripe", email="stripe@example.com")
    _rows(db, user)
    gateway = Gateway()
    gateway.client.fail = True
    try:
        _run(db, "erasure", uid="uid-stripe", email="stripe@example.com", gateway=gateway)
        raise AssertionError("expected failure")
    except AccountError as exc:
        assert exc.status == 502
    db.expire_all()
    assert db.get(User, user.id) is not None
    assert db.query(LandlordLogin).filter_by(user_id=user.id).count() == 1
    assert db.query(AuditLog).filter_by(actor_email="stripe@example.com").count() == 1
    assert "auth-delete" not in gateway.log
    assert "purge" not in [item[0] if isinstance(item, tuple) else item for item in gateway.log]


def test_firestore_failure_can_be_retried_without_calling_stripe_again():
    db = _db()
    user = _user(db, uid="uid-retry", email="retry@example.com")
    _rows(db, user)
    failing = Gateway(fail_firestore=True)
    try:
        _run(db, "erasure", uid="uid-retry", email="retry@example.com", gateway=failing)
        raise AssertionError("expected failure")
    except AccountError:
        pass
    db.expire_all()
    assert db.get(User, user.id) is None
    stripe_calls = len(failing.client.calls)
    healed = Gateway(client=failing.client)
    result, _ = _run(db, "erasure", uid="uid-retry", email="retry@example.com", gateway=healed)
    assert result["ok"] is True
    assert result["firebaseAuth"] == "deleted"
    assert len(failing.client.calls) == stripe_calls
    assert healed.log == [("purge", "uid-retry"), "auth-delete"]


def test_erasure_after_account_delete_still_removes_logs():
    db = _db()
    user = _user(db, uid="uid-both", email="both@example.com")
    _rows(db, user)
    _run(db, "account", uid="uid-both", email="both@example.com")
    assert db.query(AuditLog).filter_by(actor_email="both@example.com").count() == 1
    _run(db, "erasure", uid="uid-both", email="both@example.com")
    db.expire_all()
    assert db.get(User, user.id) is None
    assert db.query(LandlordLogin).filter_by(user_id=user.id).count() == 0
    assert db.query(AuditLog).filter_by(actor_email="both@example.com").count() == 0
    assert db.query(DeletionJournal).filter(DeletionJournal.firebase_uid == "uid-both", DeletionJournal.prior_email != "").count() == 0


def test_links_remove_landlord_logins_and_providers_only():
    db = _db()
    user = _user(db, uid="uid-links", email="links@example.com")
    _rows(db, user)
    result, gateway = _run(db, "links", uid="uid-links", email="links@example.com")
    assert result["status"] == "unlinked"
    assert result["firebaseAuth"] == "unlinked"
    assert "auth-delete" not in gateway.log
    assert "stripe" not in gateway.log
    db.expire_all()
    saved = db.get(User, user.id)
    assert saved.auth_method == "google"
    assert saved.name == "Anna Lindström"
    assert saved.google_sub is None
    assert db.query(LandlordLogin).filter_by(user_id=user.id).count() == 0
    assert db.query(Job).filter_by(user_id=user.id, kind="store_session").count() == 0
    assert db.query(Job).filter_by(user_id=user.id, kind="apply").count() == 1
    assert db.query(Notice).filter_by(user_id=user.id).count() == 1
    assert db.query(AuditLog).filter_by(actor_email="links@example.com").count() == 1
    assert ("credentials", "uid-links") in gateway.log


def test_unlink_failure_keeps_landlord_logins():
    db = _db()
    user = _user(db, uid="uid-unlink", email="unlink@example.com")
    _rows(db, user)
    gateway = Gateway(fail_unlink=True)
    try:
        _run(db, "links", uid="uid-unlink", email="unlink@example.com", gateway=gateway)
        raise AssertionError("expected failure")
    except AccountError:
        pass
    assert db.query(LandlordLogin).filter_by(user_id=user.id).count() == 1
    assert db.get(User, user.id).google_sub == "google-uid-unlink"


def test_live_stripe_key_is_refused_before_deletion():
    db = _db()
    user = _user(db, uid="uid-live", email="live@example.com")
    _rows(db, user)
    settings.stripe_secret_key = "sk_live_no"
    gateway = Gateway()
    try:
        _run(db, "erasure", uid="uid-live", email="live@example.com", gateway=gateway)
        raise AssertionError("expected failure")
    except AccountError as exc:
        assert exc.status == 503
    finally:
        settings.stripe_secret_key = "sk_test_account"
    assert db.get(User, user.id) is not None
    assert db.query(LandlordLogin).filter_by(user_id=user.id).count() == 1
    assert gateway.client.calls == []


def test_missing_stripe_key_still_erases_local_data():
    db = _db()
    user = _user(db, uid="uid-nokey", email="nokey@example.com")
    settings.stripe_secret_key = ""
    try:
        result, gateway = _run(db, "erasure", uid="uid-nokey", email="nokey@example.com")
    finally:
        settings.stripe_secret_key = "sk_test_account"
    assert result["stripe"] == "skipped"
    assert db.get(User, user.id) is None
    assert gateway.client.calls == []


def test_http_requires_token_confirmation_and_recent_login(monkeypatch):
    from fastapi.testclient import TestClient

    from blixtbo.main import app, build_gateways, get_db

    db = _db()

    def override():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override
    monkeypatch.setattr("blixtbo.firebase_app.verify_id_token", lambda token: {"uid": "uid-http", "email": "http@example.com", "auth_time": int(time.time())})
    monkeypatch.setattr("blixtbo.main.build_gateways", lambda: (Gateway(), Gateway(), Gateway()))
    client = TestClient(app)
    missing = client.post("/account/delete", json={"scope": "account", "confirm": "RADERA"})
    assert missing.status_code == 401
    wrong = client.post(
        "/account/delete",
        json={"scope": "account", "confirm": "radera"},
        headers={"Authorization": "Bearer token"},
    )
    assert wrong.status_code == 400
    monkeypatch.setattr(
        "blixtbo.firebase_app.verify_id_token",
        lambda token: {"uid": "uid-http", "email": "http@example.com", "auth_time": int(time.time()) - 600},
    )
    stale = client.post(
        "/account/delete",
        json={"scope": "links", "confirm": "RADERA"},
        headers={"Authorization": "Bearer token"},
    )
    assert stale.status_code == 401
    assert stale.json()["detail"] == "recent-login-required"
    app.dependency_overrides.clear()
    assert build_gateways


def test_http_cancel_is_idempotent_and_resume_clears_it(monkeypatch):
    from fastapi.testclient import TestClient

    from blixtbo.main import app, get_db

    db = _db()

    def override():
        try:
            yield db
        finally:
            pass

    class BillingStripe:
        def __init__(self):
            self.modifies = []
            self.cancels = []
            self.sub = {
                "id": "sub_1",
                "customer": "cus_1",
                "status": "active",
                "cancel_at_period_end": False,
                "pause_collection": None,
                "current_period_end": 1_800_000_000,
                "metadata": {"firebaseUid": "uid-bill"},
            }

        def search(self, **kwargs):
            return Page([Row(id="cus_1")])

        def list(self, **kwargs):
            owner = self

            class Listed:
                def to_dict(self):
                    return dict(owner.sub)

            return Page([Listed()])

        def modify(self, sub_id, **params):
            self.modifies.append(params)
            self.sub.update(params)
            if params.get("pause_collection") == "":
                self.sub["pause_collection"] = None
            return dict(self.sub)

        def cancel(self, sub_id):
            self.cancels.append(sub_id)

    stripe = BillingStripe()
    stripe.Customer = stripe
    stripe.Subscription = stripe
    app.dependency_overrides[get_db] = override
    monkeypatch.setattr(
        "blixtbo.firebase_app.verify_id_token",
        lambda token: {"uid": "uid-bill", "email": "bill@example.com", "auth_time": int(time.time())},
    )
    monkeypatch.setattr("blixtbo.main._stripe", lambda: stripe)
    client = TestClient(app)
    denied = client.post("/billing/cancel")
    assert denied.status_code == 401
    headers = {"Authorization": "Bearer token"}
    first = client.post("/billing/cancel", headers=headers)
    assert first.status_code == 200
    body = first.json()
    assert body["status"] == "active"
    assert body["cancelAtPeriodEnd"] is True
    assert body["plan"] == "premium"
    assert body["currentPeriodEnd"]
    second = client.post("/billing/cancel", headers=headers)
    assert second.status_code == 200
    assert second.json()["cancelAtPeriodEnd"] is True
    assert len(stripe.modifies) == 1
    assert stripe.cancels == []
    current = client.get("/billing/subscription", headers=headers)
    assert current.json()["cancelAtPeriodEnd"] is True
    resumed = client.post("/billing/resume", headers=headers)
    assert resumed.status_code == 200
    assert resumed.json()["cancelAtPeriodEnd"] is False
    assert resumed.json()["status"] == "active"
    app.dependency_overrides.clear()
