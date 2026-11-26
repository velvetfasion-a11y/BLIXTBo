"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import { relative } from "@/lib/format";
import { supportFetch } from "@/lib/support-client";

type Ticket = {
  id: string;
  type: string;
  status: string;
  email: string;
  subject: string;
  message?: string;
  createdAt: string;
  stale: boolean;
  unread: boolean;
  chatId: string;
  metadata?: Record<string, string>;
  messages?: Array<{ id: string; role: string; body: string; createdAt: string }>;
};

type Chat = {
  id: string;
  email: string;
  updatedAt: string;
  excerpt: string;
  ticketId: string;
  messages: Array<{ id: string; role: string; body: string; createdAt: string }>;
};

const STATUS = [
  { id: "ny", label: "Ny" },
  { id: "pågår", label: "Pågår" },
  { id: "löst", label: "Löst" },
] as const;

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function typeLabel(value: string) {
  if (value === "bug") return "Bugg";
  if (value === "support") return "Support";
  return value;
}

function statusLabel(value: string) {
  return STATUS.find((item) => item.id === value)?.label ?? value;
}

export function SupportUnreadBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const { response, data } = await supportFetch("/support/admin/summary");
        if (stop || !response.ok) return;
        const unread = Number(asRecord(data).unread);
        setCount(Number.isFinite(unread) ? unread : 0);
      } catch {
        if (!stop) setCount(0);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  if (count < 1) return null;
  return (
    <span className="num rounded-full bg-pine px-2 py-0.5 text-xs text-white" aria-label={`${count} olästa ärenden`}>
      {count}
    </span>
  );
}

