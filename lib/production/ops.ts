// THE PRODUCTION'S OPERATIONS (spark character-cores S1.5, WP5) - every verb the canvas port answers, as functions over
// the production's file (./state.ts): the productions, the cores, a swap's preview, its accept, a verdict. The canvas's
// fixture side and pipeline/production.mts both call these, so the screen and the CLI change one production.
//
// Two things are read from disk on every call besides the file: a core's take-start frames for a swap's preview - the
// ones `keyframes` drew in this production's look (keyframes/<productionId>/<coreKey>/<K-id>.png) first, then the
// core-to-scene experiment's (experiment/<coreKey>/<K-id>.png), else the original, `pending` - and the experiment's
// eye readings (experiment/drift.json: {`<coreKey>/<K-id>` | `original/<K-id>` | node id: Drift}).

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import { redoOf, staleAfter, type CoreRef, type Drift, type Production, type ProductionNode, type SwapPreview } from "@gt/domain/productionGraph";

import { productionFileUrl, productionFixtureRoot } from "../foundry/production/files.ts";
import { CAST, isDrift, isRec } from "./check.ts";
import { coreKey, findCore, listCores, productionIds, readOnlyRefusal, readState, updateState, type ProductionState } from "./state.ts";

/** How many take-start frames a swap previews. */
const PREVIEW_FRAMES = 3;

export type SwapInput = { readonly production: string; readonly core: string };
export type VerdictInput = { readonly production: string; readonly node: string; readonly verdict: "keep" | "reject" | null; readonly reasons: readonly string[]; readonly note?: string };

const experimentDir = (): string => path.join(productionFixtureRoot(), "experiment");

/** Where `keyframes` writes a core's frames in one production. */
export const keyframesDir = (productionId: string, coreId: string): string => path.join(productionFixtureRoot(), "keyframes", productionId, coreKey(coreId));

function readDrift(): Readonly<Record<string, Drift>> {
  try {
    const raw: unknown = JSON.parse(readFileSync(path.join(experimentDir(), "drift.json"), "utf8"));
    if (!isRec(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, Drift] => isDrift(e[1])));
  } catch {
    return {};
  }
}

/** `kf:K03` / `clip:K03` -> `K03`; any other node -> null. */
export const takeOf = (n: Pick<ProductionNode, "id">): string | null => /^(?:kf|clip):(K\d\d)$/.exec(n.id)?.[1] ?? null;

/** The eye's reading of the production as cast now: a node's own reading first, then the experiment's. */
function withDrift(p: Production, drift: Readonly<Record<string, Drift>>): Production {
  const nodes = p.nodes.map((n) => {
    if (n.drift !== undefined) return n;
    const k = takeOf(n);
    // the experiment read the original takes: its reading belongs to a clip only while the clip still shows one
    const original = k !== null && n.station === "clip" && n.media?.src === productionFileUrl("unlatched", `takes/${k}.mp4`);
    const d = drift[n.id] ?? (original ? drift[`original/${k}`] : undefined);
    return d === undefined ? n : { ...n, drift: d };
  });
  return { ...p, nodes };
}

const shown = (s: ProductionState): Production => withDrift(s.production, readDrift());

/** A core's frame for one take: drawn in this production's look, else the experiment's (`<key>` or the round's `new-<key>`). */
function redrawn(productionId: string, coreId: string, take: string): { readonly src: string; readonly key: string } | null {
  const key = coreKey(coreId);
  if (existsSync(path.join(keyframesDir(productionId, coreId), `${take}.png`))) return { src: productionFileUrl("keyframes", `${productionId}/${key}/${take}.png`), key };
  for (const k of [key, `new-${key}`]) {
    if (existsSync(path.join(experimentDir(), k, `${take}.png`))) return { src: productionFileUrl("experiment", `${k}/${take}.png`), key: k };
  }
  return null;
}

export function listProductions(): Result<readonly Production[]> {
  const ids = productionIds();
  if (!ids.ok) return ids;
  const out: Production[] = [];
  for (const id of ids.value) {
    const s = readState(id);
    if (!s.ok) return s;
    out.push(shown(s.value));
  }
  return ok(out);
}

export function getProduction(id: string): Result<Production> {
  const s = readState(id);
  return s.ok ? ok(shown(s.value)) : s;
}

export { listCores };

function swapOf(s: ProductionState, ref: string): Result<CoreRef> {
  const core = findCore(ref);
  if (!core.ok) return core;
  if (core.value.id === s.production.cast.id) return err("conflict", `${core.value.name} is already cast in ${s.production.title}`);
  return core;
}

