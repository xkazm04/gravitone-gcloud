// Render a span of a scene page as an mp4 with the track under it (lib/music-clip/gpuShot.ts renderSpan).
//   npx tsx pipeline/music-clip/cut.mts <clip dir> <scene.html> <startS> <endS> <out.mp4>
// <clip dir> is the track folder (the one holding the mp3 and music-clip/).

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { renderSpan, vendorThree } from "../../lib/music-clip/gpuShot";
import type { TimelineV1 } from "../../lib/music-clip/types";

const argv = process.argv.slice(2);
const sizeAt = argv.indexOf("--size");
const [width, height] = sizeAt >= 0 ? argv.splice(sizeAt, 2)[1].split("x").map(Number) : [1920, 1080];
const [dir, page, start, end, out] = argv;
if (!dir || !page || !start || !end || !out) {
  console.error("usage: cut.mts [--size WxH] <clip dir> <scene.html> <startS> <endS> <out.mp4>");
  process.exit(2);
}
const clip = path.join(dir, "music-clip");
const mp3 = (await readdir(dir)).find((f) => f.toLowerCase().endsWith(".mp3"));
if (!mp3) {
  console.error(`no .mp3 in ${dir}`);
  process.exit(1);
}
await vendorThree(clip);
const timeline = JSON.parse(await readFile(path.join(clip, "timeline.json"), "utf8")) as TimelineV1;
const res = await renderSpan({ pageFile: path.resolve(page), rootDir: clip, timeline, audioPath: path.join(dir, mp3), startS: Number(start), endS: Number(end), outFile: path.resolve(out), width, height });
console.log(JSON.stringify(res, null, 2));
