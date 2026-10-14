// Writes the two derived token outputs from packages/ui/tokens/source.json.
//   node pipeline/gen-tokens.mts        (npm run tokens:gen)
// Deterministic: a second run rewrites identical bytes.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderCss, renderTs } from "../packages/ui/src/tokenRender.ts";
import { parseSource } from "../packages/ui/src/tokenSource.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const parsed = parseSource(readFileSync(join(root, "packages/ui/tokens/source.json"), "utf8"));
if (!parsed.ok) {
  console.error(`gen-tokens: ${parsed.error}`);
  process.exit(1);
}

const outputs: ReadonlyArray<readonly [string, string]> = [
  ["packages/ui/src/tokens.css", renderCss(parsed.value)],
  ["packages/ui/src/tokens.ts", renderTs(parsed.value)],
];
for (const [rel, body] of outputs) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), body);
  console.log(`gen-tokens: wrote ${rel} (${body.split("\n").length - 1} lines)`);
}
