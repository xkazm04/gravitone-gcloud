// CHARACTERS RE-DRAWN PER DEVICE (spark device-metadata-sync, KS2). A character another device made arrives as text;
// when this device holds none of her pictures, she is queued (foundry-out/knowhow-redraw.json) and `redraw` draws her
// portrait, then her sheet from that portrait, with Codex from her identity and her looks' prompts. The new pictures
// are THIS device's visual record (visuals[this device] in the mirror, and the mirror's `core`, which makes her castable
// here); the next export carries them, and no other device sees them as missing, because visuals are per device.
//
// The import only plans (fast, free); drawing is a session's or the operator's act: image generation is orchestrated to
// the Codex CLI, never fired from a git hook.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { CharacterVisual, DeviceId, KnowhowCharacter, MediaRef } from "@gt/domain/knowhow";

import { productionFileUrl, productionFixtureRoot } from "../foundry/production/files.ts";
import { knowhowLocalDir, readMirror, writeJsonFile, writeMirror, type MirrorEntry } from "./mirror.ts";

/** One character to draw on this device: her two prompts, the sheet's drawn from the portrait. */
export type RedrawItem = { readonly id: string; readonly name: string; readonly look: string | null; readonly portraitPrompt: string; readonly sheetPrompt: string };

/** Same shape as pipeline/trailer/codex.mts codexImage: writes <dir>/<name>.png, answers whether it did. */
export type RedrawDrawer = (dir: string, name: string, prompt: string, refs: string[]) => Promise<boolean>;

export type RedrawDone = { readonly id: string; readonly ok: boolean; readonly sentence?: string };

const PARALLEL = 3;

export const redrawQueuePath = (): string => path.join(knowhowLocalDir(), "knowhow-redraw.json");

const keyOf = (id: string): string => id.replace(/^chr:/, "").replace(/[^a-z0-9-]+/gi, "_");

/** Where her pictures land: under the production root's cores, so the production file door serves them. */
export const redrawDir = (id: string): string => path.join(productionFixtureRoot(), "cores", keyOf(id), "redrawn");

/** A look's prompt without the sentences that name reference images: a redraw has none for the portrait. */
const withoutRefs = (p: string): string => p.replace(/Image \d[^.]*\.\s*/g, "").trim();

const PORTRAIT = "A head-and-shoulders portrait of her at rest, facing the camera, neutral expression, neutral light, plain ground, no text.";
const SHEET = "An invariant reference sheet of her on one plain ground: full-body front, three-quarter, side and back views, and two head close-ups at rest; neutral light, no labels, no text.";

/** Her prompts: the first look (by name) that has one, else her identity with the plain portrait and sheet. */
export function redrawItem(c: KnowhowCharacter): RedrawItem {
  const looks = Object.keys(c.looks).sort();
  const look = looks.find((k) => c.looks[k]?.portraitPrompt !== undefined) ?? null;
  const l = look === null ? undefined : c.looks[look];
  const lead = (p: string): string => (p.startsWith(c.identity) ? p : `${c.identity} ${p}`.trim());
  const portrait = l?.portraitPrompt === undefined ? lead(PORTRAIT) : lead(withoutRefs(l.portraitPrompt));
  const sheetBody = l?.sheetPrompt === undefined ? lead(SHEET) : lead(withoutRefs(l.sheetPrompt));
  return { id: c.id, name: c.card.name, look, portraitPrompt: portrait, sheetPrompt: `Image 1 is her portrait: take who she is and how she is drawn from it. ${sheetBody}` };
}

/** True when any device's picture of her is on this disk (the bytes, hash-checked by `localFileOf`). */
const anyHere = (c: KnowhowCharacter, localFileOf: (ref: MediaRef) => string | null): boolean => Object.values(c.visuals).some((vs) => vs.some((v) => localFileOf(v.media) !== null));