export function AdminCases() {
  const params = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [openId, setOpenId] = useState(params.get("arende") ?? "");
  const [detail, setDetail] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const visible = detail && detail.id === openId ? detail : null;

  useEffect(() => {
    document.title = "Ärenden · Blixtbo admin";
  }, []);

  function applyList(listed: { response: Response; data: unknown; detail: string }, thread: { response: Response; data: unknown }) {
    if (listed.response.status === 404) {
      setForbidden(true);
      return;
    }
    if (!listed.response.ok) {
      setError(listed.detail || "Ärendena gick inte att hämta.");
      return;
    }
    setForbidden(false);
    const rows = asRecord(listed.data).tickets;
    setTickets(Array.isArray(rows) ? (rows as Ticket[]) : []);
    if (thread.response.ok) {
      const items = asRecord(thread.data).chats;
      setChats(Array.isArray(items) ? (items as Chat[]) : []);
    }
  }

  useEffect(() => {
    let stop = false;
    Promise.all([supportFetch("/support/admin/tickets"), supportFetch("/support/admin/chats")])
      .then(([listed, thread]) => {
        if (!stop) applyList(listed, thread);
      })
      .catch(() => {
        if (!stop) setError("Ärendena gick inte att hämta.");
      });
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (!openId) return;
    let stop = false;
    supportFetch(`/support/admin/tickets/${openId}`)
      .then(({ response, data, detail: message }) => {
        if (stop) return;
        if (!response.ok) {
          setError(message || "Ärendet gick inte att öppna.");
          return;
        }
        setDetail(data as Ticket);
      })
      .catch(() => {
        if (!stop) setError("Ärendet gick inte att öppna.");
      });
    return () => {
      stop = true;
    };
  }, [openId]);

  async function refresh() {
    const [listed, thread] = await Promise.all([supportFetch("/support/admin/tickets"), supportFetch("/support/admin/chats")]);
    applyList(listed, thread);
  }

  async function changeStatus(status: string) {
    if (!visible || busy) return;
    setBusy(true);
    setError("");
    try {
      const { response, data, detail: message } = await supportFetch(`/support/admin/tickets/${visible.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        setError(message || "Status gick inte att ändra.");
        return;
      }
      setDetail(data as Ticket);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    const text = reply.trim();
    if (!visible || !text || busy) return;
    setBusy(true);
    setError("");
    try {
      const { response, data, detail: message } = await supportFetch(`/support/admin/tickets/${visible.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ body: text }),
      });
      if (!response.ok) {
        setError(message || "Svaret gick inte att skicka.");
        return;
      }
      setReply("");
      setDetail(data as Ticket);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const shot = visible?.metadata?.screenshot;
  const mailto = visible
    ? `mailto:${visible.email}?subject=${encodeURIComponent(`Re: ${visible.subject}`)}`
    : "";

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-serif text-4xl tracking-[-0.03em]">Ärenden</h1>
      <p className="mt-2 text-sm text-soft">Buggar, support och chattar som lämnats vidare. Äldre än 24 timmar utan statusändring är markerade.</p>
      {forbidden ? <p className="mt-6 text-sm text-soft">Bara ägaren kan se ärenden. Logga in med ägarkontot.</p> : null}
      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {!forbidden ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            {tickets.length === 0 ? <p className="text-sm text-soft">Inga ärenden ännu.</p> : null}
            <ul className="overflow-hidden rounded-3xl border border-line bg-card">
              {tickets.map((ticket) => (
                <li key={ticket.id} className={ticket.stale ? "bg-gold-soft" : undefined}>
                  <button type="button" onClick={() => setOpenId(ticket.id)} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left">
                    <span>
                      <span className="block text-sm font-medium">
                        {typeLabel(ticket.type)} · {statusLabel(ticket.status)}
                        {ticket.unread ? " · Oläst" : ""}
                      </span>
                      <span className="mt-0.5 block text-sm text-soft">{ticket.subject}</span>
                      <span className="mt-0.5 block text-xs text-faint">{ticket.email}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-faint">
                      <span className="block">{relative(ticket.createdAt)}</span>
                      {ticket.stale ? <span className="mt-1 block font-medium text-gold">Över 24 timmar</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <h2 className="mt-8 text-sm font-medium">Alla chattar</h2>
            {chats.length === 0 ? <p className="mt-2 text-sm text-soft">Inga chattar ännu.</p> : null}
            <ul className="mt-3 space-y-3">
              {chats.map((chat) => (
                <li key={chat.id} className="rounded-2xl border border-line bg-card px-4 py-3">
                  <p className="text-sm font-medium">{chat.email}</p>
                  <p className="mt-1 text-sm text-soft">{chat.excerpt || "Ingen text ännu"}</p>
                  <p className="mt-1 text-xs text-faint">{relative(chat.updatedAt)}</p>
                  {chat.ticketId ? (
                    <button type="button" className="mt-2 text-sm font-medium text-pine" onClick={() => setOpenId(chat.ticketId)}>
                      Öppna ärendet
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          <div>
            {!visible ? <p className="text-sm text-soft">{openId ? "Hämtar ärendet…" : "Välj ett ärende för att läsa det och svara."}</p> : null}
            {visible ? (
              <article className="rounded-3xl border border-line bg-card px-4 py-4">
                <p className="text-xs text-soft">
                  {typeLabel(visible.type)} · {statusLabel(visible.status)} · {relative(visible.createdAt)}
                </p>
                <h2 className="mt-2 text-lg font-medium">{visible.subject}</h2>
                <p className="mt-1 text-sm text-soft">{visible.email}</p>
                {visible.stale ? <p className="mt-2 text-sm font-medium text-gold">Äldre än 24 timmar utan statusändring.</p> : null}
                <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{visible.message}</p>
                {visible.metadata?.route ? <p className="mt-3 text-xs text-faint">Sida: {visible.metadata.route}</p> : null}
                {visible.metadata?.appVersion ? <p className="text-xs text-faint">Version: {visible.metadata.appVersion}</p> : null}
                {visible.metadata?.userAgent ? <p className="text-xs text-faint">Enhet: {visible.metadata.userAgent}</p> : null}
                {shot && shot.startsWith("data:image/") ? (
                  <img src={shot} alt="Skärmbild från användaren" className="mt-4 max-h-64 rounded-2xl border border-line" />
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {STATUS.map((item) => (
                    <Button key={item.id} size="sm" variant={visible.status === item.id ? "primary" : "outline"} disabled={busy} onClick={() => void changeStatus(item.id)}>
                      {item.label}
                    </Button>
                  ))}
                  <a href={mailto} className="inline-flex h-9 items-center rounded-full border border-line bg-card px-3 text-sm font-medium">
                    Svara med e-post
                  </a>
                </div>
                {visible.messages && visible.messages.length > 0 ? (
                  <ol className="mt-4 space-y-2">
                    {visible.messages.map((item) => (
                      <li key={item.id} className="rounded-2xl bg-paper px-3 py-2 text-sm">
                        <span className="text-xs text-soft">{item.role === "admin" ? "Support" : item.role === "user" ? "Användare" : "Assistent"}</span>
                        <p className="mt-1 whitespace-pre-wrap leading-relaxed">{item.body}</p>
                      </li>
                    ))}
                  </ol>
                ) : null}
                <label className="mt-4 block text-sm font-medium">
                  Svar i chatten
                  <textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    className="mt-2 min-h-24 w-full rounded-2xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                  />
                </label>
                <Button className="mt-3" disabled={busy || reply.trim().length < 1} onClick={() => void sendReply()}>
                  {busy ? "Skickar…" : "Skicka svar"}
                </Button>
              </article>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
