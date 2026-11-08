#!/usr/bin/env -S npx tsx
// CAN CODEX DRAW WITH NOBODY AT THE KEYBOARD? (idea loop, stage 1)
//
// One non-interactive `codex exec` asks the CLI's built-in image tool for one picture, on the operator's
// ChatGPT subscription and never on an API key. The exit code and the model's closing sentence prove nothing:
// a refusal exits 0 and a model can say "saved". THE FILE IS THE EVIDENCE: the proof names the thread from the
// event stream, looks under $CODEX_HOME/generated_images/<thread>/, fully decodes the PNG and refuses a blank one.
//
//   npx tsx pipeline/idea-loop/codex-image-proof.mts [--out <dir>] [--timeout-s 480]
//
// Prints one JSON report on stdout and exits 0 only when every requirement held. Each run is one real draw
// against the operator's subscription.

import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { imagesOf, inspectPng, keysIn, notAPicture, runCodex, type PngFacts } from "../../lib/foundry/scout/codexExec.ts";

const PROMPT = [
  "Generate exactly one image with your built-in image generation tool (image_gen). Do not write code, do not run a shell command, and do not use any script or API.",
  "The image: a rough storyboard frame, 16:9, of a lighthouse keeper's lantern reflected in a flooded stairwell at dusk, loose ink and wash.",
  "When the tool has returned, reply with the single word DONE.",
].join("\n");

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const outDir = path.resolve(flag("out") ?? path.join(os.tmpdir(), `idea-loop-proof-${process.pid}`));
mkdirSync(outDir, { recursive: true });

const run = await runCodex(PROMPT, { timeoutS: Number(flag("timeout-s") ?? 480) });
const found = run.thread === undefined ? [] : imagesOf(run.env, run.thread);
const leaked = keysIn(run.env);

const failures: string[] = [];
if (run.exit !== 0) failures.push(`codex exited ${String(run.exit)}`);
if (leaked.length > 0) failures.push(`key-shaped variables reached the child: ${leaked.join(", ")}`);
if (run.thread === undefined) failures.push("no thread.started event: nowhere to look for the image");
if (found.length === 0) failures.push("no PNG on disk for this thread");

let image: string | undefined;
let png: PngFacts | undefined;
if (found[0] !== undefined) {
  image = path.join(outDir, `proof-${String(run.thread)}.png`);
  copyFileSync(found[0], image);
  try {
    png = inspectPng(readFileSync(image));
    const why = notAPicture(png);
    if (why !== undefined) failures.push(why);
  } catch (e) {
    failures.push(`the PNG did not decode: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const ok = failures.length === 0;
process.stdout.write(`${JSON.stringify({ ok, failures, exit: run.exit, wallSeconds: run.wallSeconds, thread: run.thread, image, imagesForThread: found.length, png, keysInChildEnv: leaked, itemTypes: run.itemTypes, lastMessage: run.lastMessage, ...(ok ? {} : { stderrTail: run.stderr.slice(-1500), eventTail: run.events.slice(-4) }) }, null, 2)}\n`);
process.exit(ok ? 0 : 1);
