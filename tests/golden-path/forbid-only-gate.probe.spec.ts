// LANE — A COMMITTED `test.only` IS REFUSED BY THE GATE CHAIN (dynamic + wiring).
//
// forbidOnly was `!!process.env.CI`, and the pre-push hook runs `npm run verify`
// without CI, so a committed `.only` reduced `npm test` to one test, exit 0, past
// the hook. The fix is a dedicated switch, PW_FORBID_ONLY, that
// pipeline/run-gates.mts sets for every gate it spawns; CI=1 in the hook would
// also have changed `next build` and eslint.
//
// DYNAMIC: a scratch spec carrying a `.only` is run through the REAL
// playwright.config.ts (testDir swapped for the scratch dir). Control arm: with
// neither switch set the `.only` passes through, so the instrument can see the
// hole. Test arm: with PW_FORBID_ONLY it is refused.
// WIRING: both configs read the switch; the runner sets it.
import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./_helpers";

const ROOT = process.cwd();

function runScratch(env: Record<string, string>) {
  const dir = mkdtempSync(path.join(ROOT, ".tmp-forbid-only-"));
  try {
    writeFileSync(
      path.join(dir, "focused.spec.ts"),
      `import { test, expect } from "@playwright/test";\n` +
        `test("a", () => { expect(1).toBe(1); });\n` +
        `test.only("b", () => { expect(1).toBe(1); });\n`,
    );
    const base = path.join(ROOT, "playwright.config").split(path.sep).join("/");
    writeFileSync(
      path.join(dir, "pw.config.ts"),
      `import base from ${JSON.stringify(base)};\n` +
        `export default { ...base, testDir: ${JSON.stringify(dir.split(path.sep).join("/"))}, reporter: [["list"]] };\n`,
    );
    const clean: NodeJS.ProcessEnv = { ...process.env };
    for (const k of Object.keys(clean)) {
      if (k === "CI" || k === "PW_FORBID_ONLY" || k.startsWith("PLAYWRIGHT_") || k.startsWith("PW_TEST")) delete clean[k];
    }
    const r = spawnSync(`npx playwright test -c "${path.join(dir, "pw.config.ts")}"`, {
      cwd: ROOT,
      shell: true,
      encoding: "utf8",
      env: { ...clean, ...env },
      timeout: 120_000,
    });
    return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("control: with neither switch set a committed .only passes through", () => {
  const r = runScratch({});
  expect(r.code, r.out).toBe(0);
  expect(r.out).toMatch(/1 passed/);
});

test("PW_FORBID_ONLY refuses a committed .only without CI", () => {
  const r = runScratch({ PW_FORBID_ONLY: "1" });
  expect(r.code, r.out).not.toBe(0);
  expect(r.out).toMatch(/forbid-only|focused/i);
});

test("both configs read the switch and the gate runner sets it", () => {
  const configs = readdirSync(ROOT).filter((f) => /^playwright(\.\w+)?\.config\.ts$/.test(f));
  expect(configs.length).toBeGreaterThan(0);
  for (const f of configs) {
    const src = stripComments(readFileSync(path.join(ROOT, f), "utf8"));
    expect(src, f).toMatch(/forbidOnly:[^\n]*PW_FORBID_ONLY/);
  }
  const runner = stripComments(readFileSync(path.join(ROOT, "pipeline", "run-gates.mts"), "utf8"));
  expect(runner).toMatch(/PW_FORBID_ONLY:\s*"1"/);
});
