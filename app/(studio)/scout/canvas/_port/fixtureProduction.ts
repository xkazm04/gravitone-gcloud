import "server-only";

// THE PRODUCTION BASIN'S FIXTURE SIDE (spark character-cores S1). One real production - the paused Unlatched clip's
// first 1:46 as a graph of stations - and the cores it can cast, imported once by pipeline/production-fixture.mts into
// ./fixtureProduction.json, checked here on first use and held in memory for the life of the dev server: a swap and a
// verdict answer as the real side will from the kernel production manifest (S2), without a store or a vendor.
//
// Two things are read from disk on every call, because the core-to-scene experiment writes them while the server
// runs (foundry-out/production-fixture/experiment/): a core's redrawn take-start frames (<coreKey>/<K-id>.png) for a
// swap's preview, and the eye's drift.json ({`<coreKey>/<K-id>` | `original/<K-id>` | node id: Drift}). A frame the
// experiment has not drawn yet previews as the original, `pending`.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import { DRIFT_AXES, PRODUCTION_NODE_STATES, PRODUCTION_STATIONS, redoOf, staleAfter, type CoreRef, type Drift, type Production, type ProductionNode, type SwapPreview } from "@gt/domain/productionGraph";

import { productionFileUrl, productionFixtureRoot } from "../../../../../lib/foundry/production/files.ts";
import type { ProductionVerdictInput, SwapInput } from "./contract.ts";
import type { ServerCanvas } from "./port.ts";
import imported from "./fixtureProduction.json" with { type: "json" };

export type ProductionFixture = { readonly production: Production; readonly cores: readonly CoreRef[] };

/** How many take-start frames a swap previews. */
const PREVIEW_FRAMES = 3;
const CAST = "cast";

/* ── the runtime check: the JSON is the importer's, the types are WP0's ─────────────────────────────── */

type Rec = Readonly<Record<string, unknown>>;
const isRec = (x: unknown): x is Rec => typeof x === "object" && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === "string" && x.length > 0;
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isStrs = (x: unknown): x is readonly string[] => Array.isArray(x) && x.every(isStr);
const optional = (r: Rec, key: string, ok_: (x: unknown) => boolean): boolean => !(key in r) || ok_(r[key]);

function nodeProblem(n: unknown): string | null {
  if (!isRec(n) || !isStr(n["id"])) return "a node without an id";
  const id = n["id"];
  if (!(PRODUCTION_STATIONS as readonly unknown[]).includes(n["station"])) return `${id}: no station`;
  if (!(PRODUCTION_NODE_STATES as readonly unknown[]).includes(n["state"])) return `${id}: no state`;
  if (!isStr(n["label"]) || !isStr(n["inputsDigest"]) || !isStrs(n["madeFrom"])) return `${id}: label, madeFrom or inputsDigest`;
  const media = (m: unknown): boolean => isRec(m) && ["image", "video", "audio"].includes(m["kind"] as string) && isStr(m["src"]);
  if (!optional(n, "media", media) || !optional(n, "at", isNum) || !optional(n, "dur", isNum) || !optional(n, "prompt", isStr) || !optional(n, "drift", isDrift)) return `${id}: media, at, dur, prompt or drift`;
  return null;
}

function coreProblem(c: unknown): string | null {
  if (!isRec(c) || !isStr(c["id"]) || !c["id"].startsWith("chr:")) return "a core without a chr: id";
  if (!isStr(c["name"]) || !isStr(c["identity"]) || !isStr(c["portrait"]) || !isStr(c["origin"]) || !optional(c, "sheet", isStr)) return `${c["id"]}: name, identity, portrait, sheet or origin`;
  return null;
}

export function isDrift(x: unknown): x is Drift {
  return isRec(x) && DRIFT_AXES.every((a) => x[a] === "holds" || x[a] === "drifts") && typeof x["reason"] === "string" && x["reason"].length <= 140 && isStr(x["by"]);
}

