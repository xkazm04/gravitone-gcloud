import "server-only";

import type { Discipline } from "@gt/catalog/projects";
import type { PartVerdict, VerdictCode } from "@gt/domain/partView";
import { decodeStep } from "@gt/domain/steps/record";
import { ADS_SCENARIOS } from "@gt/domain/steps/script";
import { ADS_SHOTS, FRAMES } from "@gt/domain/steps/frames";
import { ADS_FINISH, ADS_SCORE, CUT, MOTION_DIRECTION, SCORE } from "@gt/domain/steps/finish";

import { deriveTimeline } from "@/lib/cut/deriveTimeline";
import { finishLine } from "@/lib/cut/finishLine";
import type { PictureUnit } from "@/lib/frames/picture/unit";
import type { ScoreSpot } from "@/lib/score/spots";

// THE VERDICTS OF THE PARTS THAT GATE (frames, score, cut) AND OF MOTION - ported from v1's
// app/_phases/{frames,score,cut}/verdict.ts, over the server's part records, with the gaps the
// inventory measured filled (INVENTORY §7.9):
//   · v1 verdicts could never say done ("done IS NOT A VERDICT ... a lock is a sign-off",
//     stepContract.ts:29), and its ceiling was `review`. Here the sign-off IS the gate packet, so
//     the verdict says READY when the part's work is complete by its own checks - and READY is
//     the only state that opens the gate (./gates.ts). Every other state names what is missing.
//   · no ads branch anywhere, and Score/Cut read the wrong ads records: the ads faces read
//     ads-shots / ads-score / ads-finish against the PICKED scenario, and a record made for
//     another scenario reads as stale, never as done.
//   · Motion had no verdict at all (absent from STEP_MODULES); it has one.
// The research and script verdicts (with their ads branches) are L38's ports in
// app/(studio)/projects/[id]/_part (RESEARCH.verdict / SCRIPT.verdict) - one implementation each,
// reached from the real side; neither part has a gate.
//
// Texts are the work's own sentences ("3 of 16 plates composed", the finish line's deny
// sentences verbatim), never an explanation of the app.

export type GateKind = "frames" | "motion" | "score" | "cut";

export type VerdictInput = {
  readonly projectId: string;
  readonly title: string;
  readonly discipline: Discipline;
  readonly targetS: number | null;
  /** Does the recipe plan a voice part? A film recipe does not, so the Cut's voice lane is not
   *  this project's to fill, and its finish-line row is reported but does not hold READY. */
  readonly plansVoice: boolean;
  /** Every step record of the project, decoded (the kernel's PartSnapshot.records). */
  readonly records: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  /** The take ids the sound store holds; absent = not read, and a take not read is not held. */
  readonly takeIds?: ReadonlySet<string> | null;
};

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const v = (state: PartVerdict["state"], ...codes: VerdictCode[]): PartVerdict => ({ state, codes });
const c = (code: string, text: string): VerdictCode => ({ code, text });

function rec<T>(input: VerdictInput, key: string, decode: (raw: unknown) => { ok: true; value: T } | { ok: false }): T | undefined {
  const raw = input.records.get(key);
  if (raw === undefined) return undefined;
  const d = decode(raw);
  return d.ok ? d.value : undefined;
}

const frames = (i: VerdictInput) => rec(i, "frames", (r) => decodeStep(FRAMES, r));
const scenarios = (i: VerdictInput) => rec(i, "ads-scenarios", (r) => decodeStep(ADS_SCENARIOS, r));
const adsShots = (i: VerdictInput) => rec(i, "ads-shots", (r) => decodeStep(ADS_SHOTS, r));

/** The picked scenario's shots (the ads faces' units), or null when none is picked. */
function pickedShots(i: VerdictInput): { id: string; shots: readonly string[] } | null {
  const s = scenarios(i);
  const picked = s?.options.find((o) => o.id === s.pickedId);
  return picked === undefined ? null : { id: picked.id, shots: picked.shots.map((x) => x.id) };
}

/** The ads per-shot record, if it was made for the picked scenario. */
function shotsFor(i: VerdictInput, scenarioId: string): { stale: boolean; shots: NonNullable<ReturnType<typeof adsShots>>["shots"] } {
  const r = adsShots(i);
  if (r === undefined) return { stale: false, shots: {} };
  return { stale: r.scenarioId !== null && r.scenarioId !== scenarioId, shots: r.scenarioId === scenarioId ? r.shots : {} };
}

/* ── frames ───────────────────────────────────────────────────────────────── */

