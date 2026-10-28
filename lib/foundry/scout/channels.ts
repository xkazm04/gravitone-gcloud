import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  CHANNEL_ID_RE,
  CHANNEL_MEDIA,
  EPISODE_ID_RE,
  EPISODE_STATES,
  channelOfEpisode,
  type Channel,
  type Episode,
  type EpisodeState,
} from "@gt/domain/channel";
import { parseAt } from "@gt/domain/door";

import { outPath } from "../../fixtures/roots";
import { readJson, writeJsonAtomic } from "../runStore";
import { withRunLock } from "../verdictLog";
import { Refusal } from "./acts";
import { CANDIDATE_ID_RE, NIGHT_ID_RE } from "./types";

// THE CHANNELS' STORE (spark project-baseline). The scout stopped spreading across genres and serves the channels the
// operator designed in session; this is where those channels and their episodes live between the session and the nights.
//
// One JSON file per channel, `<channelsDir>/<id>.json` = `{channel, episodes}`. The directory is `SCOUT_CHANNELS_DIR`
// (read per call, so a test or a rehearsal never writes the checkout's), else `foundry-out/scout-channels/`. Every write
// is a read-modify-write under ONE lock for the whole directory (../verdictLog withRunLock - a lock FILE, so it holds
// across processes: an import in the CLI and a night's storyboard collect queue instead of losing an episode), and an
// atomic write (tmp + rename). A file is parsed at the door; a damaged one throws with its path - it never reads as an
// empty channel, because an empty channel would be re-imported over the operator's verdicts.
//
// Episodes arrive only through `importEpisodes` (the session's accepted outlines); a night never invents one. Nothing
// here spends.

export type ChannelFile = { readonly channel: Channel; readonly episodes: readonly Episode[] };

/** What `episodes import` reads: the session's outlines (a JSON array of channels with items) and the pasted
 *  outline-triage report (lines `  F1-03 keep · Title · note`). Only `keep` lines import. */
export type ImportInput = { readonly outlines: unknown; readonly report: string };
export type ImportResult = { readonly imported: readonly string[]; readonly skipped: readonly { readonly id: string; readonly why: string }[] };

/** The env var that moves the store (server-only; no client module may spell it - check:bundle). */
const CHANNELS_ENV = "SCOUT_CHANNELS_DIR";

/** The group whose episodes are made as real-data reels; every other group's as Flux storyboards. */
const REEL_GROUP = "Data explainer";

/** The store. A shell that moved the night store (`SCOUT_STORE_DIR`: a test, a rehearsal) and named no channels
 *  directory gets one beside it, never the operator's - the same rule store.ts preBaselineRoot keeps. */
export function channelsDir(): string {
  const own = process.env[CHANNELS_ENV]?.trim();
  if (own) return own;
  const moved = process.env["SCOUT_STORE_DIR"]?.trim();
  return moved ? path.join(path.dirname(moved), "scout-channels") : outPath("scout-channels");
}

/* ── the door ─────────────────────────────────────────────────────────────── */

const text = z.string().trim().min(1);

const channelSchema = z
  .object({
    id: z.string().regex(CHANNEL_ID_RE, "a channel id: a letter and one or two digits"),
    group: text,
    name: text,
    audience: text,
    promise: text,
    gap: text,
    edge: text,
    medium: z.enum(CHANNEL_MEDIA),
  })
  .strict();

const episodeSchema = z
  .object({
    id: z.string().regex(EPISODE_ID_RE, "an episode id: <channel>-NN"),
    channel: z.string().regex(CHANNEL_ID_RE),
    title: text,
    logline: text,
    beats: z.array(text).length(5),
    spec: text,
    state: z.enum(EPISODE_STATES),
    at: z.iso.datetime(),
    candidate: z.string().optional(),
    note: z.string().optional(),
  })
  .strict();

const fileSchema = z.object({ channel: channelSchema, episodes: z.array(episodeSchema) }).strict();

/** The session's outlines.json: channels with their outline items (no medium - the store derives it from the group). */
const outlineItemSchema = z.object({
  id: z.string().regex(EPISODE_ID_RE, "an episode id: <channel>-NN"),
  title: text,
  logline: text,
  beats: z.array(text).length(5, "an outline has exactly five beats"),
  spec: text,
});
const outlinesSchema = z.array(
  z.object({
    id: z.string().regex(CHANNEL_ID_RE, "a channel id: a letter and one or two digits"),
    group: text,
    name: text,
    audience: text,
    promise: text,
    gap: text,
    edge: text,
    items: z.array(outlineItemSchema),
  }),
);

function fileOf(id: string): string {
  return path.join(channelsDir(), `${id}.json`);
}

