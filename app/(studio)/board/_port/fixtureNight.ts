import "server-only";

// A WHOLE CHANNEL NIGHT'S PACKET, as the scout adapter draws night 2026-11-16 (lib/decision/v1/sources/scoutPlan.ts
// build, measured 2026-11-20 over a copy of that night): three found scenes (replicas and a clip under `videos`), a
// finding under `notes`, storyboards of five frames and their words, three real-data reels whose 8 s strip is an mp4
// under `reels` (the images tab), two full reel cuts under `reel cuts`, and the night's losses verbatim. Every output
// kind the verdict pass and the KindsBar must name is here, over the media public/ ships.
import type { Seed, SeedItem } from "./fixtureData.ts";

const PLATES = ["blueprint", "chalk-argument", "data-neon", "newsprint-cutout", "paper-relief", "signal-ledger"] as const;
const plate = (i: number): string => `/presets/${PLATES[i % PLATES.length] ?? "blueprint"}.jpg`;
const clip = (i: number): string => `/clips/presets/${PLATES[i % PLATES.length] ?? "blueprint"}.webm`;

const BOARDS = [
  ["c-01", "The Pour", "F1"],
  ["c-02", "White Since 1840", "F2"],
  ["c-05", "The Puddle's Job", "K1"],
  ["c-09", "The Jam Sculpture", "S1"],
] as const;
const REELS = [
  ["c-13", "Fastest trains: top scheduled service"],
  ["c-14", "Boycott years: Summer Olympic medals"],
  ["c-15", "What if electric light never replaced gas"],
] as const;
const CUTS = [
  ["c-17", "Car country: vehicle production, 1900-2020"],
  ["c-18", "What if the 1906 earthquake never hit"],
] as const;

const items: SeedItem[] = [
  ...["c-21", "c-24"].flatMap((c, k) => [
    { id: `${c}/replica-1`, row: c, url: plate(k), mime: "image/jpeg" },
    { id: `${c}/replica-2`, row: c, url: plate(k + 1), mime: "image/jpeg" },
    { id: `${c}/clip`, row: c, url: clip(k), mime: "video/webm" },
  ]),
  { id: "c-23/text", row: "c-23", url: "", mime: "text/plain" },
  ...BOARDS.flatMap(([c], k) => [
    ...[0, 1, 2, 3, 4].map((p) => ({ id: `${c}/panel-${p + 1}`, row: c, url: plate(k + p), mime: "image/jpeg" })),
    { id: `${c}/words`, row: c, url: "", mime: "text/plain" },
  ]),
  ...REELS.map(([c], k) => ({ id: `${c}/reel`, row: c, url: clip(k + 2), mime: "video/webm" })),
  ...CUTS.map(([c], k) => ({ id: `${c}/video`, row: c, url: clip(k + 4), mime: "video/webm" })),
];

export function channelNight(): Seed {
  const words: Record<string, { label: string; meta?: string; prompt?: string }> = {
    "c-23/text": { label: "Cut on the beat the eye expects, not the one the music gives", meta: "short-form-clip · 02-frames", prompt: "\"the cut lands a frame early and the viewer feels it as speed\"" },
  };
  for (const c of ["c-21", "c-24"]) {
    words[`${c}/replica-1`] = { label: "replica 1", meta: "replica · local · free" };
    words[`${c}/replica-2`] = { label: "replica 2", meta: "replica · local · free" };
    words[`${c}/clip`] = { label: "clip · replica-1", meta: "5s · local · free" };
  }
  for (const [c, title] of BOARDS) {
    for (const p of [1, 2, 3, 4, 5]) words[`${c}/panel-${p}`] = { label: `frame ${p}`, meta: "codex · seat" };
    words[`${c}/words`] = { label: title, prompt: `${title}: five beats, one frame each.\n\n- 60 s vertical\n- view grade: Reconstructed` };
  }
  for (const [c, title] of REELS) words[`${c}/reel`] = { label: title, meta: "table · Our World in Data · 6 beats" };
  for (const [c, title] of CUTS) words[`${c}/video`] = { label: title, meta: `reel ${c} · 60s` };
  return {
    id: "pkt:scout:2026-11-16",
    lane: "image",
    source: "scout",
    mode: "matrix-cull",
    title: "scout 2026-11-16",
    runId: "2026-11-16",
    items,
    imported: [],
    present: {
      items: words,
      rows: [
        { id: "c-21", label: "medium · eye-level", group: "videos", ref: plate(3) },
        { id: "c-24", label: "wide · eye-level straight-on wide shot", group: "videos", ref: plate(4) },
        { id: "c-23", label: "finding · short-form-clip", group: "notes" },
        ...BOARDS.map(([c, title, ch]) => ({ id: c, label: title, group: "storyboards", channel: ch, prompt: `${title}: five beats, one frame each.` })),
        ...REELS.map(([c, title], k) => ({ id: c, label: title, group: "reels", poster: plate(k) })),
        ...CUTS.map(([c, title]) => ({ id: c, label: title, group: "reel cuts" })),
      ],
      losses: [
        { candidate: "c-22", grade: "dropped", reason: "No extract run called 2026-11-16-jointed-translucent-hide-figures." },
        { candidate: "c-19", grade: "dropped", reason: "c-19 keyframe 1/1: the scene recipe names \"casting\" (the source's title or channel): craft, not content" },
        { candidate: "c-16", grade: "dropped", reason: "page.evaluate: Target page, context or browser has been closed" },
      ],
      oracle: { passed: true, summary: "22 candidates · 3 failed · stopped: deadline", fixture: true },
      meta: "scout · 5 sources",
    },
  };
}
