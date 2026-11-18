// THE /reels FIXTURE UNIVERSE: ten reels, one per film stage, titled from the 2026-11 night set. The stills are real
// frames of those films (public/fixtures/reels/<slug>/, 240 px strips and a 480 px poster); the two players share one
// pair of short clips cut from Towers of Light on ONE timeline - desktop 40-46 s at 1x, phone 20-23 s (the same
// moments at 2x) - so the linked players can be judged against frames that really line up. A record's own lengths
// and sizes are the night's measured ones; the clips are only a few seconds of them.
//
// Not flattered: a render is caught mid-face, a redo carries pinned notes, a release has VMAF under its mean, a table
// fails a continuity floor, a reel was dropped.
import type { FilmStage } from "@/lib/reel/film";
import type { ReelPin } from "@/lib/reel/store";
import type { FilmFace, FilmRecord } from "@/lib/reel/types";

import { REEL_REASONS } from "./reasons.ts";
import type { ReelDetail, ReelVerdictView } from "./types.ts";

const ROOT = "/fixtures/reels";
const strip = (slug: string, face: "d" | "p" = "d"): string[] => Array.from({ length: 12 }, (_, i) => `${ROOT}/${slug}/${face}-${String(i).padStart(2, "0")}.jpg`);
const sha = (seed: string): string => seed.repeat(64).slice(0, 64);

const SOURCE = { name: "Our World in Data", url: "https://ourworldindata.org", licence: "CC BY 4.0", fetchedAt: "2026-11-12" };

/** A rendered film's record, lengths and sizes as the night measured them. */
function film(o: { desktop: [number, number]; phone: [number, number]; seed: string; bed?: boolean; copies?: { desktop: [number, number, number]; phone: [number, number, number] }; imported?: boolean }): FilmRecord {
  const at = "2026-11-17T23:40:00Z";
  const render = (face: FilmFace, [seconds, bytes]: [number, number]) => ({ file: face === "desktop" ? "film-desktop.mp4" : "film-phone.mp4", frames: seconds * 30, seconds, bytes, sha: sha(`${o.seed}${face[0]}`), renderedAt: at });
  const copy = (face: FilmFace, [bytes, mean, min]: [number, number, number], seconds: number) => ({
    file: face === "desktop" ? "release-desktop.mp4" : "release-phone.mp4",
    seconds,
    bytes,
    sha: sha(`${o.seed}r${face[0]}`),
    encodedAt: "2026-11-18T09:12:00Z",
    bedSha: sha(`${o.seed}b`),
    vmaf: { mean, min },
  });
  return {
    frames: o.desktop[0] * 30,
    renders: { desktop: render("desktop", o.desktop), phone: render("phone", o.phone) },
    ...(o.bed === true ? { bed: { file: "bed.mp3", seconds: o.desktop[0] + 8, sha: sha(`${o.seed}b`), lufs: -13.8, prompt: { style: "slow analog synth pulse, tape hiss, rising strings, no vocals", model: "v5.5", title: "Low Tide Ledger" }, attachedAt: "2026-11-18T08:50:00Z" } } : {}),
    copies: o.copies === undefined ? {} : { desktop: copy("desktop", o.copies.desktop, o.desktop[0]), phone: copy("phone", o.copies.phone, o.phone[0]) },
    ...(o.imported === true ? { imported: { from: "scratchpad/r3/winners", at: "2026-11-18T07:00:00Z" } } : {}),
  };
}

const verdict = (v: ReelVerdictView["verdict"], at: string, round: number, current: boolean, reasons: string[] = [], more: { note?: string; pins?: ReelPin[] } = {}): ReelVerdictView => ({ verdict: v, reasons, at, round, current, ...more });

type Seed = Omit<ReelDetail, "reasons" | "jobs" | "verdicts" | "media" | "strip"> & Partial<Pick<ReelDetail, "jobs" | "verdicts" | "media" | "strip">>;

