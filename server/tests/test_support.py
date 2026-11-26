"""Support tickets, rate limit, admin gate, mocked assistant, and GDPR deletion."""

import base64
import json
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateTable

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("DATA_BACKEND", "postgres")

from blixtbo.account import run_deletion
from blixtbo.config import settings
from blixtbo.db import engine as app_engine
from blixtbo.main import app, get_db
from blixtbo.models import Base, User
from blixtbo.support import CONFIRMATION, PROMISE, classify_escalation, complete_chat, promises_forbidden, system_prompt
from blixtbo.support_models import SupportChat, SupportMessage, SupportTicket

_PATH = "/tmp/blixtbo-support-test.db"
if os.path.exists(_PATH):
    os.remove(_PATH)
engine = create_engine(f"sqlite:///{_PATH}", connect_args={"check_same_thread": False})
Base.metadata.create_all(engine)
Session = sessionmaker(engine, expire_on_commit=False)

PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


def setup_module():
    settings.firebase_project_id = "blixtbo-test"
    settings.data_backend = "postgres"
    settings.owner_google_email = "owner@example.com"
    settings.openai_api_key = ""
    settings.smtp_host = ""
    settings.smtp_password = ""
    settings.support_email = "support@blixtbo.se"
    settings.owner_alert_email = ""
    settings.public_app_url = "https://blixtbo.se"
    settings.support_ticket_limit = 5
    settings.support_chat_limit = 20


def _db():
    return Session()


def _client(monkeypatch, db):
    from fastapi.testclient import TestClient

    def override():
        try:
            yield db
        finally:
            pass

    def verify(token):
        uid, _, email = token.partition("|")
        if not uid or not email or "@" not in email:
            raise RuntimeError("bad token")
        return {"uid": uid, "email": email, "name": "Anna", "sub": uid}

    app.dependency_overrides[get_db] = override
    monkeypatch.setattr("blixtbo.firebase_app.verify_id_token", verify)
    return TestClient(app)


def _auth(uid="anna", email="anna@example.com"):
    return {"Authorization": f"Bearer {uid}|{email}"}


def teardown_function():
    app.dependency_overrides.clear()
    settings.openai_api_key = ""
    settings.smtp_host = ""
    settings.support_ticket_limit = 5
    settings.support_chat_limit = 20


def test_tables_use_if_not_exists():
    sql = str(CreateTable(SupportTicket.__table__).compile(dialect=app_engine.dialect))
    assert "IF NOT EXISTS" in sql.upper()
    Base.metadata.create_all(engine)
    Base.metadata.create_all(engine)


def test_knowledge_includes_site_copy_price_and_facts():
    from blixtbo.knowledge import build_corpus

    text = build_corpus()
    assert "Premium kostar 99 kr per månad efter 3 dagars provperiod." in text
    assert "Kort om hur Blixtbo fungerar" in text
    assert "Integritetspolicy" in text
    assert "Blixtbo äger inga lägenheter" in text
    assert "escalate_to_owner" in text
    assert "support@blixtbo.se" in text
    assert "WORKER_KEK" not in text
    assert "sk_test" not in text
    assert "sk_live" not in text


def test_create_validates_and_stores_metadata(monkeypatch):
    db = _db()
    client = _client(monkeypatch, db)
    missing = client.post("/support/tickets", json={"type": "bug", "message": "Sidan kraschade"})
    assert missing.status_code == 401

    headers = _auth("meta-user", "meta@example.com")
    bad_type = client.post("/support/tickets", json={"type": "annat", "message": "Hej"}, headers=headers)
    assert bad_type.status_code == 400
    empty_bug = client.post("/support/tickets", json={"type": "bug", "message": "x"}, headers=headers)
    assert empty_bug.status_code == 400
    empty_subject = client.post("/support/tickets", json={"type": "support", "subject": "He", "message": "Behöver hjälp med filtret"}, headers=headers)
    assert empty_subject.status_code == 400
    bad_email = client.post(
        "/support/tickets",
        json={"type": "support", "subject": "Kontot", "message": "Jag kommer inte in", "email": "inte-en-adress"},
        headers=headers,
    )
    assert bad_email.status_code == 400
    bad_image = client.post(
        "/support/tickets",
        json={"type": "bug", "message": "Knappen gör inget", "screenshot": "data:text/html;base64,aaaa"},
        headers=headers,
    )
    assert bad_image.status_code == 400

    created = client.post(
        "/support/tickets",
        json={
            "type": "bug",
            "message": "Knappen gör inget när jag sveper",
            "steps": "Öppna hem och svep höger",
            "email": "svar@example.com",
            "screenshot": PNG,
            "metadata": {
                "appVersion": "0.1.0",
                "route": "/hem",
                "userAgent": "TestBrowser",
                "language": "sv-SE",
                "userId": "spoofed",
                "password": "hunter2",
                "token": "secret-token",
            },
        },
        headers=headers,
    )
    assert created.status_code == 200
    body = created.json()
    assert body["confirmation"] == CONFIRMATION
    assert body["notified"] is False
    ticket = db.get(SupportTicket, body["id"])
    assert ticket is not None
    assert ticket.type == "bug"
    assert ticket.status == "ny"
    assert ticket.email == "svar@example.com"
    assert "Öppna hem" in ticket.message
    meta = json.loads(ticket.metadata_json)
    assert meta["userId"] != "spoofed"
    assert meta["userId"] == ticket.user_id
    assert meta["route"] == "/hem"
    assert meta["appVersion"] == "0.1.0"
    assert meta["userAgent"] == "TestBrowser"
    assert "password" not in meta
    assert "token" not in meta
    assert meta["screenshot"].startswith("data:image/png;base64,")
    assert "hunter2" not in ticket.metadata_json
    assert "secret-token" not in ticket.metadata_json


