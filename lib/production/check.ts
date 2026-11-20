// THE PRODUCTION FIXTURE'S RUNTIME CHECK (spark character-cores, moved here from the canvas port at WP5 so the CLI and
// the dev server read one production through one door). The JSON is pipeline/production-fixture.mts's; the types are
// WP0's (packages/domain/src/productionGraph.ts). A state file the CLI or the screen wrote goes through the same check.

import { err, ok, type Result } from "@gt/domain/errors";
import { DRIFT_AXES, PRODUCTION_NODE_STATES, PRODUCTION_STATIONS, type CoreRef, type Drift, type Production, type ProductionNode } from "@gt/domain/productionGraph";

export type ProductionFixture = { readonly production: Production; readonly cores: readonly CoreRef[] };

/** The cast station's one node id. */
export const CAST = "cast";

type Rec = Readonly<Record<string, unknown>>;
export const isRec = (x: unknown): x is Rec => typeof x === "object" && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === "string" && x.length > 0;
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isStrs = (x: unknown): x is readonly string[] => Array.isArray(x) && x.every(isStr);
const optional = (r: Rec, key: string, ok_: (x: unknown) => boolean): boolean => !(key in r) || ok_(r[key]);

export function isDrift(x: unknown): x is Drift {
  return isRec(x) && DRIFT_AXES.every((a) => x[a] === "holds" || x[a] === "drifts") && typeof x["reason"] === "string" && x["reason"].length <= 140 && isStr(x["by"]);
}

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

/** One production as WP0's types, or the first thing that is not. Every madeFrom names a node of the graph. */
export function checkProduction(p: unknown, where: string): Result<Production> {
  const bad = (m: string): Result<Production> => err("invalid", `${where}: ${m}`);
  if (!isRec(p)) return bad("no production");
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
  return ok(p as unknown as Production);
}

/** The imported fixture as WP0's types, or the first thing that is not. */
export function checkFixture(x: unknown): Result<ProductionFixture> {
  const where = "fixtureProduction.json";
  if (!isRec(x) || !isRec(x["production"]) || !Array.isArray(x["cores"])) return err("invalid", `${where}: no production or cores`);
  const p = checkProduction(x["production"], where);
  if (!p.ok) return p;
  for (const c of x["cores"]) {
    const why = coreProblem(c);
    if (why !== null) return err("invalid", `${where}: ${why}`);
  }
  return ok({ production: p.value, cores: x["cores"] as readonly CoreRef[] });
}
