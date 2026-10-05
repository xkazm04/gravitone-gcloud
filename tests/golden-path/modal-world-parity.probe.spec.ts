// LANE — A DIALOG'S HEADER ACTIONS RENDER IN EITHER WORLD.
// Modal documents `actions` as controls beside the close button; the Obsidian
// branch used to drop them silently, so an obsidian-world Sheet lost its controls.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

test("Modal renders {actions} in both world branches", () => {
  const src = stripComments(readFileSync(join(process.cwd(), "components/ui/Modal.tsx"), "utf8"));
  expect(src.length).toBeGreaterThan(0);
  expect(src.match(/\{actions\}/g)?.length ?? 0).toBe(2);
});
