"""In-app support tickets and the optional assistant.

The assistant calls no model unless OPENAI_API_KEY is set. Mail is sent only when
SMTP_HOST is set. Neither path adds a paid service by itself.
"""

import base64
import json
import re
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from blixtbo.config import settings
from blixtbo.knowledge import load_knowledge
from blixtbo.models import User, utcnow
from blixtbo.support_mail import owner_inbox, send_email, support_inbox
from blixtbo.support_models import SupportChat, SupportMessage, SupportTicket

CONFIRMATION = "Tack! Vi har fått ditt ärende och svarar inom 24 timmar."
PROMISE = "Vi svarar inom 24 timmar."
TYPES = ("bug", "support")
STATUSES = ("ny", "pågår", "löst")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_SCREENSHOT = re.compile(r"^data:image/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$", re.I)
_SECRET_KEYS = ("password", "token", "secret", "authorization", "cookie", "otp", "totp", "kek")
_PROMISES = (
    "du får pengarna tillbaka",
    "jag lovar att återbetala",
    "jag skickar ansökan",
    "jag ansöker åt dig",
    "vi äger lägenheter",
    "blixtbo äger lägenheter",
    "vi hyr ut lägenheter",
    "jag hyr ut",
)

RULES = """Du är Blixtbos stöd i appen. Svara på svenska, kort, med du-tilltal.
Använd bara underlaget nedan. Hitta inte på.

Blixtbo äger inga lägenheter, hyr inte ut bostäder och förmedlar inte kontrakt. Säg aldrig att Blixtbo äger eller hyr ut en bostad.
Lova aldrig en återbetalning. Lova aldrig att en ansökan skickas åt användaren. Du kan inte skicka ansökningar, ändra en betalning eller radera ett konto.

Anropa verktyget escalate_to_owner så fort du är osäker, det gäller en bugg, betalning, återbetalning, ångerrätt, radering av konto, eller användaren vill prata med en människa.
När du anropar verktyget ska svaret innehålla meningen: Vi svarar inom 24 timmar.
"""

TOOL = {
    "type": "function",
    "function": {
        "name": "escalate_to_owner",
        "description": "Kontakta ägaren när du är osäker, det är en bugg, betalning eller återbetalning, radering av konto, eller användaren vill prata med en människa.",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "Kort skäl, utan lösenord eller kortnummer."},
                "type": {"type": "string", "enum": ["bug", "support"]},
                "subject": {"type": "string", "description": "Kort ämnesrad till ägaren."},
            },
            "required": ["reason", "type", "subject"],
        },
    },
}


class SupportError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def llm_available() -> bool:
    return bool((settings.openai_api_key or "").strip())


def system_prompt() -> str:
    knowledge = load_knowledge().strip() or "Inget underlag är inläst."
    return RULES + "\nUnderlag:\n" + knowledge


def classify_escalation(text: str) -> dict | None:
    """Force a handoff the model must not skip. Ordinary price and how-to questions stay."""
    folded = (text or "").casefold()
    if any(word in folded for word in ("återbetal", "pengarna tillbaka", "refund", "ångerrätt")):
        return {"type": "support", "reason": "betalning eller återbetalning", "subject": "Betalning eller återbetalning"}
    if any(word in folded for word in ("radera mitt konto", "radera kontot", "radera alla uppgifter", "ta bort mitt konto", "gdpr")):
        return {"type": "support", "reason": "radering av konto", "subject": "Radering av konto"}
    if any(word in folded for word in ("människa", "riktig person", "prata med någon", "prata med nån", "kundtjänst")):
        return {"type": "support", "reason": "användaren vill prata med en människa", "subject": "Önskan om människa"}
    if any(word in folded for word in ("bugg", "kraschar", "fungerar inte", "funkar inte", "felmeddelande", "gick sönder", "trasigt", "trasig")):
        return {"type": "bug", "reason": "bugg", "subject": "Buggrapport från chatten"}
    return None


def promises_forbidden(text: str) -> bool:
    folded = (text or "").casefold()
    return any(phrase in folded for phrase in _PROMISES)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _iso(value: datetime | None) -> str:
    if value is None:
        return ""
    return _as_utc(value).isoformat()


