// THE RELEASE TAB'S FIXTURE (spark audio-distribution, S1): the owner's own record - MiSu, "Misu Vol 2",
// Suno-generated - as three releases at three points of the flow, plus a shelf of kept takes. Each
// release exercises a different slice of `releaseProblems`: the single is a draft with blocks
// (persona unstated, no sleeve) and rights warnings; the EP is ready (warnings only); the album is
// scheduled. Sleeves are frames of the owner's music videos (public/release-fixture/, 640 px
// previews of the files the record describes). Audio on the fixture: the two tracks the master trial
// rendered excerpts for carry hrefs; the rest are silent (null), which every layout must draw. The
// excerpts are gitignored audio (*.mp3): they exist only where they were cut from the trial (ffmpeg -ss 60 -t 30
// over the source and its uni-1 master), so on any other checkout those two play the missing-audio state too.
import type { ChannelRow, MasterRef, Release, ReleaseTrack, RightsRecord, ShelfTake } from "@gt/domain/release";

import type { ReleasePort, ReleaseRead } from "./port.ts";

const ARTIST = "MiSu";
const FIX = "/release-fixture";

const slugOf = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const SHELF_TITLES: readonly [string, number, number, number][] = [
  // title, duration s, LUFS, true peak dBTP - measured on the owner's WAVs by the uni-1 trial, 2026-11-16
  ["Dancing in the Static", 282, -14.88, -3.09],
  ["Past the Sleeping Moons", 283, -15.59, -3.47],
  ["Leave the Door Unlatched", 202, -15.04, -3.13],
  ["I Kept the Key", 180, -15.04, -3.47],
  ["Stay Here", 284, -14.94, -3.98],
  ["Room Enough", 258, -15.78, -3.29],
  ["The Cup Stays Blue", 234, -16.23, -5.04],
  ["Leave a Little Room", 214, -16, -5.22],
  ["Brisk Gallop", 148, -14.96, -2.99],
  ["Pattern Crawls", 200, -14.9, -3.18],
  ["Keep the Window Cracked", 263, -15.56, -3.59],
  ["Bass Motif Settles", 220, -15.72, -3.75],
];

const takeIdOf = (title: string) => `take-misu-${slugOf(title)}`;

/** The two excerpts the trial rendered for the fixture (original + uni-1 master, 30 s each). */
const WITH_AUDIO = new Set(["Dancing in the Static", "Past the Sleeping Moons"]);
const audioOf = (title: string, kind: "orig" | "uni-1") => (WITH_AUDIO.has(title) ? `${FIX}/${slugOf(title)}.${kind}.mp3` : null);

const shelf: ShelfTake[] = SHELF_TITLES.map(([title, durationS, lufs, truePeakDb]) => ({
  takeId: takeIdOf(title),
  title,
  durationS,
  audioHref: audioOf(title, "orig"),
  provider: "suno",
  label: null,
  lufs,
  truePeakDb,
}));

const suno = (planTier: string | null): RightsRecord => ({
  vendor: "suno",
  model: "v5",
  planTier,
  generatedAt: "2026-11-03",
  briefDigest: "sha256:9f2c41d07ab3e5c8",
  reference: null,
  licence: planTier === null ? "unknown" : "commercial",
});

