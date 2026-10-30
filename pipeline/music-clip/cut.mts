// Render a span of a scene page as an mp4 with the track under it (lib/music-clip/gpuShot.ts renderSpan).
//   npx tsx pipeline/music-clip/cut.mts <clip dir> <scene.html> <startS> <endS> <out.mp4>
// <clip dir> is the track folder (the one holding the mp3 and music-clip/).

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { renderSpan, vendorThree } from "../../lib/music-clip/gpuShot";
import type { TimelineV1 } from "../../lib/music-clip/types";

const [dir, page, start, end, out] = process.argv.slice(2);
if (!dir || !page || !start || !end || !out) {
  console.error("usage: cut.mts <clip dir> <scene.html> <startS> <endS> <out.mp4>");
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
const res = await renderSpan({ pageFile: path.resolve(page), rootDir: clip, timeline, audioPath: path.join(dir, mp3), startS: Number(start), endS: Number(end), outFile: path.resolve(out) });
console.log(JSON.stringify(res, null, 2));
