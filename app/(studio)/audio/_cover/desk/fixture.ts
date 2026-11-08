"use client";

// THE COVER DESK'S FIXTURE (spark track-mirror-studio, WP3): a history of covers, one per state plus a draft whose
// brief is running, audio synthesized in the browser, and stand-in acts that move the fixture through the flow
// (receipt, a stale confirm once, five takes, a pick, a remix), so the desk is driven before the engine and the doors exist. A draft's brief walks
// queued -> running -> done, one state per re-read, and on done writes the fields and launches the cover. Reached with
// `/audio?s=cover&fixture=<state>` on a development build only (./useDesk.ts reads the switch); a production
// build never honours it. Nothing here touches a store, a route or a vendor. A link sent here (cover from a link,
// WP-C) is "fetched" for LINK_FETCH_MS, so the fetching state can be seen, then made a draft carrying its link.
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { COVER_SECTION_MAX_S, type CoverCard, type CoverDeskView, type CoverRecord, type CoverState, type CoverTake } from "@gt/domain/cover";
import type { Receipt } from "@gt/domain/produce";

import type { CoverActs } from "../contract.ts";
import type { Sender } from "./send.ts";
import { clock } from "./words.ts";

// An act's success, in the ActionResult shape the contract answers.
const ok = <T,>(value: T) => ({ ok: true as const, value });

export const FIXTURE_STATES = ["empty", "draft", "queued", "rendering", "failed", "judging", "picked", "remixed"] as const;
export type FixtureState = (typeof FIXTURE_STATES)[number];

const RATE = 16_000;
const SONG_S = 64;
const SEEDS = [41_877_203, 9_020_114, 77_310_552, 3_405_918, 60_118_734];
const NOTES = [220, 246.9, 277.2, 329.6, 370, 440, 493.9, 554.4];
/** How long the fixture's link takes to "download": long enough to be seen and photographed. */
const LINK_FETCH_MS = 2_500;
/** The video the fixture's link turns out to be. */
const LINK_TITLE = "Rain on Tin";

/** A whole song's rate: a history of 3-5 minute songs at 16 kHz would hold ~60 MB of blobs in a dev tab. */
const SONG_RATE = 8_000;
/** A song is this phrase played over and over under a slow verse/chorus swell, so its length costs a copy, not a synth. */
const PHRASE_S = 16;

/** A 16-bit mono WAV of a little tune: phrases of eighth notes, louder in its middle third, the timbre the seed's.
 *  Past `phraseS` the tune repeats under a slow swell, so a five-minute song costs a copy, not a synth. */
function wav(seconds: number, seed: number, rate = RATE, phraseS = seconds): string {
  const n = Math.floor(seconds * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  const beat = 0.25;
  const bright = 1 + (seed % 4);
  const pn = Math.min(n, Math.floor(phraseS * rate));
  const phrase = new Float32Array(pn);
  for (let i = 0; i < pn; i++) {
    const t = i / rate;
    const k = Math.floor(t / beat);
    const f = NOTES[(k * 3 + Math.floor(k / 8) + seed) % NOTES.length] ?? 220;
    const inNote = (t % beat) / beat;
    const env = Math.exp(-inNote * 4) * (0.35 + 0.65 * Math.abs(Math.sin((t / phraseS) * Math.PI * 1.5)));
    let s = 0;
    for (let h = 1; h <= bright; h++) s += Math.sin(2 * Math.PI * f * h * t) / h;
    const kick = t % 1 < 0.08 ? Math.sin(2 * Math.PI * 55 * t) * (1 - (t % 1) / 0.08) : 0;
    phrase[i] = s * env * 0.3 + kick * 0.5;
  }
  const swells = pn < n;
  for (let i = 0; i < n; i++) {
    const swell = swells ? 0.45 + 0.55 * Math.abs(Math.sin((i / n) * Math.PI * 3)) : 1;
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, (phrase[i % pn] ?? 0) * swell)) * 32_767, true);
  }
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

