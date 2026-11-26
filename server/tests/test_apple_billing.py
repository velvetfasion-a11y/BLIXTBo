"""App Store Server Notifications and the iOS entitlement path.

These tests sign their own certificate chain. They never call Apple, Stripe, or a landlord.
"""

import base64
import json
import os
import time
from datetime import datetime, timedelta, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.x509.oid import NameOID, ObjectIdentifier
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from blixtbo.apple_billing import (
    VerificationError,
    decode_notification,
    entitlement_from_parts,
    subscription_view_from_entitlement,
    trusted_roots,
    verify_jws,
)
from blixtbo.config import settings
from blixtbo.models import AppleAccount, Base, User
from blixtbo.push import build_apns_jwt, build_payload, deliver, href_for_kind

BUNDLE = "se.blixtbo.app"
PRODUCT = "se.blixtbo.premium.monthly"
IAP_OID = ObjectIdentifier("1.2.840.113635.100.6.11.1")
ACCOUNT = "11111111-1111-4111-8111-111111111111"


def _name(common: str) -> x509.Name:
    return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common)])


def _ca(common: str):
    key = ec.generate_private_key(ec.SECP256R1())
    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(_name(common))
        .issuer_name(_name(common))
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=30))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    return key, cert


def _issued(common: str, issuer_key, issuer_cert, *, ca: bool, oid: bool):
    key = ec.generate_private_key(ec.SECP256R1())
    now = datetime.now(timezone.utc)
    builder = (
        x509.CertificateBuilder()
        .subject_name(_name(common))
        .issuer_name(issuer_cert.subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=30))
        .add_extension(x509.BasicConstraints(ca=ca, path_length=0 if ca else None), critical=True)
    )
    if oid:
        builder = builder.add_extension(x509.UnrecognizedExtension(IAP_OID, b"\x05\x00"), critical=False)
    return key, builder.sign(issuer_key, hashes.SHA256())