def test_rate_limit_is_per_user(monkeypatch):
    db = _db()
    client = _client(monkeypatch, db)
    headers = _auth("rate-user", "rate@example.com")
    payload = {"type": "support", "subject": "Fråga om kön", "message": "Hur förnyas kön?"}
    for index in range(5):
        response = client.post("/support/tickets", json=payload, headers=headers)
        assert response.status_code == 200, index
    blocked = client.post("/support/tickets", json=payload, headers=headers)
    assert blocked.status_code == 429
    other = client.post("/support/tickets", json=payload, headers=_auth("other-user", "other@example.com"))
    assert other.status_code == 200


def test_admin_is_owner_only_and_can_update_and_reply(monkeypatch):
    db = _db()
    client = _client(monkeypatch, db)
    created = client.post(
        "/support/tickets",
        json={"type": "support", "subject": "Premium", "message": "Jag ser inte provperioden"},
        headers=_auth("member", "member@example.com"),
    )
    assert created.status_code == 200
    ticket_id = created.json()["id"]
    ticket = db.get(SupportTicket, ticket_id)
    ticket.created_at = datetime.now(timezone.utc) - timedelta(hours=30)
    db.commit()

    assert client.get("/support/admin/tickets").status_code == 404
    assert client.get("/support/admin/tickets", headers=_auth("member", "member@example.com")).status_code == 404
    assert client.post("/support/admin/tickets/" + ticket_id + "/status", json={"status": "löst"}, headers=_auth("member", "member@example.com")).status_code == 404

    owner = _auth("owner", "owner@example.com")
    listed = client.get("/support/admin/tickets", headers=owner)
    assert listed.status_code == 200
    row = next(item for item in listed.json()["tickets"] if item["id"] == ticket_id)
    assert row["type"] == "support"
    assert row["status"] == "ny"
    assert row["stale"] is True
    assert row["email"] == "member@example.com"
    assert listed.json()["unread"] >= 1

    detail = client.get(f"/support/admin/tickets/{ticket_id}", headers=owner)
    assert detail.status_code == 200
    assert detail.json()["unread"] is False
    changed = client.post(f"/support/admin/tickets/{ticket_id}/status", json={"status": "pågår"}, headers=owner)
    assert changed.status_code == 200
    assert changed.json()["status"] == "pågår"
    assert changed.json()["stale"] is False
    refused = client.post(f"/support/admin/tickets/{ticket_id}/status", json={"status": "arkiv"}, headers=owner)
    assert refused.status_code == 400

    reply = client.post(f"/support/admin/tickets/{ticket_id}/reply", json={"body": "Vi tittar på det."}, headers=owner)
    assert reply.status_code == 200
    assert any(item["role"] == "admin" and item["body"] == "Vi tittar på det." for item in reply.json()["messages"])

    seen = client.get("/support/chat", headers=_auth("member", "member@example.com"))
    assert seen.status_code == 200
    assert any(item["role"] == "admin" and "Vi tittar" in item["body"] for item in seen.json()["messages"])
    chats = client.get("/support/admin/chats", headers=owner)
    assert chats.status_code == 200
    assert any(item["email"] == "member@example.com" for item in chats.json()["chats"])


