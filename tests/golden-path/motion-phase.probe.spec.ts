// LANE — THE SIXTH STEP: Motion between Frames and Score (video-clip-pipeline-B,
// stage 1).
//
// Motion was a step once, was folded into Frames, and is a step again: the
// operator approved the sixth phase on 2026-10-05. Adding a member to `PHASES`
// is a change to every progress consumer at once — the shelf's gates, its
// "next" verb, the stepper, the delivered count — and every project record
// already in somebody's IndexedDB was written with five keys. So the migration
// default is pinned FIRST, against a record written raw to the store the way an
// older build left it, not against `newProject` (which can only ever produce
// the current shape).
//
//   1. PHASES orders motion after frames and before score.
//   2. A five-key record loads with `progress.motion === "empty"`, every other
//      word untouched, through both read doors (`getProject`, `listProjects`).
//   3. The first write after that load (`reportPhase` → `patchProject`)
//      persists the six-key shape, so the default is not re-derived forever.
//   4. A record whose bookmark says `phase: "motion"` opens on Motion — the
//      retired-step rename that sent it to Frames must not survive the step
//      coming back.
//   5. The shelf counts six: a lane draws a Motion gate, and a project whose
//      five original steps are locked is not "delivered" while Motion is empty.

import "fake-indexeddb/auto";

import { test, expect } from "@playwright/test";

import { Lane } from "@/app/_projects/RaceSheet";
import { nextAction } from "@/app/_projects/shelf";
import {
  PHASES,
  PHASE_TITLE,
  doneCount,
  getProject,
  listProjects,
  phaseStates,
  projectState,
  reportPhase,
  type Project,
} from "@/lib/projects";
import { getRecord, openDb, PROJECTS_STORE, runTx } from "@/lib/studioDb";

import { noopProps } from "./_helpers";

/** A record exactly as a five-step build stored it: no `motion` key at all. */
function fiveStepRecord(id: string, over: Partial<Record<string, unknown>> = {}): Project {
  return {
    id,
    uid: "u-motion",
    title: `Legacy ${id}`,
    logline: "",
    template: "short-educational-video",
    discipline: "educational",
    targetS: 120,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    phase: "frames",
    progress: { research: "done", script: "done", frames: "working", score: "empty", cut: "empty" },
    ...over,
  } as unknown as Project;
}

async function putRaw(rows: Project[]) {
  const db = await openDb();
  try {
    await runTx(db, PROJECTS_STORE, "readwrite", (store) => {
      store.clear();
      for (const r of rows) store.put(r);
    });
  } finally {
    db.close();
  }
}

async function readRaw(id: string): Promise<Project | undefined> {
  const db = await openDb();
  try {
    return await getRecord<Project>(db, PROJECTS_STORE, id);
  } finally {
    db.close();
  }
}

test("case 1: PHASES has motion after frames and before score, titled Motion", () => {
  expect([...PHASES]).toEqual(["research", "script", "frames", "motion", "score", "cut"]);
  expect((PHASE_TITLE as Record<string, string>).motion).toBe("Motion");
});

test("case 2: a five-key record loads with progress.motion === 'empty', every other word untouched", async () => {
  await putRaw([fiveStepRecord("legacy-a")]);

  const one = await getProject("legacy-a");
  expect(one).toBeDefined();
  expect((one!.progress as Record<string, string>).motion).toBe("empty");
  expect(one!.progress).toEqual({
    research: "done",
    script: "done",
    frames: "working",
    motion: "empty",
    score: "empty",
    cut: "empty",
  });

  const listed = await listProjects("u-motion");
  expect(listed).toHaveLength(1);
  expect((listed[0].progress as Record<string, string>).motion).toBe("empty");

  // Every consumer that walks PHASES sees a word for every step, never undefined.
  const states = phaseStates(one!);
  expect(Object.keys(states).sort()).toEqual([...PHASES].sort());
  for (const k of PHASES) expect(states[k], k).toBeDefined();
  expect(doneCount(one!)).toBe(2);
});

test("case 3: the first write after the load persists the six-key shape", async () => {
  await putRaw([fiveStepRecord("legacy-b")]);
  expect(((await readRaw("legacy-b"))!.progress as Record<string, string>).motion).toBeUndefined();

  await reportPhase("legacy-b", "frames", "review");
  const raw = (await readRaw("legacy-b"))!;
  expect((raw.progress as Record<string, string>).motion).toBe("empty");
  expect(raw.progress.frames).toBe("review");
});

test("case 4: a bookmark on motion opens Motion, and a stored motion word is Motion's own", async () => {
  await putRaw([
    fiveStepRecord("legacy-c", {
      phase: "motion",
      progress: { research: "done", script: "done", frames: "done", motion: "blocked", score: "empty", cut: "empty" },
    }),
  ]);
  const p = (await getProject("legacy-c"))!;
  expect(p.phase).toBe("motion");
  expect((p.progress as Record<string, string>).motion).toBe("blocked");
  // Frames keeps its own word: the step that reported "blocked" is Motion, and
  // merging it into Frames was only right while Motion did not exist.
  expect(p.progress.frames).toBe("done");
});

test("case 5: the shelf counts six — a Motion gate on the lane, and five locked steps are not delivered", () => {
  const p = fiveStepRecord("legacy-d", {
    progress: { research: "done", script: "done", frames: "done", motion: "empty", score: "done", cut: "done" },
  });
  expect(projectState(p)).not.toBe("delivered");
  expect(nextAction(p).step).toBe("motion");
  expect(nextAction(p).verb).toBe("Start Motion");

  const tree = (Lane as unknown as (props: unknown) => unknown)({
    p,
    active: false,
    tabbable: false,
    onFocus: () => {},
    ...noopProps,
  });
  const labels: string[] = [];
  const walk = (n: unknown) => {
    if (n == null || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    const el = n as { props?: Record<string, unknown> };
    const label = el.props?.["aria-label"];
    if (typeof label === "string" && label.startsWith(`Open ${p.title} at `)) labels.push(label);
    walk(el.props?.children);
  };
  walk(tree);
  expect(labels.length, "the lane rendered no gates — the walk is reading the wrong tree").toBeGreaterThan(0);
  expect(labels).toHaveLength(PHASES.length);
  expect(labels.some((l) => l.startsWith(`Open ${p.title} at Motion (`))).toBe(true);
});
