// `npm run verify` and the `gates` CI job are one rule written twice, and the
// pre-push hook promises they are the same set. They drifted: check:narration,
// check:clips and check:style-refs joined `verify` (2026-09-04..09) and never
// reached CI, so a gate the hook blocked on was a courtesy on every other path
// (moonshot backlog Q5, 2026-10-05).
//
// Since pipeline-scripts-A the rule is written ONCE, in pipeline/gates.mts, and
// `verify` runs it through pipeline/run-gates.mts. CI keeps one step per gate (a
// failed step names itself in the Actions UI), so this holds the gates job to
// the registry's blocking set, step for step and in order. The registry is read
// through the runner's own `--list --json`, the CI steps from gates.yml's
// `run: npm ...` lines (install excluded) - never a hand copy. `verify:serial`,
// the old `&&` chain kept as the rollback, is held to the same list.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

const ROOT = path.resolve(__dirname, "../..");

const norm = (cmd: string) => cmd.trim().replace(/^npm test$/, "npm run test");

function registryChain(): string[] {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^npm_/i.test(k))) as NodeJS.ProcessEnv;
  const r = spawnSync(process.execPath, [path.join(ROOT, "pipeline", "run-gates.mts"), "--list", "--json"], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });
  expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
  const gates = JSON.parse(r.stdout) as { npmScript: string; class: string }[];
  return gates.filter((g) => g.class === "blocking").map((g) => `npm run ${g.npmScript}`);
}

function serialChain(): string[] {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
  return (pkg.scripts["verify:serial"] ?? "").split("&&").map(norm).filter(Boolean);
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

test("the gates job runs the registry's blocking gates, step for step, in order", () => {
  const registry = registryChain();
  expect(registry.length, "the registry's blocking set parsed to almost nothing").toBeGreaterThan(5);
  expect(ciChain()).toEqual(registry);
});

test("verify:serial (the rollback chain) is the same blocking set, in order", () => {
  expect(serialChain()).toEqual(registryChain());
});
