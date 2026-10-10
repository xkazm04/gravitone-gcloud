// LANE — STORAGE TROUBLE BECOMES A REMEDY (challenge 2026-10-10, ui-shell/B).
//
// Registry: toasts-notifications / actionable-toasts (one verb that lands at the
// fix; dismissal is deferral, not resolution), durable-notification-ledger.
//
// WHAT WAS WRONG. The bell's storage card was a dead end: a paragraph, a
// `phase · message` line, and a `dismiss` that called clearStorageTrouble() and so
// erased the fact that saving had stopped. stepStore kept ONE `latest` slot, so a
// second failing step replaced the first, and nothing ever cleared a trouble when
// saving resumed — the card kept saying "nothing more will be saved" over saves
// that were landing.
//
// WHAT THIS PROBE DRIVES. The pure remedy table and the trouble reducer in
// components/ui/storageRemedy.ts, stepStore's scoped noteStorageOk channel, and
// source checks that the live bell and withStore actually use them. No DOM.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import {
  clearStorageTrouble,
  lastStorageTrouble,
  noteStorageOk,
  reportStorageTrouble,
  reportTaskTrouble,
  type StorageFailure,
  type StorageTrouble,
} from "@/app/_phases/_shared/stepStore";
import { troubleAnnouncement } from "@/components/ui/NotificationBell";
import {
  CLEAR_TROUBLE,
  remedyFor,
  troubleBadge,
  troubleReducer,
  type TroubleState,
} from "@/components/ui/storageRemedy";

import { stripComments } from "./_helpers";

const quotaError = () => Object.assign(new Error("The quota has been exceeded."), { name: "QuotaExceededError" });

const t = (over: Partial<StorageTrouble>): StorageTrouble => ({
  kind: "quota",
  op: "write",
  projectId: "p1",
  phase: "script",
  message: "The quota has been exceeded.",
  at: 1000,
  ...over,
});

const run = (events: Parameters<typeof troubleReducer>[1][], from: TroubleState = CLEAR_TROUBLE) =>
  events.reduce(troubleReducer, from);

test.beforeEach(() => clearStorageTrouble());
test.afterAll(() => clearStorageTrouble());

test("case 1: quota -> archive for the signed-in uid, and the measured quota as a fact", () => {
  const r = remedyFor(
    { kind: "quota", op: "write", projectId: "p1", phase: "script" },
    { uid: "u1", estimate: { usage: 4.9e8, quota: 5e8 } },
  );
  expect(r.actions).toEqual([{ kind: "archive", uid: "u1" }]);
  expect(r.fact).toEqual({ used: 490, of: 500, unit: "MB" });
  // No uid, no archive: there is nobody's shelf to pack.
  expect(remedyFor({ kind: "quota" }, { uid: null }).actions).toEqual([]);
  // No measurement, no number — never a guessed one.
  expect(remedyFor({ kind: "quota" }, { uid: "u1" }).fact).toBeNull();
});

test("case 2: blocked and missing-store -> reload; unavailable -> nothing (an archive would be empty)", () => {
  expect(remedyFor({ kind: "blocked" }).actions).toEqual([{ kind: "reload" }]);
  expect(remedyFor({ kind: "missing-store" }).actions).toEqual([{ kind: "reload" }]);
  expect(remedyFor({ kind: "unavailable" }, { uid: "u1" }).actions).toEqual([]);
  expect(remedyFor({ kind: "blocked" }, { uid: "u1", estimate: { usage: 1, quota: 2 } }).fact).toBeNull();
});

test("case 3: non-storage with a studio step -> open that step; 'app' or a non-step phase -> nothing", () => {
  expect(remedyFor({ kind: "non-storage", projectId: "p1", phase: "script" }).actions).toEqual([
    { kind: "open", href: "/studio/p1?step=script" },
  ]);
  expect(remedyFor({ kind: "non-storage", projectId: "app", phase: "script" }).actions).toEqual([]);
  expect(remedyFor({ kind: "non-storage", projectId: "p1", phase: "a background task" }).actions).toEqual([]);
});

test("case 4: two failing steps accumulate under one active card, badge 1", () => {
  const s = run([
    { type: "report", trouble: t({ phase: "script", at: 1 }) },
    { type: "report", trouble: t({ phase: "frames", at: 2 }) },
  ]);
  expect(s.status).toBe("active");
  expect(s.phases).toEqual(["script", "frames"]);
  expect(troubleBadge(s)).toBe(1);
});

test("case 5: dismiss defers (badge 0, row kept); a different kind re-activates", () => {
  const active = run([
    { type: "report", trouble: t({ phase: "script", at: 1 }) },
    { type: "report", trouble: t({ phase: "frames", at: 2 }) },
  ]);
  const deferred = troubleReducer(active, { type: "dismiss" });
  expect(deferred.status).toBe("deferred");
  expect(troubleBadge(deferred)).toBe(0);
  expect(deferred.phases).toEqual(["script", "frames"]);
  expect(deferred.trouble?.kind).toBe("quota");
  // The same news again stays quiet.
  expect(troubleReducer(deferred, { type: "report", trouble: t({ phase: "frames", at: 3 }) }).status).toBe("deferred");
  // Different news is news.
  const back = troubleReducer(deferred, { type: "report", trouble: t({ kind: "blocked", phase: "score", at: 4 }) });
  expect(back.status).toBe("active");
  expect(troubleBadge(back)).toBe(1);
});

