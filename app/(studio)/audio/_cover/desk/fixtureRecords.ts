// THE FIXTURE'S RECORDS (./fixture.ts): a history of covers, one per state, plus the receipts and the brief's write the
// stand-in acts answer with. Reachable states only. Pure, but for the clock its dates are read from.
import { COVER_SECTION_MAX_S, type CoverCard, type CoverRecord, type CoverState, type CoverTake } from "@gt/domain/cover";
import type { SunoRead } from "@gt/domain/audio.suno";
import { coverSunoJobId, type CoverSuno, type CoverSunoPlan, type CoverSunoSend, type CoverSunoTake } from "@gt/domain/cover.suno";
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
    ...sunoCovers(),
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
  sending: "cov-0000000000b1",
  covered: "cov-0000000000b2",
  filed: "cov-0000000000b3",
  remixed: "cov-0000000000a7",
};

// ---- spark suno-covers: the winner sent to Suno, one cover per state `?fixture=` opens on ----

const sunoRead = (bpm: number, key: string, genre: string[], mood: string[], answer: string): SunoRead => ({ at: minutesAgo(5), status: "complete", bpm, key, timeSignature: 4, sections: [], terms: [], labels: [], answer, genre, mood });

const clip = (id: string, send: number, take: 1 | 2): string => `fx-clip-${id}-${send}${take}`;
const songUrl = (clipId: string): string => `https://suno.com/song/${clipId}`;

/** A take Suno finished, with its link out; `read` and `refused` are Suno's free read of it. */
function doneTake(id: string, send: number, take: 1 | 2, title: string, durationS: number, tail: Pick<CoverSunoTake, "read" | "readRefused"> = {}): CoverSunoTake {
  const clipId = clip(id, send, take);
  return { take, state: "complete", clipId, title, durationS, songUrl: songUrl(clipId), ...tail };
}

const sunoPlan = (style: string, lyrics: string, extra: Partial<CoverSunoPlan> = {}): CoverSunoSend["plan"] => {
  const { id: _id, ...rest } = { id: "", style, lyrics, model: "v6" as const, ...extra };
  return rest;
};

