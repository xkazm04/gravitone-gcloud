// THE PRODUCTION'S FILE (spark character-cores S1.5, WP5) - one truth for the canvas and the CLI. A production lives at
// <productionFixtureRoot()>/state/<productionId>.json, seeded from the canvas port's fixtureProduction.json the first
// time it is read; every operation reads it per call and writes it whole (temp file + rename), so a recast from
// pipeline/production.mts shows on the dev server's next render and a verdict from the screen shows in `status`.
//
// Beside WP0's Production the file keeps what the domain type has no slot for yet: `styled`, the cores already redrawn
// in this production's look (S2 folds it into the kernel manifest), and `failed`, the sentence a failed draw (by node id)
// or an unreadable eye reply (`eye/<node id>`) left.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import type { CoreRef, Production } from "@gt/domain/productionGraph";

import { productionFixtureRoot } from "../foundry/production/files.ts";
import imported from "../../app/(studio)/scout/canvas/_port/fixtureProduction.json" with { type: "json" };
import { checkFixture, checkProduction, isRec, type ProductionFixture } from "./check.ts";

/** A core redrawn in one production's look: the browser URLs of her portrait and sheet, the look verbatim, when. */
export type Styled = { readonly portrait: string; readonly sheet: string; readonly look: string; readonly at: string };

export type ProductionState = {
  readonly production: Production;
  /** By core id. */
  readonly styled: Readonly<Record<string, Styled>>;
  /** A failed draw's log sentence by node id; the eye's reply when it was not the JSON (first 140 characters) by `eye/<node id>`. */
  readonly failed: Readonly<Record<string, string>>;
};

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

let seed: Result<ProductionFixture> | null = null;

/** The imported fixture, checked once: the seed of every production file and the cores' one list. */
export function fixtureSeed(): Result<ProductionFixture> {
  seed ??= checkFixture(imported);
  return seed;
}

export function listCores(): Result<readonly CoreRef[]> {
  const f = fixtureSeed();
  return f.ok ? ok(f.value.cores) : f;
}

/** The productions there are: the fixture's (S2 lists the kernel's). */
export function productionIds(): Result<readonly string[]> {
  const f = fixtureSeed();
  return f.ok ? ok([f.value.production.id]) : f;
}

/** A core by `chr:<key>` or by its bare key. */
export function findCore(ref: string): Result<CoreRef> {
  const cores = listCores();
  if (!cores.ok) return cores;
  const id = ref.startsWith("chr:") ? ref : `chr:${ref}`;
  const core = cores.value.find((c) => c.id === id);
  return core === undefined ? err("not-found", `no core ${ref}`) : ok(core);
}

export const coreKey = (coreId: string): string => coreId.replace(/^chr:/, "");

export function statePath(productionId: string): string {
  return path.join(productionFixtureRoot(), "state", `${productionId}.json`);
}

function checkState(raw: unknown, file: string): Result<ProductionState> {
  if (!isRec(raw)) return err("invalid", `${file}: not a production state`);
  const p = checkProduction(raw["production"], file);
  if (!p.ok) return p;
  const styled: Record<string, Styled> = {};
  if (isRec(raw["styled"])) {
    for (const [k, v] of Object.entries(raw["styled"])) {
      if (isRec(v) && typeof v["portrait"] === "string" && typeof v["sheet"] === "string" && typeof v["look"] === "string" && typeof v["at"] === "string") styled[k] = { portrait: v["portrait"], sheet: v["sheet"], look: v["look"], at: v["at"] };
    }
  }
  const failed: Record<string, string> = {};
  if (isRec(raw["failed"])) for (const [k, v] of Object.entries(raw["failed"])) if (typeof v === "string") failed[k] = v;
  return ok({ production: p.value, styled, failed });
}

/** The production as its file holds it now; the first read of the fixture's production writes its seed. */
export function readState(productionId: string): Result<ProductionState> {
  if (!ID_RE.test(productionId)) return err("invalid", `${productionId} is not a production id`);
  const file = statePath(productionId);
  if (existsSync(file)) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      return err("invalid", `${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return checkState(raw, file);
  }
  const f = fixtureSeed();
  if (!f.ok) return err("unavailable", f.error.message);
  if (f.value.production.id !== productionId) return err("not-found", `no production ${productionId}`);
  const fresh: ProductionState = { production: f.value.production, styled: {}, failed: {} };
  const w = writeState(fresh);
  return w.ok ? ok(fresh) : w;
}

const pause = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

/** The whole file at once: a temp file beside it, renamed over it (retried: Windows refuses while a reader holds it). */
export function writeState(state: ProductionState): Result<ProductionState> {
  const file = statePath(state.production.id);
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(tmp, `${JSON.stringify(state, null, 1)}\n`);
    for (let i = 0; ; i++) {
      try {
        renameSync(tmp, file);
        return ok(state);
      } catch (e) {
        if (i >= 4) throw e;
        pause(40 * (i + 1));
      }
    }
  } catch (e) {
    rmSync(tmp, { force: true });
    return err("unavailable", `could not write ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Read, change, write: `change` answers the next state or refuses. */
export function updateState(productionId: string, change: (s: ProductionState) => Result<ProductionState>): Result<ProductionState> {
  const s = readState(productionId);
  if (!s.ok) return s;
  const next = change(s.value);
  return next.ok ? writeState(next.value) : next;
}

/** The file a production door URL names (`/api/foundry/file?run=..&path=..&kind=production`), or null. */
export function fileOfUrl(src: string): string | null {
  const q = src.indexOf("?");
  if (!src.startsWith("/api/foundry/file") || q < 0) return null;
  const params = new URLSearchParams(src.slice(q + 1));
  const run = params.get("run");
  const rel = params.get("path");
  if (params.get("kind") !== "production" || run === null || rel === null) return null;
  const root = path.join(productionFixtureRoot(), run);
  const abs = path.resolve(root, rel);
  return abs.startsWith(root + path.sep) ? abs : null;
}
