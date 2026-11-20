// THE KNOW-HOW MIRROR (spark device-metadata-sync, KS2) - this device's local copy of every character the know-how
// import has seen, kept beside the production state (<productionFixtureRoot()>/knowhow/characters.json) so the
// production's cores can cast a character another device created. `core` is set once THIS device holds her pictures
// (a redraw, lib/knowhow/redraw.ts): only then is she castable here, because a core without a portrait cannot be styled.
//
// The file is local (foundry-out is gitignored) and is written whole (temp + rename), like a production's state file.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { DeviceId, KnowhowCharacter } from "@gt/domain/knowhow";
import type { CoreRef } from "@gt/domain/productionGraph";

import { productionFixtureRoot } from "../foundry/production/files.ts";

/** Her pictures on this device as production file door URLs. */
export type MirrorCore = { readonly portrait: string; readonly sheet?: string };
export type MirrorEntry = { readonly record: KnowhowCharacter; readonly core?: MirrorCore };
export type Mirror = Readonly<Record<string, MirrorEntry>>;

/** The local, untracked side of the import (its index, the redraw queue): KNOWHOW_LOCAL_DIR (tests), else foundry-out. */
export const knowhowLocalDir = (): string => path.resolve(process.env["KNOWHOW_LOCAL_DIR"]?.trim() || path.join(process.cwd(), "foundry-out"));

export const mirrorPath = (): string => path.join(productionFixtureRoot(), "knowhow", "characters.json");

const isRec = (x: unknown): x is Readonly<Record<string, unknown>> => typeof x === "object" && x !== null && !Array.isArray(x);

/** The mirror as its file holds it; an absent or unreadable file is an empty mirror (the import rebuilds it). */
export function readMirror(): Mirror {
  const file = mirrorPath();
  if (!existsSync(file)) return {};
  try {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isRec(raw)) return {};
    const out: Record<string, MirrorEntry> = {};
    for (const [id, e] of Object.entries(raw)) if (isRec(e) && isRec(e["record"])) out[id] = e as unknown as MirrorEntry;
    return out;
  } catch {
    return {};
  }
}

/** Atomic: a temp file beside it, renamed over it. */
export function writeJsonFile(file: string, value: unknown): void {
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  mkdirSync(path.dirname(file), { recursive: true });
  try {
    writeFileSync(tmp, `${JSON.stringify(value, null, 1)}\n`);
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

export function writeMirror(m: Mirror): void {
  writeJsonFile(mirrorPath(), m);
}

/** The mirrored characters this device can cast: those with a portrait here, which only a redraw here gives them. */
export function mirroredCores(mirror: Mirror = readMirror()): readonly CoreRef[] {
  const out: CoreRef[] = [];
  for (const e of Object.values(mirror)) {
    if (e.core === undefined || e.record.identity === "") continue;
    out.push({ id: e.record.id, name: e.record.card.name, identity: e.record.identity, portrait: e.core.portrait, ...(e.core.sheet === undefined ? {} : { sheet: e.core.sheet }), origin: "knowhow", redrawnHere: true });
  }
  return out;
}

/** How many devices hold pictures of her: this one (a castable core has a portrait here) and every other with a visual. */
export function devicesOf(record: KnowhowCharacter, self: DeviceId): number {
  return 1 + Object.entries(record.visuals).filter(([d, vs]) => d !== self && vs.length > 0).length;
}

/** Each core another device also holds pictures of, with how many devices do (spark device-metadata-sync KS3). */
export function markDevices(cores: readonly CoreRef[], records: Readonly<Record<string, KnowhowCharacter>>, self: DeviceId): CoreRef[] {
  return cores.map((c) => {
    const r = records[c.id];
    const n = r === undefined ? 1 : devicesOf(r, self);
    return n > 1 ? { ...c, devices: n } : c;
  });
}
