// CHARACTERS INTO THE PROJECTION (spark device-metadata-sync, KS1) - `knowhow/characters/<key>.json`, one per character:
// the kernel's records and the production cores (lib/production/state.ts). Her card and identity block, her prompts per
// look (the style plan's portrait and sheet prompts, for each production that styled her), and THIS device's pictures of
// her as media references. Other devices' pictures and looks already in the file are kept: visuals are per device.
//
// Owner: an existing file's owner is kept; a record first exported here is this device's. `at` moves only when a text
// field (card, identity, looks, sourceKey) changed, so a re-export that changes nothing writes nothing.

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { isForeign, knowhowPaths, type CharacterVisual, type Device, type KnowhowCharacter } from "@gt/domain/knowhow";
import type { CoreRef } from "@gt/domain/productionGraph";
import type { CharacterExport } from "@gt/kernel/characters/store";

import { identityBlock } from "../foundry/scout/characters.ts";
import type { CharacterCard as MuseCard } from "../foundry/scout/muse.ts";
import { stylePlan } from "../production/draw.ts";
import { coreKey, fileOfUrl, listCores, readState, statePath, type ProductionState } from "../production/state.ts";
import { blobMediaRef, mediaRef } from "./media.ts";
import { fileOf, put, readRecord, serialize, type ExportSummary } from "./write.ts";

type Card = KnowhowCharacter["card"];
type Looks = Record<string, { readonly portraitPrompt?: string; readonly sheetPrompt?: string }>;
type Text = { readonly card: Card; readonly identity: string; readonly looks: Looks; readonly sourceKey?: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A production's look as a key: its name before the colon, slugged; else the production id. */
export function lookSlug(s: Pick<ProductionState["production"], "id" | "look">): string {
  const name = s.look.split(":")[0] ?? "";
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" || name.length === s.look.length ? s.id : slug;
}

/** The ids of the production state files on this device. */
export function stateIds(): readonly string[] {
  const dir = path.dirname(statePath("x"));
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5))
      .sort();
  } catch {
    return [];
  }
}

function write(s: ExportSummary, self: Device, key: string, id: string, text: Text, mine: readonly CharacterVisual[], dry: boolean): void {
  const contract = knowhowPaths.character(key);
  const held = readRecord(fileOf(contract));
  const heldLooks = isObj(held?.["looks"]) ? (held["looks"] as Looks) : {};
  const looks: Looks = { ...heldLooks, ...text.looks };
  const visuals: Record<string, readonly CharacterVisual[]> = isObj(held?.["visuals"]) ? { ...(held["visuals"] as Record<string, readonly CharacterVisual[]>) } : {};
  if (mine.length > 0) visuals[self.id] = mine;
  else delete visuals[self.id];
  const next = { card: text.card, identity: text.identity, looks, ...(text.sourceKey === undefined ? {} : { sourceKey: text.sourceKey }) };
  const was = held === undefined ? null : { card: held["card"], identity: held["identity"], looks: held["looks"], ...(held["sourceKey"] === undefined ? {} : { sourceKey: held["sourceKey"] }) };
  const at = was !== null && typeof held?.["at"] === "string" && serialize(was) === serialize(next) ? held["at"] : new Date().toISOString();
  const owner = typeof held?.["owner"] === "string" ? held["owner"] : self.id;
  const record: KnowhowCharacter = { v: 1, id, owner, at, ...next, visuals };
  put(s, id, contract, record, { dry });
}

const heldOwner = (key: string): string | undefined => {
  const o = readRecord(fileOf(knowhowPaths.character(key)))?.["owner"];
  return typeof o === "string" ? o : undefined;
};

/**
 * A character another device owns (mirrored here by the import, re-drawn on this device): only this device's pictures
 * change; every other field, `at` and `owner` included, stays exactly as the file holds it.
 */
function visualsOnly(s: ExportSummary, self: Device, key: string, id: string, mine: readonly CharacterVisual[], dry: boolean): void {
  const contract = knowhowPaths.character(key);
  const held = readRecord(fileOf(contract));
  if (held === undefined) {
    s.refused.push({ id, reason: "another device's character with no know-how file here" });
    return;
  }
  const visuals: Record<string, readonly CharacterVisual[]> = isObj(held["visuals"]) ? { ...(held["visuals"] as Record<string, readonly CharacterVisual[]>) } : {};
  if (mine.length > 0) visuals[self.id] = mine;
  else delete visuals[self.id];
  put(s, id, contract, { ...held, visuals }, { dry });
}

