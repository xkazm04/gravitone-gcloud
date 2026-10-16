// LANE — UI SHELL: Notification Bell doors and clear (dynamic probe).
//
// Every card for a running or interrupted job or an unread event is a door to where the work is
// read in full. Since Phase 4 wave D the bell's jobs are the server's (lib/jobs.tsx) and each
// carries its own door, its row in Runs; the v1 doors into studio steps (a JobKind -> step table)
// retired with the studio. Cases 5 and 8 (applyClear's tombstone and mergeJobs' cross-tab merge)
// retired with the browser job record they guarded: the server's list is the one truth, and
// clearing a card is local to the tray (case 6 holds that it still empties the pulse).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { jobHref, studioHref, trayModel } from "@/lib/jobLinks";
import type { Job, JobEvent } from "@/lib/jobs";

import { stripComments } from "./_helpers";

const RUNS = (id: string) => `/projects/runs?job=${encodeURIComponent(id)}`;
const job = (id: string, status: Job["status"], more: Partial<Job> = {}): Job => ({ id, kind: "image", label: id, status, startedAt: 1000, href: RUNS(id), progress: 0, measured: false, ...more });

test("case 1: a card's door is its job's own; the v1 studio address is encoded and left to the redirect", () => {
  expect(jobHref({ href: RUNS("job:run:r1") })).toBe("/projects/runs?job=job%3Arun%3Ar1");
  expect(jobHref({ href: "" })).toBeNull();
  expect(jobHref({})).toBeNull();
  expect(studioHref("p1", "script")).toBe("/studio/p1?step=script");
  expect(studioHref("p 1/x", "cut")).toBe("/studio/p%201%2Fx?step=cut");
});

test("case 2: trayModel with an interrupted job -> actions are open and clear", () => {
  const model = trayModel({ jobs: [job("j-int-1", "interrupted")], unread: [], trouble: null });
  expect(model.interruptedCards.length).toBe(1);
  expect(model.interruptedCards[0]?.actions).toEqual([
    { kind: "open", href: RUNS("j-int-1") },
    { kind: "clear", jobId: "j-int-1" },
  ]);
});

test("case 3: trayModel with an unread event -> actions are open (with marksRead) and dismiss", () => {
  const unreadEvent: JobEvent = { id: "e1", jobId: "j1", projectId: "p2", kind: "part", ok: true, title: "Part finished", detail: "Ready", at: 2000, href: RUNS("j1"), read: false };
  const model = trayModel({ jobs: [], unread: [unreadEvent], trouble: null });
  expect(model.eventCards.length).toBe(1);
  expect(model.eventCards[0]?.actions).toEqual([
    { kind: "open", href: RUNS("j1"), marksRead: "e1" },
    { kind: "dismiss", eventId: "e1" },
  ]);
});

test("case 4 (guard): running job actions are exactly [{kind:'open', href}] - no stop action is offered", () => {
  const model = trayModel({ jobs: [job("j-run-1", "running")], unread: [], trouble: null });
  expect(model.runningCards.length).toBe(1);
  const card = model.runningCards[0];
  expect(card?.actions).toEqual([{ kind: "open", href: RUNS("j-run-1") }]);
  expect(card?.actions.some((a) => (a as { kind: string }).kind === "stop")).toBe(false);
});

test("case 6: an interrupted job pulses; a cleared one has pulse: false and no cards", () => {
  const before = trayModel({ jobs: [job("j-int-1", "interrupted")], unread: [], trouble: null });
  expect(before.badge).toBe(0);
  expect(before.pulse).toBe(true);
  expect(before.interruptedCards.length).toBe(1);

  const after = trayModel({ jobs: [job("j-int-1", "interrupted", { clearedAt: 1500 })], unread: [], trouble: null });
  expect(after.badge).toBe(0);
  expect(after.pulse).toBe(false);
  expect(after.cards).toEqual([]);
  expect(after.interruptedCards).toEqual([]);
});

test("case 7 (source ratchet): NotificationBell contains no '/studio/' literal, imports from '@/lib/jobLinks', and renders 'bell-open' and 'bell-interrupted-clear'", () => {
  const bellRaw = readFileSync(resolve(process.cwd(), "components/ui/NotificationBell.tsx"), "utf-8");
  const bellClean = stripComments(bellRaw);

  expect(bellClean).not.toContain("/studio/");
  expect(bellClean).toMatch(/from\s+["']@\/lib\/jobLinks["']/);
  expect(bellClean).toContain("bell-open");
  expect(bellClean).toContain("bell-interrupted-clear");
});
