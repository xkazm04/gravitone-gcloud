// LANE — STUDIO WORKSPACE: Step Sign-off Locking and Matrix Derivation (dynamic probe).
//
// Demonstrates that human sign-off ("locking" a step) is an explicit milestone
// on the project record, distinct from what an automated step reporter reports.
// Derived reporting cannot undo human sign-off, but blocker news ("blocked")
// always beats the lock. ProjectsMatrix and Stepper must derive their cells and
// column counts from stateOf(p, phase) / phaseStates(p) rather than raw progress.

import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

import ProjectsMatrix from "@/app/_projects/ProjectsMatrix";
import {
  PHASES,
  PHASE_STATE_WORD,
  doneCount,
  getProject,
  isBlocked,
  newProject,
  parkAt,
  phaseStates,
  projectState,
  putProject,
  reopen,
  reportPhase,
  signOff,
  signOffBlocker,
  stateOf,
  type Project,
} from "@/lib/projects";
import { openDb, PROJECTS_STORE, runTx } from "@/lib/studioDb";

import { mkProject, noopProps, stripComments } from "./_helpers";

async function clearProjectsStore() {
  const db = await openDb();
  try {
    await runTx(db, PROJECTS_STORE, "readwrite", (store) => {
      store.clear();
    });
  } finally {
    db.close();
  }
}

test.beforeEach(async () => {
  await clearProjectsStore();
});

interface TestElementNode {
  type?: unknown;
  key?: string;
  props?: {
    "data-testid"?: string;
    children?: unknown;
    title?: string;
    "aria-label"?: string;
    className?: string;
  };
}

function findElementByTestId(node: unknown, testid: string): TestElementNode | null {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const c of node) {
      const found = findElementByTestId(c, testid);
      if (found) return found;
    }
    return null;
  }
  const el = node as TestElementNode;
  if (el.props?.["data-testid"] === testid) return el;
  return findElementByTestId(el.props?.children, testid);
}

test("case 1: project with progress.frames 'review'; signOff(id,'frames') -> stored record has signedOff.frames, progress.frames still 'review', stateOf 'done', doneCount +1", async () => {
  const p0 = await putProject(
    newProject("u1", {
      title: "P1",
      logline: "",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 120,
    }),
  );
  await reportPhase(p0.id, "frames", "review");
  const p = (await getProject(p0.id))!;
  expect(p.progress.frames).toBe("review");
  const countBefore = doneCount(p);

  const t0 = Date.now();
  await signOff(p.id, "frames");
  const t1 = Date.now();

  const stored = (await getProject(p.id))!;
  expect(stored.signedOff?.frames).toBeDefined();
  expect(typeof stored.signedOff?.frames).toBe("number");
  expect(stored.signedOff!.frames).toBeGreaterThanOrEqual(t0);
  expect(stored.signedOff!.frames).toBeLessThanOrEqual(t1);
  expect(stored.progress.frames).toBe("review");
  expect(stateOf(stored, "frames")).toBe("done");
  expect(doneCount(stored)).toBe(countBefore + 1);
});

test("case 2: progress.frames 'blocked'; signOffBlocker returns non-null reason and signOff writes nothing", async () => {
  const p0 = await putProject(
    newProject("u1", {
      title: "P2",
      logline: "",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 120,
    }),
  );
  await reportPhase(p0.id, "frames", "blocked");
  const p = (await getProject(p0.id))!;
  expect(p.progress.frames).toBe("blocked");

  const blocker = signOffBlocker(p, "frames");
  expect(blocker).not.toBeNull();
  expect(typeof blocker).toBe("string");

  const before = await getProject(p.id);
  await signOff(p.id, "frames");
  const after = await getProject(p.id);
  expect(after).toEqual(before);
});

test("case 3: progress.cut 'empty'; signOffBlocker non-null and signOff refuses - there is nothing to sign", async () => {
  const p = await putProject(
    newProject("u1", {
      title: "P3",
      logline: "",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 120,
    }),
  );
  expect(p.progress.cut).toBe("empty");

  const blocker = signOffBlocker(p, "cut");
  expect(blocker).not.toBeNull();
  expect(typeof blocker).toBe("string");
  expect(blocker).toBe("Nothing has been started on this step yet");

  const before = await getProject(p.id);
  await signOff(p.id, "cut");
  const after = await getProject(p.id);
  expect(after).toEqual(before);
});

test("case 4: after signOff, reportPhase 'working' -> progress.frames 'working' and stateOf still 'done'", async () => {
  const p0 = await putProject(
    newProject("u1", {
      title: "P4",
      logline: "",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 120,
    }),
  );
  await reportPhase(p0.id, "frames", "review");
  await signOff(p0.id, "frames");
  const signed = (await getProject(p0.id))!;
  expect(stateOf(signed, "frames")).toBe("done");

  await reportPhase(p0.id, "frames", "working");
  const after = (await getProject(p0.id))!;
  expect(after.progress.frames).toBe("working");
  expect(stateOf(after, "frames")).toBe("done");
});

test("case 5: after signOff, reportPhase 'blocked' -> stateOf 'blocked', isBlocked true, projectState 'blocked'", async () => {
  const p0 = await putProject(
    newProject("u1", {
      title: "P5",
      logline: "",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 120,
    }),
  );
  await reportPhase(p0.id, "frames", "review");
  await signOff(p0.id, "frames");

  await reportPhase(p0.id, "frames", "blocked");
  const after = (await getProject(p0.id))!;
  expect(stateOf(after, "frames")).toBe("blocked");
  expect(isBlocked(after)).toBe(true);
  expect(projectState(after)).toBe("blocked");
});

