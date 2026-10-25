// LANE — A SAVE THAT RESUMES CLEARS ONLY ITS OWN TROUBLE (challenge 2026-10-10, ui-shell/B).
//
// What is left of the storage-remedy lane after Phase 6 wave C. The remedy table
// (components/ui/storageRemedy.ts), the trouble reducer and the bell's storage card
// (components/ui/NotificationBell.tsx) retired with the v1 shell, and with them cases
// 1-5, 7, 7b, 8 and 9, which drove the card's remedies, badge, deferral, the cleared
// announcement and its spoken copy. The new world surfaces a storage failure as the
// shell's toast (@gt/ui/storage, app/(studio)/_shell/Providers.tsx), held by
// packages/ui/test/storage.test.ts.
//
// What stays is the step store's half, which the v1 step records still write through:
// stepStore kept ONE `latest` slot and nothing ever cleared a trouble when saving
// resumed, so `noteStorageOk` clears only a storage trouble of the same op, project and
// step, and withStore's success path is held to calling it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { clearStorageTrouble, lastStorageTrouble, noteStorageOk, reportStorageTrouble, reportTaskTrouble } from "@/lib/steps";

import { classify as classifyUi } from "@gt/ui/storage/trouble";
import { stripComments } from "./_helpers";

const quotaError = () => Object.assign(new Error("The quota has been exceeded."), { name: "QuotaExceededError" });

test.beforeEach(() => clearStorageTrouble());
test.afterAll(() => clearStorageTrouble());

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

test("case 6d: v1's classify names every recognised storage error what @gt/ui's does", () => {
  const named = (name: string) => Object.assign(new Error(name), { name });
  for (const name of ["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED", "SecurityError", "UnknownError"]) {
    reportStorageTrouble("write", "p1", "script", named(name));
    expect(lastStorageTrouble()?.kind, name).toBe(classifyUi(named(name)));
  }
});

test("case 6b (critic): an asset-blob quota is not cleared by a small step record saving elsewhere", () => {
  reportStorageTrouble("write", "", "assets", quotaError());
  const raised = lastStorageTrouble();
  noteStorageOk("write", "p1", "script");
  expect(lastStorageTrouble()).toBe(raised);
});

test("case 6c (source ratchet): withStore's success path calls noteStorageOk(op, projectId, phase)", () => {
  // withStore moved to its own file when stepStore.ts was split; stepStore.ts is
  // the door now and holds no implementation. The ratchet is unchanged - it still
  // reads the success path of the real withStore.
  const src = stripComments(readFileSync(join(process.cwd(), "lib/steps/withStore.ts"), "utf8"));
  const start = src.indexOf("async function withStore");
  expect(start).toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf("catch (e)", start));
  expect(body).toMatch(/noteStorageOk\(\s*op\s*,\s*projectId\s*,\s*phase\s*\)/);
});
