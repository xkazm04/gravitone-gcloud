// The part workspace's pure rules (STEPS-DESIGN §1): how a verdict is drawn, how a tab names its
// state, how a clock reads, and how a keyboard walk moves. One table each, so the editors, the
// tabs and the kit cannot draw the same verdict two ways.
import type { PartTab, VerdictState } from "@gt/domain/partView";

import type { Look } from "../status/status.ts";

/** A verdict as the status vocabulary draws it. WORKING is amber (it waits on the operator, it is
 *  not a running job), and anything unknown reads as blocked, never as ready (registry
 *  status-vocabulary/status-color-mapping: the fallback is the least approved state). */
export const VERDICT_LOOK: { readonly [S in VerdictState]: Look } = { empty: "idle", working: "awaiting", ready: "done", blocked: "failed" };
export const verdictLook = (s: string): Look => (s in VERDICT_LOOK ? VERDICT_LOOK[s as VerdictState] : "failed");

/** The tab rail's mark per state - a shape, never colour alone (v1 Stepper.tsx's glyphs). */
export function tabMark(t: Pick<PartTab, "kind" | "verdict" | "editor">): { readonly glyph: string; readonly spoken: string } {
  if (t.kind === "gate") return { glyph: "◆", spoken: "gate" };
  if (t.kind === "slot") return { glyph: "▸", spoken: "slot" };
  if (!t.editor || t.verdict === null) return { glyph: "·", spoken: "no editor yet" };
  return { empty: { glyph: "", spoken: "empty" }, working: { glyph: "○", spoken: "working" }, ready: { glyph: "✓", spoken: "ready" }, blocked: { glyph: "▲", spoken: "blocked" } }[t.verdict];
}

/** m:ss from seconds, rounded to the second - v1 drew "120.00000000000004s" (INVENTORY §7.5). */
export function clock(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Seconds as a short figure: `4.5s`, never a float tail. */
export const secs = (n: number): string => `${Math.round(n * 10) / 10}s`;

/**
 * One step of a keyboard walk over ids, by IDENTITY (registry accessibility/keyboard-navigation-
 * models: a refresh that reorders or drops items keeps the walk on the same item, or on its
 * nearest surviving neighbour). Wraps at the ends; from nothing, J starts at the top and K at
 * the bottom.
 */
export function walk(ids: readonly string[], current: string | null, dir: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const at = current === null ? -1 : ids.indexOf(current);
  if (at < 0) return dir === 1 ? (ids[0] ?? null) : (ids[ids.length - 1] ?? null);
  return ids[(at + dir + ids.length) % ids.length] ?? null;
}

/** The editable tab before or after `key` in recipe order, skipping parts with no editor. */
export function stepTab(tabs: readonly PartTab[], key: string, dir: 1 | -1): PartTab | null {
  const open = tabs.filter((t) => t.editor);
  const at = open.findIndex((t) => t.key === key);
  if (at < 0) return null;
  return open[at + dir] ?? null;
}