/** `songs`: each history cover's source at its own length, by id; `source`: the 64 s song a fixture upload stands on. */
type Sounds = { readonly source: string; readonly songs: ReadonlyMap<string, string>; readonly takes: readonly string[]; readonly remix: string };

const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();
const HOUR = 60;
const DAY = 24 * HOUR;

function takesFor(state: CoverState | "rendering-2" | "failed-1"): CoverTake[] {
  return SEEDS.map((seed, i): CoverTake => {
    const n = i + 1;
    const done: CoverTake = { n, seed, state: "done", file: `takes/s${seed}.flac`, renderS: 58 + i * 3 };
    if (state === "draft" || state === "queued") return { n, seed, state: "pending" };
    if (state === "rendering-2") return n <= 2 ? done : { n, seed, state: "pending" };
    if (state === "failed-1") return n === 4 ? { n, seed, state: "failed", error: "Prompt outputs failed validation: YuE2Sampler: CUDA out of memory. Tried to allocate 1.20 GiB" } : n === 5 ? { n, seed, state: "pending" } : done;
    return done;
  });
}

function card(sounds: Sounds, r: CoverRecord, dropped: ReadonlyMap<string, string>): CoverCard {
  const takeUrls: Record<number, string> = {};
  r.takes.forEach((t, i) => {
    if (t.file !== undefined) takeUrls[t.seed] = sounds.takes[i] ?? sounds.source;
  });
  const sourceUrl = dropped.get(r.id) ?? sounds.songs.get(r.id) ?? sounds.source;
  return { record: r, sourceUrl, takeUrls, ...(r.exportFile === undefined ? {} : { winnerUrl: sounds.takes[1] ?? sounds.source }), ...(r.remix === undefined ? {} : { remixUrl: sounds.remix }) };
}

const base = (id: string, title: string, ago: number): Omit<CoverRecord, "state" | "takes"> => ({
  id: `cov-${id}`,
  createdAt: minutesAgo(ago),
  title,
  rights: "third-party-uncleared",
  holder: "Tears for Fears",
  source: { file: "source.mp3", mime: "audio/mpeg", name: `${title}.mp3`, durationS: SONG_S },
  section: { startS: 12, endS: 36 },
  style: "",
  lyrics: "",
});

type Song = { readonly id: string; readonly title: string; readonly ago: number; readonly lenS: number; readonly rights: CoverRecord["rights"]; readonly holder?: string; readonly note?: string; readonly video?: string; readonly section: readonly [number, number] };