/** Every mirrored character with no visual for this device and no picture of hers on this disk. */
export function planRedraw(mirror: Readonly<Record<string, MirrorEntry>>, self: DeviceId, localFileOf: (ref: MediaRef) => string | null): readonly RedrawItem[] {
  const out: RedrawItem[] = [];
  for (const id of Object.keys(mirror).sort()) {
    const e = mirror[id] as MirrorEntry;
    if (e.core !== undefined || (e.record.visuals[self]?.length ?? 0) > 0) continue;
    if (anyHere(e.record, localFileOf)) continue;
    out.push(redrawItem(e.record));
  }
  return out;
}

export function writeRedrawQueue(items: readonly RedrawItem[]): void {
  const file = redrawQueuePath();
  const body = { v: 1, items };
  const before = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (before !== `${JSON.stringify(body, null, 1)}\n`) writeJsonFile(file, body);
}

export function readRedrawQueue(): readonly RedrawItem[] {
  try {
    const raw = JSON.parse(readFileSync(redrawQueuePath(), "utf8")) as { readonly items?: unknown };
    return Array.isArray(raw.items) ? (raw.items as RedrawItem[]) : [];
  } catch {
    return [];
  }
}

const sha256 = (file: string): string => createHash("sha256").update(readFileSync(file)).digest("hex");

/** A picture drawn here, as the contract's MediaRef: a hash and the logical path under the production root. */
function refOf(id: string, name: string): MediaRef {
  const file = path.join(redrawDir(id), `${name}.png`);
  return { kind: "image", hash: sha256(file), at: `production-fixture/cores/${keyOf(id)}/redrawn/${name}.png` };
}

async function once(draw: RedrawDrawer, dir: string, name: string, prompt: string, refs: string[]): Promise<boolean> {
  const tryOnce = (): Promise<boolean> => draw(dir, name, prompt, refs).catch(() => false);
  return (await tryOnce()) || (await tryOnce()); // retry once
}

async function drawOne(item: RedrawItem, draw: RedrawDrawer): Promise<RedrawDone> {
  const dir = redrawDir(item.id);
  if (!(await once(draw, dir, "portrait", item.portraitPrompt, []))) return { id: item.id, ok: false, sentence: `${item.name}'s portrait failed twice` };
  const portrait = path.join(dir, "portrait.png");
  if (!(await once(draw, dir, "sheet", item.sheetPrompt, [portrait]))) return { id: item.id, ok: false, sentence: `${item.name}'s sheet failed twice` };
  return { id: item.id, ok: true };
}

/**
 * Draw the queue (or `only` its ids), three at a time, each picture retried once. Each character drawn becomes this
 * device's visual in the mirror (and castable: `core`) and leaves the queue; a failure stays queued with its sentence.
 */
export async function redraw(self: DeviceId, draw: RedrawDrawer, only?: readonly string[]): Promise<readonly RedrawDone[]> {
  const queue = readRedrawQueue();
  const items = only === undefined || only.length === 0 ? queue : queue.filter((i) => only.includes(i.id));
  const done: RedrawDone[] = new Array<RedrawDone>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      done[i] = await drawOne(items[i] as RedrawItem, draw);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));

  const made = new Set(done.filter((d) => d.ok).map((d) => d.id));
  if (made.size > 0) {
    const mirror: Record<string, MirrorEntry> = { ...readMirror() };
    for (const id of made) {
      const e = mirror[id];
      if (e === undefined) continue;
      const look = items.find((x) => x.id === id)?.look ?? undefined;
      const visual = (kind: CharacterVisual["kind"]): CharacterVisual => ({ kind, media: refOf(id, kind), ...(look === undefined || look === null ? {} : { style: look }) });
      const key = keyOf(id);
      mirror[id] = {
        record: { ...e.record, visuals: { ...e.record.visuals, [self]: [visual("portrait"), visual("sheet")] } },
        core: { portrait: productionFileUrl("cores", `${key}/redrawn/portrait.png`), sheet: productionFileUrl("cores", `${key}/redrawn/sheet.png`) },
      };
    }
    writeMirror(mirror);
    writeRedrawQueue(queue.filter((i) => !made.has(i.id)));
  }
  return done;
}
