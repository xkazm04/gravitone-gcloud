// THE KNOW-HOW IMPORT (spark device-metadata-sync, KS2) - what another device learned, read from the tracked `knowhow/`
// folder after a pull and folded into this device's stores, one stream at a time, per the topology the contract states
// (packages/domain/src/knowhow.ts):
//
//   characters  - upserted by id into the mirror (lib/knowhow/mirror.ts, the production's cores) and, for a kernel id,
//                 into the kernel character store through `KernelSink`. Changed on both sides since the last import:
//                 the newer `at` wins and the other is written to knowhow/conflicts/ (never silent). Visuals are per
//                 device: this device's own are never taken from the file.
//   lanes       - a union into the local read index (foundry-out/knowhow-index.json, by lane); lane files are only read.
//   productions - another device's production becomes a read-only state file (lib/production/state.ts); one owned here,
//                 or a local file with no owner, is never overwritten.
//
// Idempotent: a second run over the same folder changes nothing. The import spends nothing and draws nothing; the
// characters it leaves with no picture here are queued for `redraw` (lib/knowhow/redraw.ts).

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { LANE_RECORD_KINDS, knowhowPaths, type Device, type KnowhowCharacter, type KnowhowLaneRecord, type KnowhowProduction, type MediaRef } from "@gt/domain/knowhow";
import type { Production, ProductionNode } from "@gt/domain/productionGraph";

import { productionFileUrl, productionFixtureRoot } from "../foundry/production/files.ts";
import { checkProduction, isDrift, isRec } from "../production/check.ts";
import { findCore, statePath, type ProductionState } from "../production/state.ts";
import { knowhowLocalDir, readMirror, writeJsonFile, writeMirror, type MirrorEntry } from "./mirror.ts";
import { planRedraw, writeRedrawQueue } from "./redraw.ts";
import { fileOf, knowhowRoot } from "./write.ts";

/** The kernel's half of a character upsert (the CLI opens the store; a test passes a stand-in or nothing). */
export type KernelSink = (c: KnowhowCharacter) => "added" | "updated" | "unchanged" | "skipped";

export type ImportDeps = {
  readonly self: Device;
  readonly localFileOf: (ref: MediaRef) => string | null;
  readonly kernel?: KernelSink;
  /** Plan and print only: nothing is written. */
  readonly dry?: boolean;
};

export type ImportSummary = {
  readonly created: number;
  readonly updated: number;
  readonly conflicts: number;
  readonly skipped: number;
  /** Characters with no picture on this device: the redraw queue's length. */
  readonly redraw: number;
  /** One sentence per record that could not be read or written. */
  readonly problems: readonly string[];
};

export const indexPath = (): string => path.join(knowhowLocalDir(), "knowhow-index.json");

/** The base of each character as last imported: the text the file said (`seen`) and the text the mirror kept (`kept`). */
type Base = { readonly seen: string; readonly kept: string };
type Index = { v: 1; lanes: Record<string, Record<string, KnowhowLaneRecord>>; characters: Record<string, Base> };

export function readIndex(): Index {
  try {
    const raw: unknown = JSON.parse(readFileSync(indexPath(), "utf8"));
    if (isRec(raw) && isRec(raw["lanes"]) && isRec(raw["characters"])) return raw as unknown as Index;
  } catch {
    // absent or unreadable: the import rebuilds it from the folder
  }
  return { v: 1, lanes: {}, characters: {} };
}

const sorted = (x: unknown): unknown => (Array.isArray(x) ? x.map(sorted) : isRec(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sorted(x[k])])) : x);
const stable = (x: unknown): string => JSON.stringify(sorted(x));

/** A character's text: what a conflict is about. Visuals are per device and never conflict. */
export const textDigest = (c: KnowhowCharacter): string => createHash("sha1").update(stable({ card: c.card, identity: c.identity, looks: c.looks, sourceKey: c.sourceKey ?? null, at: c.at })).digest("hex");

function readJsonDir(dir: string): { readonly file: string; readonly value: unknown }[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
  } catch {
    return [];
  }
  return names.map((n) => {
    const file = path.join(dir, n);
    try {
      return { file, value: JSON.parse(readFileSync(file, "utf8")) as unknown };
    } catch {
      return { file, value: undefined };
    }
  });
}

const str = (x: unknown): x is string => typeof x === "string" && x.length > 0;
const isCharacter = (x: unknown): x is KnowhowCharacter => isRec(x) && x["v"] === 1 && str(x["id"]) && x["id"].startsWith("chr:") && str(x["owner"]) && str(x["at"]) && isRec(x["card"]) && str(x["card"]["name"]) && typeof x["identity"] === "string" && isRec(x["looks"]) && isRec(x["visuals"]);
const isLane = (x: unknown): x is KnowhowLaneRecord => isRec(x) && x["v"] === 1 && str(x["id"]) && str(x["lane"]) && (LANE_RECORD_KINDS as readonly unknown[]).includes(x["kind"]) && str(x["text"]) && str(x["owner"]) && str(x["at"]);
const isProduction = (x: unknown): x is KnowhowProduction => isRec(x) && x["v"] === 1 && str(x["id"]) && str(x["owner"]) && str(x["title"]) && typeof x["look"] === "string" && str(x["cast"]) && Array.isArray(x["nodes"]);