/** One channel's file, parsed; undefined when absent; a throw naming the path when damaged. */
async function loadFile(id: string): Promise<ChannelFile | undefined> {
  const file = fileOf(id);
  let raw: unknown;
  try {
    raw = await readJson<unknown>(file);
  } catch (e) {
    throw new Refusal(`channels: ${file} is damaged (${e instanceof Error ? e.message : String(e)}); fix or restore it - it is never read as empty`);
  }
  if (raw === null) return undefined;
  const r = parseAt(`channels: ${file}`, fileSchema, raw);
  if (!r.ok) throw new Refusal(`${r.error.message} - the file is damaged; fix or restore it`);
  if (r.value.channel.id !== id) throw new Refusal(`channels: ${file} holds channel ${r.value.channel.id}, not ${id}`);
  return r.value;
}

async function channelIds(): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(channelsDir());
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  return names
    .filter((n) => n.endsWith(".json"))
    .map((n) => n.slice(0, -".json".length))
    .filter((id) => CHANNEL_ID_RE.test(id))
    .sort();
}

/**
 * Read every channel, let `fn` change what it will, write the channels it changed - all under the directory's lock.
 * `fn` returns the next map; a channel whose file object is the same one it was handed is not written.
 */
async function mutateChannels<T>(fn: (files: Map<string, ChannelFile>) => { readonly next: Map<string, ChannelFile>; readonly out: T }): Promise<T> {
  const dir = channelsDir();
  await mkdir(dir, { recursive: true });
  return withRunLock(dir, async () => {
    const before = new Map<string, ChannelFile>();
    for (const id of await channelIds()) {
      const f = await loadFile(id);
      if (f !== undefined) before.set(id, f);
    }
    const { next, out } = fn(before);
    for (const [id, f] of next) if (before.get(id) !== f) await writeJsonAtomic(fileOf(id), f);
    return out;
  });
}

/* ── reads ────────────────────────────────────────────────────────────────── */

export async function readChannels(): Promise<readonly ChannelFile[]> {
  const out: ChannelFile[] = [];
  for (const id of await channelIds()) {
    const f = await loadFile(id);
    if (f !== undefined) out.push(f);
  }
  return out;
}

export async function readChannel(id: string): Promise<ChannelFile> {
  if (!CHANNEL_ID_RE.test(id)) throw new Refusal(`channels: that is not a channel id: ${id}`);
  const f = await loadFile(id);
  if (f === undefined) throw new Refusal(`channels: no channel ${id} in ${channelsDir()}`);
  return f;
}

/** The episode by id, with its channel; undefined when unknown. */
export async function episodeOf(id: string): Promise<{ readonly channel: Channel; readonly episode: Episode } | undefined> {
  if (!EPISODE_ID_RE.test(id)) return undefined;
  const f = await loadFile(channelOfEpisode(id));
  const episode = f?.episodes.find((e) => e.id === id);
  return f === undefined || episode === undefined ? undefined : { channel: f.channel, episode };
}

/** Import order: the time it landed, then its id (one import lands a channel's episodes at one instant). */
const byImport = (a: Episode, b: Episode): number => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Episodes whose outline is kept and that no night has taken, oldest import first, per channel. */
export async function episodesDue(): Promise<readonly { readonly channel: Channel; readonly episodes: readonly Episode[] }[]> {
  return (await readChannels())
    .map((f) => ({ channel: f.channel, episodes: f.episodes.filter((e) => e.state === "outline-kept").sort(byImport) }))
    .filter((d) => d.episodes.length > 0);
}

/* ── the state machine ────────────────────────────────────────────────────── */

/** The moves the store allows, as data: a night takes a kept outline, makes it or hands it back (its candidate failed);
 *  the operator's verdict on what it made ends it. */
const MOVES: Readonly<Record<EpisodeState, readonly EpisodeState[]>> = {
  "outline-kept": ["in-production"],
  "in-production": ["made", "outline-kept"],
  made: ["kept", "thrown"],
  kept: [],
  thrown: [],
};

/** A night's candidate ref, `<night>/<c-id>`, or the reason it is not one. */
function candidateProblem(ref: string): string | undefined {
  const [night = "", cId = "", ...more] = ref.split("/");
  return NIGHT_ID_RE.test(night) && CANDIDATE_ID_RE.test(cId) && more.length === 0 ? undefined : `${ref} is not a night's candidate (<night>/<c-id>)`;
}

/** Move one episode; the store refuses a move its state machine does not allow (outline-kept -> in-production ->
 *  made -> kept | thrown; in-production -> outline-kept when the night's candidate failed). */
