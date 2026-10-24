import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";

import { usableSeed } from "./seeds";
import { mutateNight, nextCandidateId, readNight } from "./store";
import { GENRE_MAX, IDEA_TITLE_MAX, NIGHT_ID_RE, PREMISE_MAX, SEED_REF_RE, USE_MAX, VIDEO_FORMATS, cellId, type DirectionCandidate, type IdeaCandidate, type Night, type NightId, type SeedRef } from "./types";

// WHAT A NIGHT STANDS ON - the refs that tie it to an earlier night's verdicts (spark
// scout-idea-artboards WP-I4a, the operator 2026-10-23: "using Notes more as confirmation of
// direction ... based on the approved decisions").
//
//   A DIRECTION   `scout.mts direction <night> --json <file|->`: one brief in the work's words -
//                 `{title, format, genre, style, tone, audience, premise, basedOn, use?}` - as a
//                 `direction` candidate, `rendered` at once (words, no job), like a finding. Every
//                 `basedOn` entry is `<night>/<cell id>` of a cell that night KEPT: an approved
//                 decision is the only ground a direction may stand on, so an entry naming anything
//                 else refuses the brief, with the entry and why. An optional `seed`
//                 (`<batch>/sd-NNN`, ./seeds.ts usableSeed) is the branch it confirms,
//                 recorded as `fromSeed` (spark scout-decision-graph).
//   A KEPT IDEA   `<night>/<c-id>`: an idea artboard that night kept, live. add-source brings it in
//                 as our own source (./sources.ts), an act over that source carries the ref
//                 (`fromIdea`), and once any night holds it, it is off the taste brief's
//                 to-develop list (./taste.ts). The idea's `fromSeed` rides on the source
//                 and onto every candidate over it (`fromIdeaOf`).

/** A direction's style, tone and audience: one line each. */
export const DIRECTION_LINE_MAX = 140;
/** `2026-10-22/c-12`: a kept idea, by its night and its candidate. */
export const IDEA_REF_RE = /^\d{4}-\d{2}-\d{2}(-\d{1,2})?\/c-\d{2,3}$/;

const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[\r\n]/.test(s), { message: "one line" });

const directionSchema = z
  .object({
    title: line(IDEA_TITLE_MAX),
    format: z.enum(VIDEO_FORMATS),
    genre: line(GENRE_MAX),
    style: line(DIRECTION_LINE_MAX),
    tone: line(DIRECTION_LINE_MAX),
    audience: line(DIRECTION_LINE_MAX),
    premise: z.string().trim().min(1).max(PREMISE_MAX),
    basedOn: z.array(z.string().trim().min(1).max(200)).min(1, "a direction stands on at least one kept cell: `<night>/<cell id>`").max(24),
    use: line(USE_MAX).optional(),
    seed: z.string().trim().regex(SEED_REF_RE, "a kept seed's <batch>/sd-NNN").optional(),
  })
  .strict();

/** `<night>/<rest>`: the night a ref names and what it names inside it, or null. */
export function splitRef(ref: string): { readonly night: NightId; readonly rest: string } | null {
  const i = ref.indexOf("/");
  if (i <= 0 || i === ref.length - 1) return null;
  const night = ref.slice(0, i);
  return NIGHT_ID_RE.test(night) ? { night, rest: ref.slice(i + 1) } : null;
}

/** A night read once per call site, or the store's sentence for why it could not be. */
type Nights = Map<NightId, Night | string>;
async function nightOf(cache: Nights, id: NightId): Promise<Night | string> {
  const had = cache.get(id);
  if (had !== undefined) return had;
  const got = await readNight(id).then((n): Night | string => n, (e: unknown) => errorMessage(e));
  cache.set(id, got);
  return got;
}

/** Why `cell` is not ground for a direction in that night, or undefined when the night kept it. */
function notKept(n: Night, cell: string): string | undefined {
  const c = n.committed;
  if (c === undefined) return `night ${n.id} is ${n.state}: it has no verdicts yet`;
  // A dry night's verdicts were on stand-ins: they approve nothing a direction may stand on.
  if (n.dry || c.dry) return `night ${n.id} was dry: its keeps were of stand-ins`;
  if (c.kept.includes(cell)) return undefined;
  if (c.rejected.includes(cell)) return `night ${n.id} rejected ${cell}${(c.reasons[cell] ?? []).length > 0 ? ` (${(c.reasons[cell] ?? []).join(", ")})` : ""}`;
  return `night ${n.id} did not keep ${cell}`;
}

/** Append one direction, `rendered`. Err when the brief is malformed, the night is not open, or a `basedOn` entry is not a kept cell. */
export async function addDirection(nightId: NightId, raw: unknown): Promise<Result<DirectionCandidate>> {
  const parsed = parseAt("direction", directionSchema, raw);
  if (!parsed.ok) return parsed;
  const b = parsed.value;
  const night = await readNight(nightId);
  if (night.state !== "open") return err("refused", `night ${nightId} is ${night.state}; it takes no more directions`);
  const basedOn = [...new Set(b.basedOn)];
  const cache: Nights = new Map();
  for (const [i, ref] of basedOn.entries()) {
    const at = `direction: basedOn ${i + 1} "${ref}"`;
    const p = splitRef(ref);
    if (p === null) return err("invalid", `${at}: not <night>/<cell id>`);
    const n = await nightOf(cache, p.night);
    if (typeof n === "string") return err("invalid", `${at}: ${n}`);
    const why = notKept(n, p.rest);
    if (why !== undefined) return err("refused", `${at}: ${why}; a direction stands only on a kept cell`);
  }
  if (b.seed !== undefined) {
    const u = await usableSeed(b.seed);
    if (!u.ok) return err(u.error.code, `direction: seed: ${u.error.message}`);
  }
  let made: DirectionCandidate | undefined;
  await mutateNight(nightId, (n) => {
    if (n.state !== "open") return n;
    made = { id: nextCandidateId(n), kind: "direction", sourceIds: [], status: "rendered", title: b.title, format: b.format, genre: b.genre, style: b.style, tone: b.tone, audience: b.audience, premise: b.premise, basedOn, ...(b.use === undefined ? {} : { use: b.use }), ...(b.seed === undefined ? {} : { fromSeed: b.seed }) };
    return { ...n, candidates: [...n.candidates, made] };
  });
  if (made === undefined) return err("refused", `night ${nightId} closed while the direction was checked; it takes no more directions`);
  return ok(made);
}

