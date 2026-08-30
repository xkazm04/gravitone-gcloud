// FABRICATE A DOJO CYCLE — a plausible awaiting-gate training cycle with no
// GPU, no vendors, no loop.
//
//   npx tsx pipeline/foundry/make-fixture-cycle.mts
//   npx tsx pipeline/foundry/make-fixture-cycle.mts --id my-fixture-slug
//
// WHAT IT IS FOR. The Dojo tab (app/foundry/DojoView.tsx) gates cycles the
// autonomous training loop writes under foundry-out/training/<id>/ — and that
// loop runs on the GPU machine. This script fabricates one cycle on ANY
// machine so the gate surface can be exercised end to end: two improvements,
// three seed-matched baseline/challenger pairs each, judge picks with
// one-line reasons, a couple of Gemini picks with one disagreement, and
// programmatically written solid-colour PNGs (distinct per arm, so the A/B
// duo is visibly different). Improvement 2 carries one video-kind pair with a
// poster. verdicts.json starts empty; status is awaiting-gate, so the commit
// bar shows and a full approve/reject/commit pass works.
//
// FIXTURES NEVER REACH THE LEDGER AS REGISTRY EVIDENCE — but committing one
// locally to test the flow is fine. The ledger IS git-tracked, so the warning
// this script prints is real: revert pipeline/foundry/training-ledger.json
// (and delete any pipeline/foundry/training/thumbs/<id>--*.png) after a test
// commit.
//
// No dependencies beyond Node: the PNGs are hand-built buffers (IHDR + a
// zlib-deflated solid raster + IEND) via node:zlib.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

import type { CycleManifest, Improvement, PairResult } from "../../lib/foundry/training/types";

/* ── tiny PNG writer ─────────────────────────────────────────────────────── */

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A valid solid-colour RGB PNG, w×h. */
function solidPng(w: number, h: number, [r, g, b]: [number, number, number]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).fill(Buffer.from([r, g, b]))]);
  const raster = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raster)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ── the fixture ─────────────────────────────────────────────────────────── */

const idArg = process.argv.indexOf("--id");
const id = idArg > -1 && process.argv[idArg + 1] ? process.argv[idArg + 1] : `fixture-${new Date().toISOString().slice(0, 10)}`;
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(id)) {
  console.error(`--id must be a slug (got "${id}")`);
  process.exit(1);
}

const dir = path.join(process.cwd(), "foundry-out", "training", id);
mkdirSync(path.join(dir, "pairs"), { recursive: true });

const at = new Date().toISOString();

// Distinct colours per arm: baselines in muted blues, challengers in warm
// ambers — the duo reads as different at a glance.
const BASELINE_TONES: [number, number, number][] = [
  [42, 62, 94],
  [36, 52, 84],
  [50, 70, 104],
];
const CHALLENGER_TONES: [number, number, number][] = [
  [176, 122, 46],
  [188, 134, 52],
  [164, 112, 40],
];

const SCENES = ["harbor-dusk-wide", "workshop-interior-mid", "ridge-walk-golden-hour"];

function makePairs(imp: string, video: boolean): PairResult[] {
  return SCENES.map((scene, i) => {
    const pid = `${imp}-p${i + 1}`;
    const base = `pairs/${pid}-baseline.png`;
    const chal = video && i === 1 ? `pairs/${pid}-challenger.mp4` : `pairs/${pid}-challenger.png`;
    writeFileSync(path.join(dir, base), solidPng(320, 180, BASELINE_TONES[i]));
    const poster = video && i === 1 ? `pairs/${pid}-challenger-poster.png` : undefined;
    if (poster) {
      // A placeholder byte-stream for the "video" plus its real poster.
      writeFileSync(path.join(dir, chal), Buffer.from("fixture-mp4-placeholder"));
      writeFileSync(path.join(dir, poster), solidPng(320, 180, CHALLENGER_TONES[i]));
    } else {
      writeFileSync(path.join(dir, chal), solidPng(320, 180, CHALLENGER_TONES[i]));
    }
    return {
      id: pid,
      scene,
      seed: 41000 + i * 17,
      baseline: { file: base, kind: "image" as const },
      challenger: poster ? { file: chal, poster, kind: "video" as const } : { file: chal, kind: "image" as const },
      ...judgement(imp, i),
    };
  });
}

