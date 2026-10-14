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
  "app/board/useBoard.ts": NO_DRIVER,
  "app/board/useBoardKeys.ts": NEEDS_DOM,
  "app/calendar/useCalendar.ts": NO_DRIVER,
  "app/calendar/useDrag.ts": NEEDS_DOM,
  "app/foundry/gate/useGate.ts": NO_DRIVER,
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
  "app/library/assets/useShelf.ts": NO_DRIVER,
  "app/library/audio/useAudioShelf.ts": NO_DRIVER,
  "app/playground/arrange/useArrange.ts": NO_DRIVER,
  "app/playground/hunt/useHunt.ts": NO_DRIVER,
  "app/playground/triage/useTriage.ts": NO_DRIVER,
  "app/_library/useProjectOutputs.ts": NO_DRIVER,
  "app/_phases/cut/ads/useAdRenders.ts": NO_DRIVER,
  "app/_phases/cut/music-video/useMusicVideoExport.ts": NO_DRIVER,
  "app/_phases/cut/useAnimaticExport.ts": NO_DRIVER,
  "app/_phases/cut/useCut.ts": NO_DRIVER,
  "app/_phases/cut/useTakeAudio.ts": NO_DRIVER,
  "app/_phases/frames/ads/useAdsFrames.ts": NO_DRIVER,
  "app/_phases/frames/ads/useAdsShots.ts": NO_DRIVER,
  "app/_phases/frames/alternatives/useAlternatives.ts": `${LEGACY}: picture-unit, step-records`,
  "app/_phases/frames/music-video/useMusicVideoComposition.ts": `${LEGACY}: step-records, turn-poster`,
  "app/_phases/frames/useFrames.ts": `${LEGACY}: frames-notebook, phase-report-retry, picture-unit`,
  "app/_phases/motion/ads/useAdsMotion.ts": NO_DRIVER,
  "app/_phases/motion/useMotion.ts": NO_DRIVER,
  "app/_phases/research/beats/useBeatPicks.ts": NO_DRIVER,
  "app/_phases/research/guided/useEducationalResearch.ts": `${LEGACY}: active-notebook, c1-closing, turn-research-live`,
  "app/_phases/research/run/useResearchRun.ts": NO_DRIVER,
  "app/_phases/research/useFollowUps.ts": NO_DRIVER,
  "app/_phases/research/useMusicVideoSource.ts": `${LEGACY}: step-records`,
  "app/_phases/research/useScope.ts": `${LEGACY}: active-notebook, c1-closing`,
  "app/_phases/score/useCueTakes.ts": NO_DRIVER,
  "app/_phases/script/candidates/useAdoption.ts": NO_DRIVER,
  "app/_phases/script/candidates/useScriptFace.ts": NO_DRIVER,
  "app/_phases/script/useVersions.ts": `${LEGACY}: c1-closing`,
  "app/_phases/_shared/notebook/useActiveNotebook.ts": `${LEGACY}: active-notebook, c1-closing, picture-unit, turn-research-live`,
  "app/_phases/_shared/records/useRecord.ts": `${LEGACY}: step-records`,
  "app/_phases/_shared/usePhaseReport.ts": `${LEGACY}: phase-report-retry`,
  "app/_phases/_shared/useStorageTrouble.ts": NO_DRIVER,
  "app/_projects/useShelf.ts": NO_DRIVER,
  "app/_phases/_shared/useLoadFor.ts": `${LEGACY}: step-records, through the stub of lib/useLoadFor.ts (also reached through useSpots, which IS driven)`,
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
  const driven = drivenHooks();
  expect(driven.has("app/_phases/script/trailer/useTrailerCut.ts")).toBe(true);
  expect(driven.has("app/_phases/score/useSpots.ts")).toBe(true);
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
  const exempt = {
    ...EXEMPT,
    "app/gone/useGone.ts": NO_DRIVER,
    "app/_phases/score/useSpots.ts": NO_DRIVER,
  };
  const problems = coverageProblems(hooksOnDisk(), drivenHooks(), exempt);
  expect(problems.some((p) => p.includes("useGone.ts") && p.includes("gone"))).toBe(true);
  expect(problems.some((p) => p.includes("useSpots.ts") && p.includes("IS driven"))).toBe(true);
});
