// BASELINE PROMPTS FROM THE LIVE COMPILER — never a retyped copy.
//
//   npx tsx pipeline/foundry/dojo-shot-prompts.mts <shots.json>
//
// A dojo cycle about shot composition A/Bs the words a shot becomes. The
// baseline arm must be what the app would actually send today, so this reads
// `shotPrompt.actionFor` and `stylePrompt.compilePrompt` — the one compiler —
// and prints them. The input names a StyleBlock (held constant across arms)
// and a list of Shot-shaped records; the output is one line of JSON per shot.
import fs from "node:fs";

import { actionFor } from "../../app/_phases/frames/shotPrompt";
import { compilePrompt } from "../../lib/stylePrompt";

const input = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const out = input.shots.map((s: Record<string, unknown>) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const action = actionFor(s as any);
  return { id: s.id, action, text: compilePrompt(input.block, action) };
});
process.stdout.write(JSON.stringify(out, null, 1) + "\n");
