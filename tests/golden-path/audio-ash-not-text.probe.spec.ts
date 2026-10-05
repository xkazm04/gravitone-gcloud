// LANE — ASH IS NOT A TEXT COLOUR (static).
//
// components/ui/tokens.ts: text has two levels, white and vellum; ash draws
// rings, rules and the rejected disc. Under the Obsidian kit world ash is
// ink-bright at 45% over ink, 4.24:1 — under AA for the label-size text it
// coloured in audio-workbench.css, and `.sc.na` multiplied it by opacity .5
// down to 1.88:1: the marker of the work still to do on a scoring surface.
// `border-color`, `fill` and `stroke` uses of ash are allowed; only a text
// `color:` declaration fails.
import { readFileSync } from "node:fs";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const CSS = "app/library/audio/audio-workbench.css";

test("the audio workbench colours no text with --al-ash", () => {
  const css = stripComments(readFileSync(CSS, "utf-8"));
  expect(css.length, "read nothing").toBeGreaterThan(1000);
  const hits = css.match(/(^|[;{\s])color:\s*var\(--al-ash\)/g) ?? [];
  expect(hits.length, "text declarations in ash").toBe(0);
});

test("the unscored marker carries no opacity", () => {
  const css = stripComments(readFileSync(CSS, "utf-8"));
  const rule = /\.ab \.sc\.na\s*\{([^}]*)\}/.exec(css);
  expect(rule, ".ab .sc.na rule exists").not.toBeNull();
  expect(rule![1]).not.toMatch(/opacity/);
});