function framesVerdict(i: VerdictInput): PartVerdict {
  if (i.discipline === "ads") {
    const p = pickedShots(i);
    if (p === null) return v("empty", c("no-scenario", "no scenario picked"));
    const s = shotsFor(i, p.id);
    if (s.stale) return v("working", c("scenario-changed", "takes made for another scenario"));
    const adopted = p.shots.filter((id) => (s.shots[id]?.adoptedImage ?? null) !== null).length;
    const text = `${adopted} of ${p.shots.length} images adopted`;
    return adopted === p.shots.length ? v("ready", c("images-adopted", text)) : v(adopted === 0 ? "empty" : "working", c("images-adopted", text));
  }
  const units = frames(i)?.units ?? [];
  if (units.length === 0) return v("empty", c("no-units", "no picture units"));
  const refused = units.filter((u) => u.plate.state === "refused");
  if (refused.length > 0) return v("blocked", c("plate-refused", `${plural(refused.length, "plate", "plates")} refused`));
  const composed = units.filter((u) => u.plate.state === "ready").length;
  // A plate whose subject moved since it was rendered is stale (lib/frames/frames.ts isStalePlate);
  // one rendered before `renderedSubject` existed is unknown, not stale.
  const stale = units.filter((u) => u.plate.state === "ready" && u.plate.renderedSubject !== undefined && u.plate.subject !== undefined && u.plate.subject.trim() !== u.plate.renderedSubject.trim()).length;
  const unsourced = units.reduce((n, u) => n + u.texts.filter((t) => t.role === "figure" && t.factId === undefined).length, 0);
  const codes = [c("plates-composed", `${composed} of ${units.length} plates composed`)];
  if (stale > 0) codes.push(c("plate-stale", `${plural(stale, "plate", "plates")} behind its subject`));
  if (unsourced > 0) codes.push(c("figure-unsourced", `${plural(unsourced, "figure", "figures")} unsourced`));
  if (composed === units.length && stale === 0 && unsourced === 0) return v("ready", ...codes);
  return v(composed === 0 && unsourced === 0 ? "empty" : "working", ...codes);
}

/* ── motion ───────────────────────────────────────────────────────────────── */

/** What identifies a plate's pixels now: its blob digest (v1 plateSig hashed the data: URL). */
export const plateSigOf = (plate: { readonly blob?: { readonly sha256: string }; readonly src?: string }): string => plate.blob?.sha256 ?? plate.src ?? "";

function motionVerdict(i: VerdictInput): PartVerdict {
  if (i.discipline === "ads") {
    const p = pickedShots(i);
    if (p === null) return v("empty", c("no-scenario", "no scenario picked"));
    const s = shotsFor(i, p.id);
    if (s.stale) return v("working", c("scenario-changed", "clips made for another scenario"));
    const done = p.shots.filter((id) => {
      const shot = s.shots[id];
      const clip = shot?.clips.find((x) => x.id === shot.adoptedClip);
      return clip !== undefined && (clip.status === undefined || clip.status === "done");
    }).length;
    const text = `${done} of ${p.shots.length} clips adopted`;
    return done === p.shots.length ? v("ready", c("clips-adopted", text)) : v(done === 0 ? "empty" : "working", c("clips-adopted", text));
  }
  const plated = (frames(i)?.units ?? []).filter((u) => u.plate.state === "ready");
  if (plated.length === 0) return v("empty", c("no-plates", "no plate to direct"));
  const dir = rec(i, "motion-direction", (r) => decodeStep(MOTION_DIRECTION, r))?.byFrame ?? {};
  let moving = 0;
  let declined = 0;
  for (const u of plated) {
    if (u.clip.motion.trim() !== "") moving++;
    else if (dir[u.id]?.outcome.kind === "declined" && dir[u.id]?.plate === plateSigOf(u.plate)) declined++;
  }
  const open = plated.length - moving - declined;
  const codes = [c("motion-directed", `${moving} moving · ${declined} declined of ${plated.length}`)];
  if (open === 0) return v("ready", ...codes);
  return v(moving + declined === 0 ? "empty" : "working", c("units-undirected", `${plural(open, "plate", "plates")} without direction`), ...codes);
}

/* ── score ────────────────────────────────────────────────────────────────── */

function scoreVerdict(i: VerdictInput): PartVerdict {
  if (i.discipline === "ads") {
    const p = pickedShots(i);
    if (p === null) return v("empty", c("no-scenario", "no scenario picked"));
    const s = rec(i, "ads-score", (r) => decodeStep(ADS_SCORE, r));
    if (s === undefined || s.takeIds.length === 0) return v("empty", c("no-bed", "no bed rendered"));
    if (s.scenarioId !== p.id) return v("working", c("scenario-changed", "bed scored against another scenario"));
    return s.activeTakeId === null ? v("working", c("take-missing", "no take in use")) : v("ready", c("bed-taken", "bed take in use"));
  }
  const spots = rec(i, "score", (r) => decodeStep(SCORE, r))?.spots;
  if (spots === undefined || spots.length === 0) return v("empty", c("no-cues", "no cues spotted"));
  const untaken = spots.filter((s) => s.activeTakeId === undefined).length;
  const spotted = c("cues-spotted", `${plural(spots.length, "cue", "cues")} spotted`);
  // A cue without a take is the gap the Cut's music lane draws as missing.
  return untaken === 0 ? v("ready", spotted) : v("working", c("take-missing", `${plural(untaken, "cue", "cues")} without a take`), spotted);
}

