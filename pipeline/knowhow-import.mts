// THE KNOW-HOW IMPORT AND REDRAW, HEADLESS (spark device-metadata-sync, KS2) - the verbs a pull and a session run.
//
//   npx tsx pipeline/knowhow-import.mts import [--dry] [--real] [--quiet]   fold knowhow/** into this device's stores
//   npx tsx pipeline/knowhow-import.mts redraw [--dry] [--ids chr:a,chr:b]  draw the characters with no picture here (Codex)
//
// `import` prints {created, updated, conflicts, skipped} and, when characters wait for pictures, one line naming
// `npm run know:redraw`. It spends nothing and draws nothing. The kernel character store is written only when this
// process names a store (GRAVITONE_STORE_PATH) or `--real` asks for the app's own; without either, characters reach the
// production's mirror only (a session never opens the operator's store). The git hooks pass `--real` only outside an
// agent session.
//
// `redraw` draws the queue (foundry-out/knowhow-redraw.json) on the operator's ChatGPT seat through codexImage: three
// characters at a time, each picture retried once; `--dry` prints the plan. Exit 0 done, 1 a record or a draw failed
// (the sentence printed), 2 usage.

import { mkdirSync } from "node:fs";

import { codexImage } from "./trailer/codex.mts";
import { CHARACTER_ID_RE } from "../packages/domain/src/production.machine.ts";
import type { KnowhowCharacter } from "../packages/domain/src/knowhow.ts";
import { thisDevice } from "../lib/knowhow/device.ts";
import { localFileOf } from "../lib/knowhow/media.ts";
import { importKnowhow, type KernelSink } from "../lib/knowhow/import.ts";
import { readRedrawQueue, redraw } from "../lib/knowhow/redraw.ts";

const argv = process.argv.slice(2);
const verb = argv[0];
const has = (f: string): boolean => argv.includes(f);
const value = (f: string): string | undefined => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const USAGE = "usage: knowhow-import.mts import [--dry] [--real] [--quiet] | redraw [--dry] [--ids chr:a,chr:b]";

const POOLS = ["scout-character", "muse-army", "codex-kept"] as const;
type Pool = (typeof POOLS)[number];

/** The kernel's half, when this process may open a store: the card by id, the origin from her source key's pool. */
async function kernelSink(): Promise<{ readonly sink: KernelSink; readonly close: () => void } | null> {
  if (process.env["GRAVITONE_STORE_PATH"] === undefined && !has("--real")) return null;
  const { openKernel } = await import("../packages/kernel/src/kernel.ts");
  const { adoptCharacterIn } = await import("../packages/kernel/src/characters/store.ts");
  const { storeLocation } = await import("../lib/kernelStore.ts");
  const k = openKernel(storeLocation());
  if (!k.ok) {
    console.error(`know:import: the kernel store did not open, characters reach the production only: ${k.error.message}`);
    return null;
  }
  const store = k.value.store;
  const sink: KernelSink = (c: KnowhowCharacter) => {
    const card = c.card;
    if (!CHARACTER_ID_RE.test(c.id) || typeof card.personality !== "string" || card.personality === "" || card.look === "") return "skipped";
    const pool = POOLS.find((p) => c.sourceKey?.startsWith(`${p}:`) === true) ?? ("scout-character" satisfies Pool);
    const { name, look, personality, age } = card;
    const r = store.tx((t) => adoptCharacterIn(t, { id: c.id, card: { name, look, personality, ...(typeof age === "number" ? { age } : {}) }, origin: pool }, { kind: "machine", id: "knowhow-import" }));
    if (!r.ok) throw r.error;
    return r.value.did === "covered" ? "unchanged" : r.value.did;
  };
  return { sink, close: () => k.value.close() };
}

async function runImport(): Promise<number> {
  const dry = has("--dry");
  const kernel = dry ? null : await kernelSink();
  const self = thisDevice();
  const s = importKnowhow({ self, localFileOf, dry, ...(kernel === null ? {} : { kernel: kernel.sink }) });
  kernel?.close();
  const line = `know:import${dry ? " (dry)" : ""}: created ${s.created} · updated ${s.updated} · conflicts ${s.conflicts} · skipped ${s.skipped}`;
  if (!has("--quiet") || s.created + s.updated + s.conflicts > 0 || s.problems.length > 0) console.log(line);
  for (const p of s.problems) console.log(`  ${p}`);
  if (s.conflicts > 0) console.log(`  ${s.conflicts} conflict(s) kept in knowhow/conflicts/`);
  if (s.redraw > 0) console.log(`${s.redraw} characters to redraw: npm run know:redraw`);
  return s.problems.length > 0 ? 1 : 0;
}

async function runRedraw(): Promise<number> {
  const ids = value("--ids")?.split(",").map((x) => x.trim()).filter((x) => x !== "");
  const queue = readRedrawQueue().filter((i) => ids === undefined || ids.includes(i.id));
  if (has("--dry")) {
    console.log(`know:redraw (dry): ${queue.length} character(s)`);
    for (const i of queue) console.log(`- ${i.id} ${i.name}${i.look === null ? "" : ` (${i.look})`}\n  portrait: ${i.portraitPrompt}\n  sheet: ${i.sheetPrompt}`);
    return 0;
  }
  if (queue.length === 0) {
    console.log("know:redraw: nothing to draw");
    return 0;
  }
  const done = await redraw(
    thisDevice().id,
    (dir, name, prompt, refs) => {
      mkdirSync(dir, { recursive: true }); // codex writes into it
      return codexImage(dir, name, prompt, refs);
    },
    ids,
  );
  for (const d of done) console.log(`- ${d.id}: ${d.ok ? "drawn" : `FAILED (${d.sentence ?? ""})`}`);
  return done.every((d) => d.ok) ? 0 : 1;
}

if (verb === "import") process.exit(await runImport());
else if (verb === "redraw") process.exit(await runRedraw());
else {
  console.error(USAGE);
  process.exit(2);
}
