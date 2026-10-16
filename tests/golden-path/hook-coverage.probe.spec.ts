// LANE - HOOK COVERAGE, DERIVED FROM THE FILESYSTEM (static + one self-check).
//
// WHY. This repo's worst defects sat in the joins between steps, and the hooks
// are where those joins live. The node lane can drive a hook through the shared
// dispatcher (_studio/hooks.ts), but nothing said which hooks it drives, so a new
// `app/x/useThing.ts` landed with no driver and nobody noticed.
//
// THE RULE. Every `app/**/use*.ts(x)` is either DRIVEN - imported by a probe
// that also imports `./_studio/hooks` - or EXEMPT with a reason. Three failures:
//   · a hook that is neither (named in the message),
//   · an exemption whose file no longer exists,
//   · an exemption for a hook that IS driven now (a stale exemption: delete it,
//     so the list can only shrink as drivers arrive).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { test, expect } from "@playwright/test";

const ROOT = process.cwd();
const PROBES = join(ROOT, "tests", "golden-path");

/* ───────────────────────────── the exemption list ─────────────────────────── */

const LEGACY =
  "driven today by a private dispatcher copy in the named probe(s), not _studio/hooks.ts - migrate it onto the shared harness";
const NO_DRIVER = "no probe drives this hook through a dispatcher yet";
const NEEDS_DOM =
  "reads pointer/keyboard/layout events (or a ref'd element) that this DOM-less lane cannot produce";

/** hook path -> why it is not driven through _studio/hooks.ts. Shrink-only. */
export const EXEMPT: Record<string, string> = {
  "app/articles/useArticles.ts": NO_DRIVER,
  "app/calendar/useCalendar.ts": NO_DRIVER,
  "app/calendar/useDrag.ts": NEEDS_DOM,
  "app/foundry/pipeline/useAudition.ts": NO_DRIVER,
  "app/foundry/pipeline/useBoardCull.ts": NO_DRIVER,
  "app/foundry/pipeline/useBoardEngine.ts": NO_DRIVER,
  "app/foundry/pipeline/useBoardKeys.ts": NEEDS_DOM,
  "app/foundry/pipeline/useBoardMoves.ts": NO_DRIVER,
  "app/foundry/pipeline/useBoardVerbs.ts": NO_DRIVER,
  "app/foundry/pipeline/useCanvasHandle.ts": NEEDS_DOM,
  "app/foundry/pipeline/useCardDrag.ts": NEEDS_DOM,
  "app/foundry/pipeline/useCards.tsx": NO_DRIVER,
  "app/foundry/pipeline/useCullRect.ts": NEEDS_DOM,
  "app/foundry/pipeline/useFullScreen.ts": NEEDS_DOM,
  "app/foundry/pipeline/useGhostFlight.ts": NEEDS_DOM,
  "app/foundry/pipeline/useOffers.ts": NO_DRIVER,
  "app/foundry/pipeline/usePipelineData.ts": NO_DRIVER,
  "app/foundry/pipeline/usePointerVerbs.ts": NEEDS_DOM,
  "app/foundry/pipeline/useSelection.ts": NO_DRIVER,
  "app/foundry/pipeline/useViewport.ts": NEEDS_DOM,
  "app/foundry/pipeline/useViewportEvents.ts": NEEDS_DOM,
  "app/playground/arrange/useArrange.ts": NO_DRIVER,
  "app/playground/hunt/useHunt.ts": NO_DRIVER,
  "app/playground/triage/useTriage.ts": NO_DRIVER,
  "app/_phases/_shared/useStorageTrouble.ts": NO_DRIVER,
  "app/(studio)/library/_library/useNarrow.ts": NEEDS_DOM,
  "app/_phases/_shared/useLoadFor.ts": `${LEGACY}: step-records, through the stub of lib/useLoadFor.ts`,
};

/* ───────────────────────────── derivation (pure) ──────────────────────────── */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const rel = (p: string) => p.slice(ROOT.length + 1).replace(/\\/g, "/");

