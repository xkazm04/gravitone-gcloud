// THE BACKLOG (spark scout-vision) - pure. What the night owes before it spreads: every kept idea that waits for its
// next step, and the seed gate that follows from their count.
//
// WAITING. A kept idea of a live committed night (a dry night's verdicts were over stand-ins) waits when its target
// is `scene` or `style` and no storyboard that did not fail composes it (./storyboardKept.ts storyboardOf) - the
// storyboard is the root any video needs. A `stats` or `asset3d` idea has no buildable next step in the night (a
// reel's real data is later work; an asset serves a game), so it never holds the gate. A cell still `open` on a
// remainder packet is not kept yet.
//
// THE GATE. While BACKLOG_GATE or more ideas wait, a seed batch takes its child seeds (a parent) and at most
// GATED_FRESH_SEEDS fresh ones. Kept seeds with no idea yet are counted beside it, advisory: kept on a live batch
// (./seedStore.ts isKeptSeed), under no paused branch (./steer.ts pausedUnder over the steer the caller passes;
// none passed, nothing is paused), and no idea that did not fail grows from it on a live night - the rule
// ./taste.ts `## Seeds to develop` counts ideas by, so the two numbers agree.

import { ancestryOf, isKeptSeed } from "./seedStore";
import { EMPTY_STEER, pausedUnder } from "./steer";
import { storyboardOf } from "./storyboardKept";
import { BACKLOG_GATE, GATED_FRESH_SEEDS, parseCellId, seedRef, type Night, type Seed, type SeedBatch, type Steer } from "./types";

export type Backlog = {
  /** `<night>/<c-id>` of every kept idea waiting for a storyboard, oldest night first. */
  readonly waiting: readonly string[];
  /** Kept, unpaused seeds no idea grows from yet. */
  readonly seedsWaiting: number;
  /** waiting.length >= BACKLOG_GATE. */
  readonly gated: boolean;
  /** GATED_FRESH_SEEDS while gated, else null (no limit beyond MAX_SEED_BATCH). */
  readonly freshAllowed: number | null;
};

/** How many waiting refs the taste brief lists. */
export const BACKLOG_LISTED = 20;

const oldestFirst = (a: Night, b: Night): number => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : a.id.localeCompare(b.id));

/** The live committed nights' kept scene and style ideas, oldest night first, with the idea each ref names. */
function keptIdeas(nights: readonly Night[]): { readonly ref: string; readonly title: string }[] {
  const out: { ref: string; title: string }[] = [];
  for (const n of [...nights].sort(oldestFirst)) {
    const k = n.committed;
    if (k === undefined || n.dry || k.dry) continue;
    const open = new Set(k.open ?? []);
    for (const c of n.candidates) {
      if (c.kind !== "idea" || (c.target !== "scene" && c.target !== "style")) continue;
      if (k.kept.some((cell) => !open.has(cell) && parseCellId(cell)?.candidate === c.id)) out.push({ ref: `${n.id}/${c.id}`, title: c.title });
    }
  }
  return out;
}

/** The backlog over the scout wing's nights and its seed batches; `steer` says which branches are paused (absent: none). */
export function backlogOf(nights: readonly Night[], batches: readonly SeedBatch[], steer: Steer = EMPTY_STEER): Backlog {
  const waiting = keptIdeas(nights)
    .filter((i) => storyboardOf(nights, i.ref) === undefined)
    .map((i) => i.ref);
  const grown = new Set(nights.filter((n) => !n.dry).flatMap((n) => n.candidates.flatMap((c) => (c.kind === "idea" && c.status !== "failed" && c.fromSeed !== undefined ? [c.fromSeed] : []))));
  let seedsWaiting = 0;
  for (const b of batches) {
    for (const s of b.seeds) {
      const ref = seedRef(b.id, s.id);
      if (isKeptSeed(batches, ref) && !grown.has(ref) && pausedUnder(steer, ancestryOf(batches, ref)) === undefined) seedsWaiting += 1;
    }
  }
  const gated = waiting.length >= BACKLOG_GATE;
  return { waiting, seedsWaiting, gated, freshAllowed: gated ? GATED_FRESH_SEEDS : null };
}

/** The refusal of a batch with more fresh seeds than the gate allows, or undefined. */
export function freshSeedRefusal(backlog: Backlog, briefs: readonly Omit<Seed, "id">[]): string | undefined {
  if (!backlog.gated || backlog.freshAllowed === null) return undefined;
  const fresh = briefs.filter((b) => b.parent === undefined).length;
  if (fresh <= backlog.freshAllowed) return undefined;
  return `the backlog holds ${backlog.waiting.length} kept ideas with no storyboard (gate ${BACKLOG_GATE}): at most ${backlog.freshAllowed} fresh seeds, this batch has ${fresh}; child seeds are not limited`;
}

/**
 * The taste brief's `## Backlog` section: the counts, the gate, and the BACKLOG_LISTED oldest waiting ideas with their
 * titles. `nights` are the ones the backlog was read from (a ref whose idea is not among them is listed bare).
 */
export function backlogSection(backlog: Backlog, nights: readonly Night[] = []): string[] {
  const titles = new Map(keptIdeas(nights).map((i) => [i.ref, i.title]));
  const gate = backlog.gated ? `- gate: on · at most ${backlog.freshAllowed ?? GATED_FRESH_SEEDS} fresh seeds a batch; child seeds unlimited` : `- gate: off · ${BACKLOG_GATE - backlog.waiting.length} more waiting ideas close it`;
  const listed = backlog.waiting.slice(0, BACKLOG_LISTED).map((ref) => {
    const t = titles.get(ref);
    return `- ${ref}${t === undefined ? "" : ` · ${t}`}`;
  });
  const more = backlog.waiting.length > BACKLOG_LISTED ? [`- and ${backlog.waiting.length - BACKLOG_LISTED} more`] : [];
  return [
    "## Backlog",
    "",
    `- kept ideas waiting for a storyboard: ${backlog.waiting.length}`,
    `- kept seeds with no idea: ${backlog.seedsWaiting}`,
    gate,
    "",
    ...(listed.length === 0 ? [] : [...listed, ...more, ""]),
  ];
}
