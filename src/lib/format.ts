import type { Preferences } from "./types";

const DEFAULT: Preferences = {
  currency_symbol: "৳",
  currency_decimals: 2,
  date_format: "DD-MMM-YYYY",
  number_grouping: "international",
  session_timeout_minutes: 30,
};

/** Format a number with the configured grouping (1,234,567.00 or 12,34,567.00). */
export function formatNumber(value: number, prefs: Preferences = DEFAULT): string {
  const decimals = prefs.currency_decimals ?? 2;
  const locale = prefs.number_grouping === "lakh" ? "en-IN" : "en-US";
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value));
  return value < 0 ? `(${formatted})` : formatted;
}

export function formatAmount(value: number, prefs: Preferences = DEFAULT): string {
  return `${prefs.currency_symbol ?? ""} ${formatNumber(value, prefs)}`.trim();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format an ISO date (yyyy-mm-dd or full timestamp) with the configured format. */
export function formatDate(value: string | null | undefined, prefs: Preferences = DEFAULT): string {
  if (!value) return "";
  const date = new Date(value.length === 10 ? value + "T00:00:00" : value);
  if (Number.isNaN(date.getTime())) return value;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  switch (prefs.date_format) {
    case "DD/MM/YYYY":
      return `${dd}/${mm}/${yyyy}`;
    case "YYYY-MM-DD":
      return `${yyyy}-${mm}-${dd}`;
    case "MM/DD/YYYY":
      return `${mm}/${dd}/${yyyy}`;
    default:
      return `${dd}-${MONTHS[date.getMonth()]}-${yyyy}`;
  }
}

export function formatDateTime(value: string | null | undefined, prefs: Preferences = DEFAULT): string {
  if (!value) return "";
  const date = new Date(value);
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${formatDate(value, prefs)} ${time}`;
}

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