/** The three picked covers the suno fixtures open on: a send running, two takes heard, one take filed. */
function sunoCovers(): CoverRecord[] {
  const picked = { state: "picked" as const, score: "score.abc", takes: takesFor("picked"), winnerSeed: SEEDS[1] ?? 0, exportFile: "winner.mp3" };
  const lyrics = "Walk me through the glass orchard\nwhere the lanterns hum\nI will count the hours home\nuntil the morning comes";
  const sending: CoverSuno = {
    uploadClipId: "fx-up-0000000000b1",
    sends: [
      {
        n: 1,
        at: minutesAgo(3),
        jobId: coverSunoJobId("cov-0000000000b1", 1),
        state: "running",
        plan: sunoPlan(STYLED.style, "", { controls: { weirdness: 0.4 } }),
        takes: [doneTake("0000000000b1", 1, 1, "Salt Road (dusty cover)", 191), { take: 2, state: "pending" }],
      },
    ],
  };
  const heard = (id: string, send: number, tail: [Pick<CoverSunoTake, "read" | "readRefused">, Pick<CoverSunoTake, "read" | "readRefused">], titles: [string, string]): CoverSunoTake[] => [doneTake(id, send, 1, titles[0], 188, tail[0]), doneTake(id, send, 2, titles[1], 204, tail[1])];
  const covered: CoverSuno = {
    uploadClipId: "fx-up-0000000000b2",
    sends: [
      {
        n: 1,
        at: minutesAgo(47),
        jobId: coverSunoJobId("cov-0000000000b2", 1),
        state: "done",
        plan: sunoPlan(STYLED.style, lyrics, { model: "v6-wild", negativeStyle: "autotune, trap hats", durationS: 180, controls: { audioInfluence: 0.6, styleInfluence: 0.7, variety: 2 } }),
        creditsSpent: 10,
        takes: heard(
          "0000000000b2",
          1,
          [
            { read: sunoRead(91.8, "F minor", ["lo-fi hip hop", "downtempo"], ["wistful", "warm"], "A slow, dusty lo-fi cover. Soft rhodes carry the melody over a swung kick and a warm sub bass; the vocal is breathy and close.") },
            { readRefused: "The listen was refused: the clip is still processing. Ask again in a minute." },
          ],
          ["Glass Orchard (dusty cover)", "Glass Orchard (wild cover)"],
        ),
      },
    ],
  };
  const filed: CoverSuno = {
    uploadClipId: "fx-up-0000000000b3",
    sends: [
      {
        n: 1,
        at: minutesAgo(26 * 60),
        jobId: coverSunoJobId("cov-0000000000b3", 1),
        state: "done",
        plan: sunoPlan("lo-fi hip hop, tape-saturated rhodes, brushed drums, upright bass, 72 bpm", "", { model: "v6-mini" }),
        creditsSpent: 10,
        takes: [
          doneTake("0000000000b3", 1, 1, "Tin Roof Hymn (tape cover)", 197, { read: sunoRead(72.4, "D minor", ["lo-fi hip hop"], ["calm"], "Tape-warped rhodes and brushed drums at a walking pace. No vocal.") }),
          { take: 2, state: "failed", error: "Suno refused the cover: the upload was screened as a copyrighted recording." },
        ],
      },
      {
        n: 2,
        at: minutesAgo(95),
        jobId: coverSunoJobId("cov-0000000000b3", 2),
        state: "done",
        plan: sunoPlan("lo-fi hip hop, tape-saturated rhodes, brushed drums, upright bass, 72 bpm, wide reverb", "", { controls: { weirdness: 0.25, variety: 1 } }),
        creditsSpent: 10,
        takes: heard("0000000000b3", 2, [{ read: sunoRead(73.1, "D minor", ["lo-fi hip hop", "ambient"], ["calm", "nocturnal"], "Rhodes and upright bass under a long reverb tail, brushes keeping time; slower than the source and more open.") }, { read: sunoRead(72.0, "D minor", ["lo-fi hip hop"], ["warm"], "A close, dry mix of the same changes with a muted trumpet answering the rhodes.") }], ["Tin Roof Hymn (wide cover)", "Tin Roof Hymn (muted cover)"]),
      },
    ],
    filed: { send: 2, take: 2, clipId: clip("0000000000b3", 2, 2) },
  };
  return [
    { ...song({ id: "0000000000b1", title: "Salt Road", ago: 4 * DAY, lenS: 191, rights: "own", section: [0, 191] }), ...STYLED, ...picked, jobId: "job:cover:cov-0000000000b1", suno: sending },
    { ...song({ id: "0000000000b2", title: "Glass Orchard", ago: 4 * DAY + 2 * HOUR, lenS: 204, rights: "third-party-uncleared", holder: "Harbour Sound Records", section: [0, 204] }), ...STYLED, lyrics, ...picked, jobId: "job:cover:cov-0000000000b2", suno: covered },
    {
      ...song({ id: "0000000000b3", title: "Tin Roof Hymn", ago: 5 * DAY, lenS: 197, rights: "licensed", holder: "Mercury Records", note: "sync licence ML-2026-0412", section: [0, 197] }),
      ...STYLED,
      ...picked,
      jobId: "job:cover:cov-0000000000b3",
      remix: { file: "remix.mp3", mime: "audio/mpeg", name: "tin-roof-hymn-wide-cover.mp3", style: "lo-fi hip hop, tape-saturated rhodes, brushed drums, upright bass, 72 bpm, wide reverb", sunoClipId: clip("0000000000b3", 2, 2) },
      suno: filed,
    },
  ];
}

/** The send's receipt as lib/producers/coverSuno.ts draws it: the upload and the two reads free, the two covers unpriced
 *  (Suno bills song credits, not dollars). */
