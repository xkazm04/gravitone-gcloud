#!/usr/bin/env -S npx tsx
// ONE PASS OF THE IDEA LOOP: ideas written by the Codex subscription seat, scored against the Board's verdicts, the
// passing ones recorded and written out as storyboard briefs.
//
//   npx tsx pipeline/idea-loop/run.mts [--count 3] [--panels 5] [--top 1] [--briefs <file>]
//
// Then, on an open --live night: npx tsx pipeline/scout.mts storyboard <night> --draw codex --json <file>
// Prints one JSON report on stdout. Exits 1 when the seat produced no usable idea.

import { writeFileSync } from "node:fs";

import { runCodex } from "../../lib/foundry/scout/codexExec.ts";
import { barLine } from "../../lib/foundry/scout/idea-loop/score.ts";
import { briefOf, runIdeaLoop } from "../../lib/foundry/scout/idea-loop/loop.ts";
import { readAllNights } from "../../lib/foundry/scout/store.ts";

function flag(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const seat = async (prompt: string): Promise<string> => {
  const r = await runCodex(prompt, { timeoutS: 300 });
  if (r.exit !== 0 || r.lastMessage === undefined) throw new Error(`the codex seat answered nothing (exit ${String(r.exit)}): ${r.stderr.slice(-400)}`);
  return r.lastMessage;
};

const pass = await runIdeaLoop({ nights: await readAllNights(), seat, count: Number(flag("count", "3")), panels: Number(flag("panels", "5")), top: Number(flag("top", "1")), now: new Date() });
const briefs = flag("briefs");
if (briefs !== undefined) writeFileSync(briefs, JSON.stringify(pass.passing.map(briefOf), null, 2));
process.stdout.write(`${JSON.stringify({ line: barLine(pass.bar), bar: pass.bar, dropped: pass.dropped, ideas: pass.ideas.map((i) => ({ id: i.id, title: i.title, predictedKeep: i.predictedKeep, passed: i.passed })), passing: pass.passing.map((i) => i.id) }, null, 2)}\n`);
process.exit(pass.ideas.length === 0 ? 1 : 0);
