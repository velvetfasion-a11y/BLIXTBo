from blixtbo.credentials import credential_document, refuse_bankid_document
import pytest


def test_credential_document_is_ciphertext_only():
    document = credential_document(b"nonce-bytes", b"cipher-bytes", "a@b.se", True, "active")
    assert document["username"] == "a@b.se"
    assert document["landlord_requires_bankid"] is True
    assert "password" not in document
    assert "cookie" not in document
    assert "personalNumber" not in document


def test_bankid_fields_are_refused():
    with pytest.raises(ValueError):
        refuse_bankid_document({"autoStartToken": "x"})
    with pytest.raises(ValueError):
        refuse_bankid_document({"bankid": "order"})
