// THE SEEDS DOOR - server only (spark scout-decision-graph WP-S1). A batch of ~100 one-sentence seeds is
// validated whole and written by one call; the CLI's `seeds` command and the night's step 0 both go through
// `addSeedBatch`. `usableSeed` is the door every seed-taking act calls; `seedsInForce` says when an idea
// brief must name its seed.
//
// THE DOOR IS THE BATCH'S, as the ideas door is (./idea.ts): one bad seed refuses the whole batch, naming
// its place (1-based) and why, before a batch id is reserved - a batch never holds half of what the seat
// meant to ask. A seed is refused for its shape (one line each, the facets' bounds, a known audience and
// format), for REPEATING a sentence - another in this batch, or any earlier batch's seed whatever became
// of it ("done before": a kept one is a branch already, a thrown one is a ban) - compared case- and
// whitespace-folded, and for a `parent` the seed door refuses (not kept, a dry batch's, under a pause).

import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";

import { nextPart, partRunId } from "./parts";
import { ancestryOf, createSeedBatch, listSeedBatches, readSeedBatch, seedOf, seedsPacketId } from "./seedStore";
import { pausedUnder, readSteer } from "./steer";
import { GENRE_MAX, MAX_SEED_BATCH, SEED_AUDIENCES, SEED_REF_RE, SEED_SENTENCE_MAX, VIDEO_FORMATS, seedRef, type NightId, type Seed, type SeedBatch, type SeedRef } from "./types";

export type SeedBatchOptions = {
  readonly dry: boolean;
  /** The night writing it at its start; absent for a batch written by day. */
  readonly night?: NightId;
  readonly now?: Date;
};

const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[\r\n]/.test(s), { message: "one line" });

const seedSchema = z
  .object({
    sentence: line(SEED_SENTENCE_MAX),
    genre: line(GENRE_MAX),
    subgenre: line(GENRE_MAX),
    type: line(GENRE_MAX),
    audience: z.enum(SEED_AUDIENCES),
    format: z.enum(VIDEO_FORMATS),
    parent: z.string().trim().regex(SEED_REF_RE, "a kept seed's <batch>/sd-NNN").optional(),
  })
  .strict();

type Brief = Omit<Seed, "id">;

/** What makes two sentences the same seed: case and whitespace folded. */
export const foldSentence = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

/** A seed's verdict in its batch, in the word the refusal says. */
function verdictOf(b: SeedBatch, id: string): string {
  const c = b.committed;
  if (c === undefined) return "undecided";
  return c.kept.includes(id) ? "kept" : c.rejected.includes(id) ? "rejected" : "undecided";
}

/** The batch as seeds in order, or the first bad one's place and why; nothing is written here. */
export async function checkSeedBatch(raw: unknown, batches: readonly SeedBatch[]): Promise<Result<Brief[]>> {
  if (!Array.isArray(raw)) return err("invalid", "seeds: the input is a JSON array of seeds {sentence, genre, subgenre, type, audience, format, parent?}");
  if (raw.length === 0) return err("invalid", "seeds: the batch holds no seed");
  if (raw.length > MAX_SEED_BATCH) return err("invalid", `seeds: a batch holds at most ${MAX_SEED_BATCH} seeds; this one has ${raw.length}`);
  const earlier = new Map<string, string>();
  for (const b of batches) for (const s of b.seeds) if (!earlier.has(foldSentence(s.sentence))) earlier.set(foldSentence(s.sentence), `${seedRef(b.id, s.id)} (${verdictOf(b, s.id)})`);
  const here = new Map<string, number>();
  const out: Brief[] = [];
  for (const [i, item] of raw.entries()) {
    const at = `seed ${i + 1}`;
    const r = parseAt(at, seedSchema, item);
    if (!r.ok) return r;
    const s = r.value;
    const key = foldSentence(s.sentence);
    const twin = here.get(key);
    if (twin !== undefined) return err("invalid", `${at}: repeats seed ${twin} of this batch`);
    const was = earlier.get(key);
    if (was !== undefined) return err("refused", `${at}: done before - ${was}`);
    here.set(key, i + 1);
    if (s.parent !== undefined) {
      const p = await usableSeed(s.parent, batches);
      if (!p.ok) return err(p.error.code, `${at}: parent: ${p.error.message}`);
    }
    out.push({ sentence: s.sentence, genre: s.genre, subgenre: s.subgenre, type: s.type, audience: s.audience, format: s.format, ...(s.parent === undefined ? {} : { parent: s.parent }) });
  }
  return ok(out);
}

/** Validate a batch (`[{sentence, genre, subgenre, type, audience, format, parent?}]`) and write it whole. */
export async function addSeedBatch(raw: unknown, o: SeedBatchOptions): Promise<Result<SeedBatch>> {
  const checked = await checkSeedBatch(raw, await listSeedBatches());
  if (!checked.ok) return checked;
  const now = o.now ?? new Date();
  const seeds: Seed[] = checked.value.map((s, i) => ({ id: `sd-${String(i + 1).padStart(3, "0")}`, ...s }));
  const batch = await createSeedBatch(now.toISOString().slice(0, 10), (id) => ({ id, createdAt: now.toISOString(), ...(o.night === undefined ? {} : { night: o.night }), dry: o.dry, seeds }));
  return ok(batch);
}

/** True once any LIVE batch committed a kept seed: from then on every new idea brief must name its seed. */
export function seedsInForce(batches: readonly SeedBatch[]): boolean {
  return batches.some((b) => b.committed !== undefined && !b.committed.dry && b.committed.kept.length > 0);
}

/**
 * The door every seed-taking act calls (ideas `seed`, track `--seed`, direction `seed`, a child seed's
 * `parent`): Ok when the ref names a kept seed of a live batch and no paused branch holds it; else the
 * refusal sentence naming the ref and why.
 */