def _chain():
    root_key, root = _ca("Test Apple Root")
    intermediate_key, intermediate = _issued("Test WWDR", root_key, root, ca=True, oid=False)
    leaf_key, leaf = _issued("Test StoreKit", intermediate_key, intermediate, ca=False, oid=True)
    return root, leaf_key, [leaf, intermediate]


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _sign(payload: dict, leaf_key, certs: list) -> str:
    header = {
        "alg": "ES256",
        "x5c": [base64.b64encode(cert.public_bytes(serialization.Encoding.DER)).decode("ascii") for cert in certs],
    }
    header_b64 = _b64url(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    der = leaf_key.sign(f"{header_b64}.{payload_b64}".encode("ascii"), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    raw = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    return f"{header_b64}.{payload_b64}.{_b64url(raw)}"


def _transaction(**extra) -> dict:
    now = int(time.time() * 1000)
    body = {
        "transactionId": "2000001",
        "originalTransactionId": "2000001",
        "bundleId": BUNDLE,
        "productId": PRODUCT,
        "purchaseDate": now,
        "expiresDate": now + 3 * 24 * 60 * 60 * 1000,
        "type": "Auto-Renewable Subscription",
        "environment": "Sandbox",
        "appAccountToken": ACCOUNT,
        "offerType": 1,
        "offerDiscountType": "FREE_TRIAL",
        "price": 0,
        "currency": "SEK",
    }
    body.update(extra)
    return body


def _notification(leaf_key, certs, transaction: dict, *, kind: str = "SUBSCRIBED", subtype: str = "INITIAL_BUY", renewal: dict | None = None, uuid: str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") -> str:
    signed_transaction = _sign(transaction, leaf_key, certs)
    data = {"bundleId": BUNDLE, "environment": "Sandbox", "signedTransactionInfo": signed_transaction}
    if renewal is not None:
        data["signedRenewalInfo"] = _sign(renewal, leaf_key, certs)
    outer = {
        "notificationType": kind,
        "subtype": subtype,
        "notificationUUID": uuid,
        "version": "2.0",
        "data": data,
    }
    return _sign(outer, leaf_key, certs)


def test_apple_root_certificates_are_shipped():
    names = " ".join(cert.subject.rfc4514_string() for cert in trusted_roots())
    assert "Apple Root CA - G3" in names
    assert "Apple Root CA - G2" in names


def test_trial_renewal_expiry_refund_and_grace():
    root, leaf_key, certs = _chain()
    now = int(time.time() * 1000)
    signed = _notification(leaf_key, certs, _transaction())
    decoded = decode_notification(signed, [root], bundle_id=BUNDLE)
    entitlement = entitlement_from_parts(
        notification_type=decoded["notificationType"],
        subtype=decoded["subtype"],
        transaction=decoded["transaction"],
        renewal=decoded["renewal"],
        product_id=PRODUCT,
        now_ms=now,
    )
    assert entitlement["plan"] == "premium"
    assert entitlement["status"] == "trialing"
    assert entitlement["source"] == "apple"
    assert entitlement["autoApply"] is True
    assert entitlement["trial"] is True
    assert "password" not in entitlement

    renewed = entitlement_from_parts(
        notification_type="DID_RENEW",
        subtype="",
        transaction=_transaction(offerType=0, offerDiscountType="", price=99000, expiresDate=now + 30 * 24 * 60 * 60 * 1000),
        renewal={"autoRenewStatus": 1, "originalTransactionId": "2000001"},
        product_id=PRODUCT,
        now_ms=now,
    )
    assert renewed["status"] == "active"
    assert renewed["trial"] is False
    assert renewed["cancelAtPeriodEnd"] is False

    ending = entitlement_from_parts(
        notification_type="DID_CHANGE_RENEWAL_STATUS",
        subtype="AUTO_RENEW_DISABLED",
        transaction=_transaction(offerType=0, offerDiscountType="", price=99000),
        renewal={"autoRenewStatus": 0},
        product_id=PRODUCT,
        now_ms=now,
    )
    assert ending["plan"] == "premium"
    assert ending["status"] == "active"
    assert ending["cancelAtPeriodEnd"] is True

    expired = entitlement_from_parts(
        notification_type="EXPIRED",
        subtype="",
        transaction=_transaction(expiresDate=now - 1000, offerType=0, offerDiscountType="", price=99000),
        renewal=None,
        product_id=PRODUCT,
        now_ms=now,
    )
    assert expired["plan"] == "free"
    assert expired["status"] == "canceled"
    assert expired["autoApply"] is False

    refunded = entitlement_from_parts(
        notification_type="REFUND",
        subtype="",
        transaction=_transaction(revocationDate=now, offerType=0, offerDiscountType="", price=99000),
        renewal=None,
        product_id=PRODUCT,
        now_ms=now,
    )
    assert refunded["status"] == "canceled"

    grace = entitlement_from_parts(
        notification_type="DID_FAIL_TO_RENEW",
        subtype="GRACE_PERIOD",
        transaction=_transaction(expiresDate=now - 1000, offerType=0, offerDiscountType="", price=99000),
        renewal={"gracePeriodExpiresDate": now + 60_000, "autoRenewStatus": 1},
        product_id=PRODUCT,
        now_ms=now,
    )
    assert grace["plan"] == "premium"
    assert grace["status"] == "active"
    assert grace["autoApply"] is True


def test_unknown_product_and_test_notifications_do_not_grant_premium():
    now = int(time.time() * 1000)
    assert entitlement_from_parts(
        notification_type="SUBSCRIBED",
        subtype="",
        transaction=_transaction(productId="se.other.product"),
        renewal=None,
        product_id=PRODUCT,
        now_ms=now,
    ) is None
    assert entitlement_from_parts(
        notification_type="TEST",
        subtype="",
        transaction=_transaction(),
        renewal=None,
        product_id=PRODUCT,
        now_ms=now,
    ) is None


def _tamper(token: str) -> str:
    header, payload, signature = token.split(".")
    chars = list(signature)
    original_raw = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
    for index, character in enumerate(chars):
        chars[index] = "A" if character != "A" else "B"
        candidate = "".join(chars)
        try:
            tampered = base64.urlsafe_b64decode(candidate + "=" * (-len(candidate) % 4))
        except Exception:
            chars[index] = character
            continue
        if tampered != original_raw:
            return f"{header}.{payload}.{candidate}"
        chars[index] = character
    raise AssertionError("could not change the signature bytes")


def test_bad_signature_wrong_root_and_wrong_bundle_are_rejected():
    root, leaf_key, certs = _chain()
    signed = _notification(leaf_key, certs, _transaction())
    try:
        verify_jws(_tamper(signed), [root])
    except VerificationError as exc:
        assert exc.code == "signature"
    else:
        raise AssertionError("forged signature was accepted")

    other_root, _, _ = _chain()
    try:
        verify_jws(signed, [other_root])
    except VerificationError as exc:
        assert exc.code == "root"
    else:
        raise AssertionError("untrusted root was accepted")

    try:
        decode_notification(signed, [root], bundle_id="se.other.app")
    except VerificationError as exc:
        assert exc.code == "bundle"
    else:
        raise AssertionError("wrong bundle was accepted")


def test_subscription_view_keeps_apple_trial_as_premium():
    view = subscription_view_from_entitlement(
        {"source": "apple", "plan": "premium", "status": "trialing", "cancelAtPeriodEnd": False, "currentPeriodEnd": "2026-12-01T00:00:00+00:00", "trial": True}
    )
    assert view["plan"] == "premium"
    assert view["status"] == "active"
    assert view["trial"] is True
    assert subscription_view_from_entitlement({"source": "apple", "plan": "free", "status": "canceled"}) is None
    assert subscription_view_from_entitlement({"plan": "premium", "status": "active"}) is None


def test_href_and_apns_jwt_do_not_call_the_network(monkeypatch):
    assert href_for_kind("applied") == "blixtbo://ansokningar"
    assert href_for_kind("password_changed") == "blixtbo://kopplingar"
    assert href_for_kind("listing") == "blixtbo://hem"
    assert href_for_kind("system") == "blixtbo://notiser"
    payload = build_payload("Rubrik", "Text", "applied", "notice-1")
    assert payload["href"] == "blixtbo://ansokningar"
    assert payload["aps"]["alert"]["title"] == "Rubrik"
    assert deliver("abc", "apns", payload)["skipped"] is True

    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    monkeypatch.setattr(settings, "apns_key_id", "KEY1234567")
    monkeypatch.setattr(settings, "apns_team_id", "TEAM123456")
    monkeypatch.setattr(settings, "apns_key_p8", pem)
    token = build_apns_jwt(now=1_700_000_000)
    header_b64, payload_b64, signature_b64 = token.split(".")
    signing_input = f"{header_b64}.{payload_b64}".encode()
    pad = "=" * (-len(signature_b64) % 4)
    raw = base64.urlsafe_b64decode(signature_b64 + pad)
    r = int.from_bytes(raw[:32], "big")
    s = int.from_bytes(raw[32:], "big")
    from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

    key.public_key().verify(encode_dss_signature(r, s), signing_input, ec.ECDSA(hashes.SHA256()))
    sent = {}

    def capture(url, headers, body):
        sent["url"] = url
        sent["topic"] = headers["apns-topic"]
        sent["body"] = body

    monkeypatch.setattr(settings, "apple_bundle_id", BUNDLE)
    monkeypatch.setattr(settings, "apns_use_sandbox", True)
    assert deliver("devicetoken", "apns", payload, post=capture)["skipped"] is False
    assert sent["url"] == "https://api.sandbox.push.apple.com/3/device/devicetoken"
    assert sent["topic"] == BUNDLE
    assert sent["body"]["href"] == "blixtbo://ansokningar"


def test_notification_endpoint_writes_entitlement_once_and_ignores_landlords(tmp_path, monkeypatch):
    root, leaf_key, certs = _chain()
    engine = create_engine(f"sqlite:///{tmp_path}/ios.db", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(engine, expire_on_commit=False)
    db = Session()

    def override():
        try:
            yield db
        finally:
            pass

    from blixtbo import ios_api
    from blixtbo.main import app

    app.dependency_overrides[ios_api.get_db] = override
    monkeypatch.setattr("blixtbo.apple_billing.trusted_roots", lambda: [root])
    monkeypatch.setattr(settings, "apple_bundle_id", BUNDLE)
    monkeypatch.setattr(settings, "apple_product_id", PRODUCT)
    monkeypatch.setattr(settings, "apple_app_apple_id", 0)
    written = []
    monkeypatch.setattr(ios_api, "write_entitlement", lambda uid, entitlement: written.append((uid, entitlement)))

    def fake_user(request, database):
        user = database.query(User).filter_by(firebase_uid="uid-apple").one_or_none()
        if user is None:
            user = User(email="ada@example.com", name="Ada", auth_method="apple", firebase_uid="uid-apple")
            database.add(user)
            database.commit()
        return user

    monkeypatch.setattr("blixtbo.main.user_from_firebase", fake_user)
    client = TestClient(app)
    headers = {"Authorization": "Bearer test-token"}
    token = client.get("/billing/apple/account-token", headers=headers)
    assert token.status_code == 200
    account_token = token.json()["appAccountToken"]
    assert client.get("/billing/apple/account-token", headers=headers).json()["appAccountToken"] == account_token

    transaction = _transaction(appAccountToken=account_token)
    signed_transaction = _sign(transaction, leaf_key, certs)
    saved = client.post("/billing/apple/transactions", json={"signedTransaction": signed_transaction}, headers=headers)
    assert saved.status_code == 200, saved.text
    assert saved.json()["status"] == "trialing"
    assert written[-1][0] == "uid-apple"
    assert written[-1][1]["source"] == "apple"
    assert written[-1][1]["plan"] == "premium"
    assert "password" not in written[-1][1]

    signed = _notification(leaf_key, certs, transaction, uuid="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
    first = client.post("/billing/apple/notifications", json={"signedPayload": signed})
    assert first.status_code == 200, first.text
    assert first.json()["ok"] is True
    second = client.post("/billing/apple/notifications", json={"signedPayload": signed})
    assert second.json()["duplicate"] is True
    assert len(written) == 2

    missing = client.post(
        "/billing/apple/notifications",
        json={"signedPayload": _notification(leaf_key, certs, _transaction(appAccountToken="22222222-2222-4222-8222-222222222222", originalTransactionId="9990001", transactionId="9990001"), uuid="cccccccc-cccc-4ccc-8ccc-cccccccccccc")},
    )
    assert missing.status_code == 503

    forged = _tamper(signed)
    assert client.post("/billing/apple/notifications", json={"signedPayload": forged}).status_code == 400

    landlords = client.get("/landlords", headers=headers)
    assert landlords.status_code == 200
    homeq = next(item for item in landlords.json() if item["id"] == "homeq")
    assert homeq["acceptsPassword"] is True
    assert "password" not in homeq
    assert "login_url" not in homeq

    other = User(email="other@example.com", name="Bo", auth_method="apple", firebase_uid="uid-other")
    db.add(other)
    db.add(AppleAccount(firebase_uid="uid-other", app_account_token="33333333-3333-4333-8333-333333333333", original_transaction_id="claimed"))
    db.commit()

    def other_user(request, database):
        return database.query(User).filter_by(firebase_uid="uid-other").one()

    monkeypatch.setattr("blixtbo.main.user_from_firebase", other_user)
    stolen = _sign(_transaction(appAccountToken=account_token, originalTransactionId="claimed-by-ada"), leaf_key, certs)
    rejected = client.post("/billing/apple/transactions", json={"signedTransaction": stolen}, headers=headers)
    assert rejected.status_code == 403

    registered = client.post("/devices", json={"token": "abc123", "platform": "ios", "kind": "apns"}, headers=headers)
    assert registered.status_code == 200
    assert client.post("/devices/remove", json={"token": "abc123"}, headers=headers).status_code == 200
    app.dependency_overrides.clear()
    db.close()
    assert os.environ.get("LANDLORD_MODE", "dry-run") != "live" or settings.landlord_mode == "dry-run"
