// Wave 5 (docs/waves/README.md) bound Z in v1's triage judge to take back the
// newest verdict filed this session. The audio verdict is the Board's cull now
// (Phase 3; v1 app/playground/triage dies in Phase 6 wave C), so the binding
// this pins is the cull's: undo is bound, on ⌫ with ⌘Z beside it, it never
// doubles as a reason key, and Z there is the zoom - one letter, one verb.

import { expect, test } from "@playwright/test";

import { KEYMAP } from "@gt/ui/keymap/bindings";

const cull = KEYMAP.rows.filter((r) => r.binding.mode === "board.cull");

test("keys: the cull undoes the newest verdict on ⌫ (⌘Z beside it), and no reason key undoes", () => {
  const undo = cull.filter((r) => r.binding.verb === "undo");
  expect(undo.flatMap((r) => r.caps)).toEqual(["⌫", "⌘Z"]);
  const reasons = new Set(cull.filter((r) => r.binding.verb === "reason").flatMap((r) => r.caps));
  expect(undo.flatMap((r) => r.caps).some((c) => reasons.has(c))).toBe(false);
  expect(cull.filter((r) => r.caps.includes("Z")).map((r) => r.binding.verb)).toEqual(["zoom"]);
});
