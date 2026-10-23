import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";

import { driveIdeas, launchIdeas, LIVE_IDEA_ENGINES } from "../../producers/scoutIdea.ts";
import type { IdeaEngines } from "../../producers/scoutIdeaActs.ts";
import { launchable, Refusal, type ActContext } from "./acts.ts";
import { mutateNight, nextCandidateId, readNight, withCandidate } from "./store.ts";
import { DEFAULT_IDEA_CAP, IDEA_ANCHORS, IDEA_PROMPT_MAX, IDEA_TARGETS, IDEA_TITLE_MAX, USE_MAX, type IdeaCandidate, type Night, type NightId } from "./types.ts";

// THE NIGHT'S IDEA ARTBOARDS - what `pipeline/scout.mts ideas <night> --json <file|->` does (spark
// scout-idea-artboards WP-I2). The skill writes a batch of briefs in its own words - `{title, target,
// prompt, anchor: {kind, ref}, use?}` - and this act turns each into an `idea` candidate (no source:
// the words are ours) and the batch into ONE scout-ideas job that draws every idea as one rough still
// in the operator's Leonardo studio (lib/producers/scoutIdea.ts). The night's rules are the other
// launches' (./acts.ts): refused when the night is not open or past its deadline - and two of its own:
//
//   THE DOOR IS THE BATCH'S. One bad brief refuses the whole batch, naming its place (1-based) and the
//   reason, before a candidate exists - a night never holds half of what the skill meant to draw.
//   The words are craft, not content: like the game asset's brief (./concept.ts), no door here reads
//   a name out of a prompt - the skill writes the brief, and docs/scout.md holds it to that.
//
//   THE IDEA CAP. A night draws at most `ideaCap` ideas (DEFAULT_IDEA_CAP when the night predates the
//   field). Every idea candidate counts, a failed one too: a studio failure may still have spent its
//   credits. The check and the candidates' rows are one write under the night's lock, so two batches
//   at once cannot both take the last places.
//
// NO MONEY REFUSAL. The studio bills prepaid credits and the night's ceiling caps Gemini only
// (./budget.ts), so a batch is never refused for the dollars the night has left - its receipt is
// unpriced, and says so.

const text = (max: number) => z.string().trim().min(1).max(max);

const ideaSchema = z
  .object({
    /** The idea's headline on the Board. */
    title: text(IDEA_TITLE_MAX),
    target: z.enum(IDEA_TARGETS),
    /** The studio prompt, verbatim. */
    prompt: text(IDEA_PROMPT_MAX),
    anchor: z
      .object({ kind: z.enum(IDEA_ANCHORS), ref: z.string().trim().max(300) })
      .strict()
      .refine((a) => a.kind === "free" || a.ref !== "", { message: "a watch or gap anchor quotes its watchlist line or registry gap in `ref`", path: ["ref"] }),
    use: text(USE_MAX).optional(),
  })
  .strict();

export type IdeaBrief = Pick<IdeaCandidate, "title" | "target" | "prompt" | "anchor" | "use">;

/** The skill's batch as briefs, or the first bad brief's place and reason; nothing is written here. */
export function parseIdeas(raw: unknown): Result<IdeaBrief[]> {
  if (!Array.isArray(raw)) return err("invalid", "ideas: the input is a JSON array of briefs {title, target, prompt, anchor: {kind, ref}, use?}");
  if (raw.length === 0) return err("invalid", "ideas: the batch holds no brief");
  const out: IdeaBrief[] = [];
  for (const [i, item] of raw.entries()) {
    const r = parseAt(`idea ${i + 1}`, ideaSchema, item);
    if (!r.ok) return r;
    const b = r.value;
    out.push({ title: b.title, target: b.target, prompt: b.prompt, anchor: { kind: b.anchor.kind, ref: b.anchor.ref }, ...(b.use === undefined ? {} : { use: b.use }) });
  }
  return ok(out);
}

/** Idea candidates the night holds, whatever became of them. */
export const ideasUsed = (n: Pick<Night, "candidates">): number => n.candidates.filter((c) => c.kind === "idea").length;

