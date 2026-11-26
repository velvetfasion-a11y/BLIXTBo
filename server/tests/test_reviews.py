import os
import uuid

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("DATA_BACKEND", "postgres")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from blixtbo.account import FirestoreGateway, run_deletion
from blixtbo.config import settings
from blixtbo.main import app, get_db
from blixtbo.models import Base, Review, User


def _body(**extra):
    payload = {
        "applicationId": "app-1",
        "listingId": "listing-1",
        "rating": 5,
        "text": "Blixtbo hann före.",
        "landlord": "Exempelvärd",
        "publishConsent": True,
    }
    payload.update(extra)
    return payload


class MemoryDoc:
    def __init__(self, bucket, key):
        self.bucket = bucket
        self.key = key

    def collection(self, name):
        return MemoryCollection(self.bucket, f"{self.key}/{name}")

    def get(self):
        return MemorySnap(self.bucket, self.key, self.bucket.get(self.key))

    def set(self, data, merge=False):
        if merge and self.key in self.bucket:
            merged = dict(self.bucket[self.key])
            merged.update(data)
            self.bucket[self.key] = merged
            return
        self.bucket[self.key] = dict(data)

    def delete(self):
        self.bucket.pop(self.key, None)


class MemorySnap:
    def __init__(self, bucket, key, data):
        self.bucket = bucket
        self.key = key
        self._data = data
        self.id = key.split("/")[-1]
        self.reference = MemoryDoc(bucket, key)

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return dict(self._data or {})


class MemoryCollection:
    def __init__(self, bucket, prefix):
        self.bucket = bucket
        self.prefix = prefix

    def document(self, doc_id):
        return MemoryDoc(self.bucket, f"{self.prefix}/{doc_id}")

    def stream(self):
        snaps = []
        prefix = self.prefix + "/"
        for key, data in list(self.bucket.items()):
            if not key.startswith(prefix):
                continue
            rest = key[len(prefix) :]
            if "/" in rest:
                continue
            snaps.append(MemorySnap(self.bucket, key, data))
        return snaps


class MemoryClient:
    def __init__(self):
        self.bucket = {}

    def collection(self, name):
        return MemoryCollection(self.bucket, name)

    def collection_group(self, name):
        bucket = self.bucket

        class Group:
            def stream(_self):
                snaps = []
                for key, data in list(bucket.items()):
                    parts = key.split("/")
                    if len(parts) >= 2 and parts[-2] == name:
                        snaps.append(MemorySnap(bucket, key, data))
                return snaps

        return Group()


class Gateway:
    def __init__(self):
        self.log = []

    def locate(self, uid, known):
        return {"state": "skipped", "customerId": ""}

    def anonymise(self, customer_id):
        self.log.append("stripe")

    def delete_user(self, uid):
        self.log.append("auth-delete")
        return "deleted"

    def unlink_providers(self, uid):
        return "unlinked"

    def clear_account(self, uid):
        self.log.append("clear")

    def purge_user(self, uid):
        self.log.append(("purge", uid))

    def purge_credentials(self, uid):
        pass

    def delete_reviews(self, uid):
        self.log.append(("reviews", uid))


def _open(monkeypatch):
    path = f"/tmp/blixtbo-reviews-{uuid.uuid4().hex}.db"
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    db = sessionmaker(engine, expire_on_commit=False)()
    saved = {
        "firebase_project_id": settings.firebase_project_id,
        "data_backend": settings.data_backend,
        "google_review_url": settings.google_review_url,
        "owner_google_email": settings.owner_google_email,
        "stripe_secret_key": settings.stripe_secret_key,
    }
    settings.firebase_project_id = "blixtbo-test"
    settings.data_backend = "postgres"
    settings.google_review_url = ""
    settings.owner_google_email = "owner@example.com"
    settings.stripe_secret_key = ""

    def override():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override
    people = {
        "user": {"uid": "uid-user", "email": "user@example.com", "name": "Sara"},
        "owner": {"uid": "uid-owner", "email": "owner@example.com", "name": "Olivia"},
        "other": {"uid": "uid-other", "email": "other@example.com", "name": "Nils"},
    }
    monkeypatch.setattr("blixtbo.firebase_app.verify_id_token", lambda token: people[token])

    def close():
        app.dependency_overrides.clear()
        for key, value in saved.items():
            setattr(settings, key, value)
        db.close()
        engine.dispose()
        if os.path.exists(path):
            os.remove(path)

    return TestClient(app), db, close