def _one_line(value: str, limit: int) -> str:
    return " ".join((value or "").replace("\r", " ").replace("\n", " ").split())[:limit]


def _clip(value: str, limit: int) -> str:
    text = (value or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    return text[:limit]


def _valid_email(value: str) -> str:
    email = (value or "").strip().lower()
    if not _EMAIL.fullmatch(email) or len(email) > 320:
        raise SupportError(400, "Skriv en giltig e-postadress.")
    if email.endswith("@deleted.blixtbo.invalid") or email.endswith("@anonymised.invalid"):
        raise SupportError(400, "Skriv en giltig e-postadress.")
    return email


def _screenshot(raw: str) -> str:
    if not raw:
        return ""
    if not isinstance(raw, str):
        raise SupportError(400, "Bilden gick inte att läsa.")
    match = _SCREENSHOT.fullmatch(raw.strip())
    if match is None:
        raise SupportError(400, "Bilden måste vara en png, jpeg eller webp.")
    payload = re.sub(r"\s+", "", match.group(2))
    try:
        binary = base64.b64decode(payload, validate=True)
    except Exception as exc:
        raise SupportError(400, "Bilden gick inte att läsa.") from exc
    if len(binary) < 8:
        raise SupportError(400, "Bilden gick inte att läsa.")
    if len(binary) > 600_000:
        raise SupportError(400, "Bilden är för stor. Högst 600 kB.")
    mime = "jpeg" if match.group(1).lower() == "jpg" else match.group(1).lower()
    return f"data:image/{mime};base64,{payload}"


def clean_metadata(raw: object, user: User, *, allow_screenshot: bool) -> dict:
    source = raw if isinstance(raw, dict) else {}
    cleaned: dict[str, str] = {}
    for key, value in source.items():
        name = str(key)[:80]
        if any(word in name.casefold() for word in _SECRET_KEYS):
            continue
        if name == "screenshot":
            continue
        if isinstance(value, bool):
            cleaned[name] = "ja" if value else "nej"
        elif isinstance(value, (int, float)):
            cleaned[name] = str(value)[:80]
        elif isinstance(value, str):
            cleaned[name] = _clip(value, 500)
    screenshot = _screenshot(str(source.get("screenshot") or "")) if allow_screenshot else ""
    if screenshot:
        cleaned["screenshot"] = screenshot
    cleaned["userId"] = user.id
    cleaned["firebaseUid"] = user.firebase_uid or ""
    cleaned["appVersion"] = _one_line(str(source.get("appVersion") or cleaned.get("appVersion") or ""), 40)
    cleaned["route"] = _one_line(str(source.get("route") or cleaned.get("route") or ""), 300)
    cleaned["userAgent"] = _one_line(str(source.get("userAgent") or cleaned.get("userAgent") or ""), 400)
    cleaned["language"] = _one_line(str(source.get("language") or cleaned.get("language") or ""), 40)
    return cleaned


def _recent(rows: list, cutoff: datetime) -> int:
    return sum(1 for row in rows if _as_utc(row.created_at) >= cutoff)


def _limit_tickets(db: Session, user: User, now: datetime | None = None) -> None:
    moment = now or datetime.now(timezone.utc)
    cutoff = moment - timedelta(hours=1)
    rows = db.query(SupportTicket).filter(SupportTicket.user_id == user.id).all()
    if _recent(rows, cutoff) >= max(1, int(settings.support_ticket_limit or 5)):
        raise SupportError(429, "Du har skickat för många ärenden den senaste timmen. Försök igen senare.")


def _limit_chat(db: Session, user: User, now: datetime | None = None) -> None:
    moment = now or datetime.now(timezone.utc)
    cutoff = moment - timedelta(hours=1)
    chat_ids = [row.id for row in db.query(SupportChat.id).filter(SupportChat.user_id == user.id).all()]
    if not chat_ids:
        return
    rows = db.query(SupportMessage).filter(SupportMessage.chat_id.in_(chat_ids), SupportMessage.role == "user").all()
    if _recent(rows, cutoff) >= max(1, int(settings.support_chat_limit or 20)):
        raise SupportError(429, "Du har skickat för många meddelanden den senaste timmen. Försök igen senare.")


def _transcript(messages: list[SupportMessage]) -> str:
    labels = {"user": "Användare", "assistant": "Assistent", "admin": "Support"}
    lines = []
    for item in messages:
        lines.append(f"{labels.get(item.role, item.role)}: {item.body}")
    return "\n\n".join(lines)


def _notify(ticket: SupportTicket, messages: list[SupportMessage], *, owner: bool) -> bool:
    inbox = owner_inbox() if owner else support_inbox()
    link = f"{settings.public_app_url.rstrip('/')}/admin/arenden?arende={ticket.id}"
    meta = {}
    try:
        meta = json.loads(ticket.metadata_json or "{}")
    except json.JSONDecodeError:
        meta = {}
    shot = "Ja" if isinstance(meta, dict) and meta.get("screenshot") else "Nej"
    body = "\n".join(
        [
            f"Ärende: {ticket.id}",
            f"Typ: {ticket.type}",
            f"Status: {ticket.status}",
            f"E-post: {ticket.email}",
            f"Användare: {ticket.user_id}",
            f"Firebase: {ticket.firebase_uid}",
            f"Sida: {meta.get('route', '') if isinstance(meta, dict) else ''}",
            f"Version: {meta.get('appVersion', '') if isinstance(meta, dict) else ''}",
            f"Enhet: {meta.get('userAgent', '') if isinstance(meta, dict) else ''}",
            f"Skärmbild: {shot}",
            f"Länk: {link}",
            "",
            ticket.message,
            "",
            _transcript(messages),
        ]
    )
    subject = f"[Blixtbo] {'Eskalering' if owner else 'Nytt ärende'} {_one_line(ticket.subject, 80)}"
    return send_email(to=inbox, subject=subject, body=body)


def _message_json(row: SupportMessage) -> dict:
    return {"id": row.id, "role": row.role, "body": row.body, "createdAt": _iso(row.created_at)}


def _messages(db: Session, chat_id: str) -> list[SupportMessage]:
    if not chat_id:
        return []
    return db.query(SupportMessage).filter_by(chat_id=chat_id).order_by(SupportMessage.created_at.asc()).all()


def is_stale(ticket: SupportTicket, now: datetime | None = None) -> bool:
    if ticket.status != "ny" or ticket.status_changed_at is not None:
        return False
    moment = now or datetime.now(timezone.utc)
    return moment - _as_utc(ticket.created_at) >= timedelta(hours=24)


def ticket_json(db: Session, ticket: SupportTicket, *, detail: bool) -> dict:
    payload = {
        "id": ticket.id,
        "type": ticket.type,
        "status": ticket.status,
        "email": ticket.email,
        "subject": ticket.subject,
        "createdAt": _iso(ticket.created_at),
        "stale": is_stale(ticket),
        "unread": bool(ticket.unread),
        "chatId": ticket.chat_id or "",
    }
    if not detail:
        return payload
    try:
        meta = json.loads(ticket.metadata_json or "{}")
    except json.JSONDecodeError:
        meta = {}
    if not isinstance(meta, dict):
        meta = {}
    payload["message"] = ticket.message
    payload["metadata"] = meta
    payload["messages"] = [_message_json(item) for item in _messages(db, ticket.chat_id)]
    return payload


def _ensure_active(user: User) -> None:
    if user is None or user.auth_method == "deleted":
        raise SupportError(401, "Logga in igen.")


def _reply_email(user: User, raw: object) -> str:
    if isinstance(raw, str) and raw.strip():
        return _valid_email(raw)
    return _valid_email(user.email)


def create_ticket(db: Session, user: User, body: dict) -> dict:
    _ensure_active(user)
    if not isinstance(body, dict):
        raise SupportError(400, "Formuläret gick inte att läsa.")
    kind = str(body.get("type") or "")
    if kind not in TYPES:
        raise SupportError(400, "Välj om det gäller en bugg eller support.")
    email = _reply_email(user, body.get("email"))
    metadata = clean_metadata(body.get("metadata"), user, allow_screenshot=kind == "bug")
    if kind == "bug" and body.get("screenshot"):
        metadata["screenshot"] = _screenshot(str(body.get("screenshot")))
    happened = _clip(str(body.get("message") or ""), 4000)
    steps = _clip(str(body.get("steps") or ""), 2000)
    if kind == "bug":
        if len(happened) < 3:
            raise SupportError(400, "Skriv vad som hände.")
        message = happened
        if steps:
            message = f"{happened}\n\nSteg:\n{steps}"
        subject = _one_line(str(body.get("subject") or happened), 120) or "Buggrapport"
    else:
        subject = _one_line(str(body.get("subject") or ""), 120)
        message = happened
        if len(subject) < 3:
            raise SupportError(400, "Skriv ett ämne.")
        if len(message) < 3:
            raise SupportError(400, "Skriv ett meddelande.")
    _limit_tickets(db, user)
    ticket = SupportTicket(
        type=kind,
        status="ny",
        user_id=user.id,
        firebase_uid=user.firebase_uid or "",
        email=email,
        subject=subject,
        message=message,
        metadata_json=json.dumps(metadata, ensure_ascii=False),
        transcript_json=json.dumps([{"role": "user", "body": message}], ensure_ascii=False),
        unread=True,
        created_at=utcnow(),
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    notified = _notify(ticket, [], owner=False)
    return {"id": ticket.id, "status": ticket.status, "notified": notified, "confirmation": CONFIRMATION}


def _latest_chat(db: Session, user: User) -> SupportChat | None:
    return (
        db.query(SupportChat)
        .filter(SupportChat.user_id == user.id)
        .order_by(SupportChat.updated_at.desc())
        .first()
    )


def _ensure_chat(db: Session, user: User, email: str) -> SupportChat:
    chat = _latest_chat(db, user)
    if chat is not None:
        if email and chat.email != email:
            chat.email = email
        return chat
    chat = SupportChat(
        user_id=user.id,
        firebase_uid=user.firebase_uid or "",
        email=email,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(chat)
    db.flush()
    return chat


def chat_view(db: Session, user: User) -> dict:
    _ensure_active(user)
    chat = _latest_chat(db, user)
    messages = _messages(db, chat.id) if chat is not None else []
    return {
        "available": llm_available(),
        "chatId": chat.id if chat is not None else "",
        "messages": [_message_json(item) for item in messages],
    }


def _add_message(db: Session, chat: SupportChat, role: str, body: str) -> SupportMessage:
    row = SupportMessage(chat_id=chat.id, role=role, body=body, created_at=utcnow())
    chat.updated_at = row.created_at
    db.add(row)
    db.flush()
    return row


def _history(messages: list[SupportMessage]) -> list[dict]:
    history = []
    for item in messages[-12:]:
        if item.role == "admin":
            history.append({"role": "assistant", "content": f"Support: {item.body}"})
        elif item.role in ("user", "assistant"):
            history.append({"role": item.role, "content": item.body})
    return history


def complete_chat(history: list[dict]) -> dict:
    """Call an OpenAI-compatible chat endpoint. Tests replace this function."""
    key = (settings.openai_api_key or "").strip()
    if not key:
        raise SupportError(409, "Chatten är inte påslagen. Använd formuläret.")
    base = (settings.openai_base_url or "https://api.openai.com/v1").rstrip("/")
    payload = {
        "model": settings.openai_model or "gpt-4o-mini",
        "temperature": 0.2,
        "messages": [{"role": "system", "content": system_prompt()}, *history],
        "tools": [TOOL],
        "tool_choice": "auto",
    }
    try:
        response = httpx.post(
            f"{base}/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {key}"},
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
    except SupportError:
        raise
    except Exception as exc:
        raise SupportError(502, "Det gick inte att svara just nu. Försök igen, eller använd formuläret.") from exc
    return _parse_completion(data)


def _parse_completion(data: dict) -> dict:
    try:
        message = data["choices"][0]["message"]
    except (KeyError, IndexError, TypeError) as exc:
        raise SupportError(502, "Det gick inte att svara just nu. Försök igen, eller använd formuläret.") from exc
    content = str(message.get("content") or "").strip()
    tool = None
    for call in message.get("tool_calls") or []:
        function = call.get("function") or {}
        if function.get("name") != "escalate_to_owner":
            continue
        raw = function.get("arguments") or "{}"
        try:
            args = json.loads(raw) if isinstance(raw, str) else raw
        except json.JSONDecodeError:
            args = {}
        if not isinstance(args, dict):
            args = {}
        kind = args.get("type")
        tool = {
            "reason": _one_line(str(args.get("reason") or "osäker"), 300) or "osäker",
            "type": kind if kind in TYPES else "support",
            "subject": _one_line(str(args.get("subject") or "Behöver en människa"), 120) or "Behöver en människa",
        }
        break
    return {"content": content, "tool": tool}


def _safe_reply(forced: dict | None, content: str) -> str:
    if promises_forbidden(content):
        content = "Det kan jag inte lova. Blixtbo äger inga lägenheter, hyr inte ut bostäder och skickar inte ansökningar åt dig."
    if forced and forced["reason"] == "betalning eller återbetalning":
        content = "En återbetalning kan jag inte lova här. En människa tittar på betalningen."
    elif forced and forced["reason"] == "radering av konto":
        content = "Radering gör du under Inställningar genom att skriva RADERA. En människa kan också hjälpa till."
    elif forced and forced["reason"] == "användaren vill prata med en människa":
        content = "Jag lämnar över till en människa."
    elif forced and forced["reason"] == "bugg":
        content = "Jag skickar det här som en buggrapport."
    elif not content:
        content = "Jag lämnar över det här."
    if CONFIRMATION not in content:
        content = f"{content}\n\n{CONFIRMATION}"
    if PROMISE not in content:
        content = f"{content}\n\n{PROMISE}"
    return content


def _escalate(db: Session, user: User, chat: SupportChat, email: str, tool: dict, metadata: dict) -> SupportTicket:
    _limit_tickets(db, user)
    messages = _messages(db, chat.id)
    transcript = [{"role": item.role, "body": item.body} for item in messages]
    last_user = next((item.body for item in reversed(messages) if item.role == "user"), "")
    stored = dict(metadata)
    stored["escalation"] = _one_line(str(tool.get("reason") or "osäker"), 300)
    ticket = SupportTicket(
        type=tool["type"] if tool["type"] in TYPES else "support",
        status="ny",
        user_id=user.id,
        firebase_uid=user.firebase_uid or "",
        email=email,
        subject=_one_line(tool.get("subject") or "Behöver en människa", 120),
        message=_clip(last_user or str(tool.get("reason") or "Osäker"), 4000),
        metadata_json=json.dumps(stored, ensure_ascii=False),
        transcript_json=json.dumps(transcript, ensure_ascii=False),
        chat_id=chat.id,
        unread=True,
        created_at=utcnow(),
    )
    db.add(ticket)
    db.flush()
    return ticket


def post_chat(db: Session, user: User, body: dict) -> dict:
    _ensure_active(user)
    if not llm_available():
        raise SupportError(409, "Chatten är inte påslagen. Använd formuläret.")
    if not isinstance(body, dict):
        raise SupportError(400, "Meddelandet gick inte att läsa.")
    text = _clip(str(body.get("message") or ""), 2000)
    if len(text) < 1:
        raise SupportError(400, "Skriv ett meddelande.")
    email = _reply_email(user, body.get("email"))
    metadata = clean_metadata(body.get("metadata"), user, allow_screenshot=False)
    _limit_chat(db, user)
    chat = _ensure_chat(db, user, email)
    _add_message(db, chat, "user", text)
    forced = classify_escalation(text)
    try:
        result = complete_chat(_history(_messages(db, chat.id)))
    except SupportError:
        if forced is None:
            reply = "Det gick inte att svara just nu. Försök igen, eller använd formuläret."
            _add_message(db, chat, "assistant", reply)
            db.commit()
            raise
        result = {"content": "", "tool": None}
    tool = result.get("tool") if isinstance(result, dict) else None
    content = str((result or {}).get("content") or "")
    if promises_forbidden(content) and tool is None and forced is None:
        forced = {"type": "support", "reason": "osäker", "subject": "Behöver en människa"}
    if forced and not tool:
        tool = forced
    elif forced and tool:
        tool = {**tool, "type": forced["type"], "reason": forced["reason"]}
    ticket = None
    notified = False
    if tool:
        try:
            ticket = _escalate(db, user, chat, email, tool, metadata)
        except SupportError as exc:
            if exc.status != 429:
                raise
            reply = "Du har skickat för många ärenden den senaste timmen. Försök igen senare."
            _add_message(db, chat, "assistant", reply)
            db.commit()
            raise
        reply = _safe_reply(forced, "" if forced else content)
    else:
        reply = content.strip() or "Jag hittar inte svaret i underlaget."
        if promises_forbidden(reply):
            reply = "Det kan jag inte lova. Blixtbo äger inga lägenheter, hyr inte ut bostäder och skickar inte ansökningar åt dig."
    _add_message(db, chat, "assistant", reply)
    db.commit()
    if ticket is not None:
        db.refresh(ticket)
        notified = _notify(ticket, _messages(db, chat.id), owner=True)
    return {
        "available": True,
        "reply": reply,
        "escalated": ticket is not None,
        "ticketId": ticket.id if ticket is not None else "",
        "notified": notified,
        "chatId": chat.id,
        "messages": [_message_json(item) for item in _messages(db, chat.id)],
    }


def list_tickets(db: Session) -> dict:
    rows = db.query(SupportTicket).order_by(SupportTicket.created_at.desc()).limit(200).all()
    unread = db.query(SupportTicket).filter(SupportTicket.unread.is_(True)).count()
    return {"tickets": [ticket_json(db, row, detail=False) for row in rows], "unread": unread}


def ticket_detail(db: Session, ticket_id: str) -> dict:
    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise SupportError(404, "Ärendet finns inte.")
    if ticket.unread:
        ticket.unread = False
        db.commit()
    return ticket_json(db, ticket, detail=True)


def set_status(db: Session, ticket_id: str, status: str) -> dict:
    if status not in STATUSES:
        raise SupportError(400, "Välj status ny, pågår eller löst.")
    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise SupportError(404, "Ärendet finns inte.")
    if ticket.status != status:
        ticket.status = status
        ticket.status_changed_at = utcnow()
    ticket.unread = False
    db.commit()
    return ticket_json(db, ticket, detail=True)


def _user_chat_for_ticket(db: Session, ticket: SupportTicket) -> SupportChat:
    if ticket.chat_id:
        chat = db.get(SupportChat, ticket.chat_id)
        if chat is not None:
            return chat
    chat = SupportChat(
        user_id=ticket.user_id,
        firebase_uid=ticket.firebase_uid,
        email=ticket.email,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(chat)
    db.flush()
    if ticket.message:
        _add_message(db, chat, "user", ticket.message)
    ticket.chat_id = chat.id
    return chat


def admin_reply(db: Session, ticket_id: str, body: str) -> dict:
    text = _clip(body or "", 4000)
    if len(text) < 1:
        raise SupportError(400, "Skriv ett svar.")
    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise SupportError(404, "Ärendet finns inte.")
    chat = _user_chat_for_ticket(db, ticket)
    _add_message(db, chat, "admin", text)
    ticket.unread = False
    if ticket.status == "ny":
        ticket.status = "pågår"
        ticket.status_changed_at = utcnow()
    db.commit()
    return ticket_json(db, ticket, detail=True)


def list_chats(db: Session) -> dict:
    rows = db.query(SupportChat).order_by(SupportChat.updated_at.desc()).limit(200).all()
    chats = []
    for chat in rows:
        last = (
            db.query(SupportMessage)
            .filter_by(chat_id=chat.id)
            .order_by(SupportMessage.created_at.desc())
            .first()
        )
        ticket = db.query(SupportTicket).filter_by(chat_id=chat.id).order_by(SupportTicket.created_at.desc()).first()
        chats.append(
            {
                "id": chat.id,
                "email": chat.email,
                "updatedAt": _iso(chat.updated_at),
                "excerpt": _one_line(last.body, 140) if last is not None else "",
                "ticketId": ticket.id if ticket is not None else "",
                "messages": [_message_json(item) for item in _messages(db, chat.id)],
            }
        )
    return {"chats": chats}


def reply_to_chat(db: Session, chat_id: str, body: str) -> dict:
    text = _clip(body or "", 4000)
    if len(text) < 1:
        raise SupportError(400, "Skriv ett svar.")
    chat = db.get(SupportChat, chat_id)
    if chat is None:
        raise SupportError(404, "Chatten finns inte.")
    _add_message(db, chat, "admin", text)
    ticket = db.query(SupportTicket).filter_by(chat_id=chat.id).order_by(SupportTicket.created_at.desc()).first()
    if ticket is not None and ticket.status == "ny":
        ticket.status = "pågår"
        ticket.status_changed_at = utcnow()
        ticket.unread = False
    db.commit()
    return {"id": chat.id, "messages": [_message_json(item) for item in _messages(db, chat.id)]}


def support_admin(request: Request, db: Session) -> User:
    """Owner Google account only. The in-app admin has no separate TOTP step."""
    from blixtbo.main import current_user

    user = current_user(request, db)
    owner = (settings.owner_google_email or "").strip().lower()
    if user is None or not owner or user.email.lower() != owner or user.auth_method == "deleted":
        raise HTTPException(status_code=404)
    return user


def _http(exc: SupportError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail=exc.detail)


def register(app, get_db, require_user) -> None:
    @app.get("/support/assistant")
    def assistant_status() -> dict:
        return {"available": llm_available()}

    @app.post("/support/tickets")
    def post_ticket(body: dict, user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
        try:
            return create_ticket(db, user, body)
        except SupportError as exc:
            raise _http(exc) from exc

    @app.get("/support/chat")
    def get_chat(user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
        try:
            return chat_view(db, user)
        except SupportError as exc:
            raise _http(exc) from exc

    @app.post("/support/chat")
    def post_message(body: dict, user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
        try:
            return post_chat(db, user, body)
        except SupportError as exc:
            raise _http(exc) from exc

    @app.get("/support/admin/summary")
    def admin_summary(request: Request, db: Session = Depends(get_db)) -> dict:
        support_admin(request, db)
        unread = db.query(SupportTicket).filter(SupportTicket.unread.is_(True)).count()
        return {"unread": unread}

    @app.get("/support/admin/tickets")
    def admin_tickets(request: Request, db: Session = Depends(get_db)) -> dict:
        support_admin(request, db)
        return list_tickets(db)

    @app.get("/support/admin/tickets/{ticket_id}")
    def admin_ticket(ticket_id: str, request: Request, db: Session = Depends(get_db)) -> dict:
        support_admin(request, db)
        try:
            return ticket_detail(db, ticket_id)
        except SupportError as exc:
            raise _http(exc) from exc

    @app.post("/support/admin/tickets/{ticket_id}/status")
    def admin_status(ticket_id: str, body: dict, request: Request, db: Session = Depends(get_db)) -> dict:
        support_admin(request, db)
        try:
            return set_status(db, ticket_id, str((body or {}).get("status") or ""))
        except SupportError as exc:
            raise _http(exc) from exc

    @app.post("/support/admin/tickets/{ticket_id}/reply")
    def admin_ticket_reply(ticket_id: str, body: dict, request: Request, db: Session = Depends(get_db)) -> dict:
        support_admin(request, db)
        try:
            return admin_reply(db, ticket_id, str((body or {}).get("body") or ""))
        except SupportError as exc:
            raise _http(exc) from exc

    @app.get("/support/admin/chats")
    def admin_chats(request: Request, db: Session = Depends(get_db)) -> dict:
        support_admin(request, db)
        return list_chats(db)

    @app.post("/support/admin/chats/{chat_id}/reply")
    def admin_chat_reply(chat_id: str, body: dict, request: Request, db: Session = Depends(get_db)) -> dict:
        support_admin(request, db)
        try:
            return reply_to_chat(db, chat_id, str((body or {}).get("body") or ""))
        except SupportError as exc:
            raise _http(exc) from exc