const reel = (s: Seed): ReelDetail => ({ jobs: [], verdicts: {}, media: {}, strip: [], ...s, reasons: REEL_REASONS });

/** The players' clips: one timeline, both faces (see the header). */
const CLIPS = { desktop: `${ROOT}/film-desktop.mp4`, phone: `${ROOT}/film-phone.mp4`, posterDesktop: `${ROOT}/film-desktop.jpg`, posterPhone: `${ROOT}/film-phone.jpg` } as const;

const REDO_PINS: ReelPin[] = [
  { t: 1.2, reasons: ["legibility"], text: "Country names under 28 px at the turn; the tail of the list is unreadable on a phone." },
  { t: 3.4, reasons: ["motion", "pacing"], text: "The note flies in and out inside a second. Hold it." },
  { t: 5.1, reasons: ["accuracy"], text: "1987 label sits on the 1986 bar." },
];

export const FIXTURE_REELS: readonly ReelDetail[] = [
  reel({
    slug: "the-medal-table",
    title: "The Medal Table",
    hook: "Which nation owns the summer?",
    stage: "idea",
    idea: { title: "The Medal Table", hook: "Which nation owns the summer?", path: "1896 Athens to 2024 Paris: the US, the Soviet bloc, then China's climb after 1984" },
    updatedAt: "2026-11-18T10:02:00Z",
  }),
  reel({
    slug: "long-lives",
    title: "Long Lives",
    hook: "Where do people live longest?",
    stage: "data",
    idea: { title: "Long Lives", hook: "Where do people live longest?", path: "Norway, then Iceland, then Japan from 1983: the lead passes three times in a century" },
    table: { unit: "years", granularity: "year", periods: 74, entities: 38, source: SOURCE, continuity: { ok: false, steps: 74, leadChanges: 3, movements: 11, events: 6, failures: ["11 overtakes in the top 10; the floor is 15"] } },
    jobs: [{ kind: "reel-data", jobId: "job:reel-data:long-lives:1", state: "done" }],
    updatedAt: "2026-11-18T09:31:00Z",
  }),
  reel({
    slug: "warming-stripes",
    title: "Warming Stripes",
    hook: "How fast did the world warm?",
    stage: "authoring",
    idea: { title: "Warming Stripes", hook: "How fast did the world warm?", path: "1880 to 2025, every country's anomaly; the line crosses +1 °C in 2015" },
    table: { unit: "°C", granularity: "year", periods: 146, entities: 24, source: SOURCE, continuity: { ok: true, steps: 146, leadChanges: 9, movements: 41, events: 8, failures: [] } },
    jobs: [{ kind: "reel-author", jobId: "job:reel-author:warming-stripes:1", state: "running" }],
    updatedAt: "2026-11-18T10:20:00Z",
  }),
  reel({
    slug: "chess-ratings",
    title: "Chess Ratings",
    hook: "Who held the crown longest?",
    stage: "rendering",
    idea: { title: "Chess Ratings", hook: "Who held the crown longest?", path: "Fischer's 1972 peak, Kasparov's twenty years, Carlsen from 2011" },
    table: { unit: "Elo", granularity: "month", periods: 620, entities: 30, source: { name: "FIDE rating lists", url: "https://ratings.fide.com", licence: "FIDE public lists", fetchedAt: "2026-11-15" }, continuity: { ok: true, steps: 620, leadChanges: 6, movements: 88, events: 9, failures: [] } },
    jobs: [{ kind: "reel-render", jobId: "job:reel-render:chess-ratings:1", state: "running", progress: { face: "desktop", frame: 1840, frames: 3000 } }],
    progress: { face: "desktop", frame: 1840, frames: 3000 },
    updatedAt: "2026-11-18T10:41:00Z",
  }),
  reel({
    slug: "towers-of-light",
    title: "Towers of Light",
    hook: "Which city reached highest?",
    stage: "review",
    idea: { title: "Towers of Light", hook: "Which city reached highest?", path: "New York holds 1931-1998, Kuala Lumpur and Taipei take turns, Dubai since 2010" },
    table: { unit: "m", granularity: "year", periods: 96, entities: 22, source: { name: "CTBUH Skyscraper Center", url: "https://www.skyscrapercenter.com", licence: "facts, cited", fetchedAt: "2026-11-10" }, continuity: { ok: true, steps: 96, leadChanges: 5, movements: 23, events: 7, failures: [] } },
    film: film({ desktop: [96, 235_565_629], phone: [48, 118_204_112], seed: "7a", imported: true }),
    media: { ...CLIPS, phoneStrip: strip("towers-of-light", "p") },
    strip: strip("towers-of-light"),
    poster: `${ROOT}/towers-of-light/poster.jpg`,
    seconds: { desktop: 96, phone: 48 },
    bytes: { desktop: 235_565_629, phone: 118_204_112 },
    verdicts: { film: verdict("reject", "2026-11-18T08:05:00Z", 1, false, ["legibility", "pacing"], { note: "Second half reads as a list.", pins: REDO_PINS.slice(0, 2) }) },
    last: { stop: "film", verdict: "reject", at: "2026-11-18T08:05:00Z" },
    subjectSha: { film: sha("7a7b") },
    updatedAt: "2026-11-18T09:58:00Z",
  }),
  reel({
    slug: "legal-tender",
    title: "Legal Tender",
    hook: "Which currency held its worth?",
    stage: "redo",
    idea: { title: "Legal Tender", hook: "Which currency held its worth?", path: "The Swiss franc against the dollar, the lira's fall, the euro's arrival in 1999" },
    film: film({ desktop: [120, 369_835_536], phone: [60, 182_110_402], seed: "c3", imported: true }),
    media: CLIPS,
    strip: strip("legal-tender"),
    poster: `${ROOT}/legal-tender/poster.jpg`,
    seconds: { desktop: 120, phone: 60 },
    bytes: { desktop: 369_835_536, phone: 182_110_402 },
    verdicts: { film: verdict("reject", "2026-11-18T09:40:00Z", 1, true, ["legibility", "accuracy"], { pins: REDO_PINS }) },
    last: { stop: "film", verdict: "reject", at: "2026-11-18T09:40:00Z" },
    subjectSha: { film: sha("c3c4") },
    updatedAt: "2026-11-18T09:40:00Z",
  }),
  reel({
    slug: "grand-prix-lithograph",
    title: "Grand Prix Lithograph",
    hook: "Who won the most races?",
    stage: "sound",
    idea: { title: "Grand Prix Lithograph", hook: "Who won the most races?", path: "Fangio's 1950s, Prost and Senna, Schumacher's 91, Hamilton passing him in 2020" },
    film: film({ desktop: [100, 99_038_004], phone: [50, 51_877_310], seed: "e1", imported: true }),
    media: CLIPS,
    strip: strip("grand-prix-lithograph"),
    poster: `${ROOT}/grand-prix-lithograph/poster.jpg`,
    seconds: { desktop: 100, phone: 50 },
    bytes: { desktop: 99_038_004, phone: 51_877_310 },
    verdicts: { film: verdict("keep", "2026-11-18T08:30:00Z", 1, true) },
    last: { stop: "film", verdict: "keep", at: "2026-11-18T08:30:00Z" },
    subjectSha: { film: sha("e1e2") },
    updatedAt: "2026-11-18T08:30:00Z",
  }),
  reel({
    slug: "sun-and-wind",
    title: "Sun and Wind",
    hook: "Who builds clean power fastest?",
    stage: "release",
    idea: { title: "Sun and Wind", hook: "Who builds clean power fastest?", path: "Germany's early lead, the US in wind, China passing both after 2013" },
    film: film({ desktop: [90, 720_338_975], phone: [45, 361_004_219], seed: "5d", bed: true, copies: { desktop: [49_310_220, 93.7, 87.0], phone: [29_402_118, 91.2, 82.4] } }),
    media: { ...CLIPS, mixDesktop: CLIPS.desktop, mixPhone: CLIPS.phone, releaseDesktop: CLIPS.desktop, releasePhone: CLIPS.phone },
    bedPrompt: { style: "slow analog synth pulse, tape hiss, rising strings, no vocals", model: "v5.5", title: "Low Tide Ledger" },
    publish: { title: "Who builds clean power fastest? 2000-2025", description: "Solar and wind capacity by country, 2000-2025. Source: Ember, CC BY 4.0.", tags: ["data", "energy", "solar", "wind"] },
    strip: strip("sun-and-wind"),
    poster: `${ROOT}/sun-and-wind/poster.jpg`,
    seconds: { desktop: 90, phone: 45 },
    bytes: { desktop: 49_310_220, phone: 29_402_118 },
    verdicts: { film: verdict("keep", "2026-11-18T07:55:00Z", 1, true) },
    last: { stop: "film", verdict: "keep", at: "2026-11-18T07:55:00Z" },
    jobs: [{ kind: "reel-release", jobId: "job:reel-release:sun-and-wind:1", state: "done" }],
    subjectSha: { film: sha("5d5e"), release: sha("5f60") },
    updatedAt: "2026-11-18T09:12:00Z",
  }),
  reel({
    slug: "the-strait",
    title: "The Strait",
    hook: "Whose ships pass Hormuz?",
    stage: "released",
    idea: { title: "The Strait", hook: "Whose ships pass Hormuz?", path: "Tanker transits by flag, 2017-2026: Liberia, the Marshall Islands and Panama trade places" },
    film: film({ desktop: [100, 743_115_318], phone: [50, 371_559_201], seed: "9b", bed: true, copies: { desktop: [49_302_998, 93.7, 87.0], phone: [28_870_411, 92.4, 85.1] } }),
    media: { ...CLIPS, releaseDesktop: CLIPS.desktop, releasePhone: CLIPS.phone },
    strip: strip("the-strait"),
    poster: `${ROOT}/the-strait/poster.jpg`,
    seconds: { desktop: 100, phone: 50 },
    bytes: { desktop: 49_302_998, phone: 28_870_411 },
    verdicts: { film: verdict("keep", "2026-11-17T22:10:00Z", 1, true), release: verdict("keep", "2026-11-18T06:45:00Z", 1, true) },
    last: { stop: "release", verdict: "keep", at: "2026-11-18T06:45:00Z" },
    subjectSha: { film: sha("9b9c"), release: sha("9d9e") },
    updatedAt: "2026-11-18T06:45:00Z",
  }),
  reel({
    slug: "empires",
    title: "Empires",
    hook: "Which empire was largest?",
    stage: "dropped",
    idea: { title: "Empires", hook: "Which empire was largest?", path: "Rome, the Mongols, the British Empire's 1920 peak" },
    film: film({ desktop: [120, 43_747_433], phone: [60, 22_018_870], seed: "4e", imported: true }),
    media: CLIPS,
    strip: strip("empires"),
    poster: `${ROOT}/empires/poster.jpg`,
    seconds: { desktop: 120, phone: 60 },
    bytes: { desktop: 43_747_433, phone: 22_018_870 },
    verdicts: { film: verdict("drop", "2026-11-18T07:20:00Z", 1, true, ["accuracy"], { note: "Borders before 1500 are guesses; no source holds them." }) },
    last: { stop: "film", verdict: "drop", at: "2026-11-18T07:20:00Z" },
    subjectSha: { film: sha("4e4f") },
    updatedAt: "2026-11-18T07:20:00Z",
  }),
];

/** Every stage the fixture covers, so a test can say none is missing. */
export const FIXTURE_STAGES: readonly FilmStage[] = FIXTURE_REELS.map((r) => r.stage);