/** The first `PREVIEW_FRAMES` takes' start frames, redrawn with the core where they were drawn. */
function previewFrames(p: Production, core: CoreRef, drift: Readonly<Record<string, Drift>>): ProductionNode[] {
  const starts = p.nodes.filter((n) => n.station === "keyframe" && takeOf(n) !== null).slice(0, PREVIEW_FRAMES);
  return starts.map((n) => {
    const take = takeOf(n) as string;
    const madeFrom = n.madeFrom.map((f) => (f === CAST ? core.id : f));
    const { drift: _was, ...rest } = n;
    const drawn = redrawn(p.id, core.id, take);
    if (drawn === null) return { ...rest, madeFrom, state: "pending" };
    const d = drift[`${drawn.key}/${take}`];
    return { ...rest, madeFrom, state: "made", inputsDigest: `${n.inputsDigest}>${core.id}`, media: { kind: "image", src: drawn.src }, ...(d === undefined ? {} : { drift: d }) };
  });
}

export function previewSwap(input: SwapInput): Result<SwapPreview> {
  const s = readState(input.production);
  if (!s.ok) return s;
  const refused = readOnlyRefusal(s.value);
  if (refused !== null) return refused;
  const core = swapOf(s.value, input.core);
  if (!core.ok) return core;
  const p = s.value.production;
  const stale = staleAfter(p.nodes, CAST);
  return ok({ production: p.id, from: p.cast.id, to: core.value.id, frames: previewFrames(p, core.value, readDrift()), stale, redo: redoOf(p.nodes, stale) });
}

/** The cast changes, everything downstream of it goes stale (and loses the eye's reading of the old cast). */
export function acceptSwap(input: SwapInput): Result<{ readonly production: Production }> {
  const w = updateState(input.production, (s) => {
    const core = swapOf(s, input.core);
    if (!core.ok) return core;
    const p = s.production;
    const stale = new Set(staleAfter(p.nodes, CAST));
    const nodes = p.nodes.map((n): ProductionNode => {
      if (n.id === CAST) return { ...n, label: core.value.name, inputsDigest: core.value.id, media: { kind: "image", src: core.value.portrait } };
      if (!stale.has(n.id)) return n;
      const { drift: _old, ...rest } = n;
      return { ...rest, state: "stale" };
    });
    const failed = Object.fromEntries(Object.entries(s.failed).filter(([k]) => !stale.has(k.replace(/^eye\//, ""))));
    return ok({ ...s, production: { ...p, cast: core.value, nodes }, failed });
  });
  return w.ok ? ok({ production: shown(w.value) }) : w;
}

export function setVerdict(input: VerdictInput): Result<{ readonly production: Production }> {
  const w = updateState(input.production, (s) => {
    const p = s.production;
    if (!p.nodes.some((n) => n.id === input.node)) return err("not-found", `no node ${input.node} in ${p.title}`);
    const nodes = p.nodes.map((n): ProductionNode => {
      if (n.id !== input.node) return n;
      const { verdict: _was, ...rest } = n;
      if (input.verdict === null) return rest;
      return { ...rest, verdict: { verdict: input.verdict, reasons: input.reasons, ...(input.note === undefined ? {} : { note: input.note }) } };
    });
    return ok({ ...s, production: { ...p, nodes } });
  });
  return w.ok ? ok({ production: shown(w.value) }) : w;
}

export type ClipMediaInput = { readonly production: string; readonly node: string; readonly run: string; readonly path: string; readonly prompt?: string };

/**
 * A take rendered off the street (pipeline/production-clips.py, WP8): the clip is made from the file `<run>/<path>` under
 * the production root, served through the production file door, and loses the eye's reading of what it was before.
 */
export function setClipMedia(input: ClipMediaInput): Result<{ readonly production: Production }> {
  if (path.extname(input.path).toLowerCase() !== ".mp4") return err("invalid", `${input.path} is not an mp4`);
  const abs = path.resolve(productionFixtureRoot(), input.run, input.path);
  if (!abs.startsWith(path.resolve(productionFixtureRoot()) + path.sep) || !existsSync(abs)) return err("not-found", `no take ${input.run}/${input.path} in the production fixture`);
  const w = updateState(input.production, (s) => {
    const p = s.production;
    const n = p.nodes.find((x) => x.id === input.node);
    if (n === undefined || n.station !== "clip") return err("not-found", `no clip ${input.node} in ${p.title}`);
    const nodes = p.nodes.map((x): ProductionNode => {
      if (x.id !== input.node) return x;
      const { drift: _old, ...rest } = x;
      return { ...rest, state: "made", media: { kind: "video", src: productionFileUrl(input.run, input.path.split(path.sep).join("/")) }, ...(input.prompt === undefined ? {} : { prompt: input.prompt }) };
    });
    return ok({ ...s, production: { ...p, nodes } });
  });
  return w.ok ? ok({ production: shown(w.value) }) : w;
}
