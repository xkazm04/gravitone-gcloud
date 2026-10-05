// `npm run verify` and the `gates` CI job are one rule written twice, and the
// pre-push hook promises they are the same set. They drifted: check:narration,
// check:clips and check:style-refs joined `verify` (2026-09-04..09) and never
// reached CI, so a gate the hook blocked on was a courtesy on every other path
// (moonshot backlog Q5, 2026-10-05).
//
// This holds the two to the same steps in the same order. Both lists are read
// from the files themselves - package.json's `verify` chain and the gates job's
// `run: npm ...` steps (install excluded) - so a step added to one side only is
// red here.
import { readFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

const ROOT = path.resolve(__dirname, "../..");

const norm = (cmd: string) => cmd.trim().replace(/^npm test$/, "npm run test");

function verifyChain(): string[] {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
  return pkg.scripts.verify.split("&&").map(norm);
}

function ciChain(): string[] {
  const yml = readFileSync(path.join(ROOT, ".github", "workflows", "gates.yml"), "utf8").replace(/\r\n/g, "\n");
  // The `gates:` job runs from its key to the next job key at the same indent.
  const start = yml.search(/^ {2}gates:\s*$/m);
  expect(start, "no `gates:` job in gates.yml").toBeGreaterThan(-1);
  const after = yml.slice(start + 1);
  const next = after.search(/^ {2}[A-Za-z0-9_-]+:\s*$/m);
  const job = next > -1 ? after.slice(0, next) : after;
  return [...job.matchAll(/^\s+run:\s*(npm .+)$/gm)].map((m) => norm(m[1])).filter((c) => c !== "npm ci");
}

test("the gates job and `npm run verify` run the same blocking steps, in the same order", () => {
  const verify = verifyChain();
  expect(verify.length, "the verify chain parsed to almost nothing").toBeGreaterThan(5);
  expect(ciChain()).toEqual(verify);
});
