"""Allowlist for keep-alive. Anything else raises before it is sent.

Keep-alive may log in and read one status page. It never applies, sends
interest, messages, signs up, or edits a profile.
"""

from urllib.parse import urlsplit

from blixtbo.adapters.incit import SITES

# Paths that are never a keep-alive, even if a caller adds them to an allowlist.
_DENIED_PARTS = (
    "/applications",
    "createapplication",
    "/interest",
    "intresse",
    "/messages",
    "/signup",
    "/register",
    "/api/v1/user/profile",
)


class ForbiddenRequest(Exception):
    def __init__(self, method: str, path: str) -> None:
        self.method = method
        self.path = path
        super().__init__(f"blocked {method} {path}")


def canonical_source(source_id: str) -> str:
    if source_id == "hembla":
        return "victoriahem"
    return source_id


def allowlist(source_id: str) -> frozenset[tuple[str, str]]:
    """Exact (METHOD, path) pairs one keep-alive may send. Empty means no calls."""
    source_id = canonical_source(source_id)
    if source_id == "homeq":
        return frozenset(
            {
                ("POST", "/api/v1/user/profile/login"),
                ("GET", "/api/v1/user/token/verify/"),
            }
        )
    if source_id in SITES:
        login_path = SITES[source_id]["login_path"]
        return frozenset({("GET", login_path), ("POST", login_path), ("GET", "/")})
    if source_id == "rikshem":
        return frozenset(
            {
                ("GET", "/mina-sidor/logga-in/"),
                ("POST", "/mina-sidor/logga-in/"),
                ("GET", "/mina-sidor/"),
            }
        )
    if source_id == "uppsala":
        return frozenset(
            {
                ("POST", "/mypages/api/account/login"),
                ("GET", "/mypages/api/account/me"),
            }
        )
    if source_id == "sssb":
        return frozenset(
            {
                ("GET", "/login/"),
                ("POST", "/wp-login.php"),
                ("GET", "/lediga-bostader/"),
            }
        )
    if source_id == "stena":
        return frozenset(
            {
                ("POST", "/accounts/users/auth/login/credentials/"),
                ("GET", "/"),
            }
        )
    return frozenset()


def denied(method: str, path: str) -> bool:
    lowered = path.lower()
    if method.upper() == "POST" and lowered.rstrip("/") == "/api/v1/user/profile":
        return True
    for part in _DENIED_PARTS:
        if part == "/api/v1/user/profile":
            continue
        if part in lowered:
            return True
    return False


def request_path(url: str) -> str:
    path = urlsplit(url).path or "/"
    return path


class ReadOnlyClient:
    """Delegates to an httpx client and refuses anything outside the allowlist."""

    def __init__(self, inner, allow: frozenset[tuple[str, str]]) -> None:
        self._inner = inner
        self.allow = allow
        self.calls: list[tuple[str, str]] = []

    def request(self, method: str, url: str, **kwargs):
        path = request_path(url)
        key = (method.upper(), path)
        if denied(method, path) or key not in self.allow:
            raise ForbiddenRequest(key[0], path)
        self.calls.append(key)
        return self._inner.request(method, url, **kwargs)

    def close(self) -> None:
        close = getattr(self._inner, "close", None)
        if close:
            close()
