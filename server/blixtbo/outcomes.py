"""Swedish notices for landlord jobs. Short, plain, no secrets."""

PAUSE_CODES = frozenset(
    {
        "needs_profile",
        "needs_identity",
        "needs_email",
        "captcha",
        "session_expired",
        "password_changed",
        "site_changed",
        "needs_confirmation",
        "rate_limited",
    }
)

TERMINAL_CODES = frozenset({"applied", "already_applied", "not_eligible", "queue_ok", "logged_in"})


def notice(code: str | None, name: str, detail: str = "") -> tuple[str, str]:
    extra = f" {detail}".rstrip() if detail else ""
    table: dict[str, tuple[str, str]] = {
        "applied": (f"Intresseanmälan skickad till {name}", f"Ansökan är skickad hos {name}.{extra}"),
        "already_applied": (f"Redan anmält hos {name}", f"Du har redan anmält intresse hos {name}.{extra}"),
        "not_eligible": (f"Inte aktuell hos {name}", (detail or f"{name} säger att bostaden inte är aktuell för dig.")),
        "needs_profile": (f"Fyll i profilen hos {name}", detail or f"Fyll i profilen hos {name}. Sedan kan Blixtbo försöka igen."),
        "needs_identity": (f"Legitimera dig hos {name}", detail or f"Verifiera dig med BankID hos {name}. Blixtbo ser inte det BankID:t."),
        "needs_email": (f"Bekräfta e-posten från {name}", detail or f"Bekräfta e-posten från {name}. Öppna mejlet och länken, sedan kan vi gå vidare."),
        "captcha": (f"{name} vill att du tar över", f"{name} visar en kontroll eller captcha. Vi försöker inte igen. Gör steget själv på deras sida.{extra}"),
        "session_expired": (f"Inloggningen hos {name} har gått ut", f"Sessionen hos {name} tog slut. Logga in en gång till."),
        "password_changed": (f"Lösenordet hos {name} stämmer inte", f"Blixtbo kan inte logga in hos {name}. Kontrollera lösenordet och spara det igen."),
        "site_changed": (f"{name} har ändrat sidan", f"Ett fält saknas på {name}. Vi gissar inte. Försöket är pausat.{extra}"),
        "needs_confirmation": (f"Bekräfta innan något skickas till {name}", detail or f"Inget skickades till {name}. Bekräfta i appen först."),
        "needs_bankid": (f"BankID behövs hos {name}", f"Logga in hos {name} med BankID på din egen enhet. Inte hos Blixtbo."),
        "rate_limited": (f"För många försök mot {name}", f"Vi pausar anropen till {name}. Inget skickas om igen automatiskt."),
        "queue_action": (f"Kön hos {name} behöver dig", detail or f"Logga in hos {name} och förnya kön. Blixtbo gör inte det åt dig."),
        "queue_ok": (f"Kön hos {name} är kollad", f"Sessionen hos {name} fungerar. Kön behöver inget extra just nu."),
        "logged_in": (f"{name} är kopplat", f"Inloggningen hos {name} fungerar."),
        "created": (f"Konto skapat hos {name}", detail or f"Kontot hos {name} är skapat."),
    }
    if code in table:
        return table[code]
    return (f"Något hände hos {name}", detail or f"Försöket hos {name} pausades.")
