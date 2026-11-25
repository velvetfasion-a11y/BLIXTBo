import os

os.environ["WORKER_KEK"] = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
os.environ["DATABASE_URL"] = "sqlite://"

from blixtbo.config import settings  # noqa: E402
from blixtbo.crypto import decrypt_secret, encrypt_secret, generate_dek, public_connection, unwrap_dek, wrap_dek  # noqa: E402
from blixtbo.landlords import classify_login_text  # noqa: E402
from blixtbo.matching import rule_check  # noqa: E402


def test_roundtrip_hides_password_from_admin_view():
    settings.worker_kek = os.environ["WORKER_KEK"]
    dek = generate_dek()
    nonce, wrapped = wrap_dek(dek)
    opened = unwrap_dek(nonce, wrapped)
    secret_nonce, token = encrypt_secret(opened, {"username": "a@b.se", "password": "not-for-admin"})
    assert decrypt_secret(opened, secret_nonce, token)["password"] == "not-for-admin"

    class Row:
        source_id = "homeq"
        status = "active"
        username = "a@b.se"
        last_login_at = None
        last_error = None
        landlord_requires_bankid = False
        secret_ciphertext = token

    view = public_connection(Row())
    assert "password" not in view
    assert "secret" not in str(view)
    assert view["username"] == "a@b.se"


def test_login_failures():
    assert classify_login_text("Fel lösenord, försök igen") == "password_changed"
    assert classify_login_text("Din session har gått ut") == "session_expired"
    assert classify_login_text("Välkommen", 401) == "session_expired"
    assert classify_login_text("Välkommen") is None


def test_rules_do_not_need_a_model():
    result = rule_check(
        {"monthly_income": 30000, "letter": "kort", "documents": {}},
        {"rent": 12000, "income_multiple": 3, "requires": ["payslips", "letter"]},
    )
    assert result["income_ok"] is False
    assert "payslips" in result["missing_documents"]
    assert result["ready"] is False
