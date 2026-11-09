import "server-only";

import { ok, type Result } from "@gt/domain/errors";
import type { EditorKind, PartActKind } from "@gt/domain/partView";
import type { ScoreSpot } from "@/lib/score/spots";

import { LATER, type KCtx, type LaterKind, type RecOf } from "../kinds.ts";
import { unitsOf, type FramesRec, type UnitRec } from "../fixtureFrames.ts";
import { isAds } from "../fixtureFramesView.ts";
import { dryOutcome, type MotionRec } from "../fixtureMotion.ts";
import { proposal } from "../fixtureScore.ts";
import { pictureOf, type ScoreRec } from "../fixtureScoreRecs.ts";

// WHAT A DONE JOB LEFT ON ITS PART (fixture-self-consistency: the Plan is the source, the part
// records are projected from it). A Plan row reads RATIFIED when its part's job is done; until
// 2026-11-09 the fixture's part records were born empty whatever the Plan said, so a trailer whose
// every row was ratified drew "0 of 30 plates composed", "no cues spotted" and "no picture to cut",
// and every visual gate measured the empty screens.
//
// A landing here is the kind's OWN dry acts, run in the order a producer would (each module's
// `land`, the same stand-in a confirm lands): render the plates, render alternatives for the
// opening and closing shot; give every plate its move and render its clip; spot the cues Score
// proposes, set their tempo and render each; export the animatic. What a dry act cannot know and a
// real run's operator or model would have decided - a shot's move, a cue's tempo - is read off the
// work itself (the shot's staging, the scenes' pace), never typed per project. ./../fixture.ts
// writes the result as ONE job line on the part's log, by the Plan's job id at its end time, so
// the trail says who made it and undo never reaches it (a job's write is not an operator's step).
//
// A kind with no landing here answers null: its record stays as seeded, and the consistency law
// (tests/next-server/fixture-world.test.ts) names the Plan row that claims more than it shows.

export type Landing = { readonly next: object; readonly label: string };

/** The order a film's parts land in: each reads the records of the ones before it. */
export const LANDING_ORDER: readonly LaterKind[] = ["frames", "motion", "score", "cut", "article", "strips", "words"];

/** The act a part's Plan job performs, as its editor names it (a running job's `act`). */
export const FIRST_ACT: Readonly<Partial<Record<EditorKind, PartActKind>>> = {
  research: "run-research",
  script: "compose-candidates",
  frames: "render-plates",
  motion: "render-clip",
  score: "render-cue",
  cut: "export-animatic",
  article: "write-article",
  strips: "draw-strips",
  voice: "record-line",
  words: "write-words",
  render: "render-video",
};

type Step<R> = (r: R, act: PartActKind, target?: string) => Result<R>;
function stepper<K extends LaterKind>(ctx: KCtx, kind: K, at: number, jobId: string): Step<RecOf[K]> {
  const m = LATER[kind];
  return (r, act, target) => m.land(ctx, r, act, at, jobId, target);
}

/** Run acts in order over one record; the first refusal stops the landing. */
function chain<R>(start: R, step: Step<R>, acts: readonly (readonly [PartActKind, string?])[]): Result<R> {
  let r = start;
  for (const [act, target] of acts) {
    const n = step(r, act, target);
    if (!n.ok) return n;
    r = n.value;
  }
  return ok(r);
}

/* ── what a dry act cannot decide, read off the work ──────────────────────── */

const PACE: Readonly<Record<string, string>> = { held: "holds, then a slow push in", measured: "a measured dolly", rapid: "a hard handheld whip" };
const DRIFT: Readonly<Record<string, string>> = { "screen-right": "drifting screen-right", "screen-left": "drifting screen-left", neutral: "centred" };

/** A plate's move: a beat's named elements as the dry direction pass proposes them, else a shot's
 *  move from its own staging (size, pace, screen direction). */
export function moveOf(u: UnitRec, at: number): string {
  const o = dryOutcome(u, at);
  if (o.kind === "proposed") return o.motion;
  const s = u.staging;
  const pace = PACE[s?.pace ?? ""] ?? "a slow push in";
  const drift = DRIFT[s?.direction ?? ""] ?? "centred";
  return `${s?.size == null ? "" : `${s.size} · `}${pace}, ${drift}; the ground holds still.`;
}

/** A pace as a tempo, for a cue spotted under scenes of that pace. */
const BPM: Readonly<Record<string, number>> = { held: 72, measured: 96, rapid: 132 };
export function tempoOf(units: readonly UnitRec[], sceneIds: readonly string[]): number {
  const paces = units.filter((u) => sceneIds.includes(u.id)).map((u) => BPM[u.staging?.pace ?? ""] ?? 90);
  return paces.length === 0 ? 90 : Math.round(paces.reduce((a, b) => a + b, 0) / paces.length);
}

/* ── the landings ─────────────────────────────────────────────────────────── */

function frames(ctx: KCtx, r: FramesRec, at: number, jobId: string): Result<Landing> | null {
  if (isAds(ctx) || unitsOf(ctx, r).length === 0) return null;
  const all = unitsOf(ctx, r);
  const ends = [...new Set([all[0]?.id, all.at(-1)?.id])].flatMap((id) => (id === undefined ? [] : [["render-alternative", id] as const]));
  const next = chain(r, stepper(ctx, "frames", at, jobId), [["render-plates"], ...ends]);
  return next.ok ? ok({ next: next.value, label: "render plates" }) : next;
}

