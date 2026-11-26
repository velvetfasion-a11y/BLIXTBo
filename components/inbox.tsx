"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Countdown } from "@/components/countdown";
import { EmptyState } from "@/components/ui";
import { formatDateTime, relative } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Notice, NoticeKind } from "@/lib/types";

const KIND: Record<NoticeKind, string> = {
  listing: "Ny bostad",
  status: "Ansökan",
  fee: "Avgift",
  queue: "Kö",
  system: "Blixtbo",
};

export function Inbox() {
  const store = useStore();
  const router = useRouter();

  useEffect(() => {
    document.title = "Notiser · Blixtbo";
  }, []);

  const offer = store.notifications.find((notice) => notice.deadlineAt && notice.title.startsWith("Grattis"));
  const groups = group(store.notifications.filter((notice) => notice.id !== offer?.id));

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6 md:px-8 md:py-10">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-soft">Direkt, utan att du behöver leta</p>
          <h1 className="mt-1 font-serif text-4xl tracking-[-0.03em]">Notiser</h1>
        </div>
        {store.notifications.some((notice) => !notice.read) ? (
          <button type="button" className="text-sm text-soft" onClick={() => store.markAllRead()}>
            Markera lästa
          </button>
        ) : null}
      </div>
      {offer?.deadlineAt ? (
        <button
          type="button"
          className="mt-6 w-full rounded-3xl border border-line bg-card p-5 text-left"
          onClick={() => {
            store.markRead(offer.id);
            router.push(offer.href);
          }}
        >
          <p className="text-sm font-medium text-pine">Erbjudande</p>
          <p className="mt-2 font-serif text-3xl tracking-[-0.03em]">{offer.title}</p>
          <p className="mt-2 text-sm text-soft">Svara senast {formatDateTime(offer.deadlineAt)}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            <Countdown deadline={offer.deadlineAt} />
          </p>
        </button>
      ) : null}
      {store.notifications.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Inget nytt"
            body="Nya annonser, köavgifter och besked på ansökningar samlas här."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((groupItem) => (
            <section key={groupItem.label}>
              <h2 className="text-xs font-medium tracking-wide text-faint">{groupItem.label}</h2>
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
                {groupItem.items.map((notice) => (
                  <li key={notice.id} className="px-4 py-4">
                    <div className="flex gap-3">
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notice.read ? "bg-transparent" : "bg-pine"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-xs text-soft">{KIND[notice.kind]}</span>
                          <span className="text-xs text-faint">{relative(notice.at)}</span>
                        </div>
                        <p className="mt-1 font-medium">{notice.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-soft">{notice.body}</p>
                        {notice.actionHref ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <NoticeLink
                              href={notice.actionHref}
                              label={notice.actionLabel || "Öppna"}
                              onOpen={() => store.markRead(notice.id)}
                            />
                            {notice.secondaryHref ? (
                              <NoticeLink
                                href={notice.secondaryHref}
                                label={notice.secondaryLabel || "Öppna"}
                                quiet
                                onOpen={() => store.markRead(notice.id)}
                              />
                            ) : null}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="mt-2 text-sm text-clay"
                            onClick={() => {
                              store.markRead(notice.id);
                              router.push(notice.href);
                            }}
                          >
                            Visa
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function external(href: string) {
  return href.startsWith("http://") || href.startsWith("https://");
}

function NoticeLink({ href, label, onOpen, quiet = false }: { href: string; label: string; onOpen: () => void; quiet?: boolean }) {
  const router = useRouter();
  const className = quiet
    ? "inline-flex h-9 items-center rounded-full border border-line px-3 text-sm"
    : "inline-flex h-9 items-center rounded-full bg-ink px-3 text-sm font-medium text-paper";
  if (external(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className} onClick={onOpen}>
        {label}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        onOpen();
        router.push(href);
      }}
    >
      {label}
    </button>
  );
}

function group(notices: Notice[]) {
  const today: typeof notices = [];
  const yesterday: typeof notices = [];
  const older: typeof notices = [];
  const now = new Date();
  for (const notice of notices) {
    const date = new Date(notice.at);
    const day = Math.floor((start(now) - start(date)) / 86400000);
    if (day <= 0) today.push(notice);
    else if (day === 1) yesterday.push(notice);
    else older.push(notice);
  }
  return [
    { label: "Idag", items: today },
    { label: "Igår", items: yesterday },
    { label: "Tidigare", items: older },
  ].filter((item) => item.items.length > 0);
}

function start(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
