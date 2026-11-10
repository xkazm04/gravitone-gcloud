import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { Episode } from "@gt/domain/channel";
import { parseAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { ProductionAspect, ProductionSource } from "@gt/domain/production";

import { outPath } from "../../fixtures/roots";
import { readJson } from "../runStore";
import { readChannels, type ChannelFile } from "./channels";
import { readNight, resolveInNight } from "./store";
import type { Night, StoryboardCandidate } from "./types";

// WHAT A PRODUCTION CAN START FROM (spark concept-casting-stages S1). A kept concept is one of three things, read here
// from where it stands; nothing starts itself and nothing here writes.
//
//   episode      a channel episode that the operator kept (the night's storyboard is its board), or an episode whose
//                outline is kept and that has a kept Codex board (the board is drawn but no night has taken it);
//   codex-board  a kept Codex board that is NOT an episode (`foundry-out/scout-codex/<date>/verdicts.json` joined to its
//                `queue.json`); a board whose cell is an episode id is offered as that episode, so a started one stops
//                being due;
//   outline      an approved outline (`foundry-out/scout-outlines/<date>/verdicts.json` joined to outlines.json and
//                queue.json). That verdicts file is `{items: {"<id>": {verdict: "approve"|"iterate"|"drop", note?}}}`;
//                only `approve` offers Start, and a folder without one is an honest empty state.
//
// A panel's still is resolved only at Start (one concept, not all of them on every read of the slate).

const CODEX_ENV = "SCOUT_CODEX_DIR";
const OUTLINES_ENV = "SCOUT_OUTLINES_DIR";

/** Where a Scout store of `name` lives: its own env, else beside a moved night store, else foundry-out. */
function scoutDir(env: string, name: string): string {
  const own = process.env[env]?.trim();
  if (own) return own;
  const moved = process.env["SCOUT_STORE_DIR"]?.trim();
  return moved ? path.join(path.dirname(moved), name) : outPath(name);
}

export const codexDir = (): string => scoutDir(CODEX_ENV, "scout-codex");
export const outlinesDir = (): string => scoutDir(OUTLINES_ENV, "scout-outlines");

/** What the screen offers Start on. `matches`: every ref a Scout graph node may name this concept by. */
export type KeptConcept = {
  readonly source: ProductionSource;
  readonly title: string;
  readonly logline: string;
  readonly beats: readonly string[];
  readonly matches: readonly string[];
};

/** A concept's board, its panels held by their bytes (the caller stores them). */
export type ConceptBoard = {
  readonly title: string;
  readonly logline: string;
  readonly aspect: ProductionAspect;
  readonly panels: readonly { readonly id: string; readonly beat: string; readonly prompt: string; readonly bytes: Uint8Array; readonly mime: "image/png" | "image/jpeg" | "image/webp" }[];
};

const frameSchema = z.object({ name: z.string().min(1), prompt: z.string().min(1) }).passthrough();
const queueItemSchema = z
  .object({ id: z.string().min(1), tier: z.number().int(), title: z.string().min(1), paragraph: z.string().min(1).optional(), bullets: z.array(z.string()).default([]), frames: z.array(frameSchema).min(1) })
  .passthrough();
const queueSchema = z.array(queueItemSchema);
type QueueItem = z.output<typeof queueItemSchema>;
/** A queue item that is a storyboard. The same queues hold character sheets (tier 6: concept, hair, scene, sheet; no words): S2's pool, never a concept. */
type BoardItem = QueueItem & { readonly paragraph: string };
const isBoard = (x: QueueItem): x is BoardItem => x.paragraph !== undefined && x.frames.some((f) => f.name.startsWith("panel-"));

const codexVerdictsSchema = z.object({ items: z.record(z.string(), z.object({ verdict: z.string(), note: z.string().optional() }).passthrough()) }).passthrough();
const outlineVerdictsSchema = z.object({ items: z.record(z.string(), z.object({ verdict: z.enum(["approve", "iterate", "drop"]), note: z.string().optional() }).passthrough()) }).passthrough();
const outlinesSchema = z.array(z.object({ id: z.string().min(1), title: z.string().min(1), logline: z.string().min(1), beats: z.array(z.string()).default([]) }).passthrough());

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const readJsonIf = async (file: string): Promise<unknown> => (await readJson<unknown>(file)) ?? undefined;

function parsed<T>(at: string, schema: z.ZodType<T>, raw: unknown): T {
  const r: Result<unknown> = parseAt(at, schema, raw);
  if (!r.ok) throw r.error;
  return r.value as T;
}

async function days(root: string): Promise<readonly string[]> {
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && DAY_RE.test(d.name))
      .map((d) => d.name)
      .sort()
      .reverse();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

/** A queue's item folder: `<tier>/<id>` with a night-candidate id's slash folded the way the runner writes it. */
const itemDir = (root: string, day: string, item: QueueItem): string => path.join(root, day, `t${item.tier}`, item.id.replace("/", "_"));

type Held = { readonly day: string; readonly item: BoardItem };

/** Every kept Codex board, newest day first; a board kept on two days is its newest. */
async function keptBoards(): Promise<Map<string, Held>> {
  const root = codexDir();
  const out = new Map<string, Held>();
  for (const day of await days(root)) {
    const v = await readJsonIf(path.join(root, day, "verdicts.json"));
    const q = await readJsonIf(path.join(root, day, "queue.json"));
    if (v === undefined || q === undefined) continue;
    const verdicts = parsed(`${day} verdicts`, codexVerdictsSchema, v);
    const queue = new Map(parsed(`${day} queue`, queueSchema, q).filter(isBoard).map((x) => [x.id, x]));
    for (const [id, verdict] of Object.entries(verdicts.items)) {
      if (verdict.verdict !== "keep" || out.has(id)) continue;
      const item = queue.get(id);
      if (item !== undefined) out.set(id, { day, item });
    }
  }
  return out;
}

type Outline = { readonly day: string; readonly item: QueueItem; readonly outline: z.output<typeof outlinesSchema>[number] };

/** Every approved outline, newest day first. A folder with no verdicts yet offers nothing: the empty state is honest. */
async function approvedOutlines(): Promise<readonly Outline[]> {
  const root = outlinesDir();
  const seen = new Set<string>();
  const out: Outline[] = [];
  for (const day of await days(root)) {
    const v = await readJsonIf(path.join(root, day, "verdicts.json"));
    if (v === undefined) continue;
    const verdicts = parsed(`${day} outline verdicts`, outlineVerdictsSchema, v);
    const [outlines, queue] = await Promise.all([readJsonIf(path.join(root, day, "outlines.json")), readJsonIf(path.join(root, day, "queue.json"))]);
    if (outlines === undefined || queue === undefined) throw new AppError("unavailable", `outlines ${day}: verdicts.json stands without outlines.json or queue.json`);
    const words = new Map(parsed(`${day} outlines`, outlinesSchema, outlines).map((o) => [o.id, o]));
    const items = new Map(parsed(`${day} queue`, queueSchema, queue).map((x) => [x.id, x]));
    for (const [id, verdict] of Object.entries(verdicts.items)) {
      if (verdict.verdict !== "approve" || seen.has(id)) continue;
      const outline = words.get(id);
      const item = items.get(id);
      if (outline === undefined || item === undefined) continue;
      seen.add(id);
      out.push({ day, item, outline });
    }
  }
  return out;
}

const panelsDrawn = async (dir: string): Promise<boolean> => {
  try {
    await stat(path.join(dir, "panel-1.png"));
    return true;
  } catch {
    return false;
  }
};

/** The storyboard candidate a kept episode's night holds for it, when that night still stands. */
async function episodeNightBoard(episode: Episode): Promise<{ readonly night: Night; readonly board: StoryboardCandidate } | undefined> {
  const ref = episode.candidate?.split("/");
  if (ref === undefined || ref.length !== 2 || ref[0] === undefined || ref[1] === undefined) return undefined;
  let night: Night;
  try {
    night = await readNight(ref[0]);
  } catch {
    return undefined;
  }
  const board = night.candidates.find((c): c is StoryboardCandidate => c.id === ref[1] && c.kind === "storyboard");
  return board === undefined ? undefined : { night, board };
}

const episodeRefs = (e: Episode): string[] => [e.id, ...(e.candidate === undefined ? [] : [e.candidate])];

/** Every concept the operator can Start right now, before the record's "already started" is applied. */
export async function keptConcepts(): Promise<readonly KeptConcept[]> {
  const [files, boards, outlines] = await Promise.all([readChannels(), keptBoards(), approvedOutlines()]);
  const out: KeptConcept[] = [];
  const episodeIds = new Set<string>();
  for (const f of files as readonly ChannelFile[]) {
    for (const e of f.episodes) {
      episodeIds.add(e.id);
      const concept: KeptConcept = { source: { kind: "episode", ref: e.id }, title: e.title, logline: e.logline, beats: e.beats, matches: episodeRefs(e) };
      if (e.state === "kept") {
        if ((await episodeNightBoard(e)) !== undefined || boards.has(e.id)) out.push(concept);
      } else if (e.state === "outline-kept" && boards.has(e.id)) {
        out.push(concept);
      }
    }
  }
  for (const [id, held] of boards) {
    if (episodeIds.has(id) || !(await panelsDrawn(itemDir(codexDir(), held.day, held.item)))) continue;
    out.push({ source: { kind: "codex-board", ref: `${held.day}/${id}` }, title: held.item.title, logline: held.item.paragraph, beats: held.item.bullets, matches: [`${held.day}/${id}`, id] });
  }
  for (const o of outlines) {
    if (!(await panelsDrawn(itemDir(outlinesDir(), o.day, o.item)))) continue;
    out.push({ source: { kind: "outline", ref: o.item.id }, title: o.outline.title, logline: o.outline.logline, beats: o.outline.beats, matches: [o.item.id] });
  }
  return out;
}

const aspectOf = (x: string | undefined): ProductionAspect => (x === "9:16" ? "9:16" : "16:9");

const beatFor = (beats: readonly string[], i: number, fallback: string): string => beats[i] ?? fallback;

async function panelsFromFolder(dir: string, item: QueueItem, beats: readonly string[]): Promise<ConceptBoard["panels"]> {
  const out: { id: string; beat: string; prompt: string; bytes: Uint8Array; mime: "image/png" }[] = [];
  for (const [i, frame] of item.frames.entries()) {
    const bytes = await readFile(path.join(dir, `${frame.name}.png`)).catch(() => undefined);
    if (bytes !== undefined) out.push({ id: `panel-${i + 1}`, beat: beatFor(beats, i, frame.name), prompt: frame.prompt, bytes: new Uint8Array(bytes), mime: "image/png" });
  }
  return out;
}

const refused = (m: string): AppError => new AppError("refused", m);

async function episodeBoard(id: string): Promise<ConceptBoard> {
  const file = (await readChannels()).find((f) => f.episodes.some((e) => e.id === id));
  const e = file?.episodes.find((x) => x.id === id);
  if (e === undefined) throw new AppError("not-found", `start: no episode ${id} in the channel store`);
  if (e.state !== "kept" && e.state !== "outline-kept") throw refused(`start: episode ${id} is ${e.state}; only a kept episode, or one whose outline and Codex board are kept, can start`);
  const held = await episodeNightBoard(e);
  if (held !== undefined && e.state === "kept") {
    const panels: { id: string; beat: string; prompt: string; bytes: Uint8Array; mime: "image/png" }[] = [];
    for (const [i, prompt] of held.board.panels.entries()) {
      const rel = held.board.images?.[i];
      if (rel === undefined || rel === null) continue;
      const bytes = await readFile(resolveInNight(held.night.id, rel)).catch(() => undefined);
      if (bytes !== undefined) panels.push({ id: `panel-${i + 1}`, beat: beatFor(e.beats, i, `panel-${i + 1}`), prompt, bytes: new Uint8Array(bytes), mime: "image/png" });
    }
    return { title: e.title, logline: e.logline, aspect: aspectOf(held.board.aspect), panels };
  }
  const board = (await keptBoards()).get(id);
  if (board === undefined) throw refused(`start: episode ${id} has no board to animate: no kept night storyboard and no kept Codex board`);
  return { title: e.title, logline: e.logline, aspect: "16:9", panels: await panelsFromFolder(itemDir(codexDir(), board.day, board.item), board.item, e.beats) };
}

async function codexBoard(ref: string): Promise<ConceptBoard> {
  const [day, cell, ...more] = ref.split("/");
  if (day === undefined || cell === undefined || more.length > 0) throw new AppError("invalid", `start: ${ref} is not a <date>/<cell> board reference`);
  const held = await keptBoards();
  const board = held.get(cell);
  if (board === undefined || board.day !== day) throw refused(`start: board ${ref} is not kept`);
  if ((await readChannels()).some((f) => f.episodes.some((e) => e.id === cell))) throw refused(`start: board ${cell} is episode ${cell}; start it as that episode`);
  return { title: board.item.title, logline: board.item.paragraph, aspect: "16:9", panels: await panelsFromFolder(itemDir(codexDir(), day, board.item), board.item, []) };
}

async function outlineBoard(ref: string): Promise<ConceptBoard> {
  const o = (await approvedOutlines()).find((x) => x.item.id === ref);
  if (o === undefined) throw refused(`start: outline ${ref} is not approved`);
  return { title: o.outline.title, logline: o.outline.logline, aspect: "16:9", panels: await panelsFromFolder(itemDir(outlinesDir(), o.day, o.item), o.item, o.outline.beats) };
}

/** The concept's board, its stills read: refused by name when it is not kept or has no frame to animate. */
export async function conceptBoard(source: ProductionSource): Promise<ConceptBoard> {
  const board = source.kind === "episode" ? await episodeBoard(source.ref) : source.kind === "codex-board" ? await codexBoard(source.ref) : await outlineBoard(source.ref);
  if (board.panels.length === 0) throw refused(`start: ${source.kind} ${source.ref} has no frame on disk to animate`);
  return board;
}
