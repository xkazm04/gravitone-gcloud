// LANE — STUDIO DATA LAYER: Project Write Atomicity (dynamic probe).
//
// Demonstrates that project writes (phase bookmarking via parkAt, progress reporting
// via reportPhase, and dialog editing via editProject) must be atomic in-transaction
// mutations rather than read-modify-write whole-record replacements.
// Whole-record replacements race with concurrent writers and wipe facts.

import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

import {
  editProject,
  getProject,
  listProjects,
  newProject,
  parkAt,
  putProject,
  reportPhase,
} from "@/lib/projects";
import { openDb, PROJECTS_STORE, runTx } from "@/lib/studioDb";
import { stripComments } from "./_helpers";

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

test("case 1: concurrent parkAt and reportPhase preserve both phase bookmark and progress report", async () => {
  const p = await putProject(
    newProject("u1", {
      title: "P1",
      logline: "",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 120,
    }),
  );
  expect(p.phase).toBe("research");
  expect(p.progress.research).toBe("empty");

  await Promise.all([
    parkAt(p.id, "score"),
    reportPhase(p.id, "research", "working"),
  ]);

  const after = await getProject(p.id);
  expect(after).toBeDefined();
  expect(after?.phase).toBe("score");
  expect(after?.progress.research).toBe("working");
});

test("case 2: concurrent reportPhase calls preserve both progress states", async () => {
  const p = await putProject(
    newProject("u1", {
      title: "P2",
      logline: "",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 120,
    }),
  );
  expect(p.progress.research).toBe("empty");
  expect(p.progress.script).toBe("empty");

  await Promise.all([
    reportPhase(p.id, "research", "done"),
    reportPhase(p.id, "script", "working"),
  ]);

  const after = await getProject(p.id);
  expect(after).toBeDefined();
  expect(after?.progress.research).toBe("done");
  expect(after?.progress.script).toBe("working");
});

test("case 3: editProject does not overwrite concurrent phase or progress changes made since snapshot", async () => {
  const p = await putProject(
    newProject("u1", {
      title: "Original",
      logline: "",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 120,
    }),
  );

  const snapshot = await getProject(p.id);
  expect(snapshot).toBeDefined();
  expect(snapshot?.phase).toBe("research");
  expect(snapshot?.progress.research).toBe("empty");

  await reportPhase(p.id, "research", "done");
  await parkAt(p.id, "script");

  // Edit path delegates to editProject (which useProjects.update delegates to)
  await editProject(p.id, { title: "renamed" });

  const after = await getProject(p.id);
  expect(after).toBeDefined();
  expect(after?.title).toBe("renamed");
  expect(after?.phase).toBe("script");
  expect(after?.progress.research).toBe("done");
});

test("case 4: editProject only allows ProjectDraft fields across the edit door", async () => {
  const p = await putProject(
    newProject("u1", {
      title: "Initial Title",
      logline: "Initial Logline",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 120,
    }),
  );
  const initialPhase = p.phase;
  const initialProgress = { ...p.progress };
  const initialUid = p.uid;

  await editProject(p.id, {
    title: "x",
    progress: {
      research: "done",
      script: "done",
      frames: "done",
      score: "done",
      cut: "done",
    },
    phase: "cut",
    uid: "other",
  } as never);

  const after = await getProject(p.id);
  expect(after).toBeDefined();
  expect(after?.title).toBe("x");
  expect(after?.phase).toBe(initialPhase);
  expect(after?.uid).toBe(initialUid);
  expect(after?.progress).toEqual(initialProgress);
});

