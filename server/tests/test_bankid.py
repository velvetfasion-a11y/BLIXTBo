import os
import uuid
from datetime import datetime, timedelta, timezone

os.environ["WORKER_KEK"] = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["LANDLORD_MODE"] = "dry-run"

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from blixtbo import landlords
from blixtbo.config import settings
from blixtbo.crypto import decrypt_secret, encrypt_secret, generate_dek, public_connection, unwrap_dek
from blixtbo.jobs import queue_due_renewals, run_job, session_cookie_from_body
from blixtbo.models import Base, Job, LandlordLogin, Notice, User

settings.worker_kek = os.environ["WORKER_KEK"]
settings.landlord_mode = "dry-run"

engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
Base.metadata.create_all(engine)
Session = sessionmaker(engine, expire_on_commit=False)


def _user(db) -> User:
    user = User(email=f"{uuid.uuid4().hex[:10]}@b.se", auth_method="email", name="Anna")
    db.add(user)
    db.commit()
    return user


def _secret(user: User, login: LandlordLogin) -> dict:
    return decrypt_secret(unwrap_dek(user.dek_nonce, user.dek_wrapped), login.secret_nonce, login.secret_ciphertext)


def test_flags_are_per_landlord():
    assert landlords.requires_bankid("bostadsformedlingen") is True
    assert landlords.requires_bankid("wahlin") is False
    assert landlords.accepts_password("wahlin") is True
    assert landlords.requires_bankid("stena") is False
    assert landlords.accepts_password("stena") is True
    assert landlords.landlord("stena").name == "Stena Fastigheter"
    assert landlords.requires_bankid("homeq") is False


def test_bankid_landlord_pauses_without_storing_a_secret():
    db = Session()
    user = _user(db)
    job = Job(user_id=user.id, source_id="bostadsformedlingen", kind="create_account")
    db.add(job)
    db.commit()
    run_job(db, job)
    db.commit()
    login = db.query(LandlordLogin).filter_by(user_id=user.id, source_id="bostadsformedlingen").one()
    assert job.status == "waiting_bankid"
    assert login.status == "needs_bankid"
    assert login.landlord_requires_bankid is True
    assert login.secret_ciphertext is None
    notice = db.query(Notice).filter_by(user_id=user.id).one()
    assert "Bostadsförmedlingen" in notice.body
    assert "inte hos Blixtbo" in notice.body
    assert "personal" not in notice.body.lower()


def test_only_the_session_cookie_is_stored():
    db = Session()
    user = _user(db)
    waiting = Job(user_id=user.id, source_id="bostadsformedlingen", kind="create_account")
    db.add(waiting)
    db.commit()
    run_job(db, waiting)
    db.commit()
    assert waiting.status == "waiting_bankid"

    job = Job(user_id=user.id, source_id="bostadsformedlingen", kind="store_session", payload='{"cookie":"ll-session=abc"}')
    db.add(job)
    db.commit()
    run_job(db, job)
    db.commit()
    db.refresh(waiting)
    login = db.query(LandlordLogin).filter_by(user_id=user.id, source_id="bostadsformedlingen").one()
    assert job.status == "done"
    assert job.payload == "{}"
    assert waiting.status == "done"
    assert login.status == "active"
    secret = _secret(user, login)
    assert secret == {"cookie": "ll-session=abc"}
    view = public_connection(login)
    assert "cookie" not in view
    assert "ll-session" not in str(view)
    assert view["landlord_requires_bankid"] is True
    notice = db.query(Notice).filter_by(user_id=user.id, kind="bankid_session").one()
    assert "nytt BankID-godkännande" in notice.body


def test_renewal_pauses_and_notifies_without_a_second_job():
    db = Session()
    user = _user(db)
    created = Job(user_id=user.id, source_id="bostadsformedlingen", kind="create_account")
    db.add(created)
    db.commit()
    run_job(db, created)
    stored = Job(user_id=user.id, source_id="bostadsformedlingen", kind="store_session", payload='{"cookie":"sess=1"}')
    db.add(stored)
    db.commit()
    run_job(db, stored)
    login = db.query(LandlordLogin).filter_by(user_id=user.id, source_id="bostadsformedlingen").one()
    login.next_renewal_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    queue_due_renewals(db)
    queue_due_renewals(db)
    db.commit()
    renewals = db.query(Job).filter_by(user_id=user.id, source_id="bostadsformedlingen", kind="renew").all()
    assert len(renewals) == 1
    run_job(db, renewals[0])
    db.commit()
    assert renewals[0].status == "waiting_bankid"
    assert login.status == "needs_bankid"
    secret = _secret(user, login)
    assert secret == {"cookie": "sess=1"}
    assert any("nytt BankID" in notice.body or "Nytt BankID" in notice.title for notice in db.query(Notice).all())
    queue_due_renewals(db)
    db.commit()
    assert db.query(Job).filter_by(user_id=user.id, source_id="bostadsformedlingen", kind="renew").count() == 1


def test_password_landlord_still_stores_a_password():
    db = Session()
    user = _user(db)
    job = Job(user_id=user.id, source_id="homeq", kind="create_account")
    db.add(job)
    db.commit()
    run_job(db, job)
    db.commit()
    login = db.query(LandlordLogin).filter_by(user_id=user.id, source_id="homeq").one()
    assert job.status == "done"
    assert login.status == "active"
    assert login.landlord_requires_bankid is False
    secret = _secret(user, login)
    assert "password" in secret
    assert "cookie" not in secret


def test_bankid_material_is_refused():
    dek = generate_dek()
    with pytest.raises(ValueError):
        encrypt_secret(dek, {"personalNumber": "199001011234"})
    with pytest.raises(ValueError):
        encrypt_secret(dek, {"cookie": "abc", "autoStartToken": "token"})
    with pytest.raises(ValueError):
        session_cookie_from_body({"cookie": "abc", "signature": "sig"})
    with pytest.raises(ValueError):
        session_cookie_from_body({"cookie": "{\"orderRef\":\"x\"}"})
    assert session_cookie_from_body({"cookie": "ll-session=abc"}) == "ll-session=abc"
