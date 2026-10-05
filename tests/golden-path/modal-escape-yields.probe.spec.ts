// LANE — ESCAPE CLOSES THE INNERMOST THING, NOT THE DIALOG.
//
// React hydrates on `document`, so its delegated listener and Modal's own
// `document.addEventListener("keydown")` share one node. stopPropagation never
// reaches a sibling listener on the same node; it only sets cancelBubble. So a
// Hint (or a rename field) that "stops" Escape still lost the dialog unless
// Modal reads cancelBubble itself.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

test("same-node semantics: a stopped event still reaches the next listener, flagged", () => {
  const t = new EventTarget();
  let seen: boolean | null = null;
  t.addEventListener("x", (e) => e.stopPropagation());
  t.addEventListener("x", (e) => {
    seen = e.cancelBubble;
  });
  t.dispatchEvent(new Event("x", { bubbles: true }));
  expect(seen).toBe(true);
});

test("Modal's Escape branch yields to a handled event before it closes", () => {
  const src = stripComments(readFileSync(join(process.cwd(), "components/ui/Modal.tsx"), "utf8"));
  expect(src.length).toBeGreaterThan(0);
  const at = src.indexOf('e.key === "Escape"');
  expect(at).toBeGreaterThan(-1);
  const branch = src.slice(at, src.indexOf("onCloseRef.current()", at));
  expect(branch).toMatch(/cancelBubble|defaultPrevented/);
});