test("case 5 (guard): parkAt alone leaves updatedAt identical and progress identical; reportPhase alone stamps updatedAt > previous", async () => {
  const p = await putProject(
    newProject("u1", {
      title: "Guard Project",
      logline: "",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 120,
    }),
  );
  const initialUpdatedAt = p.updatedAt;
  const initialProgress = { ...p.progress };

  await new Promise((r) => setTimeout(r, 20));

  await parkAt(p.id, "frames");
  const afterPark = await getProject(p.id);
  expect(afterPark).toBeDefined();
  expect(afterPark?.updatedAt).toBe(initialUpdatedAt);
  expect(afterPark?.progress).toEqual(initialProgress);
  expect(afterPark?.phase).toBe("frames");

  await new Promise((r) => setTimeout(r, 20));

  await reportPhase(p.id, "research", "working");
  const afterReport = await getProject(p.id);
  expect(afterReport).toBeDefined();
  expect(afterReport?.updatedAt).toBeGreaterThan(initialUpdatedAt);
  expect(afterReport?.progress.research).toBe("working");
  expect(afterReport?.phase).toBe("frames");
});

test("case 6 (guard): parkAt / reportPhase / editProject on absent id resolve without writing", async () => {
  await putProject(
    newProject("u1", {
      title: "Anchor",
      logline: "",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 120,
    }),
  );
  const rowsBefore = await listProjects("u1");
  expect(rowsBefore.length).toBe(1);

  const missingId = "missing-project-id";
  await expect(parkAt(missingId, "frames")).resolves.toBeUndefined();
  await expect(reportPhase(missingId, "research", "working")).resolves.toBeUndefined();
  const editRes = await editProject(missingId, { title: "Ghost" });
  expect(editRes).toBeNull();

  const rowsAfter = await listProjects("u1");
  expect(rowsAfter.length).toBe(1);
  expect(await getProject(missingId)).toBeUndefined();
});

test("case 7 (critic revision): source ratchet - no whole-record putProject in update, parkAt, reportPhase", () => {
  const useProjectsRaw = readFileSync(resolve(process.cwd(), "lib/useProjects.ts"), "utf-8");
  const useProjectsCode = stripComments(useProjectsRaw);

  const createStart = useProjectsCode.indexOf("const create =");
  const updateStart = useProjectsCode.indexOf("const update =");
  const removeStart = useProjectsCode.indexOf("const remove =");

  expect(createStart).toBeGreaterThan(-1);
  expect(updateStart).toBeGreaterThan(createStart);
  expect(removeStart).toBeGreaterThan(updateStart);

  const createBody = useProjectsCode.slice(createStart, updateStart);
  const updateBody = useProjectsCode.slice(updateStart, removeStart);

  expect(updateBody).not.toContain("putProject(");
  expect(updateBody).toContain("editProject(");
  expect(createBody).toContain("putProject(");
  expect(createBody).toContain("newProject(");

  const projectsRaw = readFileSync(resolve(process.cwd(), "lib/projects.ts"), "utf-8");
  const projectsCode = stripComments(projectsRaw);

  const parkAtStart = projectsCode.indexOf("export async function parkAt(");
  const reportPhaseStart = projectsCode.indexOf("export async function reportPhase(");
  const editProjectStart = projectsCode.indexOf("export async function editProject(");
  const nextExportStart = projectsCode.indexOf("export interface ProjectContents", editProjectStart);

  expect(parkAtStart).toBeGreaterThan(-1);
  expect(reportPhaseStart).toBeGreaterThan(parkAtStart);
  expect(editProjectStart).toBeGreaterThan(reportPhaseStart);
  expect(nextExportStart).toBeGreaterThan(editProjectStart);

  const parkAtBody = projectsCode.slice(parkAtStart, reportPhaseStart);
  const reportPhaseBody = projectsCode.slice(reportPhaseStart, editProjectStart);
  const editProjectBody = projectsCode.slice(editProjectStart, nextExportStart);

  expect(parkAtBody).not.toContain("getProject(");
  expect(parkAtBody).not.toContain("writeProject(");
  expect(parkAtBody).not.toContain("putProject(");
  expect(parkAtBody).toContain("patchProject(");

  expect(reportPhaseBody).not.toContain("getProject(");
  expect(reportPhaseBody).not.toContain("writeProject(");
  expect(reportPhaseBody).not.toContain("putProject(");
  expect(reportPhaseBody).toContain("patchProject(");

  expect(editProjectBody).not.toContain("putProject(");
  expect(editProjectBody).toContain("patchProject(");
});
