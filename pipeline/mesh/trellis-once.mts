// TRELLIS ONCE - one TRELLIS.2 run on the box's ComfyUI, concept in, raw glb out, and nothing else:
// no kernel store, no job, no asset (spark game-3d-assets; docs/resources.md "Profiling ComfyUI").
//
//   node pipeline/mesh/trellis-once.mts <concept.png> [--faces 40000] [--seed N] [--out <dir>]
//
// WHY IT EXISTS: it is the command `resources.mts profile comfy` runs. Profiling through
// `mesh.mts new --live` deadlocks: the profile job holds gpu.local and the mesh job it would wait
// on queues behind it on the same lane (measured 2026-10-22). This drives the same client the mesh
// producer does (lib/foundry/mesh/comfy.ts `runTrellis`, pipeline/mesh/trellis-api.json), so what
// the profile measures is what a mesh job costs - and it replaces lynx-bench's run-prompt.mjs,
// which lives outside this repo.
//
// A FRESH SEED EVERY RUN unless --seed names one: ComfyUI serves a prompt it has already executed from its
// cache, so the same concept with the workflow's own seeds answers in ~3 s without sampling - a profile of
// that run measured 0.44 GB and recorded it as TRELLIS's cost (2026-10-23 12:00). The seed is printed.
//
// --faces defaults to the character budget, the heaviest class (lib/foundry/mesh/types.ts BUDGETS);
// decimation is a sliver of the run, TRELLIS's sampling is the cost. --out keeps the glb (default:
// it is not written). A SHARED SERVICE: it never POSTs /free, never interrupts, never restarts
// ComfyUI. EXIT 0 a glb came back · 1 ComfyUI refused or failed · 2 usage.

import { randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { comfyUrl, readWorkflow, runTrellis } from "../../lib/foundry/mesh/comfy.ts";
import { BUDGETS } from "../../lib/foundry/mesh/types.ts";

const USAGE = "usage: node pipeline/mesh/trellis-once.mts <concept.png> [--faces N] [--seed N] [--out <dir>]";

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({ args: process.argv.slice(2), options: { faces: { type: "string" }, seed: { type: "string" }, out: { type: "string" } }, allowPositionals: true, strict: true });
  } catch (e) {
    console.error(`trellis-once: ${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const [concept, ...extra] = positionals;
  const faces = values.faces === undefined ? BUDGETS.character.tris : Number(values.faces);
  const seed = values.seed === undefined ? randomInt(1, 2 ** 31) : Number(values.seed);
  if (concept === undefined || extra.length > 0 || !Number.isInteger(faces) || faces < 1 || !Number.isInteger(seed)) {
    console.error(USAGE);
    return 2;
  }

  const bytes = new Uint8Array(await readFile(concept));
  const stem = path.basename(concept, path.extname(concept)).replace(/[^a-z0-9_-]+/gi, "-");
  const run = await runTrellis(comfyUrl(), await readWorkflow(), {
    concept: bytes,
    conceptName: `gravitone-once-${stem}.png`,
    targetFaces: faces,
    prefix: `gravitone/once_${stem}`,
    seed,
  });
  if (!run.ok) {
    console.error(`trellis-once: ${run.message}`);
    return 1;
  }
  if (values.out !== undefined) {
    await mkdir(values.out, { recursive: true });
    await writeFile(path.join(values.out, `${stem}.glb`), run.glb);
  }
  console.log(`${run.file}: ${run.glb.byteLength} bytes in ${run.seconds} s (prompt ${run.promptId}, ${faces} faces, seed ${seed})`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(`trellis-once: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  },
);
