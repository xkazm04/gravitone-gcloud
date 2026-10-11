// FORMATTING — durations and relative ages. Split out of book.ts. Moved verbatim.
// The clock import is deliberately from the kit's Player module, not the kit
// index (see the note on it below).
// The kit's own clock, from its module rather than the kit index: the index
// imports the kit's stylesheets, and this model is also read by a Node probe
// (tests/golden-path/library-audio.probe.spec.ts) that has no CSS loader.
import { clock } from "@/components/kit/Player";

/* ── formatting ────────────────────────────────────────────────────────── */

export function dur(s: number | null): string {
  if (s == null) return "—";
  return s < 10 ? `${s.toFixed(1)}s` : clock(s);
}

/** When the document opened. Ages are read against this one instant rather
 *  than a clock per render, so a re-render never moves "1h" to "2h" under a
 *  glance — and a render stays a pure function of its inputs. */
export const OPENED_AT = typeof performance !== "undefined" ? performance.timeOrigin : 0;

export function ago(ms: number, now: number): string {
  const d = (now - ms) / 86400000;
  if (d < 0) return new Date(ms).toISOString().slice(0, 10);
  if (d < 1 / 24) return `${Math.max(1, Math.round(d * 1440))}m`;
  if (d < 1) return `${Math.round(d * 24)}h`;
  if (d < 60) return `${Math.round(d)}d`;
  return `${Math.round(d / 30)}mo`;
}
