type BrowserNav = { userAgent: string; platform: string; maxTouchPoints: number };

function authCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error && typeof error.code === "string") return error.code;
  return "";
}

/** iPhone, iPod, and iPad Safari. Other iOS browsers stay on the popup path. */
export function isMobileSafari(nav?: BrowserNav) {
  const current = nav ?? (typeof navigator === "undefined" ? undefined : navigator);
  if (!current) return false;
  const ua = current.userAgent || "";
  const iOSDevice = /iP(hone|ad|od)/.test(ua);
  const iPadOs = current.platform === "MacIntel" && current.maxTouchPoints > 1;
  if (!iOSDevice && !iPadOs) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|GSA\//.test(ua)) return false;
  return /Safari/i.test(ua);
}

export function isPopupBlocked(error: unknown) {
  const code = authCode(error);
  return code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment";
}

function cancelled(error: unknown) {
  const code = authCode(error);
  return code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" || code === "auth/redirect-cancelled-by-user";
}

export function googleErrorMessage(error: unknown) {
  const code = authCode(error);
  if (cancelled(error)) return "";
  if (code === "auth/account-exists-with-different-credential") {
    return "E-postadressen används redan med ett annat sätt att logga in. Fortsätt med det du använde först.";
  }
  if (code === "auth/unauthorized-domain") return "Den här adressen är inte godkänd för Google-inloggning.";
  if (code === "auth/network-request-failed") return "Nätverket avbröt inloggningen. Försök igen.";
  if (code === "auth/web-storage-unsupported") return "Webbläsaren blockerar inloggningen. Tillåt cookies och försök igen.";
  return "Det gick inte att logga in med Google. Försök igen.";
}

export function appleErrorMessage(error: unknown) {
  const code = authCode(error);
  if (cancelled(error)) return "Apple-inloggningen avbröts.";
  if (code === "auth/account-exists-with-different-credential") {
    return "E-postadressen används redan med ett annat sätt att logga in. Fortsätt med det du använde först.";
  }
  if (code === "auth/unauthorized-domain") return "Den här adressen är inte godkänd för Apple-inloggning.";
  if (code === "auth/network-request-failed") return "Nätverket avbröt inloggningen. Försök igen.";
  if (code === "auth/web-storage-unsupported") return "Webbläsaren blockerar inloggningen. Tillåt cookies och försök igen.";
  return "Det gick inte att logga in med Apple. Försök igen.";
}

/** Name Apple shares once. Later sign-ins only have what was stored on the profile. */
export function appleDisplayName(input: { displayName?: string | null; profile?: Record<string, unknown> | null }) {
  const direct = input.displayName?.trim();
  if (direct) return direct;
  const profile = input.profile;
  if (!profile) return "";
  const name = profile.name;
  if (typeof name === "string") return name.trim();
  if (!name || typeof name !== "object") return "";
  const record = name as { firstName?: unknown; lastName?: unknown };
  return [record.firstName, record.lastName]
    .filter((part): part is string => typeof part === "string")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}