def test_create_update_validation_admin_and_deletion(monkeypatch):
    client, db, close = _open(monkeypatch)
    try:
        missing = client.post("/reviews", json=_body())
        assert missing.status_code == 401

        headers = {"Authorization": "Bearer user"}
        bad_rating = client.post("/reviews", json=_body(rating="5"), headers=headers)
        assert bad_rating.status_code == 400
        assert "1 till 5" in bad_rating.json()["detail"]
        assert client.post("/reviews", json=_body(rating=True), headers=headers).status_code == 400
        assert client.post("/reviews", json=_body(rating=0), headers=headers).status_code == 400
        assert client.post("/reviews", json=_body(rating=6), headers=headers).status_code == 400
        assert client.post("/reviews", json=_body(text="x" * 1001), headers=headers).status_code == 400
        assert client.post("/reviews", json=_body(publishConsent="ja"), headers=headers).status_code == 400
        no_consent = dict(_body())
        del no_consent["publishConsent"]
        assert client.post("/reviews", json=no_consent, headers=headers).status_code == 400

        created = client.post("/reviews", json=_body(text="x" * 1000, publishConsent=False), headers=headers)
        assert created.status_code == 200
        body = created.json()
        assert body["rating"] == 5
        assert body["publishConsent"] is False
        assert body["landlord"] == "Exempelvärd"
        assert len(body["text"]) == 1000
        assert "googleReviewUrl" not in body
        created_at = body["createdAt"]

        again = client.post("/reviews", json=_body(), headers=headers)
        assert again.status_code == 409

        same_home = client.post("/reviews", json=_body(applicationId="app-2", listingId="listing-1"), headers=headers)
        assert same_home.status_code == 409

        other = client.put("/reviews/app-1", json=_body(text="Inte din"), headers={"Authorization": "Bearer other"})
        assert other.status_code == 404

        settings.google_review_url = "https://search.google.com/local/writereview?placeid=abc"
        low = client.put("/reviews/app-1", json=_body(rating=3, text="Helt okej"), headers=headers)
        assert low.status_code == 200
        assert low.json()["createdAt"] == created_at
        assert low.json()["rating"] == 3
        assert low.json()["text"] == "Helt okej"
        assert "googleReviewUrl" not in low.json()

        high = client.put(
            "/reviews/app-1",
            json=_body(rating=4, text="=HYPERLINK", publishConsent=True),
            headers=headers,
        )
        assert high.status_code == 200
        assert high.json()["googleReviewUrl"] == settings.google_review_url
        assert high.json()["createdAt"] == created_at

        mine = client.get("/reviews", headers=headers)
        assert mine.status_code == 200
        assert len(mine.json()["reviews"]) == 1
        assert mine.json()["reviews"][0]["text"] == "=HYPERLINK"

        hidden = client.get("/internal/ops/reviews")
        assert hidden.status_code == 404
        assert client.get("/internal/ops/reviews", headers=headers).status_code == 404
        owner_headers = {"Authorization": "Bearer owner"}
        assert client.get("/internal/ops/reviews", headers=owner_headers).status_code == 404

        listed = client.get("/internal/ops/reviews", headers=owner_headers, cookies={"blixtbo_totp": "yes"})
        assert listed.status_code == 200
        payload = listed.json()
        assert payload["count"] == 1
        assert payload["average"] == 4
        assert payload["distribution"]["4"] == 1
        assert payload["distribution"]["5"] == 0
        assert payload["reviews"][0]["email"] == "user@example.com"
        assert payload["reviews"][0]["landlord"] == "Exempelvärd"
        assert payload["reviews"][0]["publishConsent"] is True

        filtered = client.get("/internal/ops/reviews?rating=5", headers=owner_headers, cookies={"blixtbo_totp": "yes"})
        assert filtered.status_code == 200
        assert filtered.json()["count"] == 1
        assert filtered.json()["reviews"] == []
        assert client.get("/internal/ops/reviews?rating=9", headers=owner_headers, cookies={"blixtbo_totp": "yes"}).status_code == 400

        exported = client.get("/internal/ops/reviews.csv?rating=4", headers=owner_headers, cookies={"blixtbo_totp": "yes"})
        assert exported.status_code == 200
        assert "text/csv" in exported.headers["content-type"]
        text = exported.text
        assert "E-post" in text
        assert "user@example.com" in text
        assert "'=HYPERLINK" in text
        assert "Exempelvärd" in text
        assert "ja" in text

        user = db.query(User).filter_by(email="user@example.com").one()
        assert db.query(Review).filter_by(user_id=user.id).count() == 1
        gateway = Gateway()
        result = run_deletion(
            db,
            uid="uid-user",
            email="user@example.com",
            scope="account",
            stripe=gateway,
            firebase=gateway,
            firestore=gateway,
        )
        assert result["status"] == "deleted"
        assert ("reviews", "uid-user") in gateway.log
        db.expire_all()
        assert db.query(Review).filter_by(user_id=user.id).count() == 0
    finally:
        close()


