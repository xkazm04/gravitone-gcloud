// LANE — A CLOSED DRAWER IS OUT OF THE TAB ORDER (static).
//
// Under 1000px the Inspector column, and under 720px the Terms column, are
// off-canvas drawers by CSS transform only. Closed, they stayed focusable: Tab
// walked through 40+ controls that sat 105% off-screen with no visible ring.
// `inert` removes a closed drawer from the focus order and the accessibility
// tree. The breakpoints live in two places (the CSS that moves the column and
// the matchMedia that inerts it), so the probe pins them to each other.
import { readFileSync } from "node:fs";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const TSX = stripComments(readFileSync("app/library/audio/AudioWorkbench.tsx", "utf-8"));
const CSS = stripComments(readFileSync("app/library/audio/audio-workbench.css", "utf-8"));

test("the drawer breakpoints in the component are the ones the CSS uses", () => {
  expect(TSX.length, "read nothing").toBeGreaterThan(1000);
  for (const q of ["(max-width: 999px)", "(max-width: 720px)"]) {
    expect(TSX, `component media query ${q}`).toContain(q);
    expect(CSS, `css media query ${q}`).toContain(`@media ${q}`);
  }
});

test("both off-canvas columns carry inert while closed", () => {
  for (const col of ["ab-col--left", "ab-col--right"]) {
    const tag = new RegExp(String.raw`<aside\b[^>]*` + col + String.raw`[^>]*>`).exec(TSX);
    expect(tag, `<aside> for ${col}`).not.toBeNull();
    const inert = /inert=\{([^}]*)\}/.exec(tag![0]);
    expect(inert, `${col} has an inert={...} prop`).not.toBeNull();
    expect(inert![1], `${col} inert expression reads drawer`).toContain("drawer");
  }
});
