// Figures as the wizard prints them: a length, a loudness, a date. One spelling each.
import type { ReleaseKind } from "@gt/domain/release";

export const clock = (s: number): string => {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

/** A signed decibel figure with one decimal and a true minus: `−8.9`. */
export const db = (v: number): string => `${v < 0 ? "−" : v > 0 ? "+" : ""}${Math.abs(v).toFixed(1)}`;

export const KIND_LABEL: Readonly<Record<ReleaseKind, string>> = { single: "single", ep: "EP", album: "album" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-12-05` as `Dec 5, 2026`; anything that is not a date comes back as typed. */
export function day(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m === null) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month === undefined ? iso : `${month} ${Number(m[3])}, ${m[1]}`;
}

/** An empty or blank field is the absent value, `null` (release.ts's convention). */
export const orNull = (v: string): string | null => (v.trim() === "" ? null : v);
