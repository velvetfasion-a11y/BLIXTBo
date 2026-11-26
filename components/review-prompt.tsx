"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button, Sheet, cx } from "@/components/ui";
import { pickAutoPrompt } from "@/lib/review-prompt";
import { loadReviews, readSkips, submitReview, writeSkips, type SavedReview } from "@/lib/reviews-client";
import { useStore } from "@/lib/store";

type ReviewContextValue = {
  open: (applicationId: string) => void;
  reviewFor: (applicationId: string) => SavedReview | undefined;
};

const ReviewContext = createContext<ReviewContextValue | null>(null);

const NEGATIVE = new Set(["nekad", "avbojd", "aterkallad"]);

export function ReviewApplicationAction({ applicationId, status }: { applicationId: string; status: string }) {
  const ctx = useContext(ReviewContext);
  if (!ctx) return null;
  const review = ctx.reviewFor(applicationId);
  if (!review && NEGATIVE.has(status)) return null;
  return (
    <button type="button" onClick={() => ctx.open(review?.applicationId ?? applicationId)} className="text-sm font-medium text-pine">
      {review ? "Ändra recension" : "Jag fick en lägenhet!"}
    </button>
  );
}

export function ReviewPrompt({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const email = store.user?.email ?? "";
  const demo = Boolean(store.user?.demo);
  const [reviews, setReviews] = useState<SavedReview[]>([]);
  const [skips, setSkips] = useState<Record<string, number>>({});
  const [readyKey, setReadyKey] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const shown = useRef(new Set<string>());
  const loadKey = `${email}:${demo ? "1" : "0"}`;
  const ready = readyKey === loadKey && email !== "";

  useEffect(() => {
    let cancelled = false;
    void loadReviews(email, demo).then((rows) => {
      if (cancelled) return;
      setReviews(rows);
      setSkips(readSkips(email));
      setReadyKey(loadKey);
    });
    return () => {
      cancelled = true;
    };
  }, [email, demo, loadKey]);

  const reviewedApplicationIds = useMemo(() => new Set(reviews.map((item) => item.applicationId)), [reviews]);
  const reviewedListingIds = useMemo(() => new Set(reviews.map((item) => item.listingId).filter(Boolean)), [reviews]);

  useEffect(() => {
    if (!ready || openId || !email) return;
    const id = pickAutoPrompt(store.applications, reviewedListingIds, reviewedApplicationIds, skips, shown.current);
    if (!id) return;
    shown.current.add(id);
    setOpenId(id);
  }, [ready, openId, email, store.applications, reviewedListingIds, reviewedApplicationIds, skips]);

  const reviewFor = useCallback(
    (applicationId: string) => {
      const application = store.applications.find((item) => item.id === applicationId);
      return (
        reviews.find((item) => item.applicationId === applicationId) ??
        reviews.find((item) => Boolean(application && item.listingId && item.listingId === application.listingId))
      );
    },
    [reviews, store.applications],
  );

  function dismiss() {
    if (!openId) return;
    const existing = reviewFor(openId);
    if (!existing) {
      const next = { ...skips, [openId]: (skips[openId] ?? 0) + 1 };
      setSkips(next);
      if (email) writeSkips(email, next);
    }
    setOpenId(null);
  }

  function saved(review: SavedReview) {
    setReviews((current) => {
      const rest = current.filter((item) => {
        if (item.applicationId === review.applicationId) return false;
        if (review.listingId && item.listingId === review.listingId) return false;
        return true;
      });
      return [review, ...rest];
    });
  }

  const value = useMemo<ReviewContextValue>(
    () => ({
      open: (applicationId) => {
        shown.current.add(applicationId);
        setOpenId(applicationId);
      },
      reviewFor,
    }),
    [reviewFor],
  );

  const application = store.applications.find((item) => item.id === openId);
  const listing = store.listings.find((item) => item.id === application?.listingId);
  const landlord = listing?.sourceName || store.sources.find((item) => item.id === listing?.sourceId)?.name || "";

  return (
    <ReviewContext.Provider value={value}>
      {children}
      <ReviewDialog
        key={openId ?? "stangd"}
        open={Boolean(application)}
        applicationId={application?.id ?? ""}
        listingId={application?.listingId ?? ""}
        landlord={landlord}
        existing={application ? reviewFor(application.id) : undefined}
        email={email}
        demo={demo}
        onClose={dismiss}
        onSaved={saved}
      />
    </ReviewContext.Provider>
  );
}

function ReviewDialog({
  open,
  applicationId,
  listingId,
  landlord,
  existing,
  email,
  demo,
  onClose,
  onSaved,
}: {
  open: boolean;
  applicationId: string;
  listingId: string;
  landlord: string;
  existing?: SavedReview;
  email: string;
  demo: boolean;
  onClose: () => void;
  onSaved: (review: SavedReview) => void;
}) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [text, setText] = useState(existing?.text ?? "");
  const [consent, setConsent] = useState(existing?.publishConsent ?? false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [done, setDone] = useState(false);

  async function send() {
    if (rating < 1) {
      setError("Välj ett betyg.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await submitReview(
        email,
        { applicationId, listingId, rating, text: text.trim(), landlord, publishConsent: consent },
        Boolean(existing),
        demo,
      );
      onSaved(result.review);
      setGoogleReviewUrl(result.googleReviewUrl);
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Det gick inte att spara recensionen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} title={existing ? "Ändra din recension" : "Grattis till nya hemmet! Hur hjälpte Blixtbo dig?"} onClose={onClose}>
      {done ? (
        <div>
          <h2 className="font-serif text-3xl tracking-[-0.03em]">Tack.</h2>
          <p className="mt-3 text-sm leading-relaxed text-soft">Det hjälper andra att förstå hur Blixtbo fungerade för dig.</p>
          {googleReviewUrl ? (
            <a
              href={googleReviewUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-pine px-5 text-base font-medium text-white hover:bg-pine-deep"
            >
              Ge oss ett betyg på Google
            </a>
          ) : null}
          <Button variant="outline" className="mt-3 w-full" onClick={onClose}>
            Stäng
          </Button>
        </div>
      ) : (
        <div>
          <h2 className="font-serif text-3xl tracking-[-0.03em]">
            {existing ? "Ändra din recension" : "Grattis till nya hemmet! Hur hjälpte Blixtbo dig?"}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-soft">Betyget är 1 till 5. Texten är valfri.</p>
          <div role="radiogroup" aria-label="Betyg" className="mt-5 flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={rating === star}
                aria-label={`${star} av 5`}
                onClick={() => setRating(star)}
                className={cx(
                  "h-12 w-12 rounded-2xl text-2xl",
                  star <= rating ? "bg-ink text-paper" : "bg-card text-faint ring-1 ring-line",
                )}
              >
                ★
              </button>
            ))}
          </div>
          <label className="mt-5 block text-sm font-medium">
            Text
            <textarea
              value={text}
              maxLength={1000}
              onChange={(event) => setText(event.target.value)}
              placeholder="Berätta gärna, om du vill."
              className="mt-2 min-h-28 w-full rounded-2xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-ink"
            />
          </label>
          <p className="mt-1 text-right text-xs text-faint">{text.length}/1000</p>
          <label className="mt-4 flex items-start gap-3 text-sm leading-relaxed">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 h-5 w-5 accent-pine"
            />
            <span>Ni får visa min recension (bara förnamn)</span>
          </label>
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          <div className="mt-6 flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Inte nu
            </Button>
            <Button variant="pine" className="flex-1" onClick={() => void send()} disabled={busy}>
              Skicka
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
