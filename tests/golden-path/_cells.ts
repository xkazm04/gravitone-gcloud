// THE DEPLOYMENT CELLS, APPLIED — the probe-side half of CIP-B.
//
// The cells themselves are declared in lib/deploymentCells.ts, where
// pipeline/preflight.mts can read them too. This file turns one into a
// process environment for tests/golden-path/deployment-cells.probe.spec.ts.
//
// A cell applied is a COMPLETE assignment of every axis: what it names is set,
// and every other axis variable is DELETED. An axis left to inherit from the
// developer's shell would let the machine running the lane decide the verdict,
// which is the leak env-isolation.probe.spec.ts exists for. The posture axes
// are declared in lib/; the credential axes and the store-root overrides are
// DERIVED here from the app's own source, so a new key or a new store directory
// is scrubbed or redirected by existing rather than by somebody remembering.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { ACCESS_SECRET_VAR } from "@/lib/apiAuth";
import { POSTURE_AXES, type Cell } from "@/lib/deploymentCells";

import { stripComments } from "./_helpers";

export { CELLS, callerOf, nearestCell, type Cell } from "@/lib/deploymentCells";

const ROOT = process.cwd();

/** The access secret a cell's caller presents. Not a real secret: it only has
 *  to equal what the same cell configures. */
export const CELL_SECRET = "deployment-cell-secret";

/** A credential value that is SET (so a key check passes) and can buy nothing:
 *  the lane also replaces `fetch` with a stub that refuses every call. */
export const sentinel = (variable: string): string => `cell-sentinel-${variable.toLowerCase()}`;

/** Every `.ts`/`.tsx` file under `dir`, skipping node_modules. */
function sources(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) out.push(full);
    }
  };
  walk(path.join(ROOT, dir));
  return out;
}

/** Environment variable NAMES the app's code mentions, from `lib/` and `app/`
 *  with comments stripped: `process.env.X`, and any quoted SCREAMING_CASE
 *  literal (several key names live in `*_VAR` constants and lookup tables
 *  rather than inline reads). */
let mentioned: Set<string> | null = null;
function names(): Set<string> {
  if (mentioned) return mentioned;
  mentioned = new Set();
  for (const f of [...sources("lib"), ...sources("app")]) {
    const src = stripComments(readFileSync(f, "utf8"));
    for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) mentioned.add(m[1]);
    for (const m of src.matchAll(/["'`]([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)["'`]/g)) mentioned.add(m[1]);
  }
  return mentioned;
}

/** Every credential the app reads — derived. A cell sets a sentinel for the
 *  ones it holds and every other one is deleted, so a real key in the
 *  developer's shell can never decide (or pay for) a verdict. */
export function credentialVars(): string[] {
  return [...names()].filter((n) => /_(API_KEY|KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS)$/.test(n)).sort();
}

/** Every store root the app lets the environment override (`*_DIR`, `*_PATH`)
 *  — derived. The lane points each at a scratch directory so no route it
 *  drives can write into the checkout. */
export function storeRootVars(): string[] {
  return [...names()].filter((n) => /_(DIR|PATH)$/.test(n) && n !== "PATH").sort();
}

/** Every variable an applied cell assigns or deletes. */
export function cellAxes(): string[] {
  return [...new Set([...POSTURE_AXES, ...credentialVars(), ACCESS_SECRET_VAR])].sort();
}

/** The environment a cell stands for: its axis values, plus a value for each
 *  credential it holds — CELL_SECRET for the access secret, a sentinel else. */
export function envOf(cell: Cell): Record<string, string> {
  return {
    ...cell.env,
    ...Object.fromEntries(cell.present.map((v) => [v, v === ACCESS_SECRET_VAR ? CELL_SECRET : sentinel(v)])),
  };
}

/**
 * Apply `cell` to `process.env`: every axis it names is set, every other axis
 * deleted, and every store root pointed under `scratch`. Returns the function
 * that puts back exactly what was there.
 */
export function applyCell(cell: Cell, scratch: string): () => void {
  const touched = [...new Set([...cellAxes(), ...storeRootVars()])];
  const saved = Object.fromEntries(touched.map((v) => [v, process.env[v]]));
  const env = envOf(cell);
  for (const v of cellAxes()) {
    if (v in env) process.env[v] = env[v];
    else delete process.env[v];
  }
  for (const v of storeRootVars()) process.env[v] = path.join(scratch, v.toLowerCase());
  return () => {
    for (const v of touched) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
  };
}
