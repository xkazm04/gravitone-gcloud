// WHAT GRAVITONE KNOWS ABOUT AN UPLOADED SUNO TAKE (spark suno-advisor): the facts measured on the
// file the person chose to spend a Suno download on (tempo and its octave neighbours, key, loudness),
// the listener's read once a priced Listen ran, and the confirmed taste profile folded from the
// `audio.taste` ledger events. One reader for the studio's port (app/(studio)/audio/studio/_port/ledger.ts)
// and the agent's inbox (app/_server/mcp/tools/audioStudio.ts), so the page and the agent see the same facts.
//
// WHERE THE FACTS LIVE. The take itself is a SoundTake (lib/sound/takes.ts createTake: origin
// `suno-return`, provider `suno`, no parent), and what that record has an honest field for goes
// there: the file, its name, its length, and `measured` (tempo, key, LUFS, true peak) - so every
// other reader of the sound store (the Library, Triage) sees the same numbers. What it has no field
// for - the prompt card and clip the take answers, the conversation it came in through, the tempo's
// octave neighbours, the key's strength, the loudness range and the listener's read - lives in ONE
// json beside the takes, keyed by take id:
//
//   <root>/suno-facts.json   { version: 1, facts: { [takeId]: SunoFactRecord } }
//
// written under the sound store's own lock (withStore) with its tmp+rename, as ./store.ts does
// suno.json and for its reason (one lock, not two). A corrupt file is refused, never emptied. A take
// id is in the answer only when BOTH the take and its record are held: a take filed any other way
// has no studio facts, and is absent rather than half-described.
//
// THE TASTE FOLD reads the newest TASTE_READ_MAX `audio.taste` events (bounded-enumeration), oldest
// first into foldTaste. An event its door refuses is skipped AND counted, so the port can say "N taste
// events could not be read" instead of folding them silently away.
import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { StudioListen, StudioMeasured, StudioTakeFacts, StudioTasteLine } from "@gt/domain/audio.suno";
import { foldTaste, parseStudioListen, parseTasteEvent, studioListenSchema, TASTE_EVENT, type TasteEventData } from "@gt/domain/audio.suno.schema";
import { studioSessionSchema } from "@gt/domain/audio.studio.events";
import { err, ok, type Result } from "@gt/domain/errors";
import { queryEvents } from "@gt/kernel/events-query";
import type { Store } from "@gt/kernel/store";

import type { AudioAnalysis } from "../../audio/sidecar.ts";
import { ID_RE, readTakes, SoundError, soundFailure, storeRoot, withStore, writeJsonAtomic } from "../store.ts";
import { takeFileHref } from "../takeHref.ts";
import { createTakeTx, type IncomingFile } from "../takes.ts";
import type { SoundTake } from "../types.ts";
import { quoteListen } from "./listen.ts";

const measuredSchema = z.strictObject({
  bpm: z.number().positive().optional(),
  bpmAlt: z.array(z.number().positive()).max(4).optional(),
  key: z.string().min(1).max(40).optional(),
  keyStrength: z.number().min(0).max(1).optional(),
  lufs: z.number().optional(),
  truePeakDb: z.number().optional(),
  lra: z.number().nonnegative().optional(),
});

/** One take's studio-only facts, as suno-facts.json holds them. */
const recordSchema = z.strictObject({
  session: studioSessionSchema,
  promptId: z.string().min(1).max(64).optional(),
  clip: z.enum(["a", "b"]).optional(),
  durationS: z.number().nonnegative(),
  measured: measuredSchema,
  analyzedAt: z.string().min(10).max(40),
  listened: studioListenSchema.optional(),
});
export type SunoFactRecord = z.output<typeof recordSchema>;

type FactsFile = { version: 1; facts: Record<string, unknown> };

export const SUNO_FACTS_FILE = "suno-facts.json";
export const sunoFactsPath = (): string => path.join(storeRoot(), SUNO_FACTS_FILE);

