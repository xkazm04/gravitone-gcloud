// THE PRODUCTION'S REAL OPERATIONS (spark character-cores S1.5, WP5) - what a recast queues, done headless: `style` redraws
// a core in the production's look (a portrait and an invariant sheet), `keyframes` redraws the stale keyframes with the
// cast's styled sheet in the take's room, `clipsPlan` prints the H3 takes that would follow (never run here). Every
// frame is one Codex image (the drawer is injected: pipeline/production.mts passes pipeline/trailer/codex.mts's
// codexImage, tests a stub), at most 3 refs, 3 frames at a time, a failure retried once; `dry` returns the exact plan.
//
// The keyframe method is WP4's, as measured (experiment/FINDINGS.md): image 1 is the take's room plate, image 2 the
// core's sheet, the director's state prompt between her identity block and the two guard sentences; wardrobe held 18/18
// with "not the clothes in image 2". The sheet here is the STYLED one, so the core arrives already in the look.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import { MIN_PER_CLIP, type CoreRef, type Production, type ProductionNode } from "@gt/domain/productionGraph";

import { productionFileUrl, productionFixtureRoot } from "../foundry/production/files.ts";
import { isRec } from "./check.ts";
import { keyframesDir, takeOf } from "./ops.ts";
import { coreKey, fileOfUrl, findCore, readState, updateState, type ProductionState, type Styled } from "./state.ts";

/** One Codex image: writes <dir>/<name>.png and <dir>/<name>.log; true when the png is there. */
export type Drawer = (dir: string, name: string, prompt: string, refs: string[]) => Promise<boolean>;

export type PlannedFrame = {
  /** A node id (keyframes) or `portrait` / `sheet` (style). */
  readonly id: string;
  readonly out: string;
  readonly prompt: string;
  readonly refs: readonly string[];
  /** Where the state prompt came from (keyframes). */
  readonly source?: string;
};

export type DrawPlan = { readonly verb: "style" | "keyframes"; readonly production: string; readonly core: string; readonly frames: readonly PlannedFrame[]; readonly missing: readonly string[]; readonly refusal?: string };
export type FrameDone = { readonly id: string; readonly ok: boolean; readonly tries: number; readonly sentence?: string };
export type DrawDone = { readonly plan: DrawPlan; readonly frames: readonly FrameDone[] };

const PARALLEL = 3;
const MAX_REFS = 3;
const WHO = "Keep her face and identity exactly; the look changes the medium, never who she is.";
const ROLES = "Image 1 is the set. Image 2 is a reference sheet of who she is.";
const GUARDS = "Keep the room of image 1 exactly: same furniture, same positions, same light, same camera. Take only who she is from image 2 (face, hair, build); her clothes are the ones written above, not the clothes in image 2 and none of the garments her description names, and the drawing style is the painted look of image 1. Exactly one woman in the frame.";
const GUARDS_NO_ROOM = "Take only who she is from image 1 (face, hair, build); her clothes are the ones written above, not the clothes in image 1 and none of the garments her description names. Exactly one woman in the frame.";

const noStop = (s: string): string => s.trim().replace(/\.$/, "");
const digest = (...parts: readonly string[]): string => createHash("sha1").update(parts.join("\u0000")).digest("hex").slice(0, 12);

/** The look node's text, verbatim (the production's look when the node carries none). */
export function lookOf(p: Production): string {
  return p.nodes.find((n) => n.id === "look")?.prompt ?? p.look;
}

const styledDir = (productionId: string, core: CoreRef): string => path.join(productionFixtureRoot(), "cores", coreKey(core.id), "styled", productionId);

/** The last line of a frame's log that says something: the sentence a failed frame is marked with. */
function logSentence(dir: string, name: string): string {
  try {
    const lines = readFileSync(path.join(dir, `${name}.log`), "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const last = lines[lines.length - 1];
    if (last !== undefined) return last.slice(0, 240);
  } catch {
    /* no log: the drawer never started */
  }
  return `codex left no ${name}.png and no log`;
}

/** Each frame drawn, 3 at a time, a failure tried once more. */
async function drawAll(frames: readonly PlannedFrame[], draw: Drawer): Promise<FrameDone[]> {
  const done: FrameDone[] = new Array<FrameDone>(frames.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < frames.length) {
      const i = next++;
      const f = frames[i] as PlannedFrame;
      const dir = path.dirname(f.out);
      mkdirSync(dir, { recursive: true });
      const name = path.basename(f.out, ".png");
      let tries = 0;
      let made = false;
      while (!made && tries < 2) {
        tries++;
        made = await draw(dir, name, f.prompt, [...f.refs]).catch(() => false);
      }
      done[i] = made ? { id: f.id, ok: true, tries } : { id: f.id, ok: false, tries, sentence: logSentence(dir, name) };
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, frames.length) }, worker));
  return done;
}