export function sunoReceipt(plan: CoverSunoPlan, salt: number): Receipt {
  const now = Date.UTC(2026, 10, 10, 20, 0);
  const iso = (s: number): string => new Date(now + s * 1000).toISOString();
  const line = (key: string, label: string, from: number, seconds: number, priced: boolean) =>
    ({
      key,
      label,
      lane: "cloud.suno",
      provider: "suno",
      model: key.startsWith("cover") ? plan.model : key.startsWith("read") ? "analysis + listen" : "upload",
      units: 1,
      seconds,
      usd: priced ? 0 : null,
      ...(priced ? {} : { unpricedReason: "Suno song credits: about 5 credits a song, measured on a create" }),
      src: "illustrative",
      queuePos: 1 + salt,
      start: iso(from),
      end: iso(from + seconds),
    }) as const;
  const lines = [line("upload", "upload", 0, 20, true), line("cover-1", "cover-1", 20, 120, false), line("cover-2", "cover-2", 140, 120, false), line("read-1", "read-1", 260, 30, true), line("read-2", "read-2", 290, 30, true)];
  const seconds = lines.reduce((a, l) => a + l.seconds, 0);
  return { token: `fx-suno-${plan.id}-${plan.model}-${salt}`, subject: { kind: "run", lane: "audio" }, mode: "dry", lines, totals: { seconds, usd: 0, unpriced: 2, src: "illustrative" }, queuePos: 1 + salt, etaAt: iso(seconds + salt * 60), overCeiling: false, readAt: iso(0) };
}

/** What the fixture's Suno send does between two re-reads: queued, then running with the upload done, then a take
 *  at a time, then both reads and done. */
export function sunoWalk(r: CoverRecord): CoverRecord {
  const suno = r.suno;
  if (suno === undefined) return r;
  const sends = suno.sends.map((x): CoverSunoSend => {
    if (x.state === "queued") return { ...x, state: "running", takes: [{ take: 1, state: "pending" }, { take: 2, state: "pending" }] };
    if (x.state !== "running") return x;
    const t = (n: 1 | 2): CoverSunoTake | undefined => x.takes.find((k) => k.take === n);
    if (t(1)?.state !== "complete") return { ...x, takes: [doneTake(r.id.slice(4), x.n, 1, `${r.title} (cover 1)`, 192), t(2) ?? { take: 2, state: "pending" }] };
    if (t(2)?.state !== "complete") return { ...x, takes: [t(1) as CoverSunoTake, doneTake(r.id.slice(4), x.n, 2, `${r.title} (cover 2)`, 207)] };
    const read = (bpm: number, mood: string): Pick<CoverSunoTake, "read"> => ({ read: sunoRead(bpm, "F minor", ["lo-fi hip hop"], [mood], `A dusty cover of ${r.title}: soft rhodes, swung drums, a warm bass underneath.`) });
    return { ...x, state: "done", creditsSpent: 10, takes: x.takes.map((k) => ({ ...k, ...read(k.take === 1 ? 92 : 90.5, k.take === 1 ? "warm" : "wistful") })) };
  });
  const uploadClipId = suno.uploadClipId ?? `fx-up-${r.id.slice(4)}`;
  return { ...r, suno: { ...suno, uploadClipId, sends } };
}

/** The send a confirm queues: the plan as the form made it, no takes yet. */
export function sunoQueued(r: CoverRecord, plan: CoverSunoPlan, at: string): CoverRecord {
  const { id: _id, ...asked } = plan;
  const n = (r.suno?.sends.length ?? 0) + 1;
  const send: CoverSunoSend = { n, at, jobId: coverSunoJobId(r.id, n), state: "queued", plan: asked, takes: [] };
  return { ...r, suno: { ...r.suno, sends: [...(r.suno?.sends ?? []), send] } };
}

/** A take filed as the remix, as the fixture's confirmed keep writes it. */
export function sunoFiled(r: CoverRecord, send: number, take: 1 | 2): CoverRecord {
  const s = r.suno?.sends.find((x) => x.n === send);
  const t = s?.takes.find((x) => x.take === take);
  if (r.suno === undefined || s === undefined || t?.clipId === undefined) return r;
  const name = `${(t.title ?? `take ${take}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.mp3`;
  return { ...r, remix: { file: "remix.mp3", mime: "audio/mpeg", name, style: s.plan.style, sunoClipId: t.clipId }, suno: { ...r.suno, filed: { send, take, clipId: t.clipId } } };
}

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