/** The file as written, or why it cannot be read. A missing file is an empty one. */
async function readFactsFile(): Promise<FactsFile> {
  let raw: string;
  try {
    raw = await readFile(sunoFactsPath(), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, facts: {} };
    throw e;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new SoundError(`${sunoFactsPath()} is not valid JSON (${(e as Error).message}); refusing to overwrite it`, 500);
  }
  const facts = typeof parsed === "object" && parsed !== null ? (parsed as { facts?: unknown }).facts : undefined;
  if (typeof facts !== "object" || facts === null || Array.isArray(facts)) throw new SoundError(`${sunoFactsPath()} holds no facts object; refusing to overwrite it`, 500);
  return { version: 1, facts: facts as Record<string, unknown> };
}

/** What the sidecar's analysis says, in the studio's units; an absent value is an omitted key. */
export function measuredOf(a: AudioAnalysis): StudioMeasured {
  const m = a.measure;
  return {
    ...(a.tempo === null ? {} : { bpm: a.tempo.bpm, ...(a.tempo.alt.length > 0 ? { bpmAlt: [...a.tempo.alt] } : {}) }),
    ...(a.key === null ? {} : { key: a.key.name, keyStrength: a.key.strength }),
    ...(m.integratedLufs === null ? {} : { lufs: m.integratedLufs }),
    ...(m.truePeakDb === null ? {} : { truePeakDb: m.truePeakDb }),
    ...(m.lra === null ? {} : { lra: m.lra }),
  };
}

function factsFrom(take: SoundTake, rec: SunoFactRecord): StudioTakeFacts {
  const usd = quoteListen(rec.durationS);
  return {
    takeId: take.id,
    name: take.fileName ?? take.title,
    durationS: rec.durationS,
    href: takeFileHref(take.id),
    ...(rec.promptId === undefined ? {} : { promptId: rec.promptId }),
    ...(rec.clip === undefined ? {} : { clip: rec.clip }),
    measured: rec.measured,
    ...(rec.listened === undefined ? {} : { listened: rec.listened as StudioListen }),
    ...(usd === undefined ? {} : { listenUsd: usd }),
  };
}

/** Where an uploaded take came from: its conversation, and the prompt card and clip it answers. */
export type TakeFrom = { readonly session: string; readonly promptId?: string; readonly clip?: "a" | "b" };

