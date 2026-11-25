/**
 * Cookieless analytics. No-ops unless NEXT_PUBLIC_ANALYTICS_SRC and
 * NEXT_PUBLIC_ANALYTICS_WEBSITE_ID are set. Never send names, emails, or listing text.
 */

export const ANALYTICS_EVENTS = [
  "pageview",
  "signup",
  "login",
  "swipe",
  "apply",
  "payment_success",
  "payment_failed",
  "trial_started",
  "subscription_paused",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

const PROP_KEYS = new Set(["direction", "sourceId", "mode"]);

type Umami = {
  track: (event?: string | ((props: { url: string }) => { url: string }), data?: Record<string, string>) => void;
};

function umami(): Umami | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as Window & { umami?: Umami }).umami;
  return candidate ?? null;
}

export function analyticsEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_ANALYTICS_SRC && process.env.NEXT_PUBLIC_ANALYTICS_WEBSITE_ID);
}

export function sanitizeProps(data?: Record<string, string | number | undefined>) {
  const clean: Record<string, string> = {};
  if (!data) return clean;
  for (const [key, value] of Object.entries(data)) {
    if (!PROP_KEYS.has(key) || value == null) continue;
    const text = String(value);
    if (text.includes("@") || text.length > 64) continue;
    if (key === "direction" && text !== "yes" && text !== "no") continue;
    if (key === "mode" && text !== "auto" && text !== "manual") continue;
    if (key === "sourceId" && !/^[a-z0-9-]{1,64}$/i.test(text)) continue;
    clean[key] = text;
  }
  return clean;
}

function collect(event: AnalyticsEvent, data?: Record<string, string>) {
  const api = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8080";
  const body = JSON.stringify({ event, data: data ?? {} });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(`${api.replace(/\/$/, "")}/analytics/collect`, new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch(`${api.replace(/\/$/, "")}/analytics/collect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function trackPageView(path: string) {
  const url = path.split("?")[0] || "/";
  if (analyticsEnabled()) {
    umami()?.track((props) => ({ ...props, url }));
  }
  collect("pageview", {});
}

export function track(event: Exclude<AnalyticsEvent, "pageview">, data?: Record<string, string | number | undefined>) {
  const clean = sanitizeProps(data);
  if (analyticsEnabled()) {
    umami()?.track(event, clean);
  }
  collect(event, clean);
}
