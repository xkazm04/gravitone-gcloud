// THE FIXTURE'S RECORDS (./fixture.ts): a history of covers, one per state, plus the receipts and the brief's write the
// stand-in acts answer with. Reachable states only. Pure, but for the clock its dates are read from.
import { COVER_SECTION_MAX_S, type CoverCard, type CoverRecord, type CoverState, type CoverTake } from "@gt/domain/cover";
import type { Receipt } from "@gt/domain/produce";

import type { FixtureState } from "./fixture.ts";
import type { Sounds } from "./fixtureSound.ts";
import { clock } from "./words.ts";

export const SONG_S = 64;
export const SEEDS = [41_877_203, 9_020_114, 77_310_552, 3_405_918, 60_118_734];

const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();
const HOUR = 60;
const DAY = 24 * HOUR;

export function takesFor(state: CoverState | "rendering-2" | "failed-1"): CoverTake[] {
  return SEEDS.map((seed, i): CoverTake => {
    const n = i + 1;
    const done: CoverTake = { n, seed, state: "done", file: `takes/s${seed}.flac`, renderS: 58 + i * 3 };
    if (state === "draft" || state === "queued") return { n, seed, state: "pending" };
    if (state === "rendering-2") return n <= 2 ? done : { n, seed, state: "pending" };
    if (state === "failed-1") return n === 4 ? { n, seed, state: "failed", error: "Prompt outputs failed validation: YuE2Sampler: CUDA out of memory. Tried to allocate 1.20 GiB" } : n === 5 ? { n, seed, state: "pending" } : done;
    return done;
  });
}

export function card(sounds: Sounds, r: CoverRecord, dropped: ReadonlyMap<string, string>): CoverCard {
  const takeUrls: Record<number, string> = {};
  r.takes.forEach((t, i) => {
    if (t.file !== undefined) takeUrls[t.seed] = sounds.takes[i] ?? sounds.source;
  });
  const sourceUrl = dropped.get(r.id) ?? sounds.songs.get(r.id) ?? sounds.source;
  return { record: r, sourceUrl, takeUrls, ...(r.exportFile === undefined ? {} : { winnerUrl: sounds.takes[1] ?? sounds.source }), ...(r.remix === undefined ? {} : { remixUrl: sounds.remix }) };
}

export const base = (id: string, title: string, ago: number): Omit<CoverRecord, "state" | "takes"> => ({
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
export function records(): CoverRecord[] {
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
export const OPENS_ON: Readonly<Record<Exclude<FixtureState, "empty">, string>> = {
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
export function briefReceipt(id: string): Receipt {
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
export function briefDone(r: CoverRecord, at: string): CoverRecord {
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

export function receipt(id: string, startS: number, endS: number, salt: number): Receipt {
  const now = Date.UTC(2026, 10, 7, 20, 0);
  const iso = (s: number): string => new Date(now + s * 1000).toISOString();
  const step = (key: string, label: string, model: string, from: number, seconds: number) =>
    ({ key, label, lane: "gpu.local", provider: "comfy", model, units: 1, seconds, usd: 0, src: "illustrative", queuePos: 1 + salt, start: iso(from), end: iso(from + seconds) }) as const;
  const lines = [step("transcribe", "transcribe", "sheetsage2", 0, 40), ...[1, 2, 3, 4, 5].map((n) => step(`render-${n}`, `render-${n}`, "yue2", 40 + (n - 1) * 60, 60))];
  const seconds = lines.reduce((a, l) => a + l.seconds, 0);
  return { token: `fx-${id}-${startS}-${endS}-${salt}`, subject: { kind: "run", lane: "audio" }, mode: "dry", lines, totals: { seconds, usd: 0, unpriced: 0, src: "illustrative" }, queuePos: 1 + salt, etaAt: iso(seconds + salt * 60), overCeiling: false, readAt: iso(0) };
}