/* ── production cores ─────────────────────────────────────────────────── */

const AGED_RE = /^(.+?), aged (\d{1,3}): ([\s\S]+)$/;

/** A core's card from her identity block (`Name, aged N: look.`), or her name and the identity as the look. */
function coreCard(c: CoreRef): { readonly card: Card; readonly identity: string } {
  const m = AGED_RE.exec(c.identity.trim());
  if (m === null) return { card: { name: c.name, look: c.identity.trim() }, identity: c.identity };
  const look = (m[3] ?? "").trim().replace(/\.$/, "");
  const card = { name: (m[1] ?? c.name).trim(), age: Number(m[2]), look };
  return { card, identity: identityBlock({ ...card, personality: "" } as MuseCard) };
}

const imageRef = (src: string | undefined): ReturnType<typeof mediaRef> => {
  const abs = src === undefined ? null : fileOfUrl(src);
  return abs === null ? null : mediaRef(abs, "image");
};

/** One production core: her card, the looks productions styled her in, and her pictures on this device. */
export function exportCore(s: ExportSummary, self: Device, c: CoreRef, dry: boolean): void {
  const foreign = c.origin === "knowhow" || isForeign(heldOwner(coreKey(c.id)), self.id);
  const looks: Looks = {};
  const mine: CharacterVisual[] = [];
  const own = (kind: CharacterVisual["kind"], src: string | undefined, style?: string): void => {
    const media = imageRef(src);
    if (media !== null) mine.push({ kind, media, ...(style === undefined ? {} : { style }) });
  };
  own("portrait", c.portrait);
  own("sheet", c.sheet);
  for (const pid of stateIds()) {
    if (!existsSync(statePath(pid))) continue;
    const st = readState(pid);
    if (!st.ok || st.value.readOnly === true) continue;
    const styled = st.value.styled[c.id];
    if (styled === undefined) continue;
    const slug = lookSlug(st.value.production);
    const plan = stylePlan(pid, c.id);
    if (plan.ok) {
      const prompt = (id: string): string | undefined => plan.value.frames.find((f) => f.id === id)?.prompt;
      const portraitPrompt = prompt("portrait");
      const sheetPrompt = prompt("sheet");
      looks[slug] = { ...(portraitPrompt === undefined ? {} : { portraitPrompt }), ...(sheetPrompt === undefined ? {} : { sheetPrompt }) };
    }
    own("portrait", styled.portrait, slug);
    own("sheet", styled.sheet, slug);
  }
  if (foreign) {
    visualsOnly(s, self, coreKey(c.id), c.id, mine, dry);
    return;
  }
  const { card, identity } = coreCard(c);
  write(s, self, coreKey(c.id), c.id, { card, identity, looks }, mine, dry);
}

export function exportCores(s: ExportSummary, self: Device, dry: boolean, only?: string): void {
  const cores = listCores();
  if (!cores.ok) {
    s.refused.push({ id: "cores", reason: cores.error.message });
    return;
  }
  for (const c of cores.value) if (only === undefined || c.id === only) exportCore(s, self, c, dry);
}

/* ── kernel characters ────────────────────────────────────────────────── */

/** One kernel character: her card verbatim, her identity block, her pictures as blob references (no bytes read). */
export function exportKernelCharacter(s: ExportSummary, self: Device, c: CharacterExport, dry: boolean): void {
  const r = c.record;
  const card: Card = { ...r.card };
  const identity = r.card.age === undefined ? `${r.card.name}: ${r.card.look.trim().replace(/\.$/, "")}.` : identityBlock({ ...r.card, age: r.card.age } as MuseCard);
  const mine: CharacterVisual[] = c.images.map((i) => ({ kind: i.role === "sheet" ? "sheet" : "portrait", media: blobMediaRef(i.blob.sha256, "image") }));
  if (isForeign(heldOwner(coreKey(r.id)), self.id)) {
    visualsOnly(s, self, coreKey(r.id), r.id, mine, dry);
    return;
  }
  const sourceKey = c.sourceKeys[0];
  write(s, self, coreKey(r.id), r.id, { card, identity, looks: {}, ...(sourceKey === undefined ? {} : { sourceKey }) }, mine, dry);
}