export async function setEpisodeState(id: string, next: EpisodeState, patch: { readonly candidate?: string } = {}): Promise<Episode> {
  if (!EPISODE_ID_RE.test(id)) throw new Refusal(`episodes: that is not an episode id: ${id}`);
  const chId = channelOfEpisode(id);
  return mutateChannels((files) => {
    const f = files.get(chId);
    const ep = f?.episodes.find((e) => e.id === id);
    if (f === undefined || ep === undefined) throw new Refusal(`episodes: no episode ${id} in ${channelsDir()}`);
    if (!MOVES[ep.state].includes(next)) throw new Refusal(`episodes: ${id} cannot move ${ep.state} -> ${next}`);
    let candidate: string | undefined = ep.candidate;
    if (next === "in-production") {
      if (patch.candidate === undefined) throw new Refusal(`episodes: ${id} -> in-production names the night's candidate (<night>/<c-id>)`);
      const bad = candidateProblem(patch.candidate);
      if (bad !== undefined) throw new Refusal(`episodes: ${bad}`);
      candidate = patch.candidate;
    } else if (patch.candidate !== undefined && patch.candidate !== ep.candidate) {
      throw new Refusal(`episodes: ${id} ${ep.state} -> ${next} keeps its candidate ${ep.candidate ?? "(none)"}; it takes no new one`);
    }
    // Handed back: the night's candidate failed, so the episode is due again with no candidate of its own.
    if (next === "outline-kept") candidate = undefined;
    const { candidate: _drop, ...rest } = ep;
    const moved: Episode = { ...rest, state: next, at: new Date().toISOString(), ...(candidate === undefined ? {} : { candidate }) };
    const out = new Map(files);
    out.set(chId, { channel: f.channel, episodes: f.episodes.map((e) => (e.id === id ? moved : e)) });
    return { next: out, out: moved };
  });
}

/* ── import ───────────────────────────────────────────────────────────────── */

type Verdict = "keep" | "reject" | "no verdict";
type ReportLine = { readonly id: string; readonly verdict: Verdict; readonly note?: string } | { readonly id: string; readonly why: string };

const SEP = " · ";
const ITEM_RE = /^(\S+) (keep|reject|no verdict)$/;

/**
 * The outline-triage report, line by line. A line that starts at the margin is a heading (the report's title, its
 * tally, a channel's name) and is read past; an indented line is an episode's verdict, `<id> <verdict> · <title>` with
 * an optional ` · <note>` (a note may itself hold the separator: everything after the title is the note).
 */
export function parseReport(report: string): readonly ReportLine[] {
  const out: ReportLine[] = [];
  for (const raw of report.split(/\r?\n/)) {
    if (raw.trim() === "" || !/^\s/.test(raw)) continue;
    const line = raw.trim();
    const parts = line.split(SEP);
    const head = ITEM_RE.exec(parts[0] ?? "");
    const first = line.split(/\s/)[0] ?? line;
    if (head === null || parts.length < 2) {
      out.push({ id: first, why: `malformed line: ${line}` });
      continue;
    }
    const id = head[1] ?? first;
    if (!EPISODE_ID_RE.test(id)) {
      out.push({ id, why: "not an episode id (<channel>-NN)" });
      continue;
    }
    const note = parts.slice(2).join(SEP).trim();
    out.push({ id, verdict: head[2] as Verdict, ...(note === "" ? {} : { note }) });
  }
  return out;
}

/** Import the accepted outlines; idempotent (an episode already present keeps its state). */
export async function importEpisodes(input: ImportInput): Promise<ImportResult> {
  const parsed = parseAt("episodes import: outlines", outlinesSchema, input.outlines);
  if (!parsed.ok) throw new Refusal(parsed.error.message);
  const outlines = parsed.value;
  const lines = parseReport(input.report);
  const now = new Date().toISOString();
  return mutateChannels((files) => {
    const next = new Map(files);
    const imported: string[] = [];
    const skipped: { id: string; why: string }[] = [];
    const seen = new Set<string>();
    for (const l of lines) {
      if ("why" in l) {
        skipped.push(l);
        continue;
      }
      if (seen.has(l.id)) {
        skipped.push({ id: l.id, why: "listed twice in the report" });
        continue;
      }
      seen.add(l.id);
      if (l.verdict !== "keep") {
        skipped.push({ id: l.id, why: l.verdict === "reject" ? "rejected" : "no verdict" });
        continue;
      }
      const chId = channelOfEpisode(l.id);
      const ch = outlines.find((c) => c.id === chId);
      const item = ch?.items.find((i) => i.id === l.id);
      if (ch === undefined || item === undefined) {
        skipped.push({ id: l.id, why: "not in the outlines" });
        continue;
      }
      const had = next.get(chId);
      if (had?.episodes.some((e) => e.id === l.id) === true) {
        skipped.push({ id: l.id, why: "already imported" });
        continue;
      }
      const channel: Channel = had?.channel ?? {
        id: ch.id,
        group: ch.group,
        name: ch.name,
        audience: ch.audience,
        promise: ch.promise,
        gap: ch.gap,
        edge: ch.edge,
        medium: ch.group === REEL_GROUP ? "reel" : "storyboard",
      };
      const episode: Episode = {
        id: item.id,
        channel: chId,
        title: item.title,
        logline: item.logline,
        beats: item.beats,
        spec: item.spec,
        state: "outline-kept",
        at: now,
        ...(l.note === undefined ? {} : { note: l.note }),
      };
      next.set(chId, { channel, episodes: [...(had?.episodes ?? []), episode] });
      imported.push(l.id);
    }
    return { next, out: { imported, skipped } };
  });
}