/* ── cut ──────────────────────────────────────────────────────────────────── */

function cutVerdict(i: VerdictInput): PartVerdict {
  if (i.discipline === "ads") {
    const f = rec(i, "ads-finish", (r) => decodeStep(ADS_FINISH, r));
    if (f === undefined) return v("empty", c("no-finish", "nothing finished"));
    const codes: VerdictCode[] = [];
    if (f.endCard.cta.trim() === "") codes.push(c("cta-missing", "end card has no call to action"));
    if (f.exports.length === 0) codes.push(c("no-export", "no aspect rendered"));
    return codes.length === 0 ? v("ready", c("exported", `${plural(f.exports.length, "aspect", "aspects")} rendered`)) : v("working", ...codes);
  }
  const fr = frames(i);
  const spots = rec(i, "score", (r) => decodeStep(SCORE, r))?.spots ?? null;
  if (fr === undefined || fr.units.length === 0) return v("empty", c("no-picture", "no picture to cut"));
  // v1's timeline places a plate that has a `src` (deriveTimeline.ts:216, a data: URL then). A
  // plate here is a blob ref: its content address stands in for the src, so a plate whose bytes
  // are held is placed and one with neither is "no plate", as before.
  const units = narrow(
    fr.units.map((u) => (u.plate.src === undefined && u.plate.blob !== undefined ? { ...u, plate: { ...u.plate, src: `sha256:${u.plate.blob.sha256}` } } : u)),
    isUnit,
  );
  const spotList = spots === null ? null : narrow(spots, isSpot);
  if (units === null || (spots !== null && spotList === null)) return v("blocked", c("unreadable", "a picture unit or cue the timeline cannot read"));
  const cut = deriveTimeline({
    projectId: i.projectId,
    project: i.targetS === null ? null : { title: i.title, logline: "", targetS: i.targetS },
    units,
    spots: spotList,
    storeTakeIds: i.takeIds ?? null,
  });
  const offsets = rec(i, "cut", (r) => decodeStep(CUT, r))?.offsets ?? {};
  const checks = finishLine(cut, offsets);
  const holds = checks.filter((x) => x.verdict === "fail" && (x.id !== "voice" || i.plansVoice));
  const codes = checks.filter((x) => x.verdict === "fail").map((x) => c(`finish-${x.id}`, x.deny ?? `${x.label} ${x.value} vs ${x.target}`));
  if (holds.length === 0) return v("ready", c("finish-line", `${checks.filter((x) => x.verdict === "pass").length} of ${checks.length} checks pass`), ...codes);
  return v("working", ...codes);
}

// The door checked what readers rely on and carried the rest; these guards check the rest of what
// the timeline reads before it is handed lib's types (v1 cast at the same boundary, migrate.ts).
const obj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const numOrNull = (x: unknown): boolean => x === null || typeof x === "number";
function isUnit(u: unknown): u is PictureUnit {
  return obj(u) && typeof u["id"] === "string" && typeof u["sourceId"] === "string" && (u["kind"] === "beat" || u["kind"] === "shot") && numOrNull(u["startS"]) && numOrNull(u["holdS"]) && obj(u["plate"]) && obj(u["beatRef"]);
}
function isSpot(s: unknown): s is ScoreSpot {
  return obj(s) && typeof s["id"] === "string" && typeof s["title"] === "string" && Array.isArray(s["sceneIds"]) && typeof s["note"] === "string";
}
/** All of them, or null: a unit the timeline cannot read is not silently left off the clock. */
function narrow<T>(xs: readonly unknown[], is: (x: unknown) => x is T): T[] | null {
  const out: T[] = [];
  for (const x of xs) {
    if (!is(x)) return null;
    out.push(x);
  }
  return out;
}

const NOT_HERE: ReadonlySet<Discipline> = new Set<Discipline>(["music-video"]);

/** A gating part's verdict. A music video plans none of these parts (album recipe). */
export function partVerdict(kind: GateKind, input: VerdictInput): PartVerdict {
  if (NOT_HERE.has(input.discipline)) return v("empty", c("not-applicable", `no ${kind} in a ${input.discipline} project`));
  switch (kind) {
    case "frames":
      return framesVerdict(input);
    case "motion":
      return motionVerdict(input);
    case "score":
      return scoreVerdict(input);
    case "cut":
      return cutVerdict(input);
  }
}

export function isGateKind(kind: string): kind is GateKind {
  return kind === "frames" || kind === "motion" || kind === "score" || kind === "cut";
}
