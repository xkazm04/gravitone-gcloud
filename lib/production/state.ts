// THE PRODUCTION'S FILE (spark character-cores S1.5, WP5) - one truth for the canvas and the CLI. A production lives at
// <productionFixtureRoot()>/state/<productionId>.json, seeded from the canvas port's fixtureProduction.json the first
// time it is read; every operation reads it per call and writes it whole (temp file + rename), so a recast from
// pipeline/production.mts shows on the dev server's next render and a verdict from the screen shows in `status`.
//
// Beside WP0's Production the file keeps what the domain type has no slot for yet: `styled`, the cores already redrawn
// in this production's look (S2 folds it into the kernel manifest), and `failed`, the sentence a failed draw (by node id)
// or an unreadable eye reply (`eye/<node id>`) left.
//
// A production another device owns (spark device-metadata-sync, KS2) is written here by the know-how import with
// `readOnly`, `owner` and `ownerName`, plus `remoteMedia` (each node's media as the owner holds it: a hash and a logical
// path, no bytes here). It is a lesson view: every write refuses it (`readOnlyRefusal`), and the import is its only writer.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import type { MediaRef } from "@gt/domain/knowhow";
import type { CoreRef, Production } from "@gt/domain/productionGraph";

import { productionFixtureRoot } from "../foundry/production/files.ts";
import imported from "../../app/(studio)/scout/canvas/_port/fixtureProduction.json" with { type: "json" };
import { thisDevice } from "../knowhow/device.ts";
import { markDevices, mirroredCores, readMirror } from "../knowhow/mirror.ts";
import { afterWrite } from "../knowhow/hook.ts";
import { checkFixture, checkProduction, isRec, type ProductionFixture } from "./check.ts";

/** A core redrawn in one production's look: the browser URLs of her portrait and sheet, the look verbatim, when. */
export type Styled = { readonly portrait: string; readonly sheet: string; readonly look: string; readonly at: string };

export type ProductionState = {
  readonly production: Production;
  /** By core id. */
  readonly styled: Readonly<Record<string, Styled>>;
  /** A failed draw's log sentence by node id; the eye's reply when it was not the JSON (first 140 characters) by `eye/<node id>`. */
  readonly failed: Readonly<Record<string, string>>;
  /** Present on a production another device owns: it is shown, never changed here. */
  readonly readOnly?: true;
  /** The owning device's id and name (a foreign production's). */
  readonly owner?: string;
  readonly ownerName?: string;
  /** A foreign production's media by node id, as the owner holds it. */
  readonly remoteMedia?: Readonly<Record<string, MediaRef>>;
};

/** A foreign production refuses every change, in one sentence; null when this device may change it. */
export function readOnlyRefusal(s: ProductionState): Result<never> | null {
  return s.readOnly === true ? err("refused", `${s.production.title} belongs to ${s.ownerName ?? s.owner ?? "another device"}: lessons only here`) : null;
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

let seed: Result<ProductionFixture> | null = null;

/** The imported fixture, checked once: the seed of every production file and the cores' one list. */
export function fixtureSeed(): Result<ProductionFixture> {
  seed ??= checkFixture(imported);
  return seed;
}

/** The fixture's cores, then every mirrored character this device holds pictures of (lib/knowhow/mirror.ts); each one
 *  another device also holds pictures of says how many devices do. */
export function listCores(): Result<readonly CoreRef[]> {
  const f = fixtureSeed();
  if (!f.ok) return f;
  const ids = new Set(f.value.cores.map((c) => c.id));
  const mirror = readMirror();
  const all = [...f.value.cores, ...mirroredCores(mirror).filter((c) => !ids.has(c.id))];
  if (Object.keys(mirror).length === 0) return ok(all);
  const records = Object.fromEntries(Object.entries(mirror).map(([id, e]) => [id, e.record]));
  return ok(markDevices(all, records, thisDevice().id));
}

/** The state files the know-how import wrote for other devices' productions. */
function foreignIds(): string[] {
  const dir = path.join(productionFixtureRoot(), "state");
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const n of names) {
    const id = n.slice(0, -5);
    if (!ID_RE.test(id)) continue;
    try {
      const raw: unknown = JSON.parse(readFileSync(path.join(dir, n), "utf8"));
      if (isRec(raw) && raw["readOnly"] === true) out.push(id);
    } catch {
      // an unreadable file is not listed; readState names its fault when it is asked for
    }
  }
  return out.sort();
}

/** The productions there are: the fixture's (S2 lists the kernel's), then other devices' read-only ones. */
export function productionIds(): Result<readonly string[]> {
  const f = fixtureSeed();
  if (!f.ok) return f;
  const own = f.value.production.id;
  return ok([own, ...foreignIds().filter((id) => id !== own)]);
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
  const str = (k: string): string | undefined => (typeof raw[k] === "string" && raw[k] !== "" ? raw[k] : undefined);
  const owner = str("owner");
  const ownerName = str("ownerName");
  const remote = isRec(raw["remoteMedia"]) ? (raw["remoteMedia"] as Readonly<Record<string, MediaRef>>) : undefined;
  return ok({ production: p.value, styled, failed, ...(raw["readOnly"] === true ? { readOnly: true as const } : {}), ...(owner === undefined ? {} : { owner }), ...(ownerName === undefined ? {} : { ownerName }), ...(remote === undefined ? {} : { remoteMedia: remote }) });
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

/** Read, change, write: `change` answers the next state or refuses. A foreign production refuses before `change` runs. */
export function updateState(productionId: string, change: (s: ProductionState) => Result<ProductionState>): Result<ProductionState> {
  const s = readState(productionId);
  if (!s.ok) return s;
  const refused = readOnlyRefusal(s.value);
  if (refused !== null) return refused;
  const next = change(s.value);
  if (!next.ok) return next;
  const w = writeState(next.value);
  if (w.ok) afterWrite("production", productionId);
  return w;
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
