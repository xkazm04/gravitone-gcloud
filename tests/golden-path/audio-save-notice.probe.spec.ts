// LANE — AN UNSAVED AUDIO JUDGMENT STAYS REPORTED UNTIL ITS OWN SAVE LANDS (static/pure).
//
// useAudioShelf kept one error slot and every successful write cleared it, so a
// failed verdict save on take A vanished when take B saved a second later.
// The notices are now keyed (app/library/audio/shelfErrors.ts); this drives that
// model through the scenario, and runs the same scenario against the old
// single-slot model as the SEEDED CONTROL, which must fail it.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { NO_ERRORS, patchKey, pickNotice, setNotice, type ShelfErrors } from "@/app/library/audio/shelfErrors";

import { stripComments } from "./_helpers";

interface Model {
  fail(key: string, msg: string): void;
  ok(key: string): void;
  shown(): string | null;
}

const keyed = (): Model => {
  let e: ShelfErrors = NO_ERRORS;
  return { fail: (k, m) => (e = setNotice(e, k, m)), ok: (k) => (e = setNotice(e, k, null)), shown: () => pickNotice(e) };
};
/** The old behaviour: one slot, any success clears it. */
const singleSlot = (): Model => {
  let e: string | null = null;
  return { fail: (_k, m) => (e = m), ok: () => (e = null), shown: () => e };
};

function scenario(m: Model) {
  m.fail("migrate", "2 of this browser's takes did not move");
  m.fail(patchKey("A"), "A not saved");
  m.ok(patchKey("B"));
  const afterB = m.shown();
  const migrateKept = afterB === "2 of this browser's takes did not move";
  m.ok(patchKey("A"));
  const afterA = m.shown();
  return { afterB, migrateKept, afterA };
}

test("a later successful save does not erase an earlier failure", () => {
  const r = scenario(keyed());
  expect(r.migrateKept).toBe(true);
  expect(r.afterA).toBe("2 of this browser's takes did not move");
  const m = keyed();
  m.fail(patchKey("A"), "A not saved");
  m.ok(patchKey("B"));
  expect(m.shown()).toBe("A not saved");
  m.ok(patchKey("A"));
  expect(m.shown()).toBeNull();
});

test("SEEDED CONTROL: the single-slot model fails the same scenario", () => {
  const m = singleSlot();
  m.fail(patchKey("A"), "A not saved");
  m.ok(patchKey("B"));
  expect(m.shown()).toBeNull(); // the defect, as it was
  expect(scenario(singleSlot()).migrateKept).toBe(false);
});

test("the hook routes every notice through the keyed model", () => {
  const dir = path.join(process.cwd(), "app/library/audio");
  const src = stripComments(fs.readFileSync(path.join(dir, "useAudioShelf.ts"), "utf8"));
  expect(src.length).toBeGreaterThan(0);
  expect(src).not.toMatch(/setError\(/);
  expect(src).toMatch(/notice\(patchKey\(id\), null\)/);
});
