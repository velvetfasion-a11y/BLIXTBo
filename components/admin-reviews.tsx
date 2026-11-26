"use client";

import { useEffect, useState } from "react";
import { Button, cx } from "@/components/ui";
import { formatLongDate } from "@/lib/format";
import { downloadAdminReviews, loadAdminReviews, type AdminReviewReport } from "@/lib/reviews-client";

const FILTERS = [
  { id: "", label: "Alla" },
  { id: "1", label: "1" },
  { id: "2", label: "2" },
  { id: "3", label: "3" },
  { id: "4", label: "4" },
  { id: "5", label: "5" },
];

const EMPTY: AdminReviewReport = {
  average: null,
  count: 0,
  distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
  reviews: [],
};

export function AdminReviews() {
  const [rating, setRating] = useState("");
  const [report, setReport] = useState<AdminReviewReport>(EMPTY);
  const [error, setError] = useState("");
  const [loadedRating, setLoadedRating] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const loading = loadedRating !== rating;

  useEffect(() => {
    document.title = "Recensioner · Blixtbo admin";
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadAdminReviews(rating).then(({ response, data }) => {
      if (cancelled) return;
      if (response.status === 404) {
        setReport(EMPTY);
        setError("Bara administratören kan se recensioner.");
        setLoadedRating(rating);
        return;
      }
      if (!response.ok || !data || typeof data.count !== "number") {
        setReport(EMPTY);
        setError("Recensionerna gick inte att hämta.");
        setLoadedRating(rating);
        return;
      }
      setReport({
        average: typeof data.average === "number" ? data.average : null,
        count: data.count,
        distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, ...data.distribution },
        reviews: Array.isArray(data.reviews) ? data.reviews : [],
      });
      setError("");
      setLoadedRating(rating);
    }).catch(() => {
      if (cancelled) return;
      setReport(EMPTY);
      setError("Recensionerna gick inte att hämta.");
      setLoadedRating(rating);
    });
    return () => {
      cancelled = true;
    };
  }, [rating]);

  async function exportCsv() {
    setExporting(true);
    setError("");
    try {
      const csv = await downloadAdminReviews(rating);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "recensioner.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Exporten gick inte att hämta.");
    } finally {
      setExporting(false);
    }
  }

  const average =
    report.average == null
      ? "–"
      : new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(report.average);
  const maxBar = Math.max(1, ...Object.values(report.distribution));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-[-0.03em]">Recensioner</h1>
          <p className="mt-2 text-sm text-soft">Betyg från den som fått en lägenhet. Snitt och fördelning gäller alla recensioner.</p>
        </div>
        <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting || loading}>
          Exportera CSV
        </Button>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl border border-line bg-card px-4 py-4">
          <p className="text-xs text-soft">Snittbetyg</p>
          <p className="num mt-2 text-3xl font-semibold tracking-tight">{loading ? "…" : average}</p>
          <p className="mt-1 text-xs text-faint">{report.count} recensioner</p>
        </div>
        <div className="rounded-3xl border border-line bg-card px-4 py-4">
          <p className="text-xs text-soft">Fördelning</p>
          <ul className="mt-3 space-y-2">
            {["5", "4", "3", "2", "1"].map((star) => {
              const count = report.distribution[star] ?? 0;
              return (
                <li key={star} className="grid grid-cols-[1.5rem_1fr_2rem] items-center gap-2 text-xs">
                  <span>{star}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-paper-deep">
                    <span className="block h-full rounded-full bg-pine" style={{ width: `${(count / maxBar) * 100}%` }} />
                  </span>
                  <span className="num text-right text-soft">{count}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filtrera på betyg">
        {FILTERS.map((item) => (
          <button
            key={item.id || "alla"}
            type="button"
            onClick={() => setRating(item.id)}
            className={cx(
              "h-9 rounded-full px-3 text-sm",
              rating === item.id ? "bg-ink text-paper" : "bg-card text-soft ring-1 ring-line",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {loading ? <p className="mt-4 text-sm text-soft">Hämtar recensioner…</p> : null}
      {!loading && !error && report.reviews.length === 0 ? (
        <p className="mt-4 text-sm text-soft">{rating ? "Inga recensioner med det betyget." : "Inga recensioner ännu."}</p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {report.reviews.map((review) => (
          <li key={review.id} className="rounded-3xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <Stars value={review.rating} />
              <p className="text-xs text-faint">{formatLongDate(review.createdAt)}</p>
            </div>
            <p className="mt-3 text-sm leading-relaxed">{review.text || "Ingen text"}</p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-soft">Hyresvärd</dt>
                <dd className="mt-1">{review.landlord || "–"}</dd>
              </div>
              <div>
                <dt className="text-xs text-soft">Samtycke</dt>
                <dd className="mt-1">{review.publishConsent ? "Ja" : "Nej"}</dd>
              </div>
              <div>
                <dt className="text-xs text-soft">E-post</dt>
                <dd className="mt-1 break-all">{review.email}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <p aria-label={`${value} av 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= value ? "text-ink" : "text-faint"}>
          ★
        </span>
      ))}
    </p>
  );
}