/* ── kept ideas ────────────────────────────────────────────────────────────── */

export type KeptIdea = { readonly night: Night; readonly idea: IdeaCandidate & { readonly image: string } };

/** The kept idea `ref` names - kept in its night's committed verdicts, on a live night, its artboard recorded - or why not. */
export async function keptIdea(ref: string, cache: Nights = new Map()): Promise<Result<KeptIdea>> {
  const p = IDEA_REF_RE.test(ref) ? splitRef(ref) : null;
  if (p === null) return err("invalid", `${ref} is not a kept idea's <night>/<c-id>`);
  const n = await nightOf(cache, p.night);
  if (typeof n === "string") return err("invalid", `idea ${ref}: ${n}`);
  const c = n.candidates.find((x) => x.id === p.rest);
  if (c?.kind !== "idea") return err("invalid", `night ${n.id} has no idea ${p.rest}`);
  if (n.dry || n.committed?.dry === true) return err("refused", `idea ${ref} is a dry night's: its artboard is a stand-in, nothing to develop`);
  const why = notKept(n, cellId(c.id, "board"));
  if (why !== undefined) return err("refused", `idea ${ref}: ${why}; only a kept idea is developed`);
  if (c.image === undefined) return err("invalid", `idea ${ref} was kept with no artboard recorded`);
  return ok({ night: n, idea: { ...c, image: c.image } });
}

/**
 * Every kept idea some night already develops, with where: a source brought in from it (`<night>/<s-id>`), else a candidate that names it.
 * A STORYBOARD does not develop its idea (spark scout-storyboards): it composes the idea as a video, and the idea's scene, style or
 * asset act stays on "Ideas to develop" beside it - the two rungs are independent.
 */
export function developedOf(nights: readonly Night[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const n of nights) for (const s of n.sources) if (s.fromIdea !== undefined && !out.has(s.fromIdea)) out.set(s.fromIdea, `${n.id}/${s.id}`);
  for (const n of nights) for (const c of n.candidates) if (c.kind !== "storyboard" && c.fromIdea !== undefined && !out.has(c.fromIdea)) out.set(c.fromIdea, `${n.id}/${c.id}`);
  return out;
}

/** Where a candidate grows from: the kept idea and the seed its sources carry. */
export type Origin = { readonly fromIdea?: string; readonly fromSeed?: SeedRef };

/**
 * `{fromIdea, fromSeed}` for a candidate over these sources: the first source that is a kept idea brought in,
 * and the first that carries a seed (the same source, when the idea grew from one); either absent when none does.
 */
export function fromIdeaOf(n: Pick<Night, "sources">, sourceIds: readonly string[]): Origin {
  const mine = n.sources.filter((s) => sourceIds.includes(s.id));
  const f = mine.find((s) => s.fromIdea !== undefined)?.fromIdea;
  const seed = mine.find((s) => s.fromSeed !== undefined)?.fromSeed;
  return { ...(f === undefined ? {} : { fromIdea: f }), ...(seed === undefined ? {} : { fromSeed: seed }) };
}

/**
 * An asset brief's `fromIdea`, checked as a kept idea's ref, and the brief without it - the asset door
 * (./concept.ts) is the mesh brief's own and takes no such key. A brief without one passes through.
 */
export async function briefFromIdea(raw: unknown): Promise<Result<{ readonly brief: unknown } & Origin>> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw) || !("fromIdea" in raw)) return ok({ brief: raw });
  const { fromIdea: ref, ...brief } = raw as Record<string, unknown>;
  if (typeof ref !== "string") return err("invalid", "asset brief: fromIdea: a kept idea's <night>/<c-id>");
  const k = await keptIdea(ref.trim());
  if (!k.ok) return err(k.error.code, `asset brief: fromIdea: ${k.error.message}`);
  const seed = k.value.idea.fromSeed;
  return ok({ brief, fromIdea: ref.trim(), ...(seed === undefined ? {} : { fromSeed: seed }) });
}

/**
 * The seed an act was handed (`--seed`), checked at the seed door and against the seed its kept idea already
 * carries: an idea-born run grows from that idea's branch, so a `--seed` naming another branch is refused.
 * Ok with the origin to record (the idea's, `--seed` added); the refusal's sentence otherwise. Writes nothing.
 */
export async function originWith(origin: Origin, seed: string | undefined): Promise<Result<Origin>> {
  if (seed === undefined) return ok(origin);
  if (origin.fromSeed !== undefined && origin.fromSeed !== seed) return err("refused", `--seed ${seed} disagrees with ${origin.fromSeed}, the seed of kept idea ${origin.fromIdea ?? "?"} this run develops`);
  const u = await usableSeed(seed);
  if (!u.ok) return err(u.error.code, `--seed: ${u.error.message}`);
  return ok({ ...origin, fromSeed: seed });
}