/** Judge picks with reasons; a couple of Gemini picks, one disagreement. */
function judgement(imp: string, i: number): Pick<PairResult, "judge_pick" | "reason" | "gemini_pick" | "gemini_reason"> {
  if (imp === "imp-1") {
    if (i === 0)
      return {
        judge_pick: "challenger",
        reason: "Rim separation lifts the subject off the dusk sky; baseline silhouette merges into the water.",
        gemini_pick: "challenger",
        gemini_reason: "Cleaner edge light on the figure; background holds its value.",
      };
    if (i === 1)
      return {
        judge_pick: "challenger",
        reason: "Backlight kicker keeps the lathe operator readable against the window bloom.",
        gemini_pick: "baseline",
        gemini_reason: "The kicker reads as an unmotivated practical; baseline lighting is more coherent.",
      };
    return { judge_pick: "baseline", reason: "The rim overpowers the golden-hour key and flattens the ridge line." };
  }
  if (i === 0)
    return { judge_pick: "challenger", reason: "Holding the last 8 frames settles the camera before the cut; baseline ends mid-drift." };
  if (i === 1)
    return {
      judge_pick: "challenger",
      reason: "The hold gives the gesture a landing beat; motion reads as intended, not truncated.",
      gemini_pick: "challenger",
      gemini_reason: "End-of-shot stability is clearly better in the challenger.",
    };
  return { judge_pick: "tie", reason: "Both clips end on a static ridge; the hold adds nothing this shot needed." };
}

const improvements: Improvement[] = [
  {
    id: "imp-1",
    technique: "rim-light-subject-separation",
    subject: "cinematic-frames",
    claim: "Naming a motivated rim light in the lighting clause separates the subject from low-contrast backgrounds without raising overall exposure.",
    standard: "cinematic-frames/lighting-key-discipline",
    pairs: makePairs("imp-1", false),
    challenger_recipe: "…lighting: golden-hour key camera-left, motivated rim from the skyline behind, exposure held for the sky…",
    baseline_recipe: "…lighting: golden-hour key camera-left, exposure held for the sky…",
    thumbnail: "pairs/imp-1-p1-challenger.png",
  },
  {
    id: "imp-2",
    technique: "end-hold-last-frames",
    subject: "motion-shots",
    claim: "Instructing an 8-frame static hold at the end of a generated clip lands the motion on a cuttable beat instead of mid-drift.",
    standard: "none",
    pairs: makePairs("imp-2", true),
    challenger_recipe: "…motion: slow push-in, then hold the final 8 frames static for the cut…",
    baseline_recipe: "…motion: slow push-in through the full duration…",
    thumbnail: "pairs/imp-2-p2-challenger-poster.png",
  },
];

const manifest: CycleManifest = {
  version: 1,
  id,
  at,
  dimension: "lighting-and-motion-craft",
  subject: "cinematic-frames",
  status: "awaiting-gate",
  media: "image",
  improvements,
  judge_agreement: { gemini_vs_human: 0.75 },
  fail_streak: 0,
  costUsd: 0.42,
  log: [
    { at, msg: "FIXTURE cycle fabricated by pipeline/foundry/make-fixture-cycle.mts — no model ran; for surface testing only, never registry evidence" },
    { at, msg: "planned 2 improvements against the weakest dimension" },
    { at, msg: "generated 6 seed-matched pairs on the local stack" },
    { at, msg: "judged pairwise; parked for the human gate" },
  ],
};

writeFileSync(path.join(dir, "cycle.json"), JSON.stringify(manifest, null, 2));
writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify({}, null, 2));

console.log(`fixture cycle written: ${dir}`);
console.log("  2 improvements · 6 pairs · 13 media files (1 video placeholder + poster)");
console.log("  status: awaiting-gate — open /foundry → Dojo to gate it");
console.log("");
console.log("fixture cycle — if you commit it in the app, revert pipeline/foundry/training-ledger.json afterwards");
console.log("(and delete pipeline/foundry/training/thumbs/" + id + "--*.png; fixtures never count as registry evidence)");