type Tally = { created: number; updated: number; conflicts: number; skipped: number; problems: string[] };

/* ── characters ────────────────────────────────────────────────────────── */

/** The file's record with this device's visuals kept from the mirror. */
function withOwnVisuals(incoming: KnowhowCharacter, local: KnowhowCharacter | undefined, self: string): KnowhowCharacter {
  const mine = local?.visuals[self];
  if (mine === undefined) return incoming;
  return { ...incoming, visuals: { ...incoming.visuals, [self]: mine } };
}

function importCharacters(deps: ImportDeps, index: Index, t: Tally): Readonly<Record<string, MirrorEntry>> {
  const mirror: Record<string, MirrorEntry> = { ...readMirror() };
  let changed = false;
  const self = deps.self.id;
  const adopt = (c: KnowhowCharacter): void => {
    if (deps.kernel === undefined || deps.dry === true) return;
    try {
      deps.kernel(c);
    } catch (e) {
      t.problems.push(`${c.id}: the kernel refused it: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  for (const { file, value } of readJsonDir(path.join(knowhowRoot(), "characters"))) {
    if (!isCharacter(value)) {
      t.problems.push(`${path.basename(file)} is not a know-how character`);
      t.skipped++;
      continue;
    }
    const c = value;
    const held = mirror[c.id];
    const local = held?.record;
    const seen = textDigest(c);
    const base = index.characters[c.id];
    const keep = (record: KnowhowCharacter, kept: string): void => {
      mirror[c.id] = { ...(held ?? {}), record };
      index.characters[c.id] = { seen, kept };
      changed = true;
    };
    if (local === undefined) {
      keep(withOwnVisuals(c, undefined, self), seen);
      adopt(c);
      t.created++;
      continue;
    }
    const mine = textDigest(local);
    const next = withOwnVisuals(c, local, self);
    if (mine === seen) {
      // the same text: only another device's pictures can have moved
      if (stable(next.visuals) !== stable(local.visuals) || base?.seen !== seen) {
        keep({ ...local, visuals: next.visuals }, mine);
        if (stable(next.visuals) !== stable(local.visuals)) t.updated++;
        else t.skipped++;
      } else t.skipped++;
      continue;
    }
    const theirsMoved = base === undefined || base.seen !== seen;
    const mineMoved = base === undefined || base.kept !== mine;
    if (!theirsMoved) {
      t.skipped++; // only this device changed her: its own export carries it
      continue;
    }
    if (!mineMoved) {
      keep(next, seen);
      adopt(c);
      t.updated++;
      continue;
    }
    // both changed since the last import: the newer `at` wins (a tie keeps this device's), the other is kept on record
    const theirsWin = c.at > local.at;
    const loser = theirsWin ? local : c;
    const out = fileOf(knowhowPaths.conflict(loser.id, loser.owner, loser.at));
    if (deps.dry !== true && !existsSync(out)) writeJsonFile(out, sorted(loser));
    t.conflicts++;
    if (theirsWin) {
      keep(next, seen);
      adopt(c);
    } else keep({ ...local, visuals: next.visuals }, mine);
  }
  if (changed && deps.dry !== true) writeMirror(mirror);
  return mirror;
}

/* ── lanes ─────────────────────────────────────────────────────────────── */

function importLanes(index: Index, t: Tally): void {
  const root = path.join(knowhowRoot(), "lanes");
  let lanes: string[];
  try {
    lanes = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch {
    return;
  }
  for (const dir of lanes) {
    for (const { file, value } of readJsonDir(path.join(root, dir))) {
      if (!isLane(value)) {
        t.problems.push(`${dir}/${path.basename(file)} is not a know-how lane record`);
        t.skipped++;
        continue;
      }
      const lane = (index.lanes[value.lane] ??= {});
      if (lane[value.id] !== undefined) {
        t.skipped++;
        continue;
      }
      lane[value.id] = value;
      t.created++;
    }
  }
}

/* ── productions ───────────────────────────────────────────────────────── */

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PRODUCTION_ROOT = "production-fixture/";

/** A MediaRef this device holds, as the production file door's URL; null when the bytes are not here. */
function localSrc(ref: MediaRef, deps: ImportDeps): string | null {
  if (!ref.at.startsWith(PRODUCTION_ROOT) || deps.localFileOf(ref) === null) return null;
  const [run, ...rest] = ref.at.slice(PRODUCTION_ROOT.length).split("/");
  return run === undefined || rest.length === 0 ? null : productionFileUrl(run, rest.join("/"));
}

/** The production graph as the canvas reads it, from the owner's record: no bytes, the owner's media by reference. */
export function foreignState(p: KnowhowProduction, deps: ImportDeps): ProductionState | string {
  if (!ID_RE.test(p.id)) return `${p.id} is not a production id`;
  const remoteMedia: Record<string, MediaRef> = {};
  const nodes = p.nodes.map((n): ProductionNode => {
    if (n.media !== undefined) remoteMedia[n.id] = n.media;
    const src = n.media === undefined ? null : localSrc(n.media, deps);
    return {
      id: n.id,
      station: n.station as ProductionNode["station"],
      label: n.label,
      state: n.state as ProductionNode["state"],
      madeFrom: n.madeFrom,
      inputsDigest: `knowhow:${p.owner}:${p.at}`,
      ...(src === null || n.media === undefined ? {} : { media: { kind: n.media.kind, src } }),
      ...(n.at === undefined ? {} : { at: n.at }),
      ...(n.dur === undefined ? {} : { dur: n.dur }),
      ...(n.prompt === undefined || n.prompt === "" ? {} : { prompt: n.prompt }),
      ...(n.verdict === undefined ? {} : { verdict: n.verdict }),
      ...(n.drift !== undefined && isDrift(n.drift) ? { drift: n.drift } : {}),
    };
  });
  const seconds = Math.max(0, ...nodes.map((n) => (n.at ?? 0) + (n.dur ?? 0)));
  const mirrored = readMirror()[p.cast]?.record;
  const fixture = findCore(p.cast);
  const cast = fixture.ok ? fixture.value : { id: p.cast, name: mirrored?.card.name ?? p.cast.replace(/^chr:/, ""), identity: mirrored?.identity || "-", portrait: `knowhow:${p.cast}`, origin: "knowhow" };
  const production: Production = { id: p.id, title: p.title, look: p.look || "-", track: { title: p.title, seconds, bpm: 0, beats: [], sections: [], lyrics: [] }, cast, nodes };
  const checked = checkProduction(production, `knowhow production ${p.id}`);
  if (!checked.ok) return checked.error.message;
  const rec = p as unknown as Readonly<Record<string, unknown>>;
  const ownerName = str(rec["ownerName"]) ? rec["ownerName"] : `device ${p.owner.replace(/^dev:/, "").slice(0, 8)}`;
  return { production: checked.value, styled: {}, failed: {}, readOnly: true, owner: p.owner, ownerName, remoteMedia };
}

function importProductions(deps: ImportDeps, t: Tally): void {
  for (const { file, value } of readJsonDir(path.join(knowhowRoot(), "productions"))) {
    if (!isProduction(value)) {
      t.problems.push(`${path.basename(file)} is not a know-how production`);
      t.skipped++;
      continue;
    }
    if (value.owner === deps.self.id) {
      t.skipped++; // this device's own: it is the mirror's source, never its target
      continue;
    }
    const st = foreignState(value, deps);
    if (typeof st === "string") {
      t.problems.push(st);
      t.skipped++;
      continue;
    }
    const target = statePath(value.id);
    let before: string | null = null;
    if (existsSync(target)) {
      before = readFileSync(target, "utf8");
      let held: unknown;
      try {
        held = JSON.parse(before);
      } catch {
        held = undefined;
      }
      if (!isRec(held) || held["readOnly"] !== true) {
        t.problems.push(`${value.title} is held here as this device's own: not overwritten by ${value.owner}'s copy`);
        t.skipped++;
        continue;
      }
    }
    const body = `${JSON.stringify(st, null, 1)}\n`;
    if (before === body) {
      t.skipped++;
      continue;
    }
    if (deps.dry !== true) writeJsonFile(target, st);
    if (before === null) t.created++;
    else t.updated++;
  }
}

/** Every stream, then the redraw queue. Never throws for a bad record: each one is a sentence in `problems`. */
export function importKnowhow(deps: ImportDeps): ImportSummary {
  const t: Tally = { created: 0, updated: 0, conflicts: 0, skipped: 0, problems: [] };
  const index = readIndex();
  const mirror = importCharacters(deps, index, t);
  importLanes(index, t);
  importProductions(deps, t);
  const before = existsSync(indexPath()) ? readFileSync(indexPath(), "utf8") : null;
  if (deps.dry !== true && before !== `${JSON.stringify(index, null, 1)}\n`) writeJsonFile(indexPath(), index);
  const queue = planRedraw(mirror, deps.self.id, deps.localFileOf);
  if (deps.dry !== true) writeRedrawQueue(queue);
  return { ...t, redraw: queue.length };
}

/** Where the mirror and the index live, for the CLI's lines. */
export const importRoots = (): { readonly knowhow: string; readonly local: string; readonly production: string } => ({ knowhow: knowhowRoot(), local: knowhowLocalDir(), production: productionFixtureRoot() });