/** File an uploaded Suno take with its analysis: the take and its facts record under ONE store lock. */
export async function fileSunoTake(file: IncomingFile, from: TakeFrom, analysis: AudioAnalysis, now = new Date()): Promise<Result<StudioTakeFacts>> {
  const measured = measuredOf(analysis);
  const rec = recordSchema.safeParse({ ...from, durationS: analysis.durationS, measured, analyzedAt: now.toISOString() });
  if (!rec.success) return err("invalid", `the take's facts do not hold: ${rec.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  try {
    return await withStore(async (tx) => {
      const held = await readFactsFile();
      const meta: Partial<SoundTake> = {
        kind: "music",
        origin: "suno-return",
        provider: "suno",
        durationS: analysis.durationS,
        measured: {
          tempoBpm: measured.bpm ?? null,
          key: measured.key ?? null,
          energy: null,
          durationS: analysis.durationS > 0 ? analysis.durationS : null,
          lufs: measured.lufs ?? null,
          truePeakDb: measured.truePeakDb ?? null,
        },
      };
      const { take } = await createTakeTx(tx, meta, file, now);
      held.facts[take.id] = rec.data;
      await writeJsonAtomic(sunoFactsPath(), held);
      return ok(factsFrom(take, rec.data));
    });
  } catch (e) {
    return soundFailure(e);
  }
}

/** Facts for every take id given that this server holds, or why the store could not be read. */
export async function readTakeFacts(takeIds: readonly string[]): Promise<Result<Readonly<Record<string, StudioTakeFacts>>>> {
  const want = [...new Set(takeIds)].filter((id) => ID_RE.test(id));
  if (want.length === 0) return ok({});
  try {
    const [takes, held] = await Promise.all([readTakes(), readFactsFile()]);
    const out: Record<string, StudioTakeFacts> = {};
    for (const id of want) {
      const take = takes.takes.find((t) => t.id === id);
      const rec = recordSchema.safeParse(held.facts[id]);
      if (take !== undefined && rec.success) out[id] = factsFrom(take, rec.data);
    }
    return ok(out);
  } catch (e) {
    return soundFailure(e);
  }
}

/** Facts for every take id given that this server holds; an id it does not hold is absent from the record. */
export async function takeFactsOf(takeIds: readonly string[]): Promise<Readonly<Record<string, StudioTakeFacts>>> {
  const r = await readTakeFacts(takeIds);
  return r.ok ? r.value : {};
}

/** One take's facts, or why there are none. */
export async function factsOf(takeId: string): Promise<Result<StudioTakeFacts>> {
  if (!ID_RE.test(takeId)) return err("invalid", `not a take id: ${JSON.stringify(takeId).slice(0, 90)}`);
  const r = await readTakeFacts([takeId]);
  if (!r.ok) return r;
  const hit = r.value[takeId];
  return hit === undefined ? err("not-found", `take ${takeId} has no studio facts: it was not uploaded to the studio, or is gone`) : ok(hit);
}

/** Keep a listener's read on the take (WP2's listen calls this after a successful, receipted read). */
export async function saveListened(takeId: string, listen: StudioListen): Promise<Result<StudioTakeFacts>> {
  if (!ID_RE.test(takeId)) return err("invalid", `not a take id: ${JSON.stringify(takeId).slice(0, 90)}`);
  const read = parseStudioListen(listen);
  if (!read.ok) return read;
  try {
    return await withStore(async (tx) => {
      const held = await readFactsFile();
      const rec = recordSchema.safeParse(held.facts[takeId]);
      const take = (await tx.get("takes")).takes.find((t) => t.id === takeId);
      if (take === undefined || !rec.success) return err<StudioTakeFacts>("not-found", `take ${takeId} has no studio facts to keep a listen on`);
      const next: SunoFactRecord = { ...rec.data, listened: read.value as SunoFactRecord["listened"] };
      held.facts[takeId] = next;
      await writeJsonAtomic(sunoFactsPath(), held);
      return ok(factsFrom(take, next));
    });
  } catch (e) {
    return soundFailure(e);
  }
}

/** The most `audio.taste` events one fold reads (newest kept): bounded-enumeration. */
export const TASTE_READ_MAX = 5000;
const TASTE_PAGE = 1000;

export type TasteRead = {
  readonly lines: readonly StudioTasteLine[];
  /** Events the taste door refused: skipped from the fold, counted here so a reader can say so. */
  readonly unreadable: number;
  /** More taste events than TASTE_READ_MAX: the oldest were not folded. */
  readonly capped: boolean;
};

/** The profile and what the fold could not read. */
export function readTaste(store: Store): Result<TasteRead> {
  const rows: { seq: number; at: string; data: unknown }[] = [];
  let before: number | undefined;
  let capped = false;
  for (;;) {
    const page = queryEvents(store, { type: [TASTE_EVENT], by: "seq", order: "desc", limit: TASTE_PAGE, ...(before === undefined ? {} : { before }) });
    if (!page.ok) return page;
    for (const e of page.value.events) rows.push({ seq: e.seq, at: e.at, data: e.data });
    if (!page.value.capped || page.value.next === undefined) break;
    if (rows.length >= TASTE_READ_MAX) {
      capped = true;
      break;
    }
    before = page.value.next;
  }
  rows.sort((a, b) => a.seq - b.seq);
  const events: { at: string; data: TasteEventData }[] = [];
  let unreadable = 0;
  for (const r of rows) {
    const p = parseTasteEvent(r.data);
    if (p.ok) events.push({ at: r.at, data: p.value });
    else unreadable++;
  }
  return ok({ lines: foldTaste(events), unreadable, capped });
}

/** The confirmed taste profile: the `audio.taste` events folded (@gt/domain/audio.suno.schema foldTaste). */
export function tasteProfile(store: Store): Result<readonly StudioTasteLine[]> {
  const r = readTaste(store);
  return r.ok ? ok(r.value.lines) : r;
}

/** The sentence a reader shows when the fold skipped or capped anything; undefined when it did not. */
export function tasteNote(t: TasteRead): string | undefined {
  const said: string[] = [];
  if (t.unreadable > 0) said.push(`${t.unreadable === 1 ? "1 taste event" : `${t.unreadable} taste events`} could not be read.`);
  if (t.capped) said.push(`Only the newest ${TASTE_READ_MAX} taste events are folded.`);
  return said.length > 0 ? said.join(" ") : undefined;
}
