import "server-only";

// THE FIXTURE PILES - one packet per desk mode and per source the Board must draw, over media
// this repo ships in public/ (the preset plates, the deck art, the preset clips), so the desks
// are photographed and driven against real pixels without a store. Every pile names what v1
// surface it stands in for; the words are the sources' own (reasons from @gt/domain/source).
//
// A take is audio, and the repo ships none, so each take plays one short tone made here
// (`toneWav`): honest about being a fixture, and enough for Space to play something.


import type { MediaLane } from "@gt/domain/lane";
import { LOAD_BAND, LOAD_STRIP_MS, type LoadResource, type LoadSummary } from "@gt/domain/load";
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

// One /scout night (lib/decision/v1/sources/scout.ts): an extracted look's replicas, a found scene's
// replicas and clip under its keyframe, a finding and a watch line as text cells.
const SCOUT_ITEMS: SeedItem[] = [
  { id: "c-01/ink-wash/replica-1", row: "c-01/ink-wash", url: "/presets/chalk-argument.jpg", mime: "image/jpeg" },
  { id: "c-01/ink-wash/transfer-1", row: "c-01/ink-wash", url: "/presets/paper-relief.jpg", mime: "image/jpeg" },
  { id: "c-02/replica-1", row: "c-02", url: "/presets/blueprint.jpg", mime: "image/jpeg" },
  { id: "c-02/replica-2", row: "c-02", url: "/presets/data-neon.jpg", mime: "image/jpeg" },
  { id: "c-02/clip", row: "c-02", url: "/clips/presets/blueprint.webm", mime: "video/webm" },
  { id: "c-03/text", row: "c-03", url: "", mime: "text/plain" },
  { id: "c-04/text", row: "c-04", url: "", mime: "text/plain" },
];
const SCENE_PROMPT = "wide low-angle shot, 24mm, a lone figure on the left third against a pale sky, long shadow toward camera";
// The muse wing's night (spark scout-muse): idea posters only, each cell's meta its target, the card it draws and
// what the judge read - the same night /scout's fixture graph shows as closed, so "open on Board" lands here.
const MUSE_ITEMS: SeedItem[] = [
  { id: "c-01/board", row: "c-01", url: "/deck-art/template-cinematic.webp", mime: "image/webp" },
  { id: "c-02/board", row: "c-02", url: "/deck-art/discipline-free.webp", mime: "image/webp" },
  { id: "c-03/board", row: "c-03", url: "/presets/paper-relief.jpg", mime: "image/jpeg" },
];