/** The imported fixture as WP0's types, or the first thing that is not. Every madeFrom names a node of the graph. */
export function checkFixture(x: unknown): Result<ProductionFixture> {
  const bad = (m: string): Result<ProductionFixture> => err("invalid", `fixtureProduction.json: ${m}`);
  if (!isRec(x) || !isRec(x["production"]) || !Array.isArray(x["cores"])) return bad("no production or cores");
  const p = x["production"];
  const t = p["track"];
  if (!isStr(p["id"]) || !isStr(p["title"]) || !isStr(p["look"])) return bad("the production's id, title or look");
  if (!isRec(t) || !isStr(t["title"]) || !isNum(t["seconds"]) || !isNum(t["bpm"]) || !Array.isArray(t["beats"]) || !t["beats"].every(isNum)) return bad("the track map");
  if (!Array.isArray(t["sections"]) || !t["sections"].every((s) => isRec(s) && isStr(s["name"]) && isNum(s["start"]) && isNum(s["end"]))) return bad("the track's sections");
  if (!Array.isArray(t["lyrics"]) || !t["lyrics"].every((l) => isRec(l) && isNum(l["t"]) && isStr(l["text"]))) return bad("the track's lyrics");
  const cast = coreProblem(p["cast"]);
  if (cast !== null) return bad(cast);
  if (!Array.isArray(p["nodes"])) return bad("no nodes");
  for (const n of p["nodes"]) {
    const why = nodeProblem(n);
    if (why !== null) return bad(why);
  }
  const nodes = p["nodes"] as readonly ProductionNode[];
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) return bad("two nodes share an id");
  for (const n of nodes) for (const f of n.madeFrom) if (!ids.has(f)) return bad(`${n.id} is made from ${f}, which is not a node`);
  if (!ids.has(CAST)) return bad("no cast node");
  for (const c of x["cores"]) {
    const why = coreProblem(c);
    if (why !== null) return bad(why);
  }
  return ok(x as unknown as ProductionFixture);
}

/* ── the experiment, read per call ─────────────────────────────────────── */

const experimentDir = (): string => path.join(productionFixtureRoot(), "experiment");

function readDrift(): Readonly<Record<string, Drift>> {
  const file = path.join(experimentDir(), "drift.json");
  try {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isRec(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, Drift] => isDrift(e[1])));
  } catch {
    return {};
  }
}

const takeOf = (n: ProductionNode): string | null => /^(?:kf|clip):(K\d\d)$/.exec(n.id)?.[1] ?? null;

/** The eye's reading of the production as cast now: a node by its id, a take by `original/<K-id>`. */
function withDrift(p: Production, drift: Readonly<Record<string, Drift>>): Production {
  const nodes = p.nodes.map((n) => {
    const k = takeOf(n);
    const d = drift[n.id] ?? (k !== null && n.station === "clip" ? drift[`original/${k}`] : undefined);
    return d === undefined ? n : { ...n, drift: d };
  });
  return { ...p, nodes };
}

/** The core's key as the experiment names its folder: `chr:n01-elif` -> `n01-elif` (or the round's `new-n01-elif`). */
function redrawn(coreId: string, take: string): { readonly src: string; readonly key: string } | null {
  const key = coreId.replace(/^chr:/, "");
  for (const k of [key, `new-${key}`]) {
    if (existsSync(path.join(experimentDir(), k, `${take}.png`))) return { src: productionFileUrl("experiment", `${k}/${take}.png`), key: k };
  }
  return null;
}

/* ── the in-memory side ────────────────────────────────────────────────── */

let held: { production: Production; readonly cores: readonly CoreRef[] } | null = null;
let loadError: string | null = null;

function fixture(): Result<{ production: Production; readonly cores: readonly CoreRef[] }> {
  if (held !== null) return ok(held);
  if (loadError !== null) return err("unavailable", loadError);
  const checked = checkFixture(imported);
  if (!checked.ok) {
    loadError = checked.error.message;
    return checked;
  }
  held = { production: checked.value.production, cores: checked.value.cores };
  return ok(held);
}

/** The dev server's life is the fixture's: tests start it over. */
export function resetFixtureProductions(): void {
  held = null;
  loadError = null;
}