/** A cover's song: uploaded as a file, or fetched from a link (`video`, an 11-character YouTube id). */
function song({ id, title, ago, lenS, rights, holder, note, video, section }: Song): Omit<CoverRecord, "state" | "takes"> {
  const file = { file: "source.mp3", mime: "audio/mpeg", durationS: lenS };
  const source = video === undefined ? { ...file, name: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.mp3` } : { ...file, name: `${title} [${video}].mp3`, url: `https://www.youtube.com/watch?v=${video}` };
  return { id: `cov-${id}`, createdAt: minutesAgo(ago), title, rights, ...(holder === undefined ? {} : { holder }), ...(note === undefined ? {} : { note }), source, section: { startS: section[0], endS: section[1] }, style: "", lyrics: "" };
}

const STYLED = { style: "lo-fi hip hop, dusty rhodes, vinyl crackle, slow swung drums, warm bass", sourceStyle: "80s synth-pop, gated snare, driving bass, wide pads" };
const briefOf = (id: string, ago: number, why: string, agreed: number) => ({ state: "done" as const, jobId: `job:cover-brief:cov-${id}`, at: minutesAgo(ago), why, agreed });

/** The history, newest first: two weeks of covers, one per state `?fixture=` opens on, plus a draft whose brief is
 *  still running. Mixed rights, some songs from a link and some from a file, real song lengths. */
function records(): CoverRecord[] {
  const w = (id: string) => ({ jobId: `job:cover:cov-${id}` });
  return [
    { ...song({ id: "0000000000a1", title: "Paper Lanterns", ago: 6, lenS: 218, rights: "own", section: [52, 98] }), state: "draft", takes: [] },
    {
      ...song({ id: "0000000000a8", title: "Midnight Ferry", ago: 14, lenS: 243, rights: "third-party-uncleared", holder: "Harbour Sound Records", video: "q8Lw2mT4xZc", section: [0, 30] }),
      state: "draft",
      takes: [],
      brief: { state: "running", jobId: "job:cover-brief:cov-0000000000a8", at: minutesAgo(9) },
    },
    {
      ...song({ id: "0000000000a3", title: "Harbour Lights", ago: 40, lenS: 261, rights: "own", note: "demo bounce, 2026-10-30 session", section: [64, 196] }),
      ...STYLED,
      state: "rendering",
      score: "score.abc",
      takes: takesFor("rendering-2"),
      ...w("0000000000a3"),
    },
    {
      ...song({ id: "0000000000a2", title: "Mad World", ago: 9 * HOUR + 20, lenS: 215, rights: "third-party-uncleared", holder: "Tears for Fears", video: "u1ZvPSpLxCg", section: [0, 215] }),
      style: "slowcore, brushed snare, felt piano, upright bass, 84 bpm, F minor",
      sourceStyle: "80s synth-pop, drum machine, sparse piano, wide pads, 89 bpm, F minor",
      brief: briefOf("0000000000a2", 9 * HOUR + 4, "All three listens heard 80s synth-pop over a drum machine and a sparse piano. The measured 89 bpm and F minor fit. The section is the whole song, 3:35.", 3),
      state: "queued",
      takes: takesFor("queued"),
      ...w("0000000000a2"),
    },
    {
      ...song({ id: "0000000000a4", title: "Pale Shelter", ago: 2 * DAY + 3 * HOUR, lenS: 271, rights: "licensed", holder: "Mercury Records", note: "sync licence ML-2026-0412, covers for demo use", section: [41, 161] }),
      ...STYLED,
      state: "failed",
      score: "score.abc",
      takes: takesFor("failed-1"),
      ...w("0000000000a4"),
    },
    {
      ...song({ id: "0000000000a5", title: "Everybody Wants to Rule the World", ago: 3 * DAY + 5 * HOUR, lenS: 251, rights: "third-party-uncleared", holder: "Tears for Fears", section: [0, 251] }),
      ...STYLED,
      state: "judging",
      score: "score.abc",
      takes: takesFor("judging"),
      ...w("0000000000a5"),
    },
    {
      ...song({ id: "0000000000a6", title: "Low Tide Choir", ago: 6 * DAY + 2 * HOUR, lenS: 192, rights: "own", section: [30, 150] }),
      ...STYLED,
      state: "picked",
      score: "score.abc",
      takes: takesFor("picked"),
      winnerSeed: SEEDS[1] ?? 0,
      exportFile: "winner.mp3",
      ...w("0000000000a6"),
    },
    {
      ...song({ id: "0000000000a7", title: "Woman in Chains", ago: 13 * DAY + 7 * HOUR, lenS: 292, rights: "third-party-uncleared", holder: "Tears for Fears", video: "Jr0h3eOXbDg", section: [12, 292] }),
      ...STYLED,
      state: "picked",
      score: "score.abc",
      takes: takesFor("picked"),
      winnerSeed: SEEDS[1] ?? 0,
      exportFile: "winner.mp3",
      remix: { file: "remix.mp3", mime: "audio/mpeg", name: "woman-in-chains-suno-v5.mp3", style: "lo-fi hip hop, tape-saturated rhodes, brushed drums, upright bass, 72 bpm" },
      ...w("0000000000a7"),
    },
  ];
}

/** The cover each `?fixture=<state>` opens on. */
const OPENS_ON: Readonly<Record<Exclude<FixtureState, "empty">, string>> = {
  draft: "cov-0000000000a1",
  queued: "cov-0000000000a2",
  rendering: "cov-0000000000a3",
  failed: "cov-0000000000a4",
  judging: "cov-0000000000a5",
  picked: "cov-0000000000a6",
  remixed: "cov-0000000000a7",
};

/** The brief's receipt as lib/producers/coverBrief.ts draws it: the song measured here, three Gemini listens priced
 *  over its length, the Claude turn on the seat. */
function briefReceipt(id: string): Receipt {
  const now = Date.UTC(2026, 10, 7, 20, 0);
  const iso = (s: number): string => new Date(now + s * 1000).toISOString();
  const line = (key: string, label: string, lane: "seat.text" | "cloud.google", provider: string, model: string, from: number, seconds: number, usd: number) =>
    ({ key, label, lane, provider, model, units: 1, seconds, usd, src: "illustrative", queuePos: 1, start: iso(from), end: iso(from + seconds) }) as const;
  const lines = [
    line("measure", "measure", "seat.text", "local", "librosa", 0, 20, 0),
    ...[1, 2, 3].map((n) => line(`listen-${n}`, `listen-${n}`, "cloud.google", "gemini", "gemini-3.8-flash", 20 + (n - 1) * 30, 30, 0.012)),
    line("write", "write", "seat.text", "claude-code", "seat", 110, 90, 0),
  ];
  const seconds = lines.reduce((a, l) => a + l.seconds, 0);
  const usd = lines.reduce((a, l) => a + l.usd, 0);
  return { token: `fx-brief-${id}`, subject: { kind: "run", lane: "audio" }, mode: "dry", lines, totals: { seconds, usd, unpriced: 0, src: "illustrative" }, queuePos: 1, etaAt: iso(seconds), overCeiling: false, readAt: iso(0) };
}

/** What the fixture's brief writes on done: the fields, its reason, the listens that agreed, and the cover launched. */
function briefDone(r: CoverRecord, at: string): CoverRecord {
  const jobId = r.brief?.jobId ?? `job:cover-brief:${r.id}`;
  const endS = Math.min(r.source.durationS, COVER_SECTION_MAX_S);
  const why = `Two of three listens heard slow 80s synth-pop with a drum machine and a sparse piano; the third heard darkwave. The measured 92 bpm and F minor fit both. The section is the whole song, ${clock(endS)}.`;
  return {
    ...r,
    style: "lo-fi hip hop, dusty rhodes, vinyl crackle, slow swung drums, warm bass, 92 bpm, F minor",
    sourceStyle: "80s synth-pop, drum machine, sparse piano, wide pads, 92 bpm, F minor",
    section: { startS: 0, endS },
    lyrics: "",
    brief: { state: "done", jobId, at, why, agreed: 2 },
    state: "queued",
    takes: takesFor("queued"),
    jobId: `job:cover:${r.id}`,
  };
}

function receipt(id: string, startS: number, endS: number, salt: number): Receipt {
  const now = Date.UTC(2026, 10, 7, 20, 0);
  const iso = (s: number): string => new Date(now + s * 1000).toISOString();
  const step = (key: string, label: string, model: string, from: number, seconds: number) =>
    ({ key, label, lane: "gpu.local", provider: "comfy", model, units: 1, seconds, usd: 0, src: "illustrative", queuePos: 1 + salt, start: iso(from), end: iso(from + seconds) }) as const;
  const lines = [step("transcribe", "transcribe", "sheetsage2", 0, 40), ...[1, 2, 3, 4, 5].map((n) => step(`render-${n}`, `render-${n}`, "yue2", 40 + (n - 1) * 60, 60))];
  const seconds = lines.reduce((a, l) => a + l.seconds, 0);
  return { token: `fx-${id}-${startS}-${endS}-${salt}`, subject: { kind: "run", lane: "audio" }, mode: "dry", lines, totals: { seconds, usd: 0, unpriced: 0, src: "illustrative" }, queuePos: 1 + salt, etaAt: iso(seconds + salt * 60), overCeiling: false, readAt: iso(0) };
}

// One set of sounds per page load, kept for its life: a fixture is a development page, and its blob URLs go
// with the tab.
let made: Sounds | null = null;
const clientSounds = (): Sounds =>
  (made ??= {
    source: wav(SONG_S, 0),
    songs: new Map(records().map((r, i) => [r.id, wav(r.source.durationS, i + 1, SONG_RATE, PHRASE_S)])),
    takes: SEEDS.map((seed) => wav(24, seed)),
    remix: wav(30, 7),
  });
const serverSounds = (): Sounds | null => null;
const noSubscribe = (): (() => void) => () => undefined;

const recordsFor = (state: FixtureState): CoverRecord[] => (state === "empty" ? [] : records());
const currentFor = (state: FixtureState): string | undefined => (state === "empty" ? undefined : OPENS_ON[state]);

export type FixtureDesk = { readonly view: CoverDeskView | null; readonly acts: CoverActs; readonly sender: Sender; readonly refresh: () => void; readonly select: (id: string | undefined) => void };

export function useFixture(state: FixtureState): FixtureDesk {
  // The audio is made in the browser only: the server's snapshot is none, so hydration matches and the
  // client's first render after it carries the sounds.
  const sounds = useSyncExternalStore(noSubscribe, clientSounds, serverSounds);
  const [recs, setRecs] = useState<CoverRecord[]>(() => recordsFor(state));
  const [currentId, setCurrentId] = useState<string | undefined>(() => currentFor(state));
  // A new `?fixture=` starts the fixture over (React's reset-on-prop pattern, during render).
  const [forState, setForState] = useState(state);
  if (forState !== state) {
    setForState(state);
    setRecs(recordsFor(state));
    setCurrentId(currentFor(state));
  }
  const staleOnce = useRef(true);
  // The re-read a confirm makes at once finds the brief still queued: it moves on the re-read after that.
  const briefJustQueued = useRef<string | null>(null);
  // A song dropped on the fixture plays as itself.
  const [dropped, setDropped] = useState<ReadonlyMap<string, string>>(new Map());

  const change = useCallback((id: string, f: (r: CoverRecord) => CoverRecord) => setRecs((rs) => rs.map((r) => (r.id === id ? f(r) : r))), []);

  const view = useMemo((): CoverDeskView | null => {
    if (sounds === null) return null;
    const covers = recs.map((r) => card(sounds, r, dropped));
    const current = covers.find((c) => c.record.id === currentId);
    return { covers, ...(current === undefined ? {} : { current }) };
  }, [sounds, recs, currentId, dropped]);

  const acts = useMemo(
    (): CoverActs => ({
      launch: async (plan, token) => {
        if (token === undefined) return ok({ kind: "receipt", receipt: receipt(plan.id, plan.startS, plan.endS, 0) });
        if (staleOnce.current) {
          staleOnce.current = false;
          return ok({ kind: "stale", fresh: receipt(plan.id, plan.startS, plan.endS, 1) });
        }
        change(plan.id, (r) => ({ ...r, state: "queued", section: { startS: plan.startS, endS: plan.endS }, style: plan.style, lyrics: plan.lyrics, ...(plan.sourceStyle === undefined ? {} : { sourceStyle: plan.sourceStyle }), takes: takesFor("queued"), jobId: `job:cover:${plan.id}` }));
        return ok({ kind: "launched", jobId: `job:cover:${plan.id}` });
      },
      brief: async (id, token) => {
        if (token === undefined) return ok({ kind: "receipt", receipt: briefReceipt(id) });
        const jobId = `job:cover-brief:${id}`;
        briefJustQueued.current = id;
        change(id, (r) => ({ ...r, brief: { state: "queued", jobId, at: new Date().toISOString() } }));
        return ok({ kind: "launched", jobId });
      },
      pick: async (id, seed) => {
        change(id, (r) => ({ ...r, state: "picked", winnerSeed: seed, exportFile: "winner.mp3" }));
        return ok({ winnerUrl: sounds?.takes[1] ?? "" });
      },
      saveStyles: async (id, styles) => {
        change(id, (r) => ({ ...r, ...(styles.sourceStyle === undefined ? {} : { sourceStyle: styles.sourceStyle }), ...(styles.remixStyle === undefined || r.remix === undefined ? {} : { remix: { ...r.remix, style: styles.remixStyle } }) }));
        return ok(undefined);
      },
    }),
    [change, sounds],
  );

  // A brief moves one state per refresh, and a queued cover one take, as the jobs would between two reads.
  const refresh = useCallback(() => {
    const now = new Date().toISOString();
    const hold = briefJustQueued.current;
    briefJustQueued.current = null;
    setRecs((rs) =>
      rs.map((r) => {
        if (r.brief?.state === "queued" && r.id === hold) return r;
        if (r.brief?.state === "queued") return { ...r, brief: { ...r.brief, state: "running", at: now } };
        if (r.brief?.state === "running") return briefDone(r, now);
        if (r.state !== "queued" && r.state !== "rendering") return r;
        const next = r.takes.findIndex((t) => t.state === "pending");
        if (next < 0) return { ...r, state: "judging" };
        const takes = r.takes.map((t, i): CoverTake => (i === next ? { ...t, state: "done", file: `takes/s${t.seed}.flac`, renderS: 60 } : t));
        return { ...r, state: takes.every((t) => t.state === "done") ? "judging" : "rendering", score: "score.abc", takes };
      }),
    );
  }, []);

  const sender = useMemo(
    (): Sender => ({
      source: async (f) => {
        const id = `cov-${Date.now().toString(16).slice(-12).padStart(12, "0")}`;
        const r: CoverRecord = { ...base(id.slice(4), f.title, 0), id: `cov-${id.slice(4)}`, rights: f.rights, state: "draft", takes: [], source: { file: "source.mp3", mime: f.file.type, name: f.file.name, durationS: SONG_S } };
        const { holder: _h, ...rest } = r;
        setRecs((rs) => [{ ...rest, ...(f.holder.trim() === "" ? {} : { holder: f.holder.trim() }) }, ...rs]);
        setDropped((m) => new Map(m).set(r.id, URL.createObjectURL(f.file)));
        setCurrentId(r.id);
        return { ok: true, id: r.id };
      },
      remix: async (f) => {
        change(f.id, (r) => ({ ...r, remix: { file: "remix.mp3", mime: f.file.type, name: f.file.name, style: f.style } }));
        return { ok: true, id: f.id };
      },
      link: async (f) => {
        await new Promise((done) => setTimeout(done, LINK_FETCH_MS));
        const v = /(?:v=|youtu\.be\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/.exec(f.url)?.[1] ?? "dQw4w9WgXcQ";
        const id = `cov-${Date.now().toString(16).slice(-12).padStart(12, "0")}`;
        const title = f.title.trim() === "" ? LINK_TITLE : f.title.trim();
        const { holder: _h, ...rest } = base(id.slice(4), title, 0);
        const r: CoverRecord = {
          ...rest,
          rights: f.rights,
          ...(f.holder.trim() === "" ? {} : { holder: f.holder.trim() }),
          state: "draft",
          takes: [],
          source: { file: "source.mp3", mime: "audio/mpeg", name: `${LINK_TITLE} [${v}].mp3`, durationS: SONG_S, url: `https://www.youtube.com/watch?v=${v}` },
        };
        setRecs((rs) => [r, ...rs]);
        setCurrentId(r.id);
        return { ok: true, id: r.id };
      },
    }),
    [change],
  );

  return { view, acts, sender, refresh, select: setCurrentId };
}
