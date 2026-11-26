"""Per-site gap and robots.txt. A denied URL is never requested."""

import re
import time
from urllib.parse import urlparse


def robots_denies(text: str, url: str) -> bool:
    """Honor * wildcards. Python's parser does not treat them as wildcards."""
    path = urlparse(url).path or "/"
    for raw in text.splitlines():
        line = raw.strip()
        if not line.lower().startswith("disallow:"):
            continue
        rule = line.split(":", 1)[1].strip()
        if not rule:
            continue
        anchored = rule.endswith("$")
        body = rule[:-1] if anchored else rule
        pattern = "^" + re.escape(body).replace(r"\*", ".*")
        pattern += "$" if anchored else ""
        if re.search(pattern, path):
            return True
    return False


class RobotsBlocked(Exception):
    def __init__(self, url: str) -> None:
        self.url = url
        super().__init__(url)


class SiteGuard:
    def __init__(self, robots_by_host: dict[str, str] | None = None, gap_seconds: float = 2.0, sleeper=time.sleep, clock=time.monotonic) -> None:
        self.robots_by_host = robots_by_host or {}
        self.gap_seconds = gap_seconds
        self.sleeper = sleeper
        self.clock = clock
        self._next: dict[str, float] = {}

    def check(self, url: str) -> None:
        host = (urlparse(url).hostname or "").lower()
        text = self.robots_by_host.get(host)
        if text is not None:
            from blixtbo.custom_landlords import robots_allows

            if robots_denies(text, url) or not robots_allows(text, url):
                raise RobotsBlocked(url)
        now = self.clock()
        wait = self._next.get(host, 0.0) - now
        if wait > 0:
            self.sleeper(wait)
            now = self.clock()
        self._next[host] = now + self.gap_seconds