function production(id: string): Result<{ readonly p: Production; readonly cores: readonly CoreRef[] }> {
  const f = fixture();
  if (!f.ok) return f;
  return f.value.production.id === id ? ok({ p: f.value.production, cores: f.value.cores }) : err("not-found", `no production ${id}`);
}

function swapOf(input: SwapInput): Result<{ readonly p: Production; readonly core: CoreRef }> {
  const got = production(input.production);
  if (!got.ok) return got;
  const core = got.value.cores.find((c) => c.id === input.core);
  if (core === undefined) return err("not-found", `no core ${input.core}`);
  if (core.id === got.value.p.cast.id) return err("conflict", `${core.name} is already cast in ${got.value.p.title}`);
  return ok({ p: got.value.p, core });
}

/** The first `PREVIEW_FRAMES` takes' start frames, redrawn with the core where the experiment drew them. */
function previewFrames(p: Production, core: CoreRef, drift: Readonly<Record<string, Drift>>): ProductionNode[] {
  const starts = p.nodes.filter((n) => n.station === "keyframe" && takeOf(n) !== null).slice(0, PREVIEW_FRAMES);
  return starts.map((n) => {
    const take = takeOf(n) as string;
    const madeFrom = n.madeFrom.map((f) => (f === CAST ? core.id : f));
    const drawn = redrawn(core.id, take);
    if (drawn === null) return { ...n, madeFrom, state: "pending" };
    const d = drift[`${drawn.key}/${take}`];
    return { ...n, madeFrom, state: "made", inputsDigest: `${n.inputsDigest}>${core.id}`, media: { kind: "image", src: drawn.src }, ...(d === undefined ? {} : { drift: d }) };
  });
}

export function previewSwap(input: SwapInput): Result<SwapPreview> {
  const got = swapOf(input);
  if (!got.ok) return got;
  const { p, core } = got.value;
  const stale = staleAfter(p.nodes, CAST);
  return ok({ production: p.id, from: p.cast.id, to: core.id, frames: previewFrames(p, core, readDrift()), stale, redo: redoOf(p.nodes, stale) });
}

export function acceptSwap(input: SwapInput): Result<{ readonly production: Production }> {
  const got = swapOf(input);
  if (!got.ok || held === null) return got.ok ? err("unavailable", "the production fixture is not loaded") : got;
  const { p, core } = got.value;
  const stale = new Set(staleAfter(p.nodes, CAST));
  const nodes = p.nodes.map((n): ProductionNode => {
    if (n.id === CAST) return { ...n, label: core.name, inputsDigest: core.id, media: { kind: "image", src: core.portrait } };
    return stale.has(n.id) ? { ...n, state: "stale" } : n;
  });
  held.production = { ...p, cast: core, nodes };
  return ok({ production: withDrift(held.production, readDrift()) });
}

export function setVerdict(input: ProductionVerdictInput): Result<{ readonly production: Production }> {
  const got = production(input.production);
  if (!got.ok || held === null) return got.ok ? err("unavailable", "the production fixture is not loaded") : got;
  const p = got.value.p;
  if (!p.nodes.some((n) => n.id === input.node)) return err("not-found", `no node ${input.node} in ${p.title}`);
  const nodes = p.nodes.map((n): ProductionNode => {
    if (n.id !== input.node) return n;
    const { verdict: _was, ...rest } = n;
    if (input.verdict === null) return rest;
    return { ...rest, verdict: { verdict: input.verdict, reasons: input.reasons, ...(input.note === undefined ? {} : { note: input.note }) } };
  });
  held.production = { ...p, nodes };
  return ok({ production: withDrift(held.production, readDrift()) });
}

export const fixtureProductions: Pick<ServerCanvas, "productions" | "cores" | "swapPreview" | "swapAccept" | "productionVerdict"> = {
  productions: async () => {
    const f = fixture();
    return f.ok ? ok({ productions: [withDrift(f.value.production, readDrift())] }) : f;
  },
  cores: async () => {
    const f = fixture();
    return f.ok ? ok({ cores: f.value.cores }) : f;
  },
  swapPreview: async (input) => previewSwap(input),
  swapAccept: async (input) => acceptSwap(input),
  productionVerdict: async (input) => setVerdict(input),
};
