// Wave 5 (docs/waves/README.md): Z in the triage judge takes back the newest
// verdict filed this session, the same letter the board and the foundry undo
// with (lib/board/keys.ts). Pinned here so the binding cannot drift from the
// legend, and so it never fires as a defect toggle in defects mode.

import { expect, test } from "@playwright/test";

import { KEYMAP, resolveKey } from "@/app/playground/triage/model";

test("keys: Z undoes the newest verdict in judge mode, and is not bound in defects mode", () => {
  expect(resolveKey("z", "judge")).toEqual({ type: "undo" });
  expect(resolveKey("Z", "judge")).toEqual({ type: "undo" });
  expect(resolveKey("z", "defects")).toBeNull();
  expect(KEYMAP.judge.some((b) => b.keys.includes("Z") && b.does === "undo")).toBe(true);
});
