"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Field, TextArea } from "@/components/ui";
import {
  SUPPORT_CONFIRMATION,
  SUPPORT_PROMISE,
  readScreenshot,
  supportFetch,
  supportMetadata,
  type SupportMessage,
} from "@/lib/support-client";
import { useStore } from "@/lib/store";

type Panel = "chat" | "bug" | "support" | null;

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function readMessages(value: unknown): SupportMessage[] {
  const rows = asRecord(value).messages;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((item) => {
    const row = asRecord(item);
    const body = typeof row.body === "string" ? row.body : "";
    if (!body) return [];
    return [
      {
        id: String(row.id ?? body),
        role: String(row.role ?? "assistant"),
        body,
        createdAt: String(row.createdAt ?? ""),
      },
    ];
  });
}

export function SupportDesk({ heading = true }: { heading?: boolean }) {
  const store = useStore();
  const user = store.user;
  const [panel, setPanel] = useState<Panel>(null);
  const [chatOn, setChatOn] = useState(false);

  useEffect(() => {
    let stop = false;
    supportFetch("/support/assistant")
      .then(({ response, data }) => {
        if (!stop && response.ok) setChatOn(asRecord(data).available === true);
      })
      .catch(() => {
        if (!stop) setChatOn(false);
      });
    return () => {
      stop = true;
    };
  }, []);

  const items: Array<{ id: Exclude<Panel, null>; title: string; detail: string }> = [
    { id: "chat", title: "Chatta med support", detail: chatOn ? "Svar direkt, och en människa om det behövs" : "Öppnar formuläret när chatten är av" },
    { id: "bug", title: "Rapportera bugg", detail: "Vad som hände, och hur vi kan se det igen" },
    { id: "support", title: "Kontakta support", detail: "Fråga om konto, betalning eller bostäderna" },
  ];

  return (
    <section className={heading ? "mt-8" : "mt-4"}>
      {heading ? <h2 className="font-serif text-2xl tracking-[-0.03em]">Hjälp & support</h2> : null}
      <p className="mt-2 text-sm leading-relaxed text-soft">{SUPPORT_PROMISE}</p>
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
        {items.map((item) => {
          const open = panel === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setPanel(open ? null : item.id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
              >
                <span>
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="mt-0.5 block text-sm text-soft">{item.detail}</span>
                </span>
                <span className="text-soft">{open ? "–" : "→"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {!user && panel ? (
        <p className="mt-4 text-sm leading-relaxed text-soft">
          <Link href="/" className="font-medium text-pine">
            Logga in
          </Link>{" "}
          för att chatta eller skicka ett ärende.
        </p>
      ) : null}
      {user && panel === "bug" ? <BugForm email={user.email} demo={user.demo} /> : null}
      {user && panel === "support" ? <SupportForm email={user.email} demo={user.demo} /> : null}
      {user && panel === "chat" ? <ChatPanel email={user.email} demo={user.demo} enabled={chatOn} /> : null}
    </section>
  );
}

function BugForm({ email, demo }: { email: string; demo: boolean }) {
  const [replyTo, setReplyTo] = useState(email);
  const [message, setMessage] = useState("");
  const [steps, setSteps] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    setError("");
    if (!file) {
      setScreenshot("");
      setFileName("");
      return;
    }
    try {
      setScreenshot(await readScreenshot(file));
      setFileName(file.name);
    } catch (caught) {
      setScreenshot("");
      setFileName("");
      setError(caught instanceof Error ? caught.message : "Bilden gick inte att läsa.");
    }
  }

  async function submit() {
    if (busy) return;
    if (demo) {
      setError("Exempelkontot ligger bara i webbläsaren. Logga in med Google för att skicka ett ärende.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { response, detail } = await supportFetch("/support/tickets", {
        method: "POST",
        body: JSON.stringify({
          type: "bug",
          email: replyTo,
          message,
          steps,
          screenshot,
          metadata: supportMetadata(),
        }),
      });
      if (response.status === 401) {
        setError("Logga in med Google för att skicka ett ärende.");
        return;
      }
      if (!response.ok) {
        setError(detail || "Det gick inte att skicka.");
        return;
      }
      setDone(true);
    } catch {
      setError("Det gick inte att skicka. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <Thanks />;

  return (
      <div className="mt-4 rounded-3xl border border-line bg-card px-4 py-4">
        <h3 className="text-sm font-medium">Rapportera bugg</h3>
        <p className="mt-2 text-sm leading-relaxed text-soft">{SUPPORT_PROMISE}</p>
        <div className="mt-4 space-y-4">
          <Field label="E-post för svar" type="email" autoComplete="email" value={replyTo} onChange={(event) => setReplyTo(event.target.value)} />
          <TextArea label="Vad hände?" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Knappen gjorde inget när jag svepte" />
          <TextArea label="Steg, om du vill" value={steps} onChange={(event) => setSteps(event.target.value)} placeholder="Öppna hem, svep höger" className="min-h-24" />
          <label className="block text-sm font-medium">
            Skärmbild, valfritt
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="mt-2 block w-full text-sm text-soft"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
          </label>
          {fileName ? <p className="text-sm text-soft">{fileName}</p> : null}
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button className="w-full" disabled={busy || message.trim().length < 3} onClick={() => void submit()}>
            {busy ? "Skickar…" : "Skicka buggrapport"}
          </Button>
        </div>
      </div>
  );
}

function SupportForm({ email, demo }: { email: string; demo: boolean }) {
  const [replyTo, setReplyTo] = useState(email);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    if (demo) {
      setError("Exempelkontot ligger bara i webbläsaren. Logga in med Google för att skicka ett ärende.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { response, detail } = await supportFetch("/support/tickets", {
        method: "POST",
        body: JSON.stringify({
          type: "support",
          email: replyTo,
          subject,
          message,
          metadata: supportMetadata(),
        }),
      });
      if (response.status === 401) {
        setError("Logga in med Google för att skicka ett ärende.");
        return;
      }
      if (!response.ok) {
        setError(detail || "Det gick inte att skicka.");
        return;
      }
      setDone(true);
    } catch {
      setError("Det gick inte att skicka. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <Thanks />;

  return (
      <div className="mt-4 rounded-3xl border border-line bg-card px-4 py-4">
        <h3 className="text-sm font-medium">Kontakta support</h3>
        <p className="mt-2 text-sm leading-relaxed text-soft">{SUPPORT_PROMISE}</p>
        <div className="mt-4 space-y-4">
          <Field label="E-post för svar" type="email" autoComplete="email" value={replyTo} onChange={(event) => setReplyTo(event.target.value)} />
          <Field label="Ämne" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Fråga om provperioden" />
          <TextArea label="Meddelande" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Skriv vad du behöver hjälp med" />
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button className="w-full" disabled={busy || subject.trim().length < 3 || message.trim().length < 3} onClick={() => void submit()}>
            {busy ? "Skickar…" : "Skicka"}
          </Button>
        </div>
      </div>
  );
}

function ChatPanel({ email, demo, enabled }: { email: string; demo: boolean; enabled: boolean }) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demo) return;
    let stop = false;
    async function load() {
      try {
        const { response, data } = await supportFetch("/support/chat");
        if (!stop && response.ok) setMessages(readMessages(data));
      } catch {
        // The thread stays as it was. The form below still works.
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [demo]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    if (demo) {
      setError("Exempelkontot ligger bara i webbläsaren. Logga in med Google för att skicka ett ärende.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { response, data, detail } = await supportFetch("/support/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, email, metadata: supportMetadata() }),
      });
      if (response.status === 401) {
        setError("Logga in med Google för att chatta.");
        return;
      }
      if (response.status === 409) {
        setError(detail || "Chatten är inte påslagen. Använd formuläret.");
        return;
      }
      if (!response.ok) {
        setError(detail || "Det gick inte att skicka.");
        return;
      }
      setDraft("");
      setMessages(readMessages(data));
    } catch {
      setError("Det gick inte att skicka. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <div className="mt-4">
        <p className="text-sm leading-relaxed text-soft">Chatten är inte påslagen just nu. Skriv ett meddelande så tar support emot det.</p>
        <Thread messages={messages} />
        <SupportForm email={email} demo={demo} />
      </div>
    );
  }

  return (
      <div className="mt-4 rounded-3xl border border-line bg-card px-4 py-4">
        <h3 className="text-sm font-medium">Chatta med support</h3>
        <p className="mt-2 text-sm leading-relaxed text-soft">{SUPPORT_PROMISE}</p>
        <Thread messages={messages} />
        <div className="mt-4 space-y-3">
          <TextArea label="Meddelande" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Skriv din fråga" className="min-h-24" />
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button className="w-full" disabled={busy || draft.trim().length < 1} onClick={() => void send()}>
            {busy ? "Skickar…" : "Skicka"}
          </Button>
        </div>
      </div>
  );
}

function Thread({ messages }: { messages: SupportMessage[] }) {
  if (messages.length === 0) return null;
  return (
    <ol className="mt-4 space-y-3" aria-live="polite">
      {messages.map((item) => {
        const mine = item.role === "user";
        const label = item.role === "admin" ? "Support" : item.role === "user" ? "Du" : "Assistent";
        return (
          <li key={item.id} className={mine ? "ml-8 rounded-2xl bg-ink px-3 py-2 text-paper" : "mr-8 rounded-2xl border border-line bg-paper px-3 py-2"}>
            <p className={mine ? "text-xs text-paper/70" : "text-xs text-soft"}>{label}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{item.body}</p>
          </li>
        );
      })}
    </ol>
  );
}

function Thanks() {
  return (
    <p className="mt-4 rounded-3xl border border-line bg-card px-4 py-4 text-sm leading-relaxed text-pine-deep" role="status">
      {SUPPORT_CONFIRMATION}
    </p>
  );
}
