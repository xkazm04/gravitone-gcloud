import { cellId, type Night } from "./types.ts";
import type { ScoutWing } from "./wing.ts";

// THE MUSE WING'S REPEAT GUARD (spark scout-use-aim). Night 2026-10-23-2 drew all 32 cards of night
// 2026-10-23 again: the brief the author read named no card that had been thrown. A character brief is
// refused - the whole batch, like every other fault at the ideas door - when her card's name or her
// `look` slug matches an earlier character of the wing, in any night on disk (open, closed, committed or
// not) or earlier in the same batch, UNLESS that earlier one was KEPT: a kept woman is drawn again by
// design (scenes restate her card). Only a character brief is checked, only in the muse wing; the scout
// wing and every other target pass untouched. An earlier candidate that failed was never drawn and
// does not count. A legacy candidate carries no `look` and matches on her card's name alone.

/** What a brief needs to be checked: its target, card and look. */
export type RepeatBrief = { readonly target: string; readonly card?: { readonly name: string }; readonly look?: string };

type Earlier = { readonly where: string; readonly name: string | undefined; readonly look: string | undefined; readonly verdict: "kept" | "rejected" | "undecided" | "this batch" };

const norm = (s: string): string => s.trim().toLowerCase();

function earlierOf(nights: readonly Night[]): Earlier[] {
  const out: Earlier[] = [];
  for (const n of nights) {
    for (const c of n.candidates) {
      if (c.kind !== "idea" || c.target !== "character" || c.status === "failed") continue;
      const cell = cellId(c.id, "board");
      const verdict = n.committed?.kept.includes(cell) ? "kept" : n.committed?.rejected.includes(cell) ? "rejected" : "undecided";
      out.push({ where: `${n.id}/${c.id}`, name: c.card?.name, look: c.look, verdict });
    }
  }
  return out;
}

/**
 * The first refused character brief's place and reason, or undefined. `nights` is every night of the
 * active wing, the one being written to included, as the caller holds it.
 */
export function repeatRefusal(briefs: readonly RepeatBrief[], nights: readonly Night[], wing: ScoutWing): string | undefined {
  if (wing !== "muse") return undefined;
  const earlier = earlierOf(nights);
  for (const [i, b] of briefs.entries()) {
    if (b.target !== "character") continue;
    const name = b.card === undefined ? undefined : norm(b.card.name);
    const byName = name === undefined ? [] : earlier.filter((e) => e.name !== undefined && norm(e.name) === name);
    const byLook = b.look === undefined ? [] : earlier.filter((e) => e.look === b.look);
    const hit = (hits: readonly Earlier[]): Earlier | undefined => (hits.some((e) => e.verdict === "kept") ? undefined : hits[0]);
    const n = hit(byName);
    if (n !== undefined) return `idea ${i + 1}: card ${b.card?.name ?? ""} already drawn in ${n.where} (${n.verdict})`;
    const l = hit(byLook);
    if (l !== undefined) return `idea ${i + 1}: look ${b.look ?? ""} already drawn in ${l.where} (${l.verdict})`;
    earlier.push({ where: `idea ${i + 1}`, name: b.card?.name, look: b.look, verdict: "this batch" });
  }
  return undefined;
}

/** `## Already drawn`: every muse character of `nights`, newest night first, decided or not - the names the next author must not draw again. */
export function alreadyDrawn(nights: readonly Night[]): string[] {
  const rows: string[] = [];
  for (const n of nights) {
    for (const c of n.candidates) {
      if (c.kind !== "idea" || c.target !== "character" || c.card === undefined || c.status === "failed") continue;
      const cell = cellId(c.id, "board");
      const verdict = n.committed?.kept.includes(cell) ? "kept" : n.committed?.rejected.includes(cell) ? "rejected" : "undecided";
      rows.push(`- ${c.card.name}${c.look === undefined ? "" : ` · look: ${c.look}`} (${n.id}/${c.id}, ${verdict})`);
    }
  }
  return ["## Already drawn", "", ...(rows.length === 0 ? ["- none yet"] : rows), ""];
}
