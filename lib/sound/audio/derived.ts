// THE TAKE'S DERIVED READERS — score, verdict, the rubric dimensions a take can
// be scored on, the verdict counts and the reject reasons. Everything here is a
// function of a Take; none of it is stored. Split out of book.ts so the readers
// sit apart from the type (./take.ts) and from the Asset reader
// (./takeFromAsset.ts). Moved verbatim.
import { RUBRIC, type Take, type Verdict } from "./take";

export function score(t: Take): number | null {
  if (!t.ratings) return null;
  const v = RUBRIC.map((r) => t.ratings![r.key]).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function verdict(t: Take): Verdict {
  if (t.status === "rejected") return "rejected";
  if (t.status === "kept") return (score(t) ?? 0) >= 7 ? "proven" : "kept";
  return "unjudged";
}

/** The rubric dimensions a take can be scored on. A looping effect has no
 *  melody (app.js#dimsFor). */
export function dimsFor(t: Take | undefined): number[] {
  return RUBRIC.map((_, i) => i).filter((i) => !(t && t.kind === "sfx" && t.loopable && i === 0));
}

export function counts(rows: readonly Take[]): Record<Verdict, number> {
  const c: Record<Verdict, number> = {
    proven: 0,
    kept: 0,
    unjudged: 0,
    rejected: 0,
  };
  for (const r of rows) c[verdict(r)]++;
  return c;
}

/** Reject reasons in use, most common first. */
export function reasons(takes: readonly Take[]): [string, number][] {
  const c = new Map<string, number>();
  for (const t of takes) if (t.reject_reason) c.set(t.reject_reason, (c.get(t.reject_reason) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
}