def test_mail_is_optional_and_omits_secrets(monkeypatch):
    db = _db()
    client = _client(monkeypatch, db)
    sent = []

    class FakeSMTP:
        def __init__(self, host, port, timeout=10):
            sent.append(("open", host, port))

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def starttls(self):
            sent.append("tls")

        def login(self, user, password):
            sent.append(("login", user))

        def send_message(self, message):
            sent.append(message.get_content())

    monkeypatch.setattr("blixtbo.support_mail.smtplib.SMTP", FakeSMTP)
    quiet = client.post(
        "/support/tickets",
        json={"type": "support", "subject": "Filter", "message": "Områdesfiltret sparas inte"},
        headers=_auth("mail-user", "mail@example.com"),
    )
    assert quiet.json()["notified"] is False
    assert sent == []

    settings.smtp_host = "smtp.example.test"
    settings.smtp_password = "smtp-secret"
    settings.smtp_user = "apikey"
    settings.owner_alert_email = "owner-alert@blixtbo.se"
    loud = client.post(
        "/support/tickets",
        json={"type": "support", "subject": "Filter igen", "message": "Det sparas fortfarande inte"},
        headers=_auth("mail-user", "mail@example.com"),
    )
    assert loud.json()["notified"] is True
    body = sent[-1]
    assert "mail@example.com" in body
    assert "/admin/arenden?arende=" in body
    assert "smtp-secret" not in body
    assert "apikey" not in body


def test_chat_falls_back_without_a_key_and_uses_a_mocked_model(monkeypatch):
    db = _db()
    client = _client(monkeypatch, db)
    headers = _auth("chat-user", "chat@example.com")
    off = client.post("/support/chat", json={"message": "Vad kostar Premium?"}, headers=headers)
    assert off.status_code == 409
    assert client.get("/support/assistant").json()["available"] is False

    calls = []

    def fake_complete(history):
        calls.append(history)
        last = history[-1]["content"]
        if "människa" in last.casefold():
            return {
                "content": "Jag kopplar dig.",
                "tool": {"reason": "användaren vill prata med en människa", "type": "support", "subject": "Människa"},
            }
        if "äger ni" in last.casefold():
            return {"content": "Ja, vi äger lägenheter i Stockholm.", "tool": None}
        return {"content": "Premium kostar 99 kr i månaden efter 3 dagars prov.", "tool": None}

    monkeypatch.setattr("blixtbo.support.complete_chat", fake_complete)
    settings.openai_api_key = "test-key"
    answer = client.post("/support/chat", json={"message": "Vad kostar Premium?"}, headers=headers)
    assert answer.status_code == 200
    assert answer.json()["escalated"] is False
    assert "99 kr" in answer.json()["reply"]
    assert db.query(SupportTicket).filter_by(email="chat@example.com").count() == 0

    bug = client.post("/support/chat", json={"message": "Appen kraschar på hem"}, headers=headers)
    assert bug.status_code == 200
    assert bug.json()["escalated"] is True
    assert PROMISE in bug.json()["reply"]
    assert CONFIRMATION in bug.json()["reply"]
    ticket = db.query(SupportTicket).filter_by(email="chat@example.com").one()
    assert ticket.type == "bug"
    assert ticket.unread is True
    assert "Appen kraschar" in ticket.message
    assert ticket.user_id

    human = client.post("/support/chat", json={"message": "Jag vill prata med en människa"}, headers=headers)
    assert human.status_code == 200
    assert human.json()["escalated"] is True
    assert "människa" in human.json()["reply"].casefold()

    unsafe = client.post("/support/chat", json={"message": "Äger ni lägenheter?"}, headers=headers)
    assert unsafe.status_code == 200
    assert "vi äger lägenheter" not in unsafe.json()["reply"].casefold()
    assert unsafe.json()["escalated"] is True
    assert calls
    prompt = system_prompt()
    assert "escalate_to_owner" in prompt
    assert "Lova aldrig en återbetalning" in prompt
    assert "äger inga lägenheter" in prompt


