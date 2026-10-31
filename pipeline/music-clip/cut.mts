// Render a span of a scene page as an mp4 with the track under it (lib/music-clip/gpuShot.ts renderSpan).
//   npx tsx pipeline/music-clip/cut.mts <clip dir> <scene.html> <startS> <endS> <out.mp4>
// <clip dir> is the track folder (the one holding the mp3 and music-clip/). The analysis always reads the mp3;
// the sound under the picture is the folder's lossless master when there is one (one *.wav or *.flac beside the
// mp3, the same track: Suno exports both), so the film's audio is one AAC generation from the master instead of a
// transcode of a transcode. --audio <file> overrides. A master must line up with the mp3 (it did to the sample on
// Break the Sequence: cross-correlation lag 0 ms) - the beat grid was measured on the mp3.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { renderSpan, vendorThree } from "../../lib/music-clip/gpuShot";
import type { TimelineV1 } from "../../lib/music-clip/types";

const argv = process.argv.slice(2);
const sizeAt = argv.indexOf("--size");
const [width, height] = sizeAt >= 0 ? argv.splice(sizeAt, 2)[1].split("x").map(Number) : [1920, 1080];
const audioAt = argv.indexOf("--audio");
const audioArg = audioAt >= 0 ? argv.splice(audioAt, 2)[1] : undefined;
const [dir, page, start, end, out] = argv;
if (!dir || !page || !start || !end || !out) {
  console.error("usage: cut.mts [--size WxH] [--audio <file>] <clip dir> <scene.html> <startS> <endS> <out.mp4>");
  process.exit(2);
}
const clip = path.join(dir, "music-clip");
const names = await readdir(dir);
const mp3 = names.find((f) => f.toLowerCase().endsWith(".mp3"));
const masters = names.filter((f) => /\.(wav|flac)$/i.test(f));
if (masters.length > 1 && !audioArg) {
  console.error(`${masters.length} lossless files (${masters.join(", ")}); pass --audio <file>`);
  process.exit(1);
}
if (!mp3 && !audioArg && masters.length === 0) {
  console.error(`no .mp3 in ${dir}`);
  process.exit(1);
}
const audioPath = audioArg ? path.resolve(audioArg) : path.join(dir, masters[0] ?? (mp3 as string));
console.error(`audio: ${path.basename(audioPath)}`);
await vendorThree(clip);
const timeline = JSON.parse(await readFile(path.join(clip, "timeline.json"), "utf8")) as TimelineV1;
const res = await renderSpan({ pageFile: path.resolve(page), rootDir: clip, timeline, audioPath, startS: Number(start), endS: Number(end), outFile: path.resolve(out), width, height });
console.log(JSON.stringify(res, null, 2));
