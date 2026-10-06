// LANE — UI SHELL: Notification Bell Deep-Links and Sticky Clear (dynamic probe).
//
// Demonstrates that notification cards act as doors: every card for a running or
// interrupted job or an unread event links directly to the studio phase where the
// work lives, and interrupted jobs can be cleared via an additive sticky tombstone.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { KIND_STEP, jobHref, studioHref, trayModel } from "@/lib/jobLinks";
import { applyClear, mergeJobs, type Job, type JobEvent, type JobKind } from "@/lib/jobs";
import { PHASES } from "@/lib/projects";

import { stripComments } from "./_helpers";

test("case 1: every JobKind maps to a PhaseKey in KIND_STEP; jobHref returns correct studio URL", () => {
  const allJobKinds: JobKind[] = [
    "research",
    "followup",
    "recalibrate",
    "poster-generate",
    "video-export",
    "ad-ideas",
    "ad-scenarios",
    "video-clip",
    "ad-render",
  ];
  for (const kind of allJobKinds) {
    expect(KIND_STEP[kind]).toBeDefined();
    expect(PHASES).toContain(KIND_STEP[kind]);
  }
  expect(Object.keys(KIND_STEP).sort()).toEqual([...allJobKinds].sort());
  expect(studioHref("p1", "script")).toBe("/studio/p1?step=script");
  expect(jobHref({ projectId: "p1", kind: "recalibrate" })).toBe("/studio/p1?step=script");
  expect(jobHref({ projectId: "p1", kind: "research" })).toBe("/studio/p1?step=research");
  expect(jobHref({ projectId: "p1", kind: "followup" })).toBe("/studio/p1?step=research");
  expect(jobHref({ projectId: "p1", kind: "poster-generate" })).toBe("/studio/p1?step=frames");
  expect(jobHref({ projectId: "p1", kind: "video-export" })).toBe("/studio/p1?step=cut");
  expect(jobHref({ projectId: "p1", kind: "ad-scenarios" })).toBe("/studio/p1?step=script");
  // Clips are animated in Motion (ads split, 2026-10-06): images in Frames, clips in Motion.
  expect(jobHref({ projectId: "p1", kind: "video-clip" })).toBe("/studio/p1?step=motion");
  expect(jobHref({ kind: "recalibrate" })).toBeNull();
  expect(jobHref({ projectId: "", kind: "recalibrate" })).toBeNull();
});

test("case 2: trayModel with an interrupted job -> actions are open and clear", () => {
  const interruptedJob: Job = {
    id: "j-int-1",
    projectId: "p1",
    kind: "recalibrate",
    label: "Recalibrate script",
    status: "interrupted",
    startedAt: 1000,
    progress: 0,
    measured: false,
  };
  const model = trayModel({ jobs: [interruptedJob], unread: [], trouble: null });
  expect(model.interruptedCards.length).toBe(1);
  const card = model.interruptedCards[0];
  expect(card.actions).toEqual([
    { kind: "open", href: "/studio/p1?step=script" },
    { kind: "clear", jobId: "j-int-1" },
  ]);
});

test("case 3: trayModel with an unread event -> actions are open (with marksRead) and dismiss", () => {
  const unreadEvent: JobEvent = {
    id: "e1",
    jobId: "j1",
    projectId: "p2",
    kind: "poster-generate",
    ok: true,
    title: "Poster generated",
    detail: "Ready",
    at: 2000,
    read: false,
  };
  const model = trayModel({ jobs: [], unread: [unreadEvent], trouble: null });
  expect(model.eventCards.length).toBe(1);
  const card = model.eventCards[0];
  expect(card.actions).toEqual([
    { kind: "open", href: "/studio/p2?step=frames", marksRead: "e1" },
    { kind: "dismiss", eventId: "e1" },
  ]);
});

test("case 4 (guard): running job actions are exactly [{kind:'open', href}] - no stop action is offered", () => {
  const runningJob: Job = {
    id: "j-run-1",
    projectId: "p3",
    kind: "research",
    label: "Background inquiry",
    status: "running",
    startedAt: 3000,
    progress: 0,
    measured: false,
  };
  const model = trayModel({ jobs: [runningJob], unread: [], trouble: null });
  expect(model.runningCards.length).toBe(1);
  const card = model.runningCards[0];
  expect(card.actions).toEqual([
    { kind: "open", href: "/studio/p3?step=research" },
  ]);
  expect(card.actions.some((a) => (a as { kind: string }).kind === "stop")).toBe(false);
});

