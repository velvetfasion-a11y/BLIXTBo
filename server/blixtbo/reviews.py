"""Reviews of Blixtbo, one per user and obtained apartment.

App data lives in Firestore (`DATA_BACKEND=firestore`), under
`users/{uid}/reviews/{applicationId}`. The API writes those documents with
the Admin SDK. Tests and a postgres-only process use the `reviews` table,
created by the same idempotent startup as the rest of the schema.

Nothing here emits schema.org Review or AggregateRating markup.
"""

import csv
import io
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from blixtbo.config import settings
from blixtbo.models import Review, User, utcnow

MAX_TEXT = 1000
MAX_LANDLORD = 200
_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,80}$")


class ReviewError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def parse_review(body: dict, application_id: str) -> dict:
    if not isinstance(body, dict):
        raise ReviewError(400, "Recensionen saknas.")
    rating = body.get("rating")
    if isinstance(rating, bool) or not isinstance(rating, int) or rating < 1 or rating > 5:
        raise ReviewError(400, "Betyget ska vara ett heltal från 1 till 5.")
    if "text" in body and body.get("text") is not None and not isinstance(body.get("text"), str):
        raise ReviewError(400, "Texten ska vara text.")
    text = str(body.get("text") or "").strip()
    if len(text) > MAX_TEXT:
        raise ReviewError(400, "Texten får vara högst 1000 tecken.")
    if "publishConsent" not in body or not isinstance(body.get("publishConsent"), bool):
        raise ReviewError(400, "Välj om recensionen får visas.")
    landlord_raw = body.get("landlord")
    if landlord_raw is not None and not isinstance(landlord_raw, str):
        raise ReviewError(400, "Hyresvärden ska vara text.")
    landlord = str(landlord_raw or "").strip()
    if len(landlord) > MAX_LANDLORD:
        raise ReviewError(400, "Hyresvärdens namn är för långt.")
    if not _ID.fullmatch(application_id or ""):
        raise ReviewError(400, "Lägenheten saknas.")
    body_application = body.get("applicationId")
    if body_application is not None and str(body_application) != application_id:
        raise ReviewError(400, "Lägenheten saknas.")
    listing_raw = body.get("listingId") or ""
    if listing_raw is None:
        listing_raw = ""
    if not isinstance(listing_raw, str) or (listing_raw and not _ID.fullmatch(listing_raw)):
        raise ReviewError(400, "Lägenheten saknas.")
    return {
        "application_id": application_id,
        "listing_id": listing_raw,
        "rating": rating,
        "text": text,
        "landlord": landlord,
        "publish_consent": bool(body["publishConsent"]),
    }


def application_id_from(body: dict) -> str:
    if not isinstance(body, dict):
        raise ReviewError(400, "Recensionen saknas.")
    return str(body.get("applicationId") or "")


def rating_filter(raw: str | None) -> int | None:
    if raw is None or raw == "":
        return None
    if not str(raw).isdigit():
        raise ReviewError(400, "Filtret ska vara ett betyg mellan 1 och 5.")
    value = int(raw)
    if value < 1 or value > 5:
        raise ReviewError(400, "Filtret ska vara ett betyg mellan 1 och 5.")
    return value


def google_review_url_for(rating: int) -> str:
    url = (settings.google_review_url or "").strip()
    if rating < 4 or not url:
        return ""
    if not (url.startswith("https://") or url.startswith("http://")):
        return ""
    return url


def _iso(value: datetime | None) -> str:
    if value is None:
        return utcnow().isoformat()
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _public(row: dict) -> dict:
    return {
        "id": row["id"],
        "applicationId": row["application_id"],
        "listingId": row.get("listing_id") or "",
        "rating": row["rating"],
        "text": row.get("text") or "",
        "landlord": row.get("landlord") or "",
        "publishConsent": bool(row.get("publish_consent")),
        "createdAt": row["created_at"],
    }


def _with_google(payload: dict, rating: int) -> dict:
    url = google_review_url_for(rating)
    if not url:
        return payload
    return {**payload, "googleReviewUrl": url}


def _summary(rows: list[dict], rating: int | None) -> dict:
    counts = {str(star): 0 for star in range(1, 6)}
    for row in rows:
        key = str(row["rating"])
        if key in counts:
            counts[key] += 1
    total = len(rows)
    average = round(sum(row["rating"] for row in rows) / total, 2) if total else None
    visible = [row for row in rows if rating is None or row["rating"] == rating]
    return {
        "average": average,
        "count": total,
        "distribution": counts,
        "reviews": [
            {
                **_public(row),
                "email": row.get("email") or "",
            }
            for row in visible
        ],
    }