def test_erasure_deletes_reviews_and_links_keep_them(monkeypatch):
    client, db, close = _open(monkeypatch)
    try:
        headers = {"Authorization": "Bearer user"}
        assert client.post("/reviews", json=_body(), headers=headers).status_code == 200
        user = db.query(User).filter_by(email="user@example.com").one()
        kept = Gateway()
        run_deletion(db, uid="uid-user", email="user@example.com", scope="links", stripe=kept, firebase=kept, firestore=kept)
        assert ("reviews", "uid-user") not in kept.log
        assert db.query(Review).filter_by(user_id=user.id).count() == 1

        gone = Gateway()
        result = run_deletion(db, uid="uid-user", email="user@example.com", scope="erasure", stripe=gone, firebase=gone, firestore=gone)
        assert result["status"] == "deleted"
        db.expire_all()
        assert db.query(Review).count() == 0
        assert ("purge", "uid-user") in gone.log
    finally:
        close()


def test_firestore_store_and_gateway_delete(monkeypatch):
    saved_backend = settings.data_backend
    settings.data_backend = "firestore"
    try:
        memory = MemoryClient()
        user = User(id="local-1", email="sara@example.com", name="Sara", auth_method="google", firebase_uid="uid-sara")
        from blixtbo.reviews import admin_reviews, create_review, list_my_reviews, update_review

        created = create_review(None, user, _body(rating=5, publishConsent=True), client=memory)
        assert created["rating"] == 5
        assert created["landlord"] == "Exempelvärd"
        duplicate = None
        try:
            create_review(None, user, _body(), client=memory)
        except Exception as exc:
            duplicate = exc
        assert getattr(duplicate, "status", None) == 409

        updated = update_review(None, user, "app-1", _body(rating=2, text="Kort", publishConsent=False), client=memory)
        assert updated["text"] == "Kort"
        assert updated["createdAt"] == created["createdAt"]
        assert "googleReviewUrl" not in updated
        assert len(list_my_reviews(None, user, client=memory)) == 1

        other = User(id="local-2", email="nils@example.com", name="Nils", auth_method="google", firebase_uid="uid-nils")
        create_review(None, other, _body(applicationId="app-9", listingId="listing-9", rating=1, text="", landlord="", publishConsent=False), client=memory)
        admin = admin_reviews(None, None, client=memory)
        assert admin["count"] == 2
        assert admin["distribution"]["1"] == 1
        assert admin["distribution"]["2"] == 1
        only = admin_reviews(None, "1", client=memory)
        assert len(only["reviews"]) == 1
        assert only["reviews"][0]["email"] == "nils@example.com"

        monkeypatch.setattr("blixtbo.firebase_app.firestore_client", lambda: memory)
        FirestoreGateway().delete_reviews("uid-sara")
        assert list_my_reviews(None, user, client=memory) == []
        assert admin_reviews(None, None, client=memory)["count"] == 1
    finally:
        settings.data_backend = saved_backend
