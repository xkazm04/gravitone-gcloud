import "server-only";

import { z } from "zod";

import { COVER_LYRICS_MAX, COVER_SECTION_MAX_S, COVER_SECTION_MIN_S, COVER_STYLE_MAX, type CoverLaunch, type CoverRecord } from "@gt/domain/cover";
import { coverIdSchema } from "@gt/domain/cover.schema";
import { AppError, err, isAppError, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Store } from "@gt/kernel/store";

import { launchCover } from "../../../../lib/producers/cover.ts";
import { exportMp3 } from "../../../../lib/sound/cover/cut.ts";
import { coverFileHref, WINNER_FILE } from "../../../../lib/sound/cover/href.ts";
import { coverFileAbs, mutateCover, readCover } from "../../../../lib/sound/cover/store.ts";

// THE COVER'S ACTS, BODIES (spark track-mirror-studio, WP2): what ./acts.ts's Server Actions run once the action
// core has resolved who and held the input to the schemas below. Pure over the kernel store and the actor, so the
// tests run them without a request. The job is lib/producers/cover.ts's; the files lib/sound/cover's.
//
// THE STATE IS THE GATE, read twice: once to refuse before any work (an ffmpeg export, a receipt), and again
// inside the per-cover mutate, so a pick or a launch that raced another one is refused rather than written over it.

const seed = z.number().int().min(0).max(2 ** 48 - 1);
const style = z.string().trim().max(COVER_STYLE_MAX);
const backFilled = z.string().trim().max(COVER_STYLE_MAX).optional();

export const launchInput = z.strictObject({
  plan: z.strictObject({ id: coverIdSchema, startS: z.number().finite().min(0), endS: z.number().finite().positive(), style, lyrics: z.string().max(COVER_LYRICS_MAX), sourceStyle: backFilled }),
  token: z.string().min(8).max(200).optional(),
});
export const pickInput = z.strictObject({ id: coverIdSchema, seed });
export const stylesInput = z.strictObject({ id: coverIdSchema, styles: z.strictObject({ sourceStyle: backFilled, remixStyle: backFilled }) });

const LAUNCHABLE: ReadonlySet<CoverRecord["state"]> = new Set(["draft", "failed"]);

const refuse = (message: string): never => {
  throw new AppError("refused", message);
};

/** mutateCover, its refusal (an AppError thrown inside the change, or the store's) answered as a Result. */
async function mutated(id: string, f: (c: CoverRecord) => CoverRecord): Promise<Result<CoverRecord>> {
  try {
    return ok(await mutateCover(id, f));
  } catch (e) {
    if (isAppError(e)) return err(e.code, e.message);
    throw e;
  }
}

/** The section held to the song and to YuE2's ceiling, in the work's words. */
export function sectionProblem(c: CoverRecord, startS: number, endS: number): string | undefined {
  const len = endS - startS;
  if (endS <= startS) return `the section ends (${endS.toFixed(1)} s) before it starts (${startS.toFixed(1)} s)`;
  if (endS > c.source.durationS + 0.05) return `the section ends at ${endS.toFixed(1)} s; ${c.title} is ${c.source.durationS.toFixed(1)} s long`;
  if (len > COVER_SECTION_MAX_S) return `the section is ${len.toFixed(1)} s; YuE2 reads at most ${COVER_SECTION_MAX_S} s`;
  if (len < COVER_SECTION_MIN_S) return `the section is ${len.toFixed(1)} s; a cover needs at least ${COVER_SECTION_MIN_S} s`;
  return undefined;
}

export async function launchCoverBody(i: z.output<typeof launchInput>, store: Store, actor: Actor, dryOnly: boolean): Promise<Result<CoverLaunch>> {
  const { plan, token } = i;
  const c = await readCover(plan.id);
  if (c === undefined) return err("not-found", `no cover ${plan.id}`);
  const launchable = (s: CoverRecord["state"]): string | undefined => (LAUNCHABLE.has(s) ? undefined : `cover ${plan.id} is ${s}; it launches from draft or failed`);
  const first = launchable(c.state) ?? sectionProblem(c, plan.startS, plan.endS);
  if (first !== undefined) return err("refused", first);
  const sourceStyle = plan.sourceStyle === undefined || plan.sourceStyle === "" ? undefined : plan.sourceStyle;
  const m = await mutated(plan.id, (r) => {
    const why = launchable(r.state);
    if (why !== undefined) refuse(why);
    const { sourceStyle: _was, ...rest } = r;
    const keep = sourceStyle ?? _was;
    return { ...rest, section: { startS: plan.startS, endS: plan.endS }, style: plan.style, lyrics: plan.lyrics, ...(keep === undefined ? {} : { sourceStyle: keep }) };
  });
  if (!m.ok) return m;
  const saved = { id: plan.id, startS: plan.startS, endS: plan.endS, style: plan.style, lyrics: plan.lyrics, ...(sourceStyle === undefined ? {} : { sourceStyle }) };
  return launchCover(store, saved, { mode: "live", actor, dryOnly, ...(token === undefined ? {} : { token }) });
}

export async function pickCoverBody(i: z.output<typeof pickInput>): Promise<Result<{ readonly winnerUrl: string }>> {
  const c = await readCover(i.id);
  if (c === undefined) return err("not-found", `no cover ${i.id}`);
  if (c.state !== "judging") return err("refused", `cover ${i.id} is ${c.state}; a winner is picked while judging`);
  const take = c.takes.find((t) => t.seed === i.seed);
  if (take === undefined || take.state !== "done" || take.file === undefined) return err("refused", `cover ${i.id} has no finished take with seed ${i.seed}`);
  const made = await exportMp3(coverFileAbs(i.id, take.file), coverFileAbs(i.id, WINNER_FILE));
  if (!made.ok) return made;
  const m = await mutated(i.id, (r) => {
    if (r.state !== "judging") refuse(`cover ${i.id} is ${r.state}; a winner is picked while judging`);
    return { ...r, winnerSeed: i.seed, exportFile: WINNER_FILE, state: "picked" };
  });
  if (!m.ok) return m;
  return ok({ winnerUrl: coverFileHref(i.id, "winner") });
}

export async function saveCoverStylesBody(i: z.output<typeof stylesInput>): Promise<Result<void>> {
  const c = await readCover(i.id);
  if (c === undefined) return err("not-found", `no cover ${i.id}`);
  const { sourceStyle, remixStyle } = i.styles;
  if (remixStyle !== undefined && c.remix === undefined) return err("refused", `cover ${i.id} has no remix yet`);
  const m = await mutated(i.id, (r) => {
    const { sourceStyle: _was, ...rest } = r;
    // An empty back-fill clears it: the record omits an absent value.
    const source = sourceStyle === undefined ? _was : sourceStyle === "" ? undefined : sourceStyle;
    const remix = remixStyle === undefined || r.remix === undefined ? r.remix : { ...r.remix, style: remixStyle };
    const { remix: _r, ...bare } = rest;
    return { ...bare, ...(source === undefined ? {} : { sourceStyle: source }), ...(remix === undefined ? {} : { remix }) };
  });
  return m.ok ? ok(undefined) : m;
}