const refFile = (src: string | undefined): string | null => (src === undefined ? null : fileOfUrl(src));
const missingOf = (refs: readonly string[]): string[] => refs.filter((r) => !existsSync(r));

/* ── style ─────────────────────────────────────────────────────────────── */

/**
 * The song's outfit, when the director's bible defines one (`## Wardrobe per section`, its first line): a production
 * dresses its cast, so a core adapts to it and leaves her card's own garment off (operator, 2026-11-20: "the outfit for
 * the song was defined and character should adapt").
 */
export function productionWardrobe(): string | null {
  try {
    const bible = readFileSync(path.join(productionFixtureRoot(), "experiment", "director", "bible.md"), "utf8");
    const sec = bible.split(/^## Wardrobe per section\s*$/m)[1];
    const line = sec?.split(/\r?\n/).find((l) => l.trim().startsWith("- "));
    const text = line?.replace(/^\s*-\s*(\*\*[^*]*\*\*)?\s*/, "").trim();
    return text === undefined || text === "" ? null : text.replace(/\.$/, "");
  } catch {
    return null;
  }
}

/** What a production's frames say about clothes: the song's outfit replaces every garment her card names. */
const dressed = (w: string | null): string => (w === null ? "Of her clothes, only the garment her description names, exactly as named; everything else plain and neutral." : `Dress her in the song's outfit: ${w}. Leave out every garment her description names (scarf, jacket, accessory): the song's outfit replaces them.`);

export function stylePlan(productionId: string, coreRef: string): Result<DrawPlan> {
  const s = readState(productionId);
  if (!s.ok) return s;
  const core = findCore(coreRef);
  if (!core.ok) return core;
  const c = core.value;
  const refs = [refFile(c.portrait), refFile(c.sheet)].filter((r): r is string => r !== null);
  if (refs.length === 0) return err("invalid", `${c.name}'s portrait is not a production file: ${c.portrait}`);
  const roles = refs.length > 1 ? "Image 1 is her portrait and image 2 her reference sheet: take only who she is from them, not their drawing style." : "Image 1 is her portrait: take only who she is from it, not its drawing style.";
  const base = `${c.identity} ${roles} Redraw her in this look: ${noStop(lookOf(s.value.production))}. ${WHO}`;
  const dir = styledDir(productionId, c);
  const wardrobe = productionWardrobe();
  const frames: PlannedFrame[] = [
    { id: "portrait", out: path.join(dir, "portrait.png"), refs, prompt: `${base} A head-and-shoulders portrait of her at rest, facing the camera, neutral expression, neutral light, plain ground, no text. ${dressed(wardrobe)}` },
    {
      id: "sheet",
      out: path.join(dir, "sheet.png"),
      refs,
      prompt: `${base} An invariant reference sheet of her on one plain ground: full-body front, three-quarter, side and back views, and two head close-ups at rest; neutral light, no labels, no text. ${dressed(wardrobe)}`,
    },
  ];
  return ok({ verb: "style", production: productionId, core: c.id, frames, missing: missingOf(refs) });
}

export async function style(productionId: string, coreRef: string, draw: Drawer): Promise<Result<DrawDone>> {
  const plan = stylePlan(productionId, coreRef);
  if (!plan.ok) return plan;
  if (plan.value.missing.length > 0) return err("not-found", `missing reference ${plan.value.missing.join(", ")}`);
  const frames = await drawAll(plan.value.frames, draw);
  const failed = frames.find((f) => !f.ok);
  if (failed !== undefined) return err("unavailable", `${failed.id} failed after ${failed.tries} tries: ${failed.sentence ?? ""}`);
  const key = coreKey(plan.value.core);
  const rel = (f: string): string => `${key}/styled/${productionId}/${f}.png`;
  const w = updateState(productionId, (s) => {
    const styled: Styled = { portrait: productionFileUrl("cores", rel("portrait")), sheet: productionFileUrl("cores", rel("sheet")), look: lookOf(s.production), at: new Date().toISOString() };
    return ok({ ...s, styled: { ...s.styled, [plan.value.core]: styled } });
  });
  return w.ok ? ok({ plan: plan.value, frames }) : w;
}

/* ── keyframes ─────────────────────────────────────────────────────────── */

type Direction = { readonly id: string; readonly prompt: string };

/** The director's state prompts by take id (experiment/director/prompts.json), empty when it has not run. */
export function directorPrompts(): ReadonlyMap<string, string> {
  try {
    const raw: unknown = JSON.parse(readFileSync(path.join(productionFixtureRoot(), "experiment", "director", "prompts.json"), "utf8"));
    const frames = isRec(raw) && Array.isArray(raw["frames"]) ? (raw["frames"] as unknown[]) : [];
    return new Map(frames.filter((f): f is Direction => isRec(f) && typeof f["id"] === "string" && typeof f["prompt"] === "string").map((f) => [f.id, f.prompt]));
  } catch {
    return new Map();
  }
}

/**
 * The director's plate per take, when it names one the fixture holds (unlatched/plates/<id>.jpg|png): K03-K05 name the
 * master RMT2 because their reprojected per-take plates have holes (experiment/FINDINGS.md), so the director's pick wins.
 */
export function directorPlates(): ReadonlyMap<string, string> {
  try {
    const raw: unknown = JSON.parse(readFileSync(path.join(productionFixtureRoot(), "experiment", "director", "prompts.json"), "utf8"));
    const frames = isRec(raw) && Array.isArray(raw["frames"]) ? (raw["frames"] as unknown[]) : [];
    const out = new Map<string, string>();
    for (const fr of frames) {
      if (!isRec(fr) || typeof fr["id"] !== "string" || typeof fr["plate"] !== "string") continue;
      const base = path.join(productionFixtureRoot(), "unlatched", "plates", fr["plate"]);
      const file = [".jpg", ".png"].map((e) => base + e).find((x) => existsSync(x));
      if (file !== undefined) out.set(fr["id"], file);
    }
    return out;
  } catch {
    return new Map();
  }
}

/** The state prompt for a keyframe: the director's for its take, else its stored prompt (which still describes the old cast's face). */
function stateOf(n: ProductionNode, director: ReadonlyMap<string, string>): { readonly text: string; readonly source: string } | null {
  const k = takeOf(n);
  const d = k === null ? undefined : director.get(k);
  if (d !== undefined) return { text: d, source: "director/prompts.json" };
  return n.prompt === undefined ? null : { text: n.prompt, source: "stored prompt (face words left in)" };
}

const plateOf = (p: Production, n: ProductionNode): ProductionNode | undefined => {
  const id = n.madeFrom.find((f) => f.startsWith("plate:"));
  return id === undefined ? undefined : p.nodes.find((x) => x.id === id);
};

/** The room plate a keyframe is drawn on, judged against and animated from: the director's pick, else the node's own. */
export function plateFor(p: Production, n: ProductionNode, plates: ReadonlyMap<string, string> = directorPlates()): string | null {
  const k = takeOf(n);
  return (k === null ? undefined : plates.get(k)) ?? refFile(plateOf(p, n)?.media?.src);
}

export type KeyframeOptions = { readonly ids?: readonly string[]; readonly all?: boolean };

/** The default set: the stale take-start keyframes; `all`: every stale keyframe with a prompt to draw from. */
function chosen(p: Production, director: ReadonlyMap<string, string>, o: KeyframeOptions): Result<readonly ProductionNode[]> {
  if (o.ids !== undefined && o.ids.length > 0) {
    const out: ProductionNode[] = [];
    for (const id of o.ids) {
      const n = p.nodes.find((x) => x.id === id);
      if (n === undefined || n.station !== "keyframe") return err("not-found", `no keyframe ${id} in ${p.title}`);
      if (stateOf(n, director) === null) return err("refused", `${id} has neither a director prompt nor a stored prompt`);
      out.push(n);
    }
    return ok(out);
  }
  const stale = p.nodes.filter((n) => n.station === "keyframe" && n.state === "stale");
  return ok(o.all === true ? stale.filter((n) => stateOf(n, director) !== null) : stale.filter((n) => takeOf(n) !== null));
}

function styledSheet(s: ProductionState): { readonly file: string; readonly refusal?: string } {
  const c = s.production.cast;
  const st = s.styled[c.id];
  const f = st === undefined ? null : fileOfUrl(st.sheet);
  if (f !== null) return { file: f };
  return { file: path.join(styledDir(s.production.id, c), "sheet.png"), refusal: `${c.name} has not been redrawn in ${s.production.title}'s look: run style ${s.production.id} ${c.id} first` };
}

export function keyframesPlan(productionId: string, o: KeyframeOptions): Result<DrawPlan> {
  const s = readState(productionId);
  if (!s.ok) return s;
  const p = s.value.production;
  const director = directorPrompts();
  const plates = directorPlates();
  const nodes = chosen(p, director, o);
  if (!nodes.ok) return nodes;
  const sheet = styledSheet(s.value);
  const dir = keyframesDir(p.id, p.cast.id);
  const frames = nodes.value.map((n): PlannedFrame => {
    const st = stateOf(n, director) as { readonly text: string; readonly source: string };
    const plate = plateFor(p, n, plates);
    const refs = (plate === null ? [sheet.file] : [plate, sheet.file]).slice(0, MAX_REFS);
    const prompt = plate === null ? `Image 1 is a reference sheet of who she is. ${p.cast.identity} ${st.text.trim()} The drawing style: ${noStop(lookOf(p))}. ${GUARDS_NO_ROOM}` : `${ROLES} ${p.cast.identity} ${st.text.trim()} ${GUARDS}`;
    return { id: n.id, out: path.join(dir, `${n.id.replace(/^kf:/, "")}.png`), prompt, refs, source: plate === null ? `${st.source}; no room plate` : st.source };
  });
  const missing = missingOf(frames.flatMap((f) => f.refs).filter((r, i, all) => all.indexOf(r) === i && r !== sheet.file));
  return ok({ verb: "keyframes", production: p.id, core: p.cast.id, frames, missing, ...(sheet.refusal === undefined ? {} : { refusal: sheet.refusal }) });
}

export async function keyframes(productionId: string, o: KeyframeOptions, draw: Drawer): Promise<Result<DrawDone>> {
  const plan = keyframesPlan(productionId, o);
  if (!plan.ok) return plan;
  const pl = plan.value;
  if (pl.refusal !== undefined) return err("refused", pl.refusal);
  if (pl.frames.length === 0) return err("refused", "no stale keyframe to draw");
  if (pl.missing.length > 0) return err("not-found", `missing reference ${pl.missing.join(", ")}`);
  const frames = await drawAll(pl.frames, draw);
  const by = new Map(frames.map((f, i) => [f.id, { done: f, planned: pl.frames[i] as PlannedFrame }]));
  const key = coreKey(pl.core);
  const w = updateState(productionId, (s) => {
    if (s.production.cast.id !== pl.core) return err("conflict", `the cast changed to ${s.production.cast.name} while the frames were drawn`);
    const redrawn = (k: string): boolean => by.has(k.replace(/^eye\//, ""));
    const failed: Record<string, string> = Object.fromEntries(Object.entries(s.failed).filter(([k]) => !redrawn(k)));
    const nodes = s.production.nodes.map((n): ProductionNode => {
      const hit = by.get(n.id);
      if (hit === undefined) return n;
      const { drift: _d, verdict: _v, ...rest } = n;
      if (!hit.done.ok) {
        failed[n.id] = hit.done.sentence ?? "failed";
        return { ...rest, state: "failed" };
      }
      const src = productionFileUrl("keyframes", `${productionId}/${key}/${path.basename(hit.planned.out)}`);
      return { ...rest, state: "made", media: { kind: "image", src }, prompt: hit.planned.prompt, inputsDigest: digest(pl.core, s.styled[pl.core]?.at ?? "", hit.planned.prompt, ...hit.planned.refs.map((r) => path.basename(r))) };
    });
    return ok({ ...s, production: { ...s.production, nodes }, failed });
  });
  return w.ok ? ok({ plan: pl, frames }) : w;
}

/* ── clips (a plan only: no clip renders this weekend) ─────────────────── */

export type ClipLine = { readonly take: string; readonly clip: string; readonly start: string; readonly startState: string; readonly plate: string | null; readonly sheet: string; readonly seconds: number; readonly minutes: number };
export type ClipsPlan = { readonly production: string; readonly core: string; readonly clips: readonly ClipLine[]; readonly minutes: number; readonly refusal?: string };

export function clipsPlan(productionId: string): Result<ClipsPlan> {
  const s = readState(productionId);
  if (!s.ok) return s;
  const p = s.value.production;
  const sheet = styledSheet(s.value);
  const clips = p.nodes
    .filter((n) => n.station === "clip" && n.state === "stale")
    .map((n): ClipLine => {
      const take = takeOf(n) ?? n.id;
      const start = p.nodes.find((x) => x.id === `kf:${take}`);
      const plate = start === undefined ? null : plateFor(p, start);
      return { take, clip: n.id, start: start?.media === undefined ? `kf:${take}` : (refFile(start.media.src) ?? start.media.src), startState: start?.state ?? "missing", plate, sheet: sheet.file, seconds: n.dur ?? 0, minutes: MIN_PER_CLIP };
    });
  return ok({ production: p.id, core: p.cast.id, clips, minutes: clips.length * MIN_PER_CLIP, ...(sheet.refusal === undefined ? {} : { refusal: sheet.refusal }) });
}