test("case 6: stepStore's noteStorageOk clears only a storage trouble of the same op, project and step", () => {
  reportStorageTrouble("write", "p1", "script", quotaError());
  const raised = lastStorageTrouble();
  expect(raised?.kind).toBe("quota");

  noteStorageOk("read", "p1", "script");
  expect(lastStorageTrouble()).toBe(raised);
  noteStorageOk("write", "p2", "script");
  expect(lastStorageTrouble()).toBe(raised);
  noteStorageOk("write", "p1", "script");
  expect(lastStorageTrouble()).toBeNull();

  // A non-storage trouble is never cleared by a successful write.
  const task = reportTaskTrouble("a background task", new Error("fetch dropped"));
  noteStorageOk(task.op, task.projectId, task.phase);
  expect(lastStorageTrouble()).toBe(task);
});

test("case 6b (critic): an asset-blob quota is not cleared by a small step record saving elsewhere", () => {
  reportStorageTrouble("write", "", "assets", quotaError());
  const raised = lastStorageTrouble();
  noteStorageOk("write", "p1", "script");
  expect(lastStorageTrouble()).toBe(raised);
});

test("case 6c (source ratchet): withStore's success path calls noteStorageOk(op, projectId, phase)", () => {
  const src = stripComments(readFileSync(join(process.cwd(), "app/_phases/_shared/stepStore.ts"), "utf8"));
  const start = src.indexOf("async function withStore");
  expect(start).toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf("catch (e)", start));
  expect(body).toMatch(/noteStorageOk\(\s*op\s*,\s*projectId\s*,\s*phase\s*\)/);
});

test("case 7: the last recovering step clears the card with exactly one polite announcement", () => {
  const two = run([
    { type: "report", trouble: t({ phase: "script", at: 1 }) },
    { type: "report", trouble: t({ phase: "frames", at: 2 }) },
  ]);
  // One step recovering clears only that step (critic revision).
  const one = troubleReducer(two, { type: "ok", op: "write", projectId: "p1", phase: "script" });
  expect(one.status).toBe("active");
  expect(one.phases).toEqual(["frames"]);
  expect(one.announce).toBeNull();
  // A success somewhere unrelated changes nothing — not even the reference.
  expect(troubleReducer(one, { type: "ok", op: "write", projectId: "p9", phase: "frames" })).toBe(one);
  expect(troubleReducer(one, { type: "ok", op: "read", projectId: "p1", phase: "frames" })).toBe(one);

  const clear = troubleReducer(one, { type: "ok", op: "write", projectId: "p1", phase: "frames" });
  expect(clear.status).toBe("clear");
  expect(clear.phases).toEqual([]);
  expect(troubleBadge(clear)).toBe(0);
  expect(clear.announce?.key).toBe("trouble-cleared:2");
  expect(clear.announce?.text.length).toBeGreaterThan(0);
  // A second ok is a no-op: same state, so nothing further is emitted.
  expect(troubleReducer(clear, { type: "ok", op: "write", projectId: "p1", phase: "frames" })).toBe(clear);

  // A deferred card clears the same way.
  const deferred = troubleReducer(run([{ type: "report", trouble: t({ at: 7 }) }]), { type: "dismiss" });
  const after = troubleReducer(deferred, { type: "ok", op: "write", projectId: "p1", phase: "script" });
  expect(after.status).toBe("clear");
  expect(after.announce?.key).toBe("trouble-cleared:7");
});

test("case 7b: a non-storage trouble is not resolved by a save, but a dismiss does resolve it", () => {
  const task = t({ kind: "non-storage", projectId: "app", phase: "a background task", at: 9 });
  const s = run([{ type: "report", trouble: task }]);
  expect(troubleReducer(s, { type: "ok", op: "write", projectId: "app", phase: "a background task" })).toBe(s);
  // Nothing is at risk behind a failed task, so there is nothing to keep deferred.
  expect(troubleReducer(s, { type: "dismiss" }).status).toBe("clear");
});

test("[guard] case 8: troubleAnnouncement is unchanged for all six kinds", () => {
  const said: Record<StorageFailure, string> = {
    quota: "Not saved: this browser's storage is full. script was not written. Open notifications for what to do.",
    blocked:
      "Not saved: another tab is holding an older version of the database. script was not written. Open notifications for what to do.",
    unavailable:
      "Not saved: this browser session cannot store anything. script was not written. Open notifications for what to do.",
    "missing-store":
      "Not saved: this browser's database is missing the studio's store. script was not written. Open notifications for what to do.",
    failed: "Not saved: the browser refused the operation. script was not written. Open notifications for what to do.",
    "non-storage": "script failed. Your work is saved. Open notifications for what to do.",
  };
  for (const kind of Object.keys(said) as StorageFailure[]) expect(troubleAnnouncement(kind, "script")).toBe(said[kind]);
});
