from blixtbo import landlords


def test_homeq_limit_is_configurable_per_landlord():
    homeq = landlords.landlord("homeq")
    assert homeq is not None
    assert homeq.application_limit == 5
    assert homeq.plus_limit == 10
    assert homeq.plus_price_kr == 349
    assert homeq.plus_url == "https://www.homeq.se/plus"
    assert landlords.landlord("stena").application_limit is None
    assert landlords.landlord("wahlin").plus_url == ""
