// THE DEPLOYMENT CELLS — the postures this app runs in, declared once (CIP-B).
//
// The app runs on an operator's laptop and is being shaped for Cloud Run, and
// the answer to "which routes open, which capabilities show, which engine
// serves" differs between the two. Before this file those answers were checked
// one variable at a time, inside probes that each mutate `process.env` for
// their own reasons (text-ladder for the router's plan, harness-gate for the dev
// gate). Nothing enumerated the product of the axes, so a posture nobody wrote a
// probe for was a posture nobody had checked.
//
// A CELL is a complete assignment of every axis below: what it names is set,
// and every other axis variable is DELETED. That is the property that makes a
// cell a cell — an axis left to inherit from the developer's shell would let the
// machine running the lane decide the verdict, which is the exact leak
// env-isolation.probe.spec.ts exists for. The axes are partly declared (the
// posture knobs) and partly DERIVED (every credential and every store-root
// override the app reads), so a new key or a new store directory is scrubbed or
// redirected by existing rather than by somebody remembering.
//
// tests/golden-path/deployment-cells.probe.spec.ts runs every derived route,
// `capabilities()`, `engineStatus()` and `localPosture()` in each cell.
// pipeline/preflight.mts reports which cell the machine running it is in.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { ACCESS_SECRET_VAR } from "@/lib/apiAuth";
import { HOSTED_CAPS } from "@/lib/capabilities";
import type { LocalPosture } from "@/lib/deployment";
import { RETRIEVE_FLAG } from "@/lib/text/env";
import type { TextProviderId } from "@/lib/text/types";

import { stripComments } from "./_helpers";

const ROOT = process.cwd();

/** The access secret a cell's caller presents. Not a real secret: it only has
 *  to equal what the same cell configures. */
export const CELL_SECRET = "deployment-cell-secret";

/** A credential value that is SET (so a key check passes) and can buy nothing:
 *  the lane also replaces `fetch` with a stub that refuses every call. */
export const sentinel = (variable: string): string => `cell-sentinel-${variable.toLowerCase()}`;

/** Every `.ts` file under `dir` (repo-relative), skipping nothing but node_modules. */
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

/** Environment variable NAMES the app's server code mentions, from `lib/` and
 *  `app/` with comments stripped: `process.env.X`, `process.env["X"]`, and
 *  any quoted SCREAMING_CASE literal (the app keeps several key names in
 *  `*_VAR` constants and lookup tables rather than inline reads). */