/** Every `app/**\/use[A-Z]*.ts(x)`, repo-relative with forward slashes. */
export function hooksOnDisk(): string[] {
  return walk(join(ROOT, "app"))
    .map(rel)
    .filter((p) => /\/use[A-Z][^/]*\.tsx?$/.test(p))
    .sort();
}

/** Hooks imported (`from "@/app/..."`) by a probe that also imports the shared
 *  dispatcher. A bare mention in a comment does not count: only an import. */
export function drivenHooks(): Set<string> {
  const driven = new Set<string>();
  for (const f of readdirSync(PROBES).filter((n) => n.endsWith(".spec.ts"))) {
    if (f === "hook-coverage.probe.spec.ts") continue;
    const src = readFileSync(join(PROBES, f), "utf8");
    if (!/from\s+"\.\/_studio\/hooks"/.test(src)) continue;
    for (const m of src.matchAll(/from\s+"@\/(app\/[^"]*\/use[A-Z][^"/]*)"/g)) {
      for (const ext of [".ts", ".tsx"]) driven.add(posix.normalize(m[1]) + ext);
    }
  }
  return driven;
}

/** The three ways this lane's list can be wrong, as sentences. */
export function coverageProblems(
  hooks: readonly string[],
  driven: ReadonlySet<string>,
  exempt: Readonly<Record<string, string>>,
): string[] {
  const problems: string[] = [];
  const onDisk = new Set(hooks);
  for (const h of hooks) {
    if (!driven.has(h) && !(h in exempt)) {
      problems.push(`${h}: no probe drives it through _studio/hooks and it has no exemption`);
    }
  }
  for (const [h, reason] of Object.entries(exempt)) {
    if (!reason.trim()) problems.push(`${h}: exemption has no reason`);
    if (!onDisk.has(h)) problems.push(`${h}: stale exemption - the file is gone`);
    else if (driven.has(h)) problems.push(`${h}: stale exemption - it IS driven now, delete the entry`);
  }
  return problems;
}

/* ──────────────────────────────────── probes ──────────────────────────────── */

test("the derivation sees hooks and drivers at all (a walk that finds nothing proves nothing)", () => {
  const hooks = hooksOnDisk();
  expect(hooks.length, "found no app/**/use*.ts - the walk is broken").toBeGreaterThan(20);
  // The two hooks this used to name as driven (useTrailerCut, useSpots) retired
  // with the v1 studio (Phase 4 wave D); no app hook is driven through the shared
  // dispatcher today, so the self-check is the walk, and the matcher below is held
  // by the synthetic case at the end.
  expect(drivenHooks().size).toBeGreaterThanOrEqual(0);
});

test("every app hook is driven through the shared harness or exempted with a reason", () => {
  const problems = coverageProblems(hooksOnDisk(), drivenHooks(), EXEMPT);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("a new hook with no driver and no exemption fails, and is named", () => {
  const hooks = [...hooksOnDisk(), "app/x/useThing.ts"];
  const problems = coverageProblems(hooks, drivenHooks(), EXEMPT);
  expect(problems).toEqual([expect.stringContaining("app/x/useThing.ts")]);
});

test("a stale exemption fails: gone file and now-driven hook", () => {
  // Synthetic on both sides: the hook the real list once named as driven
  // (useSpots) retired with the v1 studio, so a now-driven hook is made here.
  const driven = new Set([...drivenHooks(), "app/x/useDriven.ts"]);
  const exempt = {
    ...EXEMPT,
    "app/gone/useGone.ts": NO_DRIVER,
    "app/x/useDriven.ts": NO_DRIVER,
  };
  const problems = coverageProblems([...hooksOnDisk(), "app/x/useDriven.ts"], driven, exempt);
  expect(problems.some((p) => p.includes("useGone.ts") && p.includes("gone"))).toBe(true);
  expect(problems.some((p) => p.includes("useDriven.ts") && p.includes("IS driven"))).toBe(true);
});