def test_completion_request_sends_the_tool_and_hides_the_key(monkeypatch):
    captured = {}

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "Hej", "tool_calls": []}}]}

    def fake_post(url, json=None, headers=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        captured["headers"] = headers
        return Response()

    monkeypatch.setattr("httpx.post", fake_post)
    settings.openai_api_key = "sk-test-secret"
    settings.openai_base_url = "https://example.test/v1"
    settings.openai_model = "test-model"
    result = complete_chat([{"role": "user", "content": "Hej"}])
    assert result["content"] == "Hej"
    assert result["tool"] is None
    assert captured["url"] == "https://example.test/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer sk-test-secret"
    assert "sk-test-secret" not in json.dumps(captured["json"])
    assert captured["json"]["tools"][0]["function"]["name"] == "escalate_to_owner"
    assert classify_escalation("Vad kostar Premium?") is None
    assert classify_escalation("Jag vill ha återbetalning")["type"] == "support"
    assert promises_forbidden("vi äger lägenheter") is True


def test_owner_escalation_mail_includes_transcript_and_link(monkeypatch):
    db = _db()
    client = _client(monkeypatch, db)
    sent = {}

    def fake_send(*, to, subject, body):
        sent["to"] = to
        sent["subject"] = subject
        sent["body"] = body
        return True

    monkeypatch.setattr("blixtbo.support.send_email", fake_send)
    monkeypatch.setattr(
        "blixtbo.support.complete_chat",
        lambda history: {"content": "", "tool": {"reason": "bugg", "type": "bug", "subject": "Krasch"}},
    )
    settings.openai_api_key = "test-key"
    settings.owner_alert_email = "owner-alert@blixtbo.se"
    response = client.post("/support/chat", json={"message": "Det är en bugg i filtret"}, headers=_auth("esc-user", "esc@example.com"))
    assert response.status_code == 200
    assert response.json()["notified"] is True
    assert sent["to"] == "owner-alert@blixtbo.se"
    assert "esc@example.com" in sent["body"]
    assert "Det är en bugg i filtret" in sent["body"]
    assert "/admin/arenden?arende=" in sent["body"]
    assert "test-key" not in sent["body"]


def test_chat_rate_limit(monkeypatch):
    db = _db()
    client = _client(monkeypatch, db)
    settings.support_chat_limit = 2
    settings.openai_api_key = "test-key"
    monkeypatch.setattr("blixtbo.support.complete_chat", lambda history: {"content": "Okej.", "tool": None})
    headers = _auth("chat-limit", "limit@example.com")
    assert client.post("/support/chat", json={"message": "Ett"}, headers=headers).status_code == 200
    assert client.post("/support/chat", json={"message": "Två"}, headers=headers).status_code == 200
    blocked = client.post("/support/chat", json={"message": "Tre"}, headers=headers)
    assert blocked.status_code == 429


class Gateway:
    def locate(self, uid, known):
        return {"state": "none", "customerId": ""}

    def anonymise(self, customer_id):
        return None

    def delete_user(self, uid):
        return "deleted"

    def unlink_providers(self, uid):
        return "unlinked"

    def clear_account(self, uid):
        return None

    def purge_user(self, uid):
        return None

    def purge_credentials(self, uid):
        return None


def _seed_support(db, uid, email):
    user = User(email=email, name="Test", auth_method="google", firebase_uid=uid, google_sub=f"g-{uid}")
    db.add(user)
    db.commit()
    ticket = SupportTicket(
        type="support",
        status="ny",
        user_id=user.id,
        firebase_uid=uid,
        email=email,
        subject="Hjälp",
        message="Hej",
    )
    chat = SupportChat(user_id=user.id, firebase_uid=uid, email=email)
    db.add_all([ticket, chat])
    db.commit()
    db.add(SupportMessage(chat_id=chat.id, role="user", body="Hej"))
    db.commit()
    return user, ticket, chat


def test_deletion_removes_tickets_and_chats_except_unlinked_accounts():
    db = _db()
    erased, _, chat = _seed_support(db, "uid-erase-support", "erase-support@example.com")
    run_deletion(db, uid="uid-erase-support", email="erase-support@example.com", scope="erasure", stripe=Gateway(), firebase=Gateway(), firestore=Gateway())
    assert db.query(SupportTicket).filter_by(email="erase-support@example.com").count() == 0
    assert db.query(SupportChat).filter_by(email="erase-support@example.com").count() == 0
    assert db.query(SupportMessage).filter_by(chat_id=chat.id).count() == 0
    assert db.get(User, erased.id) is None

    closed, _, _ = _seed_support(db, "uid-close-support", "close-support@example.com")
    run_deletion(db, uid="uid-close-support", email="close-support@example.com", scope="account", stripe=Gateway(), firebase=Gateway(), firestore=Gateway())
    assert db.query(SupportTicket).filter_by(email="close-support@example.com").count() == 0
    assert db.query(SupportChat).filter_by(user_id=closed.id).count() == 0

    kept, ticket, _ = _seed_support(db, "uid-links-support", "links-support@example.com")
    run_deletion(db, uid="uid-links-support", email="links-support@example.com", scope="links", stripe=Gateway(), firebase=Gateway(), firestore=Gateway())
    assert db.get(SupportTicket, ticket.id) is not None
    assert db.get(User, kept.id) is not None


def test_screenshot_size_is_rejected(monkeypatch):
    db = _db()
    client = _client(monkeypatch, db)
    huge = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"x" * 700_000).decode()
    response = client.post(
        "/support/tickets",
        json={"type": "bug", "message": "En stor bild", "screenshot": huge},
        headers=_auth("shot-user", "shot@example.com"),
    )
    assert response.status_code == 400
