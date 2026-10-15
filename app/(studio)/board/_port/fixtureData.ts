import "server-only";

// THE FIXTURE PILES - one packet per desk mode and per source the Board must draw, over media
// this repo ships in public/ (the preset plates, the deck art, the preset clips), so the desks
// are photographed and driven against real pixels without a store. Every pile names what v1
// surface it stands in for; the words are the sources' own (reasons from @gt/domain/source).
//
// A take is audio, and the repo ships none, so each take plays one short tone made here
// (`toneWav`): honest about being a fixture, and enough for Space to play something.


import type { MediaLane } from "@gt/domain/lane";
import type { PacketMode, PacketSource } from "@gt/domain/source";
import type { Presentation } from "@gt/ui/board/port";

export type SeedItem = { readonly id: string; readonly row?: string; readonly url: string; readonly mime: string };
export type SeedVerdict = { readonly candidate: string; readonly verdict: "keep" | "reject"; readonly reasons: readonly string[] };

export type Seed = {
  readonly id: string;
  readonly lane: MediaLane;
  readonly source: PacketSource;
  readonly mode: PacketMode;
  readonly title: string;
  readonly runId: string;
  readonly partId?: string;
  readonly committed?: boolean;
  readonly items: readonly SeedItem[];
  /** v1's verdicts at open: imported as the packet's first revision (decision 3). */
  readonly imported: readonly SeedVerdict[];
  /** A blind pair's machine pick per pair, released only after the operator's pick. */
  readonly machine?: Readonly<Record<string, "a" | "b">>;
  readonly present: Presentation;
  /** What the consequence of committing it names, beyond the counts. */
  readonly slug?: string;
};

const PRESETS = ["signal-ledger", "newsprint-cutout", "blueprint", "chalk-argument", "paper-relief", "data-neon"] as const;
const name = (s: string): string => s.replace(/-/g, " ");

/** A 0.6 s 440 Hz tone as a WAV data URL, 8 kHz 8-bit mono: the fixture's one take sound. */
export function toneWav(hz = 440, seconds = 0.6, rate = 8000): string {
  const n = Math.floor(seconds * rate);
  const b = Buffer.alloc(44 + n);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write("data", 36);
  b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = Math.round(128 + 60 * Math.sin((2 * Math.PI * hz * i) / rate) * Math.min(1, (n - i) / 400));
  return `data:audio/wav;base64,${b.toString("base64")}`;
}

const peaks = (seed: number): number[] => Array.from({ length: 48 }, (_, i) => 0.25 + 0.7 * Math.abs(Math.sin(seed * 1.7 + i * 0.41) * Math.cos(i * 0.13 + seed)));

const SCENES = [
  { id: "the-exit", ref: "/deck-art/template-cinematic.webp" },
  { id: "flywheel", ref: "/deck-art/engine-reversal-chain.webp" },
  { id: "peak-and-fall", ref: "/deck-art/template-trailer.webp" },
];

const forgeItems: SeedItem[] = SCENES.flatMap((sc) => PRESETS.slice(0, 4).map((p) => ({ id: `${sc.id}/${p}`, row: sc.id, url: `/presets/${p}.jpg`, mime: "image/jpeg" })));

const DECK = ["discipline-educational", "discipline-free", "discipline-trailer", "engine-adjudication", "engine-derived-short", "template-short-form-clip"];
const AUDIO = ["smeared-transients", "vocal-garble"];

