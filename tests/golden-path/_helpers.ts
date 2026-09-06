// Shared fixtures for the golden-path dynamic probes.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test } from "@playwright/test";

import { PHASES, type PhaseKey, type PhaseState, type Project } from "@/lib/projects";

/**
 * Snapshot `vars` before each test and put them back after it.
 *
 * playwright.config.ts states this lane's independence contract out loud:
 * the probes share ONE Node process, they run serially, and "independence
 * here comes from state reset inside each probe, never from worker
 * isolation, because there is no worker isolation."
 *
 * Seven probes mutate `process.env`; three restored it and four only set up.
 * Nothing fails today — measured 2026-08-29, every one of the 37 files passes
 * alone as well as in the suite — but the four were leaving a configured
 * access secret, a deleted dev-auth flag and a spend ceiling behind them for
 * every later file in alphabetical order. The next probe that reads one of
 * those inherits a verdict somebody else set up, and because the lane is
 * serial it would not flake: it would just be quietly wrong, in one
 * direction, forever.
 *
 * Snapshot-and-restore rather than the blind `delete` the music probes use:
 * a variable the developer legitimately has in `.env.local` should come back,
 * not vanish for the rest of the run.
 *
 * Call it at FILE SCOPE, above the probe's own `beforeEach` — Playwright runs
 * hooks in registration order, so the snapshot has to be registered first.
 */
export function keepEnv(vars: readonly string[]): void {
  const saved: Record<string, string | undefined> = {};
  test.beforeEach(() => {
    for (const v of vars) saved[v] = process.env[v];
  });
  test.afterEach(() => {
    for (const v of vars) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
  });
}

const allEmpty = (): Record<PhaseKey, PhaseState> =>
  Object.fromEntries(PHASES.map((p) => [p, "empty"])) as Record<PhaseKey, PhaseState>;

/** A valid Project with the fields ProjectsMatrix actually reads. */
export function mkProject(
  id: string,
  updatedAt: number,
  progress: Partial<Record<PhaseKey, PhaseState>> = {},
): Project {
  return {
    id,
    uid: "u1",
    title: `Project ${id}`,
    logline: "",
    template: "explainer" as Project["template"],
    targetS: 90,
    createdAt: updatedAt - 10_000,
    updatedAt,
    phase: "research",
    progress: { ...allEmpty(), ...progress },
  } as Project;
}

/** Walk a Playwright/React element tree, counting elements and collecting testids. */
export function walkTree(node: unknown, acc: { n: number; testids: string[]; handlers: unknown[] }) {
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const c of node) walkTree(c, acc);
    return;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type !== undefined && el.props !== undefined) {
    acc.n++;
    const tid = el.props["data-testid"];
    if (typeof tid === "string") acc.testids.push(tid);
    if (typeof el.props.onClick === "function") acc.handlers.push(el.props.onClick);
    walkTree(el.props.children, acc);
  }
}

export const noopProps = {
  onOpen: () => {},
  onEdit: () => {},
  onDelete: () => {},
  onCreate: () => {},
};

// Strip comments from TypeScript source, for the source-ratchet probes.
//
// COMMENTS MUST GO BEFORE A MATCHER RUNS, because the files in this repository
// explain each rule in prose directly above the code that implements it — so a
// matcher over raw text is satisfied by a file that TALKS about the rule and
// does not follow it. object-url-ownership.probe.spec.ts records that happening
// for real.
//
// WHY A SCANNER AND NOT TWO `replace` CALLS. The pair those probes each carry
// privately strips block comments FIRST and line comments second. That treats a
// block-open sequence appearing inside a LINE comment as really opening a block
// — and this repo's prose is full of route globs written exactly that way:
// /api/imaging/ + star, /api/foundry/ + star. The phantom block then runs to the
// next genuine block terminator and takes every line between with it.
//
// Measured 2026-09-05 over 268 files under app/ and lib/: 14 files lose a
// contiguous region that way — lib/imaging/api.ts 80% of its bytes,
// lib/imaging/types.ts 78%, lib/localMode.ts 74%, app/foundry/extractClient.ts
// 72%. Code inside those regions is invisible to every probe using that pair,
// and invisible code reads as a clean codebase in a voice indistinguishable
// from success.
//
// Checked the same day, and this is the honest half: NO probe in the suite was
// actually blinded by it. object-url-ownership hides zero callers, and all 26
// API routes still show their gate to imaging-auth. The one victim was a probe
// being written at the time, caught only by seeding the defect and watching it
// fail to go red. So this is a live hazard with no current casualty — which is
// the moment to fix it, not evidence that it does not matter.
//
// Swapping the order of the two replaces is not the fix either: a block comment
// containing a line comment then loses its terminator and survives the strip. So
// this walks the source once, tracking the three quoting forms a comment can
// hide inside. Newlines are preserved so line numbers still line up.
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += src[i++];
      while (i < src.length) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += src[i++];
  }
  return out;
}

/**
 * Aim the foundry's two VERSIONED indices at a fresh temp directory for the
 * duration of each test in the calling file, and return a getter for it.
 *
 * `pipeline/foundry/{ledger,styles}.json` are git-tracked, so before
 * `foundryFile()` existed (lib/foundry/store.ts) there was no way to watch a
 * commit do its work: `commitRun` and `commitExtractRun` could only be
 * exercised by letting them rewrite two files under version control, which no
 * probe may do. This helper is the other half of that override.
 *
 * A FRESH directory per test, not per file, because a commit's whole subject
 * is what the second call sees of the first — a shared directory would let
 * one test's rows decide another's count.
 *
 * Call it at FILE SCOPE. `keepEnv` is registered from inside so the snapshot
 * lands before the assignment and `FOUNDRY_DIR` is gone again afterwards, for
 * the same reason the doc above it gives.
 */
export function probeFoundryDir(): () => string {
  keepEnv(["FOUNDRY_DIR"]);
  let dir = "";
  test.beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "foundry-probe-"));
    process.env.FOUNDRY_DIR = dir;
  });
  test.afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = "";
  });
  return () => dir;
}
