import pytest

from blixtbo.analytics import sanitize_event


def test_events_drop_personal_data_and_unknown_fields():
    name, props = sanitize_event("swipe", {"direction": "yes", "email": "a@b.se", "address": "Storgatan 1"})
    assert name == "swipe"
    assert props == {"direction": "yes"}
    name, props = sanitize_event("apply", {"sourceId": "homeq", "mode": "auto", "name": "Anna"})
    assert props == {"sourceId": "homeq", "mode": "auto"}


def test_unknown_event_is_rejected():
    with pytest.raises(ValueError):
        sanitize_event("identify", {"email": "a@b.se"})
    name, props = sanitize_event("swipe", {"direction": "maybe"})
    assert name == "swipe"
    assert props == {}
