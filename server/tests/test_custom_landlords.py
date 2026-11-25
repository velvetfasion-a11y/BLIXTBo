from blixtbo.custom_landlords import (
    apply_mode,
    keep_listing,
    parse_rss,
    public_url,
    rank_candidates,
    robots_allows,
)


RSS = """<?xml version="1.0"?>
<rss version="2.0"><channel>
<item>
  <title>Bondegatan 8, Södermalm, Stockholm</title>
  <link>https://example.test/bostad/1</link>
  <description>2 rok, 54 m², våning 3, 11 200 kr/mån. Nyproduktion.</description>
</item>
<item>
  <title>Källarplan</title>
  <link>https://example.test/bostad/2</link>
  <description>1 rok, våning 0, 8 000 kr/mån.</description>
</item>
<item>
  <title>Dyr våning, Södermalm</title>
  <link>https://example.test/bostad/3</link>
  <description>3 rok, våning 4, 22 000 kr/mån.</description>
</item>
</channel></rss>
"""


def test_name_search_ranks_the_matching_site_without_the_model():
    ranked = rank_candidates(
        "Exempelbyggen",
        "Stockholm",
        "byggbolag",
        [
            {"url": "https://other.example/about", "title": "En helt annan sida", "snippet": ""},
            {"url": "https://exempelbyggen.example/bostader", "title": "Exempelbyggen Stockholm nyproduktion", "snippet": "byggbolag"},
        ],
    )
    assert ranked[0]["url"].startswith("https://exempelbyggen.example")
    assert ranked[0]["score"] > ranked[1]["score"]


def test_robots_txt_is_respected():
    robots = "User-agent: *\nDisallow: /privat\nAllow: /bostader\n"
    assert robots_allows(robots, "https://example.test/bostader") is True
    assert robots_allows(robots, "https://example.test/privat") is False


def test_rss_is_filtered_like_the_app():
    parsed = parse_rss(RSS)
    assert len(parsed) == 3
    filters = {"maxRent": 17000, "minFloor": 2, "areas": ["Södermalm"], "minSqm": 30}
    kept = [item for item in parsed if keep_listing(item, filters)]
    assert [item["url"] for item in kept] == ["https://example.test/bostad/1"]
    assert kept[0]["floor"] == 3
    assert kept[0]["rent"] == 11200


def test_custom_site_is_manual_and_known_adapter_is_not():
    assert apply_mode("https://exempelbyggen.example/bostader") == "manual"
    assert apply_mode("https://www.homeq.se/login") == "adapter"
    assert public_url("http://169.254.169.254/latest") is False
    assert public_url("https://exempelbyggen.example/bostader") is True
