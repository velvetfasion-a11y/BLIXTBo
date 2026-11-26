export type AppPath = "/hem" | "/ansokningar" | "/kopplingar" | "/notiser" | "/installningar" | "/premium";

const APPLICATIONS = ["applied", "already_applied", "not_eligible", "needs_confirmation", "created", "status"];
const CONNECTIONS = [
  "logged_in",
  "password_changed",
  "session_expired",
  "needs_bankid",
  "needs_profile",
  "needs_identity",
  "needs_email",
  "captcha",
  "site_changed",
  "queue_action",
  "queue_ok",
  "rate_limited",
  "fee",
  "queue",
];

export function routeFromNotice(kind: string): AppPath {
  if (APPLICATIONS.includes(kind)) return "/ansokningar";
  if (CONNECTIONS.includes(kind)) return "/kopplingar";
  if (kind === "listing") return "/hem";
  return "/notiser";
}

export function routeFromHref(href: string | undefined | null): AppPath {
  const value = href ?? "";
  if (value.includes("ansokningar")) return "/ansokningar";
  if (value.includes("kopplingar")) return "/kopplingar";
  if (value.includes("premium")) return "/premium";
  if (value.includes("hem") || value.includes("bostad")) return "/hem";
  if (value.includes("installningar")) return "/installningar";
  return "/notiser";
}
