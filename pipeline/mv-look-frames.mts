// MV-LOOK-FRAMES - look at a look before spending a render on it.
//
//   npx tsx pipeline/mv-look-frames.mts <still> <audio> <look> <outDir> [seconds,...]
//
// Bakes the track's envelope, renders the named frames through the same
// compositor and render page the music-video queue uses, and writes one PNG
// per second asked for. The same frames the finished video would hold, a
// minute instead of half an hour.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
process.chdir(ROOT);

const [stillArg, audioArg, lookArg, outArg, secsArg] = process.argv.slice(2);
if (!stillArg || !audioArg || !lookArg || !outArg) {
  console.error("usage: npx tsx pipeline/mv-look-frames.mts <still> <audio> <look> <outDir> [seconds,...]");
  process.exit(2);
}

const { analyseTrack } = await import("../lib/sound/mv/render");
const { MV_LOOKS, isLookId } = await import("../lib/sound/mv/looks");
const { launchHeadless, makeWorkDir } = await import("../lib/export/headless");
const { setUpRenderPage } = await import("../lib/musicVideoExport");
const { DEFAULT_EFFECT_PARAMS } = await import("../app/_phases/frames/music-video/compositor");

if (!isLookId(lookArg)) throw new Error(`unknown look ${lookArg}`);
const out = path.resolve(outArg);
fs.mkdirSync(out, { recursive: true });
const work = await makeWorkDir("mv-look-");
const envPath = path.join(work, "env.json");
await analyseTrack({ audioPath: path.resolve(audioArg), envelopePath: envPath });
const envelope = JSON.parse(fs.readFileSync(envPath, "utf8"));

const still = path.resolve(stillArg);
const mime = still.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
const secs = (secsArg ?? "12,45,90,150,210").split(",").map(Number);

const browser = await launchHeadless();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await setUpRenderPage(page, {
    width: 1920,
    height: 1080,
    posterDataUrl: `data:${mime};base64,${fs.readFileSync(still).toString("base64")}`,
    envelope,
    seed: 12345,
    effectParams: { ...DEFAULT_EFFECT_PARAMS, bloomIntensity: 0.5 },
    fit: "cover",
    particleHue: 200,
    scene: MV_LOOKS[lookArg],
  });
  for (const s of secs) {
    const i = Math.min(envelope.frameCount - 1, Math.round(s * envelope.fps));
    const url: string = await page.evaluate((n: number) => (window as unknown as { renderFrameAt: (i: number) => string }).renderFrameAt(n), i);
    const file = path.join(out, `frame-${String(s).padStart(4, "0")}s.png`);
    fs.writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
    console.log(file);
  }
} finally {
  await browser.close().catch(() => {});
}
process.exit(0);