function motion(ctx: KCtx, m: MotionRec, at: number, jobId: string): Result<Landing> | null {
  if (isAds(ctx)) return null;
  const plated = unitsOf(ctx, ctx.rec("frames")).filter((u) => u.plate.state === "ready");
  if (plated.length === 0) return null;
  const accepted = Object.fromEntries(plated.map((u) => [u.id, moveOf(u, at)]));
  const next = chain({ ...m, accepted: { ...m.accepted, ...accepted } }, stepper(ctx, "motion", at, jobId), plated.map((u) => ["render-clip", u.id] as const));
  return next.ok ? ok({ next: next.value, label: "render clips" }) : next;
}

/** An explainer's picture has no trailer movements to propose cues from: its job spotted the
 *  Plan's prompts as that many cues over the picture, cut where the scenes fall nearest an even
 *  split, each titled by the scene it opens on. */
function spread(ctx: KCtx, prompts: number): ScoreSpot[] {
  const scenes = pictureOf(ctx)?.scenes ?? [];
  const n = Math.min(Math.max(1, prompts), scenes.length);
  return Array.from({ length: n }, (_, i) => scenes.slice(Math.round((i * scenes.length) / n), Math.round(((i + 1) * scenes.length) / n))).flatMap((span, i) => {
    const first = span[0];
    return first === undefined ? [] : [{ id: `spot-${i + 1}`, title: first.slug, sceneIds: span.map((x) => x.id), note: "" }];
  });
}

function score(ctx: KCtx, s: ScoreRec, at: number, jobId: string, prompts: number): Result<Landing> | null {
  if (ctx.project.discipline === "ads") return null;
  const proposed = proposal(ctx, pictureOf(ctx)).spots;
  const spots = proposed.length > 0 ? proposed : spread(ctx, prompts);
  if (spots.length === 0) return null;
  const units = unitsOf(ctx, ctx.rec("frames"));
  // The session settles the proposal: every cue is the creator's (v1 useSpots: an edit clears `proposed`).
  const settled: ScoreSpot[] = spots.map(({ proposed: _p, ...x }) => ({ ...x, bpm: tempoOf(units, x.sceneIds) }));
  const next = chain<ScoreRec>({ ...s, spots: settled }, stepper(ctx, "score", at, jobId), settled.map((x) => ["render-cue", x.id] as const));
  return next.ok ? ok({ next: next.value, label: "render cues" }) : next;
}

/** One act, untargeted: the parts whose job is a single turn (an article, a strips run, a words turn). */
function single<K extends LaterKind>(kind: K, act: PartActKind) {
  return (ctx: KCtx, r: RecOf[K], at: number, jobId: string): Result<Landing> => {
    const next = stepper(ctx, kind, at, jobId)(r, act);
    return next.ok ? ok({ next: next.value, label: LATER[kind].actLabel(act) }) : next;
  };
}

/** What a FAILED frames job left: its plates rendered, then every one culled at the frames gate
 *  (the job's error is that gate's sentence) - each plate emptied and marked rejected by the
 *  gate's packet, as lib/parts/gates.ts writes a cull. Its picture stays on the clock. */
export function failedLandingOf(ctx: KCtx, kind: LaterKind, rec: unknown, at: number, jobId: string, packetId: string): Result<Landing> | null {
  if (kind !== "frames") return null;
  const made = frames(ctx, rec as FramesRec, at, jobId);
  if (made === null || !made.ok) return made;
  const r = made.value.next as FramesRec;
  const when = new Date(at).toISOString();
  const culled = (r.units ?? []).map((u): UnitRec => {
    const { src: _src, ...plate } = u.plate;
    return { ...u, plate: { ...plate, state: "empty", rejected: { packetId, at: when } } };
  });
  return ok({ next: { ...r, units: culled, alts: {} }, label: "render plates · culled at the gate" });
}

/** The landing a done job leaves on `kind`'s record, or null when this side has none for it.
 *  `units` is the Plan row's (a score's prompts). */
export function landingOf(ctx: KCtx, kind: LaterKind, rec: unknown, at: number, jobId: string, units: number): Result<Landing> | null {
  // The store holds what `seed`/`land` of THIS kind's module returned (../kinds.ts `erase`).
  switch (kind) {
    case "frames":
      return frames(ctx, rec as FramesRec, at, jobId);
    case "motion":
      return motion(ctx, rec as MotionRec, at, jobId);
    case "score":
      return score(ctx, rec as ScoreRec, at, jobId, units);
    case "cut":
      return ctx.project.discipline === "ads" ? null : single("cut", "export-animatic")(ctx, rec as RecOf["cut"], at, jobId);
    case "article":
      return single("article", "write-article")(ctx, rec as RecOf["article"], at, jobId);
    case "strips":
      return single("strips", "draw-strips")(ctx, rec as RecOf["strips"], at, jobId);
    case "words":
      return single("words", "write-words")(ctx, rec as RecOf["words"], at, jobId);
    case "render":
    case "voice":
      return null;
  }
}