export function seeds(): readonly Seed[] {
  const tone = toneWav();
  return [
    {
      id: "pkt:forge:sweep-01",
      lane: "image",
      source: "forge",
      mode: "matrix-cull",
      title: "Forge sweep-01",
      runId: "sweep-01",
      items: forgeItems,
      imported: [
        { candidate: "the-exit/signal-ledger", verdict: "keep", reasons: [] },
        { candidate: "the-exit/blueprint", verdict: "reject", reasons: ["style"] },
      ],
      present: {
        items: Object.fromEntries(forgeItems.map((it) => [it.id, { label: name(it.id.split("/")[1] ?? it.id), meta: "forge · sdxl" }])),
        rows: SCENES.map((sc) => ({ id: sc.id, label: name(sc.id), ref: sc.ref })),
        oracle: { passed: true, summary: "12 plates · 0 decode errors", digest: "grader 7c1e09", fixture: true },
        meta: "forge · 3 scenes × 4 styles · sweep-01",
      },
    },
    {
      id: "pkt:strips:strips-07",
      lane: "image",
      source: "strips",
      mode: "matrix-cull",
      title: "Strips triage 07",
      runId: "strips-07",
      items: DECK.map((d, i) => ({ id: `poster-${i + 1}`, row: i < 3 ? "concept-a" : "concept-b", url: `/deck-art/${d}.webp`, mime: "image/webp" })),
      imported: [],
      present: {
        items: Object.fromEntries(DECK.map((d, i) => [`poster-${i + 1}`, { label: name(d), meta: "strip" }])),
        rows: [
          { id: "concept-a", label: "concept a", inCatalogue: true },
          { id: "concept-b", label: "concept b", inCatalogue: false },
        ],
        oracle: { passed: true, summary: "6 posters", fixture: true },
        meta: "strips · 2 concepts",
      },
    },
    {
      id: "pkt:dojo:cycle-3",
      lane: "image",
      source: "dojo",
      mode: "blind-pair",
      title: "Dojo cycle 3",
      runId: "cycle-3",
      items: [0, 1, 2].flatMap((i) => [
        { id: `pair-${i + 1}/base`, row: `pair-${i + 1}`, url: `/presets/${PRESETS[i] ?? "blueprint"}.jpg`, mime: "image/jpeg" },
        { id: `pair-${i + 1}/improved`, row: `pair-${i + 1}`, url: `/presets/${PRESETS[i + 3] ?? "data-neon"}.jpg`, mime: "image/jpeg" },
      ]),
      imported: [],
      machine: { "pair-1": "a", "pair-2": "b", "pair-3": "a" },
      present: {
        items: Object.fromEntries([1, 2, 3].flatMap((i) => [[`pair-${i}/base`, { label: "baseline" }], [`pair-${i}/improved`, { label: "improved" }]])),
        rows: [1, 2, 3].map((i) => ({ id: `pair-${i}`, label: `pair ${i}` })),
        questions: { "pair-1": "Which reads as one lit scene?", "pair-2": "Which keeps the subject's silhouette?", "pair-3": "Which holds the palette under motion blur?" },
        oracle: { passed: true, summary: "3 pairs · judge masked", fixture: true },
        meta: "dojo · technique: rim-light",
      },
    },
    {
      id: "pkt:article:run-42",
      lane: "article",
      source: "article",
      mode: "packet-review",
      title: "Retry budgets that end",
      runId: "run-42",
      slug: "retry-budgets-that-end",
      items: [{ id: "draft-3", url: "/file.svg", mime: "text/markdown" }],
      imported: [],
      present: {
        items: { "draft-3": { label: "draft turn 3" } },
        rows: [],
        oracle: { passed: true, summary: "0 errors · quorum 2/3", fixture: true },
        meta: "software-engineering/retry-backoff · turn 3",
        review: {
          title: "Retry budgets that end",
          standfirst: "A retry loop without a ceiling is an outage you scheduled in advance.",
          turn: 3,
          illustrative: true,
          sections: [
            { id: "s1", heading: "The loop that never stops", text: "Every client library ships a retry. Few ship the budget that says when retrying has become the failure." },
            { id: "s2", heading: "Jitter is not optional", text: "Synchronised clients turn a brief blip into a thundering herd; full jitter spreads the herd across the window.", regenerated: true },
            { id: "s3", heading: "A budget per caller", text: "The ceiling belongs to the caller's intent, not to the transport: a user waiting is not a batch job." },
            { id: "s4", heading: "What to log when it ends", text: "The last error, verbatim, with the attempt count - the operator's next move depends on both." },
          ],
          checks: [
            { name: "deterministic checks", value: "0 errors", ok: true },
            { name: "figures", value: "2 of 2 sourced", ok: true },
            { name: "voice", value: "1 flag", ok: false },
          ],
          reviewers: [
            { who: "claude · depth", vote: "approve", note: "The budget section carries the argument." },
            { who: "gemini · truth", vote: "approve", note: "Claims match the cited sources." },
            { who: "qwen · voice", vote: "request", note: "Section 2 opens on a cliché." },
          ],
          spend: { low: 0.4, high: 0.9 },
        },
      },
    },
    {
      id: "pkt:audio:takes-11",
      lane: "audio",
      source: "audio",
      mode: "matrix-cull",
      title: "Take triage 11",
      runId: "takes-11",
      items: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `take-${i}`, row: i <= 3 ? "music" : "sfx", url: tone, mime: "audio/wav" })),
      imported: [{ candidate: "take-6", verdict: "reject", reasons: AUDIO }],
      present: {
        items: Object.fromEntries(
          [1, 2, 3, 4, 5, 6].map((i) => [`take-${i}`, { label: i <= 3 ? `night drive ${i}` : `door slam ${i - 3}`, meta: `${i <= 3 ? "suno" : "elevenlabs"} · 0:0${i}`, prompt: i <= 3 ? "slow synth, warm bass, rain" : "heavy wooden door, close mic", peaks: peaks(i), music: i <= 3 }]),
        ),
        rows: [
          { id: "music", label: "music" },
          { id: "sfx", label: "sound effects" },
        ],
        oracle: { passed: true, summary: "6 takes · loudness ok", fixture: true },
        meta: "audio triage · takes-11",
      },
    },
    {
      id: "pkt:mv:mv-03",
      lane: "video",
      source: "mv",
      mode: "matrix-cull",
      title: "Music video looks 03",
      runId: "mv-03",
      items: PRESETS.slice(0, 4).map((p) => ({ id: `clip-${p}`, row: "looks", url: `/clips/presets/${p}.webm`, mime: "video/webm" })),
      imported: [],
      present: {
        items: Object.fromEntries(PRESETS.slice(0, 4).map((p) => [`clip-${p}`, { label: name(p), meta: "look" }])),
        rows: [{ id: "looks", label: "looks" }],
        meta: "music video · mv-03",
      },
    },
    {
      id: "pkt:step:cut-01",
      lane: "video",
      source: "step",
      mode: "packet-review",
      title: "Flywheel explainer cut",
      runId: "cut-01",
      partId: "flywheel/cut",
      items: [{ id: "export-1", url: "/clips/presets/blueprint.webm", mime: "video/webm" }],
      imported: [],
      present: {
        items: { "export-1": { label: "export 1" } },
        rows: [],
        meta: "flywheel · cut",
        cut: {
          video: "/clips/presets/blueprint.webm",
          poster: "/clips/presets/blueprint.jpg",
          channels: ["youtube"],
          beats: [
            { t0: 0, t1: 1.5, text: "Every flywheel starts as a push." },
            { t0: 1.5, t1: 3, text: "Then the push becomes the habit." },
            { t0: 3, t1: 4.5, text: "And the habit pays for the next push." },
          ],
        },
      },
    },
    {
      id: "pkt:suno:suno-02",
      lane: "audio",
      source: "suno",
      mode: "matrix-cull",
      title: "Suno batch 02",
      runId: "suno-02",
      committed: true,
      items: [{ id: "song-1", url: tone, mime: "audio/wav" }],
      imported: [{ candidate: "song-1", verdict: "keep", reasons: [] }],
      present: { items: { "song-1": { label: "harbour lights", peaks: peaks(9), music: true } }, rows: [] },
    },
  ];
}

