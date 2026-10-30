// Shoot keyframes of one scene page on the GPU (lib/music-clip/gpuShot.ts).
//   npx tsx pipeline/music-clip/shoot.mts <scene.html> <timeline.json> <outDir> <t> [<t> ...]
// Vendors three into the clip folder first (two levels above the scene page:
// <dir>/music-clip/board-t/<id>/scene.html -> <dir>/music-clip/vendor/three).

import { readFile } from "node:fs/promises";
import path from "node:path";

import { shootKeyframes, vendorThree } from "../../lib/music-clip/gpuShot";
import type { TimelineV1 } from "../../lib/music-clip/types";

const [page, timelinePath, outDir, ...ts] = process.argv.slice(2);
if (!page || !timelinePath || !outDir || ts.length === 0) {
  console.error("usage: shoot.mts <scene.html> <timeline.json> <outDir> <t> [<t> ...]");
  process.exit(2);
}
const clipDir = path.resolve(path.dirname(page), "..", "..");
await vendorThree(clipDir);
const timeline = JSON.parse(await readFile(timelinePath, "utf8")) as TimelineV1;
const res = await shootKeyframes({ pageFile: path.resolve(page), rootDir: clipDir, timeline, times: ts.map(Number), outDir: path.resolve(outDir) });
console.log(JSON.stringify(res, null, 2));