export async function usableSeed(ref: SeedRef, batches?: readonly SeedBatch[]): Promise<Result<SeedRef>> {
  if (!SEED_REF_RE.test(ref)) return err("invalid", `not a seed ref: ${ref} (want <batch>/sd-NNN)`);
  const all = batches ?? (await listSeedBatches());
  const found = seedOf(all, ref);
  if (found === undefined) return err("refused", `no seed ${ref}`);
  const c = found.batch.committed;
  if (c === undefined) return err("refused", `seed ${ref} is not decided yet: its batch ${found.batch.id} is uncommitted`);
  if (c.dry) return err("refused", `seed ${ref} was kept on a dry batch; nothing derives from it`);
  if (!c.kept.includes(found.seed.id)) return err("refused", `seed ${ref} was not kept${c.rejected.includes(found.seed.id) ? ` (rejected: ${(c.reasons[found.seed.id] ?? []).join(", ") || "no reason"})` : ""}`);
  const paused = pausedUnder(await readSteer(), ancestryOf(all, ref));
  if (paused !== undefined) return err("refused", `seed ${ref} sits under the paused branch ${paused}; resume it on /scout first`);
  return ok(ref);
}

/* ── the CLI ───────────────────────────────────────────────────────────────── */

/** `kids · comedy › sketch · animated comedy sketch · short`: a seed's facets, as the Board's meta and the brief say them. */
export const seedFacets = (s: Pick<Seed, "audience" | "genre" | "subgenre" | "type" | "format">): string => `${s.audience} · ${s.genre} › ${s.subgenre} · ${s.type} · ${s.format}`;

/** A batch's counts: decided seeds by verdict, the rest undecided. */
export function batchCounts(b: SeedBatch): { readonly seeds: number; readonly kept: number; readonly rejected: number; readonly undecided: number } {
  const kept = b.committed?.kept.length ?? 0;
  const rejected = b.committed?.rejected.length ?? 0;
  return { seeds: b.seeds.length, kept, rejected, undecided: b.seeds.length - kept - rejected };
}

type CommandResult = { readonly lines: string[]; readonly doc: Record<string, unknown>; readonly code: number };
const refused = (message: string, code = 1): CommandResult => ({ lines: [message], doc: { ok: false, error: message }, code });

/** One seed's status line: `sd-004 rejected (generic) - note: ... · adult · comedy › sketch · ... — <sentence>`. */
function seedLine(b: SeedBatch, s: Seed): string {
  const v = verdictOf(b, s.id);
  const reasons = b.committed?.reasons[s.id] ?? [];
  const note = b.committed?.notes[s.id];
  const why = `${reasons.length > 0 ? ` (${reasons.join(", ")})` : ""}${note === undefined ? "" : ` - note: ${note}`}`;
  return `  ${s.id} ${v.padEnd(9)}${why} · ${seedFacets(s)}${s.parent === undefined ? "" : ` · from ${s.parent}`} — ${s.sentence}`;
}

/** The CLI's `seeds` command: `new --json <file|-> [--dry]`, `status [<batch>]`. Lines to print and the --json doc. */
export async function seedsCommand(
  sub: string | undefined,
  o: { readonly batch?: string; readonly input: () => Promise<unknown>; readonly dry: boolean; readonly now: Date },
): Promise<CommandResult> {
  if (sub === "new") {
    const r = await addSeedBatch(await o.input(), { dry: o.dry, now: o.now });
    if (!r.ok) return refused(r.error.message);
    const b = r.value;
    const packet = seedsPacketId(b.id);
    return { lines: [`batch ${b.id} · ${b.seeds.length} seeds${b.dry ? " · dry" : ""} · /board/${packet}`], doc: { ok: true, batch: b.id, seeds: b.seeds.length, packet, dry: b.dry }, code: 0 };
  }
  if (sub === "status") {
    if (o.batch === undefined) {
      const all = await listSeedBatches();
      const rows = all.map((b) => ({ id: b.id, createdAt: b.createdAt, ...(b.night === undefined ? {} : { night: b.night }), dry: b.dry, committed: b.committed !== undefined, packet: seedsPacketId(b.id), ...batchCounts(b) }));
      const lines = rows.length === 0 ? ["no seed batches yet"] : rows.map((r) => `${r.id.padEnd(13)} ${String(r.seeds).padStart(3)} seeds · ${r.kept} kept · ${r.rejected} rejected · ${r.undecided} undecided · ${r.dry ? "dry" : "live"}`);
      return { lines, doc: { ok: true, batches: rows }, code: 0 };
    }
    let b: SeedBatch;
    try {
      b = await readSeedBatch(o.batch);
    } catch (e) {
      return refused(errorMessage(e));
    }
    const c = batchCounts(b);
    // Committed in part (spark scout-storyboards): the rest is decided on the remainder packet.
    const part = nextPart(b.committed);
    const where = b.committed === undefined ? ` · /board/${seedsPacketId(b.id)}` : `${part === undefined ? "" : ` · /board/${seedsPacketId(partRunId(b.id, part))}`} · committed ${b.committed.at.slice(0, 10)} by ${b.committed.by}`;
    const head = `batch ${b.id} · ${c.seeds} seeds · ${c.kept} kept · ${c.rejected} rejected · ${c.undecided} undecided · ${b.dry ? "dry" : "live"}${where}`;
    return { lines: [head, ...b.seeds.map((s) => seedLine(b, s))], doc: { ok: true, batch: b }, code: 0 };
  }
  return refused(`seeds takes new or status${sub === undefined ? "" : `, not ${sub}`}`, 2);
}