test("case 6: reopen after sign-off -> signedOff.frames absent and stateOf equals own progress; reopen on unsigned step writes nothing", async () => {
  const p0 = await putProject(
    newProject("u1", {
      title: "P6",
      logline: "",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 120,
    }),
  );
  await reportPhase(p0.id, "frames", "working");
  await signOff(p0.id, "frames");
  const signed = (await getProject(p0.id))!;
  expect(signed.signedOff?.frames).toBeDefined();
  expect(stateOf(signed, "frames")).toBe("done");

  await reopen(p0.id, "frames");
  const reopened = (await getProject(p0.id))!;
  expect(reopened.signedOff?.frames).toBeUndefined();
  expect(stateOf(reopened, "frames")).toBe("working");
  expect(stateOf(reopened, "frames")).toBe(reopened.progress.frames);

  // reopen on an unsigned step writes nothing
  const beforeUnsigned = await getProject(p0.id);
  await reopen(p0.id, "script");
  const afterUnsigned = await getProject(p0.id);
  expect(afterUnsigned).toEqual(beforeUnsigned);
});

test("case 7: all five steps reported working/review and each signed off -> doneCount 5 and projectState 'delivered'; legacy record with no signedOff reads as today", async () => {
  const p0 = await putProject(
    newProject("u1", {
      title: "P7",
      logline: "",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 120,
    }),
  );
  for (const ph of PHASES) {
    await reportPhase(p0.id, ph, ph === "research" || ph === "cut" ? "working" : "review");
    await signOff(p0.id, ph);
  }
  const delivered = (await getProject(p0.id))!;
  expect(doneCount(delivered)).toBe(5);
  expect(projectState(delivered)).toBe("delivered");
  expect(phaseStates(delivered)).toEqual({
    research: "done",
    script: "done",
    frames: "done",
    score: "done",
    cut: "done",
  });

  // Legacy record with no signedOff field reads exactly as today
  const legacy = mkProject("legacy-1", Date.now(), {
    research: "working",
    script: "review",
    frames: "done",
    score: "empty",
    cut: "blocked",
  });
  delete (legacy as Partial<Project>).signedOff;
  for (const ph of PHASES) {
    expect(stateOf(legacy, ph)).toBe(legacy.progress[ph]);
  }
  expect(phaseStates(legacy)).toEqual(legacy.progress);
  expect(doneCount(legacy)).toBe(1);
  expect(isBlocked(legacy)).toBe(true);
});

test("case 8 (guard): parkAt on a signed-off project leaves signedOff and updatedAt untouched", async () => {
  const p = await putProject({
    ...newProject("u1", {
      title: "P8",
      logline: "",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 120,
    }),
    signedOff: { frames: 1728000000000 },
  } as Project);
  const beforeUpdated = p.updatedAt;
  await parkAt(p.id, "cut");
  const after = (await getProject(p.id))!;
  expect(after.phase).toBe("cut");
  expect(after.signedOff?.frames).toBe(1728000000000);
  expect(after.updatedAt).toBe(beforeUpdated);
});

test("case 9 (critic revision): ProjectsMatrix renders signed-off cell as locked and footer counts it; source ratchet has no p.progress[", () => {
  const proj = {
    ...mkProject("p-matrix-1", Date.now(), { frames: "review" }),
    signedOff: { frames: Date.now() },
  };
  const tree = (ProjectsMatrix as unknown as (p: unknown) => unknown)({
    projects: [proj],
    ...noopProps,
  });

  const cell = findElementByTestId(tree, "cell-p-matrix-1-frames");
  expect(cell).toBeDefined();
  expect(cell?.props?.title).toContain(PHASE_STATE_WORD.done);
  expect(cell?.props?.["aria-label"]).toContain(`(${PHASE_STATE_WORD.done})`);

  // Footer: frames column totals locked steps down its column
  interface FooterSpanNode {
    type?: unknown;
    key?: string;
    props?: {
      className?: string;
      children?: Array<{ props?: { children?: unknown; className?: string } }>;
    };
  }

  function findFooterSpans(node: unknown, acc: FooterSpanNode[] = []): FooterSpanNode[] {
    if (node == null || typeof node !== "object") return acc;
    if (Array.isArray(node)) {
      for (const c of node) findFooterSpans(c, acc);
      return acc;
    }
    const el = node as FooterSpanNode;
    if (el.props?.className?.includes("text-center whitespace-nowrap")) {
      acc.push(el);
    }
    findFooterSpans((el as { props?: { children?: unknown } }).props?.children, acc);
    return acc;
  }
  const footerSpans = findFooterSpans(tree);
  const framesFooter = footerSpans.find((s) => s.key === "frames");
  expect(framesFooter).toBeDefined();
  expect(framesFooter?.props?.children?.[0]?.props?.children).toBe(1);
  expect(framesFooter?.props?.children?.[0]?.props?.className).toContain("text-emerald-200/80");

  const matrixRaw = readFileSync(resolve(process.cwd(), "app/_projects/ProjectsMatrix.tsx"), "utf-8");
  const matrixCode = stripComments(matrixRaw);

  expect(matrixCode).not.toContain("p.progress[");
});