export const ideaCapOf = (n: Pick<Night, "ideaCap">): number => n.ideaCap ?? DEFAULT_IDEA_CAP;

export type IdeasResult = { readonly candidates: readonly IdeaCandidate[]; readonly jobId?: string; readonly outcome?: string };

/** Re-read the batch's candidates, in order. */
async function batchOf(id: NightId, cids: readonly string[]): Promise<IdeaCandidate[]> {
  const n = await readNight(id);
  return cids.map((cid) => n.candidates.find((c): c is IdeaCandidate => c.id === cid && c.kind === "idea")).filter((c): c is IdeaCandidate => c !== undefined);
}

export async function ideasAct(ctx: ActContext, id: NightId, raw: unknown, engines: Partial<IdeaEngines> = {}): Promise<IdeasResult> {
  const parsed = parseIdeas(raw);
  if (!parsed.ok) throw new Refusal(parsed.error.message);
  const briefs = parsed.value;
  const { mode } = await launchable(ctx, id);

  let made: IdeaCandidate[] = [];
  let full: string | undefined;
  await mutateNight(id, (n) => {
    const used = ideasUsed(n);
    const cap = ideaCapOf(n);
    const left = Math.max(0, cap - used);
    if (briefs.length > left) {
      full = `night ${id} holds ${used} of its ${cap} ideas; ${left} left, and the batch has ${briefs.length} - nothing was drawn`;
      return n;
    }
    let next = n;
    made = [];
    for (const b of briefs) {
      const c: IdeaCandidate = { id: nextCandidateId(next), kind: "idea", sourceIds: [], status: "pending", ...b };
      next = { ...next, candidates: [...next.candidates, c] };
      made.push(c);
    }
    return next;
  });
  if (full !== undefined) throw new Refusal(full);
  if (made.length === 0) throw new Error(`night ${id}: the idea candidates were not written`);
  const cids = made.map((c) => c.id);
  const span = cids.length === 1 ? (cids[0] ?? "") : `${cids[0] ?? ""}..${cids[cids.length - 1] ?? ""}`;
  const fail = async (why: string): Promise<never> => {
    await mutateNight(id, (n) => {
      let m = n;
      for (const c of made) {
        const now = m.candidates.find((x): x is IdeaCandidate => x.id === c.id && x.kind === "idea");
        if (now?.status === "pending") m = withCandidate(m, { ...now, status: "failed", error: why });
      }
      return m;
    });
    throw new Refusal(why);
  };

  const target = { nightId: id, candidateIds: cids };
  const opts = { mode, actor: ctx.actor, dryOnly: ctx.dryOnly };
  const r0 = await launchIdeas(ctx.store, target, opts);
  if (!r0.ok) return fail(r0.error.message);
  if (r0.value.kind !== "receipt") return fail(`ideas launch answered ${r0.value.kind} before its receipt`);
  const rc = r0.value.receipt;
  const line = rc.lines[0];
  ctx.say(`receipt (${rc.mode}): ideas ${span} · ${cids.length} artboard(s) on ${line?.lane ?? "box.chrome"} · ${line?.provider ?? "leonardo-studio"} · unpriced (${line?.unpricedReason ?? "studio credits"}) · ~${Math.ceil((line?.seconds ?? 0) / 60)} min`);
  const r1 = await launchIdeas(ctx.store, target, { ...opts, token: rc.token });
  if (!r1.ok) return fail(r1.error.message);
  if (r1.value.kind !== "launched") return fail(`the receipt moved while it was confirmed (${r1.value.kind}); nothing launched`);
  const jobId = r1.value.jobId;
  ctx.say(`launched ${span} as ${jobId}`);
  if (ctx.detach) return { candidates: await batchOf(id, cids), jobId, outcome: "detached" };

  const r = await driveIdeas(ctx.store, ctx.location, jobId, { dryOnly: ctx.dryOnly, engines: { generate: engines.generate ?? LIVE_IDEA_ENGINES.generate } });
  return { candidates: await batchOf(id, cids), jobId, outcome: r.ok ? r.value.outcome : r.error.message };
}