test("case 5: applyClear sets additive clearedAt on interrupted job; returns same array reference on running or done job", () => {
  const t0 = Date.now();
  const j1: Job = {
    id: "j1",
    projectId: "p1",
    kind: "followup",
    label: "Followup",
    status: "interrupted",
    startedAt: t0 - 1000,
    progress: 0,
    measured: false,
  };
  const jRunning: Job = {
    id: "j2",
    projectId: "p1",
    kind: "research",
    label: "Research",
    status: "running",
    startedAt: t0 - 500,
    progress: 0,
    measured: false,
  };
  const jDone: Job = {
    id: "j3",
    projectId: "p1",
    kind: "recalibrate",
    label: "Recalibrate",
    status: "done",
    startedAt: t0 - 2000,
    endedAt: t0 - 1000,
    progress: 1,
    measured: true,
  };
  const initial = [j1, jRunning, jDone];

  const cleared = applyClear(initial, "j1");
  expect(cleared).not.toBe(initial);
  const clearedJ1 = cleared.find((j) => j.id === "j1");
  expect(clearedJ1?.clearedAt).toBeDefined();
  expect(typeof clearedJ1?.clearedAt).toBe("number");
  expect(clearedJ1!.clearedAt).toBeGreaterThanOrEqual(t0);

  // applyClear on a running or done job id -> returns the SAME array reference (===)
  expect(applyClear(initial, "j2")).toBe(initial);
  expect(applyClear(initial, "j3")).toBe(initial);
  expect(applyClear(initial, "nonexistent")).toBe(initial);

  // Idempotent: applyClear on already cleared job returns the SAME array reference (===)
  expect(applyClear(cleared, "j1")).toBe(cleared);
});

test("case 6: trayModel interrupted job pulses, but cleared job has pulse: false and cards: []", () => {
  const interruptedJob: Job = {
    id: "j-int-1",
    projectId: "p1",
    kind: "poster-generate",
    label: "Poster generate",
    status: "interrupted",
    startedAt: 1000,
    progress: 0,
    measured: false,
  };
  const beforeClear = trayModel({ jobs: [interruptedJob], unread: [], trouble: null });
  expect(beforeClear.badge).toBe(0);
  expect(beforeClear.pulse).toBe(true);
  expect(beforeClear.interruptedCards.length).toBe(1);

  const clearedJobs = applyClear([interruptedJob], "j-int-1");
  const afterClear = trayModel({ jobs: clearedJobs, unread: [], trouble: null });
  expect(afterClear.badge).toBe(0);
  expect(afterClear.pulse).toBe(false);
  expect(afterClear.cards).toEqual([]);
  expect(afterClear.interruptedCards).toEqual([]);
});

test("case 7 (source ratchet): NotificationBell contains no '/studio/' literal, imports from '@/lib/jobLinks', and renders 'bell-open' and 'bell-interrupted-clear'", () => {
  const bellRaw = readFileSync(resolve(process.cwd(), "components/ui/NotificationBell.tsx"), "utf-8");
  const bellClean = stripComments(bellRaw);

  expect(bellClean).not.toContain("/studio/");
  expect(bellClean).toMatch(/from\s+["']@\/lib\/jobLinks["']/);
  expect(bellClean).toContain("bell-open");
  expect(bellClean).toContain("bell-interrupted-clear");
});

test("case 8 (critic revision): mergeJobs preserves clearedAt in both merge directions; trayModel over merged result has pulse:false and no interrupted card", () => {
  const j1Raw: Job = {
    id: "j1",
    projectId: "p1",
    kind: "video-export",
    label: "Export cut",
    status: "interrupted",
    startedAt: 1000,
    progress: 0,
    measured: false,
  };
  const j1Cleared: Job = {
    ...j1Raw,
    clearedAt: 1500,
  };

  const mergedForward = mergeJobs([j1Raw], [j1Cleared]);
  expect(mergedForward.length).toBe(1);
  expect(mergedForward[0].id).toBe("j1");
  expect(mergedForward[0].clearedAt).toBe(1500);

  const mergedBackward = mergeJobs([j1Cleared], [j1Raw]);
  expect(mergedBackward.length).toBe(1);
  expect(mergedBackward[0].id).toBe("j1");
  expect(mergedBackward[0].clearedAt).toBe(1500);

  const modelForward = trayModel({ jobs: mergedForward, unread: [], trouble: null });
  expect(modelForward.pulse).toBe(false);
  expect(modelForward.interruptedCards).toEqual([]);
  expect(modelForward.cards).toEqual([]);

  const modelBackward = trayModel({ jobs: mergedBackward, unread: [], trouble: null });
  expect(modelBackward.pulse).toBe(false);
  expect(modelBackward.interruptedCards).toEqual([]);
  expect(modelBackward.cards).toEqual([]);
});
