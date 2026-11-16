// THE RELEASE TAB'S FIXTURE (spark audio-distribution, S1): the owner's own record - MiSu, "Misu Vol 2",
// Suno-generated - as three releases at three points of the flow, plus a shelf of kept takes. Each
// release exercises a different slice of `releaseProblems`: the single is a draft with blocks
// (persona unstated, no sleeve) and rights warnings; the EP is ready (warnings only); the album is
// scheduled. Sleeves are frames of the owner's music videos (public/release-fixture/, 640 px
// previews of the files the record describes). Audio on the fixture: the two tracks the master trial
// rendered excerpts for carry hrefs; the rest are silent (null), which every layout must draw.
import type { ChannelRow, MasterRef, Release, ReleaseTrack, RightsRecord, ShelfTake } from "@gt/domain/release";

import type { ReleasePort, ReleaseRead } from "./port.ts";

const ARTIST = "MiSu";
const FIX = "/release-fixture";

const slugOf = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const SHELF_TITLES: readonly [string, number, number, number][] = [
  // title, duration s, measured LUFS, true peak dBTP (illustrative, not arithmetic)
  ["Dancing in the Static", 283, -8.9, 0.4],
  ["Past the Sleeping Moons", 284, -9.6, -0.2],
  ["Leave the Door Unlatched", 203, -10.4, -0.6],
  ["I Kept the Key", 180, -9.1, 0.1],
  ["Stay Here", 285, -8.4, 0.6],
  ["Room Enough", 259, -10.9, -0.9],
  ["The Cup Stays Blue", 235, -9.8, -0.3],
  ["Leave a Little Room", 215, -11.2, -1.1],
  ["Brisk Gallop", 149, -9.3, 0.2],
  ["Pattern Crawls", 201, -12.4, -1.6],
  ["Keep the Window Cracked", 265, -9.0, 0.3],
  ["Bass Motif Settles", 221, -10.1, -0.4],
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

const NONE: MasterRef = { state: "none", recipe: null, takeId: null, audioHref: null, before: null, after: null, error: null };

function mastered(title: string, lufs: number, truePeakDb: number): MasterRef {
  return {
    state: "done",
    recipe: "uni-1",
    takeId: `${takeIdOf(title)}-uni-1`,
    audioHref: audioOf(title, "uni-1"),
    before: { lufs, truePeakDb, lra: 5.8 },
    after: { lufs: -14.0, truePeakDb: -1.1, lra: 5.2 },
    error: null,
  };
}

function track(title: string, opts: { master: boolean; tier: string | null; persona: "human" | "ai" | null; writers?: string[] }): ReleaseTrack {
  const row = SHELF_TITLES.find((r) => r[0] === title);
  if (row === undefined) throw new Error(`fixture: ${title} is not on the shelf`);
  const [, durationS, lufs, truePeakDb] = row;
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
    master: opts.master ? mastered(title, lufs, truePeakDb) : NONE,
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