def _csv_cell(value: str) -> str:
    if value[:1] in ("=", "+", "-", "@"):
        return "'" + value
    return value


def reviews_csv(rows: list[dict]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Datum", "Betyg", "Text", "Hyresvärd", "Samtycke", "E-post"])
    for row in rows:
        public = _public(row)
        writer.writerow(
            [
                _csv_cell(public["createdAt"]),
                public["rating"],
                _csv_cell(public["text"]),
                _csv_cell(public["landlord"]),
                "ja" if public["publishConsent"] else "nej",
                _csv_cell(row.get("email") or ""),
            ]
        )
    return "\ufeff" + buffer.getvalue()


class SqlReviewStore:
    def __init__(self, db: Session):
        self.db = db

    def create(self, user: User, fields: dict) -> dict:
        self._listing_free(user.id, fields["listing_id"], "")
        row = Review(
            id=str(uuid.uuid4()),
            user_id=user.id,
            firebase_uid=user.firebase_uid or "",
            application_id=fields["application_id"],
            listing_id=fields["listing_id"],
            rating=fields["rating"],
            text=fields["text"],
            landlord=fields["landlord"],
            publish_consent=fields["publish_consent"],
        )
        self.db.add(row)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise ReviewError(409, "Du har redan lämnat en recension för den här lägenheten.")
        self.db.refresh(row)
        return self._row(row, user.email)

    def update(self, user: User, application_id: str, fields: dict) -> dict:
        row = self.db.query(Review).filter_by(user_id=user.id, application_id=application_id).one_or_none()
        if row is None:
            raise ReviewError(404, "Recensionen saknas.")
        self._listing_free(user.id, fields["listing_id"], application_id)
        row.listing_id = fields["listing_id"]
        row.rating = fields["rating"]
        row.text = fields["text"]
        row.landlord = fields["landlord"]
        row.publish_consent = fields["publish_consent"]
        row.firebase_uid = user.firebase_uid or row.firebase_uid
        row.updated_at = utcnow()
        self.db.commit()
        self.db.refresh(row)
        return self._row(row, user.email)

    def list_mine(self, user: User) -> list[dict]:
        rows = self.db.query(Review).filter_by(user_id=user.id).order_by(Review.created_at.desc()).all()
        return [_public(self._row(row, user.email)) for row in rows]

    def admin(self, rating: int | None) -> dict:
        found = self.db.query(Review, User).join(User, Review.user_id == User.id).order_by(Review.created_at.desc()).all()
        rows = [self._row(review, user.email) for review, user in found]
        return _summary(rows, rating)

    def _listing_free(self, user_id: str, listing_id: str, application_id: str) -> None:
        if not listing_id:
            return
        query = self.db.query(Review).filter_by(user_id=user_id, listing_id=listing_id)
        if application_id:
            query = query.filter(Review.application_id != application_id)
        if query.first() is not None:
            raise ReviewError(409, "Du har redan lämnat en recension för den här lägenheten.")

    def _row(self, row: Review, email: str) -> dict:
        return {
            "id": row.id,
            "application_id": row.application_id,
            "listing_id": row.listing_id or "",
            "rating": row.rating,
            "text": row.text or "",
            "landlord": row.landlord or "",
            "publish_consent": bool(row.publish_consent),
            "created_at": _iso(row.created_at),
            "email": email,
        }


class FirestoreReviewStore:
    def __init__(self, client=None):
        if client is None:
            from blixtbo.firebase_app import firestore_client

            client = firestore_client()
        self.client = client

    def create(self, user: User, fields: dict) -> dict:
        uid = self._uid(user)
        self._listing_free(uid, fields["listing_id"], "")
        ref = self._ref(uid, fields["application_id"])
        snap = ref.get()
        if getattr(snap, "exists", False):
            raise ReviewError(409, "Du har redan lämnat en recension för den här lägenheten.")
        created = utcnow().isoformat()
        payload = self._payload(user, fields, created)
        ref.set(payload)
        return self._from_payload(payload)

    def update(self, user: User, application_id: str, fields: dict) -> dict:
        uid = self._uid(user)
        ref = self._ref(uid, application_id)
        snap = ref.get()
        if not getattr(snap, "exists", False):
            raise ReviewError(404, "Recensionen saknas.")
        current = snap.to_dict() or {}
        self._listing_free(uid, fields["listing_id"], application_id)
        created = str(current.get("createdAt") or utcnow().isoformat())
        payload = self._payload(user, fields, created)
        ref.set(payload)
        return self._from_payload(payload)

    def list_mine(self, user: User) -> list[dict]:
        uid = self._uid(user)
        rows = []
        for snap in self.client.collection("users").document(uid).collection("reviews").stream():
            data = snap.to_dict() or {}
            if data.get("applicationId"):
                rows.append(self._from_payload(data))
        rows.sort(key=lambda item: item["created_at"], reverse=True)
        return [_public(row) for row in rows]

    def admin(self, rating: int | None) -> dict:
        rows = []
        for snap in self.client.collection_group("reviews").stream():
            data = snap.to_dict() or {}
            if "rating" not in data or not data.get("applicationId"):
                continue
            rows.append(self._from_payload(data))
        rows.sort(key=lambda item: item["created_at"], reverse=True)
        return _summary(rows, rating)

    def _uid(self, user: User) -> str:
        uid = user.firebase_uid or ""
        if not uid:
            raise ReviewError(401, "Ogiltig inloggning.")
        return uid

    def _ref(self, uid: str, application_id: str):
        return self.client.collection("users").document(uid).collection("reviews").document(application_id)

    def _listing_free(self, uid: str, listing_id: str, application_id: str) -> None:
        if not listing_id:
            return
        for snap in self.client.collection("users").document(uid).collection("reviews").stream():
            data = snap.to_dict() or {}
            if data.get("listingId") == listing_id and data.get("applicationId") != application_id:
                raise ReviewError(409, "Du har redan lämnat en recension för den här lägenheten.")

    def _payload(self, user: User, fields: dict, created: str) -> dict:
        return {
            "id": fields["application_id"],
            "userId": user.firebase_uid or "",
            "applicationId": fields["application_id"],
            "listingId": fields["listing_id"],
            "rating": fields["rating"],
            "text": fields["text"],
            "landlord": fields["landlord"],
            "publishConsent": fields["publish_consent"],
            "createdAt": created,
            "email": user.email,
        }

    def _from_payload(self, data: dict) -> dict:
        return {
            "id": str(data.get("id") or data.get("applicationId") or ""),
            "application_id": str(data.get("applicationId") or ""),
            "listing_id": str(data.get("listingId") or ""),
            "rating": int(data.get("rating") or 0),
            "text": str(data.get("text") or ""),
            "landlord": str(data.get("landlord") or ""),
            "publish_consent": bool(data.get("publishConsent")),
            "created_at": str(data.get("createdAt") or ""),
            "email": str(data.get("email") or ""),
        }


def store_for(db: Session, client=None):
    if settings.data_backend == "firestore":
        return FirestoreReviewStore(client)
    return SqlReviewStore(db)


def create_review(db: Session, user: User, body: dict, client=None) -> dict:
    fields = parse_review(body, application_id_from(body))
    saved = store_for(db, client).create(user, fields)
    return _with_google(_public(saved), fields["rating"])


def update_review(db: Session, user: User, application_id: str, body: dict, client=None) -> dict:
    fields = parse_review(body or {}, application_id)
    saved = store_for(db, client).update(user, application_id, fields)
    return _with_google(_public(saved), fields["rating"])


def list_my_reviews(db: Session, user: User, client=None) -> list[dict]:
    return store_for(db, client).list_mine(user)


def admin_reviews(db: Session, rating: str | None, client=None) -> dict:
    return store_for(db, client).admin(rating_filter(rating))


def admin_reviews_csv(db: Session, rating: str | None, client=None) -> str:
    payload = admin_reviews(db, rating, client)
    rows = []
    for item in payload["reviews"]:
        rows.append(
            {
                "id": item["id"],
                "application_id": item["applicationId"],
                "listing_id": item["listingId"],
                "rating": item["rating"],
                "text": item["text"],
                "landlord": item["landlord"],
                "publish_consent": item["publishConsent"],
                "created_at": item["createdAt"],
                "email": item["email"],
            }
        )
    return reviews_csv(rows)


def delete_sql_reviews(db: Session, *, user_id: str, firebase_uid: str) -> None:
    if user_id:
        db.query(Review).filter(Review.user_id == user_id).delete(synchronize_session=False)
    if firebase_uid:
        db.query(Review).filter(Review.firebase_uid == firebase_uid).delete(synchronize_session=False)


def delete_firestore_reviews(uid: str, client=None) -> None:
    if not uid or settings.data_backend != "firestore":
        return
    if client is None:
        from blixtbo.firebase_app import firestore_client

        client = firestore_client()
    for snap in client.collection("users").document(uid).collection("reviews").stream():
        snap.reference.delete()
