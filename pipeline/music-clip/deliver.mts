// The upload copy of a /music-clip render: 10-bit HEVC, then a VMAF check against the render.
//
//   npx tsx pipeline/music-clip/deliver.mts <render.mp4> [<out.mp4>] [--crf 22] [--no-vmaf]
//
// Why (measured on Stay Here v2, 284 s, 2026-10-31): the 16 Mb/s NVENC render is 575 MB; x265 10-bit CRF 22
// is 106 MB at VMAF 97.0 mean against it (x264 CRF 18 was 363 MB / 96.4, x264 CRF 23 162 MB / 94.7). YouTube
// re-encodes every upload and recommends 8 Mb/s for 1080p30, so the render's extra bits buy nothing there.
// 10-bit keeps the backlit gradients from banding. The render stays as the archive.
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const argv = process.argv.slice(2);
const opt = (n: string) => { const i = argv.indexOf(n); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const noVmaf = (() => { const i = argv.indexOf("--no-vmaf"); if (i < 0) return false; argv.splice(i, 1); return true; })();
const crf = opt("--crf") ?? "22";
const [src, outArg] = argv;
if (!src) { console.error("usage: deliver.mts <render.mp4> [<out.mp4>] [--crf 22] [--no-vmaf]"); process.exit(2); }
const out = outArg ?? src.replace(/(-1080p|-2160p)?\.mp4$/i, "-upload.mp4");
if (out === src) { console.error("output would overwrite the render"); process.exit(2); }

const run = (args: string[]) => spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 64 << 20 });
const enc = run(["-v", "error", "-y", "-i", src, "-c:v", "libx265", "-preset", "slow", "-crf", crf, "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1",
  "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", out]);
if (enc.status !== 0) { console.error(enc.stderr); process.exit(1); }
const mb = (f: string) => (fs.statSync(f).size / 1048576).toFixed(0);
console.log(`${out}: ${mb(out)} MB (render ${mb(src)} MB), x265 10-bit CRF ${crf}`);
if (!noVmaf) {
  const v = run(["-i", out, "-i", src, "-lavfi", "[0:v]format=yuv420p[a];[1:v]format=yuv420p[b];[a][b]libvmaf=n_threads=8", "-f", "null", "-"]);
  const m = /VMAF score: ([\d.]+)/.exec(v.stderr ?? "");
  if (!m) { console.log("VMAF: not measured (ffmpeg without libvmaf?)"); process.exit(0); }
  const score = Number(m[1]);
  console.log(`VMAF ${score.toFixed(2)} mean vs the render${score < 95 ? " - BELOW 95: lower --crf and re-run" : ""}`);
  process.exit(score < 95 ? 1 : 0);
}