function mentionedNames(): Set<string> {
  const names = new Set<string>();
  for (const f of [...sources("lib"), ...sources("app")]) {
    const src = stripComments(readFileSync(f, "utf8"));
    for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(m[1]);
    for (const m of src.matchAll(/["'`]([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)["'`]/g)) names.add(m[1]);
  }
  return names;
}

let mentioned: Set<string> | null = null;
const names = () => (mentioned ??= mentionedNames());

/** Every credential the app reads — derived. A cell sets a sentinel for the
 *  ones it means to have and every other one is deleted, so a real key in the
 *  developer's shell can never decide (or pay for) a verdict. */
export function credentialVars(): string[] {
  return [...names()].filter((n) => /_(API_KEY|KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS)$/.test(n)).sort();
}

/** Every store root the app lets the environment override (`*_DIR`, `*_PATH`)
 *  — derived. The lane points each one at a scratch directory so no route it
 *  drives can write into the checkout. */
export function storeRootVars(): string[] {
  return [...names()].filter((n) => /_(DIR|PATH)$/.test(n) && n !== "PATH").sort();
}

/** lib/deployment.ts's managed-platform markers, read from its source — the
 *  list is module-private there, and a second copy here would be a second rule. */
export function managedMarkers(): string[] {
  const src = stripComments(readFileSync(path.join(ROOT, "lib", "deployment.ts"), "utf8"));
  const block = /MANAGED_MARKERS\s*=\s*\[([\s\S]*?)\]/.exec(src)?.[1];
  if (!block) throw new Error("lib/deployment.ts: MANAGED_MARKERS not found - the cells cannot know the managed axis");
  return [...block.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
}

/** The posture knobs: what decides spawning, the text engine, the API gate,
 *  the client's world, the usage sink and the capability flags. */
export function postureAxes(): string[] {
  return [
    "LOCAL_BINARIES",
    "TEXT_ENV",
    RETRIEVE_FLAG,
    "IMAGING_ENV",
    // lib/principal.ts (AUP-A): `verified` closes the shared-secret door.
    // Every declared cell runs the legacy default; an operator's value must
    // not decide a verdict here.
    "PRINCIPAL_MODE",
    "NEXT_PUBLIC_DEV_AUTH",
    "NEXT_PUBLIC_LOCAL_MODE",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    // The usage sink would POST every turn somewhere; off in every cell.
    "LIGHTTRACK_URL",
    "LIGHTTRACK_DISABLE",
    ...managedMarkers(),
    ...HOSTED_CAPS.map((h) => h.variable),
  ];
}

/** Every variable a cell assigns or deletes. */
export function cellAxes(): string[] {
  return [...new Set([...postureAxes(), ...credentialVars(), ACCESS_SECRET_VAR])].sort();
}

export type Caller = "secret" | "dev-auth" | "anonymous";

export interface Cell {
  name: string;
  /** Who runs like this, in a line. */
  who: string;
  /** Set; every other axis is deleted. */
  env: Record<string, string>;
  posture: LocalPosture;
  /** What `engineStatus("edit-plan")` serves, with the engine stand-in
   *  (tests/_engine/fake-claude.mjs) answering for `claude` on PATH. */
  engine: TextProviderId | null;
}

const hosted = (): Record<string, string> => Object.fromEntries(HOSTED_CAPS.map((h) => [h.variable, h.value]));
const keys = (...vars: string[]): Record<string, string> => Object.fromEntries(vars.map((v) => [v, sentinel(v)]));

/**
 * THE CELLS. A new posture is a new entry here, and every invariant in the lane
 * judges it with no other edit.
 */
export const CELLS: readonly Cell[] = [
  {
    name: "laptop",
    who: "the operator's own machine, dev-auth on, every key present",
    env: {
      NEXT_PUBLIC_DEV_AUTH: "1",
      LIGHTTRACK_DISABLE: "1",
      ...keys("GOOGLE_AI_API_KEY", "ELEVENLABS_API_KEY", "LEONARDO_API_KEY"),
    },
    posture: "available",
    engine: "claude-cli",
  },
  {
    name: "laptop-offline-rehearsal",
    who: "a laptop rehearsing the hosted posture: LOCAL_BINARIES=off, a real access secret",
    env: {
      LOCAL_BINARIES: "off",
      [ACCESS_SECRET_VAR]: CELL_SECRET,
      LIGHTTRACK_DISABLE: "1",
      ...keys("GOOGLE_AI_API_KEY", "ELEVENLABS_API_KEY", "LEONARDO_API_KEY"),
    },
    posture: "policy-forbidden",
    engine: "google",
  },
  {
    name: "cloud-run-saas",
    who: "the hosted service: Cloud Run markers, the Google key, the access secret, the hosted block",
    env: {
      K_SERVICE: "gravitone",
      K_REVISION: "gravitone-00001-abc",
      [ACCESS_SECRET_VAR]: CELL_SECRET,
      LIGHTTRACK_DISABLE: "1",
      ...keys("GOOGLE_AI_API_KEY"),
      ...hosted(),
    },
    posture: "managed-platform",
    engine: "google",
  },
  {
    name: "cloud-run-misconfigured",
    who: "the hosted service deployed without its Google key",
    env: {
      K_SERVICE: "gravitone",
      K_REVISION: "gravitone-00001-abc",
      [ACCESS_SECRET_VAR]: CELL_SECRET,
      LIGHTTRACK_DISABLE: "1",
      ...hosted(),
    },
    posture: "managed-platform",
    engine: null,
  },
  {
    name: "local-mode",
    who: "the single-user local build (NEXT_PUBLIC_LOCAL_MODE=1), no secret and no dev-auth",
    env: { NEXT_PUBLIC_LOCAL_MODE: "1", LIGHTTRACK_DISABLE: "1" },
    posture: "available",
    engine: "claude-cli",
  },
  {
    name: "ci-empty",
    who: "a CI runner: nothing configured at all",
    env: {},
    posture: "available",
    engine: "claude-cli",
  },
];

/** The caller a cell's requests come from: the secret it configures, the
 *  dev bypass it turns on, or nobody. */
export function callerOf(cell: Cell): Caller {
  if (cell.env.NEXT_PUBLIC_DEV_AUTH === "1") return "dev-auth";
  if (cell.env[ACCESS_SECRET_VAR]) return "secret";
  return "anonymous";
}

/**
 * Apply `cell` to `process.env`: every axis it names is set, every other axis
 * deleted, and every store root pointed under `scratch`. Returns the function
 * that puts back exactly what was there.
 */
export function applyCell(cell: Cell, scratch: string): () => void {
  const touched = [...new Set([...cellAxes(), ...storeRootVars()])];
  const saved = Object.fromEntries(touched.map((v) => [v, process.env[v]]));
  for (const v of cellAxes()) {
    if (v in cell.env) process.env[v] = cell.env[v];
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

/** An environment's shape over the axes: a credential (or a marker whose value
 *  is arbitrary) as its bare NAME when present, every other axis as NAME=value.
 *  Values of secrets never enter it, so it is safe to print. */
function shapeOf(e: Record<string, string | undefined>): Set<string> {
  const bare = new Set([...credentialVars(), ACCESS_SECRET_VAR, ...managedMarkers()]);
  return new Set(
    cellAxes()
      .filter((v) => v !== "LIGHTTRACK_DISABLE" && e[v] !== undefined && e[v]!.trim() !== "")
      .map((v) => (bare.has(v) ? v : `${v}=${e[v]!.trim()}`)),
  );
}

/**
 * Which declared cell `env` is closest to, and how it differs: `+X` is on this
 * machine and not in the cell, `-X` the reverse. An empty diff is an exact
 * match. Matched on the axes that decide behaviour — markers, credentials
 * present, flags set — never on secret values. pipeline/preflight.mts prints it.
 */
export function nearestCell(env: Record<string, string | undefined> = process.env): { cell: Cell; diff: string[] } {
  const here = shapeOf(env);
  let best: { cell: Cell; diff: string[] } | null = null;
  for (const cell of CELLS) {
    const there = shapeOf(cell.env);
    const diff = [...[...here].filter((x) => !there.has(x)).map((x) => `+${x}`), ...[...there].filter((x) => !here.has(x)).map((x) => `-${x}`)];
    if (!best || diff.length < best.diff.length) best = { cell, diff };
  }
  return best!;
}
