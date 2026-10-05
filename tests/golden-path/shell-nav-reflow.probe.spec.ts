// LANE — THE OBSIDIAN NAV SURVIVES NARROW VIEWPORTS AND ZOOM.
// StudioFrame's module links sat in `hidden ... md:flex`: below 768px (or at
// 200% zoom, WCAG 1.4.10 Reflow) five routes were URL-only, and the landmark
// carried no accessible name while its Almanac twin is "Places".
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const src = () =>
  stripComments(readFileSync(join(process.cwd(), "components/ui/StudioFrame.tsx"), "utf8"));

test("the element mapping MODULES in the obsidian nav is never display:none", () => {
  const s = src();
  expect(s.length).toBeGreaterThan(0);
  const at = s.lastIndexOf("{MODULES.map");
  expect(at).toBeGreaterThan(-1);
  const open = s.lastIndexOf("<div", at);
  const tag = s.slice(open, s.indexOf(">", open));
  const cls = /className="([^"]*)"/.exec(tag)?.[1] ?? "";
  expect(cls.split(/\s+/)).not.toContain("hidden");
});

test("the obsidian <nav> has an accessible name", () => {
  const s = src();
  const at = s.lastIndexOf("<nav");
  expect(s.slice(at, s.indexOf(">", at))).toMatch(/aria-label=/);
});
