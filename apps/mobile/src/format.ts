export function kronor(value: number) {
  return `${new Intl.NumberFormat("sv-SE").format(value)} kr`;
}

export function when(iso: string | null | undefined) {
  if (!iso) return "ännu inte";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "okänt datum";
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function connectionStatus(status: string) {
  if (status === "active") return "Kopplad";
  if (status === "needs_user") return "Behöver dig";
  if (status === "needs_bankid") return "BankID hos hyresvärden";
  if (status === "pending" || status === "pending_approval") return "Väntar";
  return "Inte kopplad";
}

const APPLICATION_STATUS: Record<string, string> = {
  skickad: "Skickad",
  visning: "Visning",
  erbjuden: "Erbjuden",
  accepterad: "Accepterad",
  avbojd: "Avböjd",
  kontrakt: "Kontrakt",
  nekad: "Nekad",
  aterkallad: "Återkallad",
};

export function applicationStatus(status: string | undefined) {
  if (!status) return "Okänd";
  return APPLICATION_STATUS[status] ?? status;
}

export function hasPremium(entitlement: { plan?: string; status?: string }) {
  return entitlement.plan === "premium" && (entitlement.status === "active" || entitlement.status === "trialing");
}
