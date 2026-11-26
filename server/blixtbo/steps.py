"""Result of one landlord step. No secrets belong in these fields."""

from dataclasses import dataclass


@dataclass
class StepResult:
    ok: bool
    error: str | None = None
    needs_bankid_on_phone: bool = False
    title: str = ""
    body: str = ""
    pause: bool = False


def paused(code: str, title: str, body: str, *, bankid: bool = False) -> StepResult:
    return StepResult(
        ok=False,
        error=code,
        title=title,
        body=body,
        pause=not bankid and code != "needs_bankid",
        needs_bankid_on_phone=bankid or code == "needs_bankid",
    )


def finished(title: str, body: str, code: str | None = None) -> StepResult:
    return StepResult(ok=True, error=code, title=title, body=body, pause=False)