/** uni-1's trial on the owner's WAVs (foundry-out/master-trials/2026-11-16-uni-1/trial.json), re-measured on the written files. */
const TRIAL: Readonly<Record<string, Pick<MasterRef, "before" | "after">>> = {
  "Bass Motif Settles": { before: { lufs: -15.72, truePeakDb: -3.75, lra: 5.21 }, after: { lufs: -14, truePeakDb: -1.45, lra: 3.84 } },
  "Brisk Gallop": { before: { lufs: -14.96, truePeakDb: -2.99, lra: 3.24 }, after: { lufs: -14, truePeakDb: -1.38, lra: 2.34 } },
  "Dancing in the Static": { before: { lufs: -14.88, truePeakDb: -3.09, lra: 12.45 }, after: { lufs: -14, truePeakDb: -1.49, lra: 9.74 } },
  "I Kept the Key": { before: { lufs: -15.04, truePeakDb: -3.47, lra: 8.07 }, after: { lufs: -14, truePeakDb: -1.3, lra: 6.38 } },
  "Just As You Are": { before: { lufs: -16, truePeakDb: -4.45, lra: 4.74 }, after: { lufs: -14, truePeakDb: -1.3, lra: 2.86 } },
  "Keep the Window Cracked": { before: { lufs: -15.56, truePeakDb: -3.59, lra: 8.05 }, after: { lufs: -14, truePeakDb: -1.3, lra: 5.93 } },
  "Leave a Little Room": { before: { lufs: -16, truePeakDb: -5.22, lra: 3.63 }, after: { lufs: -14, truePeakDb: -2.09, lra: 2.4 } },
  "Leave the Door Unlatched": { before: { lufs: -15.04, truePeakDb: -3.13, lra: 7.88 }, after: { lufs: -14, truePeakDb: -1.3, lra: 5.42 } },
  "Past the Sleeping Moons": { before: { lufs: -15.59, truePeakDb: -3.47, lra: 6.63 }, after: { lufs: -14, truePeakDb: -1.3, lra: 4.11 } },
  "Pattern Crawls": { before: { lufs: -14.9, truePeakDb: -3.18, lra: 5.32 }, after: { lufs: -14, truePeakDb: -1.84, lra: 2.62 } },
  "Room Enough": { before: { lufs: -15.78, truePeakDb: -3.29, lra: 10.93 }, after: { lufs: -14, truePeakDb: -1.3, lra: 8.68 } },
  "Stay Here": { before: { lufs: -14.94, truePeakDb: -3.98, lra: 6.63 }, after: { lufs: -14, truePeakDb: -2.18, lra: 4.03 } },
  "Take It Slow — Elastic Bass Solo": { before: { lufs: -15.85, truePeakDb: -4.71, lra: 4.19 }, after: { lufs: -14, truePeakDb: -2.87, lra: 2.59 } },
  "The Cup Stays Blue": { before: { lufs: -16.23, truePeakDb: -5.04, lra: 6.26 }, after: { lufs: -14, truePeakDb: -2.01, lra: 4.39 } },
  "The Morning Finds the Doors": { before: { lufs: -15.34, truePeakDb: -3.08, lra: 8.39 }, after: { lufs: -14, truePeakDb: -1.3, lra: 6.15 } },
  "The Pulse Remains": { before: { lufs: -15.52, truePeakDb: -3.97, lra: 4.26 }, after: { lufs: -14, truePeakDb: -2.23, lra: 2.41 } },
  "Walls Learn a Different Shape": { before: { lufs: -16.25, truePeakDb: -5.51, lra: 5.49 }, after: { lufs: -14, truePeakDb: -2.39, lra: 3.68 } },
  "We Choose What Becomes": { before: { lufs: -15.82, truePeakDb: -3.91, lra: 5.32 }, after: { lufs: -14, truePeakDb: -1.3, lra: 4.21 } },
  "When the Circuits Break": { before: { lufs: -15.47, truePeakDb: -2.61, lra: 6.8 }, after: { lufs: -14.01, truePeakDb: -1.3, lra: 4.12 } },
  "When We Are Ready": { before: { lufs: -15.58, truePeakDb: -3.44, lra: 8.28 }, after: { lufs: -14, truePeakDb: -1.3, lra: 5.46 } },
};

const NONE: MasterRef = { state: "none", recipe: null, takeId: null, audioHref: null, before: null, after: null, error: null };

function mastered(title: string): MasterRef {
  const t = TRIAL[title];
  if (t === undefined) throw new Error(`fixture: ${title} was not in the trial`);
  return { state: "done", recipe: "uni-1", takeId: `${takeIdOf(title)}-uni-1`, audioHref: audioOf(title, "uni-1"), before: t.before, after: t.after, error: null };
}

