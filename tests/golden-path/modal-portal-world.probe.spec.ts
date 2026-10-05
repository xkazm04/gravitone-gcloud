// A Modal portals to <body>, outside the `data-world` attribute of the route
// that opened it. kit.css scopes every kit rule under `[data-world]` and counts
// "the root of a portalled Modal" as part of that scope - but only the Almanac
// branch of Modal re-declared it. A kit part (Sheet, ConfirmDialog's .k-confirm
// / .k-acts) inside a dialog opened under WorldRoot world="obsidian" drew with
// none of its rules (moonshot backlog Q8, 2026-10-05).
//
// The node lane cannot render a portal, so this is the repo's source-ratchet
// idiom: the rule is a pure function, driven here, and the default branch's
// portal root is held to calling it (comments stripped).
import { readFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { portalWorld } from "@/components/ui/world";

import { stripComments } from "./_helpers";

test("a portal re-declares the world it was opened in, and only a declared one", () => {
  expect(portalWorld("obsidian", true)).toBe("obsidian");
  expect(portalWorld("almanac", true)).toBe("almanac");
  // A route that never set a world reaches none of kit.css - its dialogs too.
  expect(portalWorld("obsidian", false)).toBeUndefined();
});

test("Modal's default branch stamps portalWorld on its portal root", () => {
  const src = stripComments(readFileSync(path.resolve(__dirname, "../../components/ui/Modal.tsx"), "utf8"));
  const portals = [...src.matchAll(/createPortal\(\s*(<[^>]*>)/g)].map((m) => m[1]);
  expect(portals.length, "Modal has fewer portal branches than expected - wrong file?").toBeGreaterThanOrEqual(2);
  for (const root of portals) {
    const stamped = /data-world=/.test(root) || /^<WorldProvider/.test(root);
    expect(stamped, `portal root without a world: ${root}`).toBe(true);
  }
  expect(src).toMatch(/portalWorld\(\s*world\s*,\s*useWorldScoped\(\)\s*\)|portalWorld\(\s*world\s*,\s*scoped\s*\)/);
});
