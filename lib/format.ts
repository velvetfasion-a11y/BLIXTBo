export function kr(value: number) {
  return `${new Intl.NumberFormat("sv-SE").format(Math.round(value))} kr`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("sv-SE").format(value);
}

export function formatDate(iso: string) {
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "short",
  }).format(date);
}

export function formatDayMonth(iso: string) {
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "long",
  }).format(date);
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string) {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

export function monthYear(iso: string) {
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return new Intl.DateTimeFormat("sv-SE", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function relative(iso: string, now = Date.now()) {
  const diff = now - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just nu";
  if (min < 60) return `${min} min sedan`;
  const hours = Math.round(min / 60);
  if (hours < 24) return hours === 1 ? "1 timme sedan" : `${hours} timmar sedan`;
  const days = Math.round(hours / 24);
  if (days === 1) return "igår";
  if (days < 7) return `${days} dagar sedan`;
  return formatDate(iso);
}

export function freshness(iso: string, now = Date.now()) {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return "Ny – just nu";
  if (min < 60) return `Ny – ${min} min sedan`;
  if (min < 60 * 18) return `Idag · ${formatTime(iso)}`;
  const days = Math.round(min / (60 * 24));
  if (days <= 1) return "Igår";
  return formatDate(iso);
}

export function deadlineLabel(iso: string | null, now = Date.now()) {
  if (!iso) return "Först till kvarn";
  const date = new Date(iso);
  const today = new Date(now);
  const time = formatTime(iso);
  if (date.toDateString() === today.toDateString()) return `Ansök senast idag ${time}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return `Ansök senast imorgon ${time}`;
  return `Ansök senast ${formatDate(iso)} ${time}`;
}

export function rok(rooms: number) {
  return rooms === 1 ? "1 rum och kök" : `${rooms} rum och kök`;
}

export function rokShort(rooms: number) {
  return `${rooms} rok`;
}

export function floorLabel(floor: number, floors: number) {
  if (floor <= 0) return "Bottenvåning";
  return `Våning ${floor} av ${floors}`;
}

export function daysFromToday(iso: string, now = Date.now()) {
  const target = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  target.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function addDays(days: number, now = Date.now()) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function hoursAgo(hours: number, now = Date.now()) {
  return new Date(now - hours * 3600000).toISOString();
}

export function minutesAgo(minutes: number, now = Date.now()) {
  return new Date(now - minutes * 60000).toISOString();
}

export function atHour(dayOffset: number, hour: number, minute: number, now = Date.now()) {
  const date = new Date(now);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

export function syncLabel(minutes: number) {
  if (minutes < 2) return "Synkade just nu";
  if (minutes < 60) return `Synkade för ${minutes} min sedan`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Synkade för ${hours} timmar sedan`;
  return `Synkade för ${Math.round(hours / 24)} dagar sedan`;
}

export function parseMoney(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  return Number(digits);
}