// A night's load as the summary hands it to the desk (@gt/domain/load), built from its strip - one
// mean per five minutes, -1 where nothing was read - so the averages, the p95 and the share in band
// agree with the bars the desk draws. The fixture writes no load_samples rows: the kernel table is
// the real side's, and this literal is the only way a fixture night shows its load.
const slot2 = (x: number): number => Math.round(Math.max(0, Math.min(0.99, x)) * 100) / 100;
function loadOf(strip: readonly number[]): LoadResource {
  const read = strip.filter((v) => v >= 0);
  const sorted = [...read].sort((a, b) => a - b);
  const n = read.length;
  if (n === 0) return { avg: 0, p95: 0, inBand: 0, read: 0, strip };
  const avg = read.reduce((a, v) => a + v, 0) / n;
  const inBand = read.filter((v) => v >= LOAD_BAND.low && v <= LOAD_BAND.high).length / n;
  return { avg, p95: sorted[Math.min(n - 1, Math.ceil(n * 0.95) - 1)] ?? 0, inBand, read: n * (LOAD_STRIP_MS / 60_000), strip };
}
function nightLoad(fromMs: number, slots: number, at: { readonly cpu: (i: number) => number; readonly ram: (i: number) => number; readonly gpu: (i: number) => number }, rest: Pick<LoadSummary, "commit" | "waited">): LoadSummary {
  const strip = (f: (i: number) => number): number[] => Array.from({ length: slots }, (_, i) => slot2(f(i)));
  return { fromMs, toMs: fromMs + slots * LOAD_STRIP_MS, samples: slots * (LOAD_STRIP_MS / 60_000), band: LOAD_BAND, cpu: loadOf(strip(at.cpu)), ram: loadOf(strip(at.ram)), gpu: loadOf(strip(at.gpu)), ...rest };
}
/** 2026-10-21, 22:00 to 06:30 UTC: CPU and RAM mostly in band, the GPU in bursts between the stills. */
const NIGHT_21 = nightLoad(
  Date.UTC(2026, 9, 21, 22, 0),
  102,
  {
    cpu: (i) => (i < 4 ? 0.2 + i * 0.12 : 0.67 + 0.13 * Math.sin(i * 0.31) + 0.05 * Math.cos(i * 1.7)),
    ram: (i) => (i < 4 ? 0.45 + i * 0.06 : 0.71 + 0.07 * Math.sin(i * 0.11)),
    gpu: (i) => 0.32 + 0.62 * Math.max(0, Math.sin(i * 0.23)),
  },
  { commit: { peakGb: 88.4, limitGb: 102 }, waited: { memory: 41, "comfy-queue": 12 } },
);
/** 2026-10-20, 23:00 to 04:00 UTC: an under-scoped night - the box sat idle for most of it. */
const NIGHT_20 = nightLoad(
  Date.UTC(2026, 9, 20, 23, 0),
  60,
  {
    cpu: (i) => 0.38 + 0.12 * Math.sin(i * 0.4),
    ram: (i) => 0.52 + 0.05 * Math.sin(i * 0.2),
    gpu: (i) => (i % 12 < 3 ? 0.9 : 0.04),
  },
  { commit: { peakGb: 61.2, limitGb: 102 }, waited: {} },
);

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
      id: "pkt:scout:2026-10-21",
      lane: "image",
      source: "scout",
      mode: "matrix-cull",
      title: "scout 2026-10-21",
      runId: "2026-10-21",
      items: SCOUT_ITEMS,
      imported: [],
      present: {
        items: {
          "c-01/ink-wash/replica-1": { label: "replica of s-02", meta: "replica · 81%" },
          "c-01/ink-wash/transfer-1": { label: "transfer · a harbour at dusk", meta: "transfer · 74%" },
          "c-02/replica-1": { label: "replica 1", prompt: SCENE_PROMPT },
          "c-02/replica-2": { label: "replica 2", prompt: SCENE_PROMPT },
          "c-02/clip": { label: "clip · replica-1", meta: "5s", prompt: "slow push-in; dust drifts right to left · long holds, one cut per phrase" },
          "c-03/text": { label: "Hold the subject still and let the camera do the moving", meta: "cinematic · 02-frames", prompt: "\"If the character and the lens both move, nobody knows where to look - pick one.\"" },
          "c-04/text": { label: "channel: lighting breakdowns - https://example.com/breakdowns", meta: "watchlist", prompt: "motivated key and practicals, measured contrast ratios" },
        },
        rows: [
          { id: "c-01/ink-wash", label: "Ink wash · illustration", ref: "/deck-art/discipline-educational.webp", inCatalogue: false },
          { id: "c-02", label: "wide · low angle, 24mm · lone figure on the left third · hard key from frame left, cool fill", ref: "/deck-art/template-cinematic.webp" },
          { id: "c-03", label: "finding · cinematic" },
          { id: "c-04", label: "watch" },
        ],
        oracle: { passed: true, summary: "4 candidates · 7 cells · 0 failed · stopped: target", fixture: true },
        meta: "scout · 9 sources",
        load: NIGHT_21,
      },
    },
    {
      id: "pkt:scout:2026-10-20",
      lane: "image",
      source: "scout",
      mode: "matrix-cull",
      title: "scout 2026-10-20",
      runId: "2026-10-20",
      committed: true,
      items: SCOUT_ITEMS.slice(0, 2),
      imported: [
        { candidate: "c-01/ink-wash/replica-1", verdict: "keep", reasons: [] },
        { candidate: "c-01/ink-wash/transfer-1", verdict: "reject", reasons: ["style"] },
      ],
      present: {
        items: {
          "c-01/ink-wash/replica-1": { label: "replica of s-02", meta: "replica · 81%" },
          "c-01/ink-wash/transfer-1": { label: "transfer · a harbour at dusk", meta: "transfer · 74%" },
        },
        rows: [{ id: "c-01/ink-wash", label: "Ink wash · illustration", ref: "/deck-art/discipline-educational.webp", inCatalogue: false }],
        meta: "scout · 3 sources",
        load: NIGHT_20,
      },
    },
    {
      id: "pkt:scout:muse:2026-10-23",
      lane: "image",
      source: "scout",
      mode: "matrix-cull",
      title: "muse 2026-10-23",
      runId: "muse:2026-10-23",
      items: MUSE_ITEMS,
      imported: [],
      present: {
        items: {
          "c-01/board": { label: "Mara Venn at the chart table", meta: "character · free · Mara Venn, 34 · read 35 · covered", prompt: "character poster of Mara Venn, a woman aged 34, auburn bob, freckles, green wool coat, brass compass on a chain" },
          "c-02/board": { label: "Studio-lit 3D concept bust, matte clay", meta: "style · free · read 42 · covered", prompt: "3D concept bust of a woman aged 42, matte clay, studio three-point light" },
          "c-03/board": { label: "A tango in an empty ballroom", meta: "scene · free · read 29 · revealing", prompt: "two dancers mid-turn in an empty ballroom, a woman aged 30 in a long evening dress, warm practicals" },
        },
        rows: [
          { id: "c-01", label: "Mara Venn at the chart table", group: "ideas", aim: "character poster of Mara Venn, a woman aged 34" },
          { id: "c-02", label: "Studio-lit 3D concept bust, matte clay", group: "ideas", aim: "3D concept bust of a woman aged 42, matte clay" },
          { id: "c-03", label: "A tango in an empty ballroom", group: "ideas", aim: "two dancers mid-turn in an empty ballroom" },
        ],
        oracle: { passed: true, summary: "3 candidates · 3 cells · 0 failed", fixture: true },
        meta: "muse · 4 ideas",
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

