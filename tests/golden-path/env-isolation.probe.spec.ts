// LANE — THE LANE'S OWN INDEPENDENCE CONTRACT (dynamic, source-coupled).
//
// playwright.config.ts states it: these probes share ONE Node process, they run
// serially, and "independence here comes from state reset inside each probe,
// never from worker isolation, because there is no worker isolation."
//
// Seven probes mutate `process.env`. Three restored it and four only set up, so
// a configured access secret, a deleted dev-auth flag and a spend ceiling were
// left behind for every later file in alphabetical order. Nothing failed —
// measured 2026-08-29, all 37 files pass alone as well as in the suite — which
// is the point: a serial lane does not flake on this, it just evaluates some
// later probe in an environment nobody chose, in one direction, forever.
//
// Two halves here, and the second is the one that keeps working:
//   1. `keepEnv` does what it says, driven directly.
//   2. every probe that WRITES process.env has registered it — derived from the
//      filesystem, so a new probe that mutates the environment and forgets is
//      caught by this existing, rather than by somebody remembering.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { keepEnv } from "./_helpers";

const VAR = "GRAVITONE_ENV_ISOLATION_PROBE";
keepEnv([VAR]);

test("keepEnv: a variable this probe invents is gone again afterwards", () => {
  expect(process.env[VAR], "a previous test leaked this one").toBeUndefined();
  process.env[VAR] = "set-by-this-test";
  expect(process.env[VAR]).toBe("set-by-this-test");
});

test("keepEnv: and the next test does not inherit it", () => {
  // If the afterEach did not run, or ran without restoring, this is the
  // assertion that says so — the leak is visible from the very next case.
  expect(process.env[VAR], "keepEnv did not put the environment back").toBeUndefined();
});

test("every probe that writes process.env registers keepEnv", () => {
  const dir = join(process.cwd(), "tests", "golden-path");
  const files = readdirSync(dir).filter((f) => f.endsWith(".spec.ts"));
  // A walk that reads nothing reports "all compliant" in a voice
  // indistinguishable from success.
  expect(files.length, "the probe walk found nothing - it is reading the wrong tree").toBeGreaterThan(20);

  const offenders: string[] = [];
  for (const f of files) {
    const raw = readFileSync(join(dir, f), "utf8");
    // Comments are stripped: several of these files explain the contract in
    // prose directly above the code, so a matcher over raw text is satisfied by
    // a file that talks about restoring and does not.
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // A WRITE, not a read, and not a COMPARISON. The first version of this
    // matched `process.env.NODE_ENV === "production"` as an assignment, because
    // `=(?!=)` was missing — harness-gate.probe.spec.ts holds that expression as
    // a STRING it searches source for, and was reported as an offender for
    // quoting the thing it checks. The lookahead is the whole difference.
    const writes =
      /process\.env\[[^\]]+\]\s*=(?!=)/.test(src) ||
      /process\.env\.[A-Za-z_]\w*\s*=(?!=)/.test(src) ||
      /delete process\.env/.test(src);
    if (!writes) continue;
    // Three shapes genuinely put it back. `finally` is the third and it is the
    // finer-grained one — cli-transport-resilience restores PATH around a single
    // spawn rather than after the whole test, which is stricter than an
    // afterEach, not looser.
    const restores =
      /keepEnv\(/.test(src) || /test\.afterEach\(/.test(src) || /\}\s*finally\s*\{/.test(src);
    if (!restores) offenders.push(f);
  }

  console.log(`[lane] ${files.length} probe file(s); ${offenders.length} mutate the environment without restoring it`);
  expect(offenders, "these mutate process.env and leave it that way for every probe after them").toEqual([]);
});