function track(title: string, opts: { master: boolean; tier: string | null; persona: "human" | "ai" | null; writers?: string[] }): ReleaseTrack {
  const row = SHELF_TITLES.find((r) => r[0] === title);
  if (row === undefined) throw new Error(`fixture: ${title} is not on the shelf`);
  const [, durationS] = row;
  return {
    takeId: takeIdOf(title),
    title,
    version: null,
    isrc: null,
    explicit: false,
    lyrics: null,
    durationS,
    audioHref: audioOf(title, "orig"),
    songwriters: opts.writers ?? ["Jane Doe"],
    credits: [{ name: ARTIST, role: "performer" }],
    ai: { lyrics: false, music: true, audio: "all", persona: opts.persona },
    rights: suno(opts.tier),
    master: opts.master ? mastered(title) : NONE,
  };
}

const releases: Release[] = [
  {
    id: "rel-0000000000a1",
    title: "Dancing in the Static",
    version: null,
    artist: ARTIST,
    label: null,
    releaseDate: null,
    language: "en",
    genre: { primary: "Electronic", secondary: null },
    upc: null,
    tracks: [track("Dancing in the Static", { master: true, tier: null, persona: null })],
    sleeve: null,
    channels: ["youtube", "audius"],
    splits: [],
    status: "draft",
  },
  {
    id: "rel-0000000000b2",
    title: "Misu Vol. 2",
    version: null,
    artist: ARTIST,
    label: "Gravitone",
    releaseDate: "2026-12-05",
    language: "en",
    genre: { primary: "Pop", secondary: "Electronic" },
    upc: null,
    tracks: ["Past the Sleeping Moons", "Leave the Door Unlatched", "I Kept the Key", "Room Enough", "Leave a Little Room"].map((t, i) =>
      track(t, { master: i !== 4, tier: "Pro", persona: "ai", writers: i === 2 ? ["Doe"] : ["Jane Doe"] }),
    ),
    sleeve: { source: "mv-look", href: `${FIX}/past-the-sleeping-moons.jpg`, widthPx: 3000, heightPx: 3000, rgb: true },
    channels: ["youtube", "soundcloud", "archive"],
    splits: [
      { name: "Jane Doe", share: 70 },
      { name: "Gravitone", share: 30 },
    ],
    status: "ready",
  },
  {
    id: "rel-0000000000c3",
    title: "Room for the Night",
    version: null,
    artist: ARTIST,
    label: "Gravitone",
    releaseDate: "2026-12-19",
    language: "en",
    genre: { primary: "Electronic", secondary: "Ambient" },
    upc: "196872534410",
    tracks: ["Stay Here", "The Cup Stays Blue", "Brisk Gallop", "Pattern Crawls", "Keep the Window Cracked", "Bass Motif Settles", "Leave the Door Unlatched", "I Kept the Key"].map((t) =>
      track(t, { master: true, tier: "Pro", persona: "ai" }),
    ),
    sleeve: { source: "generated", href: `${FIX}/leave-the-door-unlatched.jpg`, widthPx: 3000, heightPx: 3000, rgb: true },
    channels: ["youtube", "soundcloud", "audius", "mixcloud", "archive"],
    splits: [],
    status: "scheduled",
  },
];

const channels: ChannelRow[] = [
  { id: "youtube", kind: "direct", state: "dry", detail: "PUBLISH_MODE=dry: publishing writes a request plan, no upload" },
  { id: "soundcloud", kind: "direct", state: "not-wired", detail: "adapter not built" },
  { id: "audius", kind: "direct", state: "not-wired", detail: "adapter not built" },
  { id: "mixcloud", kind: "direct", state: "not-wired", detail: "adapter not built" },
  { id: "archive", kind: "direct", state: "not-wired", detail: "adapter not built" },
  ...(["spotify", "apple", "amazon", "tidal", "deezer"] as const).map((id): ChannelRow => ({ id, kind: "dsp", state: "not-reachable", detail: "delivery needs a licensed distributor" })),
];

const read: ReleaseRead = {
  source: "fixture",
  artist: ARTIST,
  shelf,
  releases,
  channels,
  mvLooks: ["Dancing in the Static", "Past the Sleeping Moons", "Leave the Door Unlatched", "I Kept the Key"].map((title) => ({
    takeId: takeIdOf(title),
    title,
    href: `${FIX}/${slugOf(title)}.jpg`,
  })),
};

export const fixturePort: ReleasePort = { read: async () => read };
