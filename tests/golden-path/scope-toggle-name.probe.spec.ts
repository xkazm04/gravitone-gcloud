// LANE — A TOGGLE'S NAME DOES NOT CHANGE WITH ITS STATE (static ratchet).
//
// The research board's scope toggle carried `aria-pressed={!s.descoped}` AND an
// aria-label that swapped "Exclude"/"Include" with the same state, so an
// in-scope card was announced "Exclude: <claim>, pressed" — heard as
// "excluded: on". A toggle's name names the thing that is ON when pressed; the
// state is carried by aria-pressed alone. CardActions' like/deepen swapped names
// too (double-announced: "Liked: X, pressed").
import { readFileSync } from "node:fs";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const read = (p: string) => stripComments(readFileSync(p, "utf8"));

test("scope toggle and card actions keep a stable accessible name", () => {
  const tile = read("app/_phases/research/_parts/CardTile.tsx");
  const actions = read("app/_phases/research/_parts/CardActions.tsx");
  expect(tile.length).toBeGreaterThan(0);
  expect(actions.length).toBeGreaterThan(0);

  expect(tile).toMatch(/aria-pressed=\{!s\.descoped\}/);
  expect(tile).not.toMatch(/aria-label=\{`\$\{s\.descoped \?/);
  expect(tile).toMatch(/aria-label=\{`In scope: \$\{card\.title\}`\}/);

  expect(actions).not.toMatch(/name=\{s\.(liked|deepen) \?/);
  expect(actions).toMatch(/name=\{`Like: \$\{card\.title\}`\}/);
  expect(actions).toMatch(/name=\{`Deepen: \$\{card\.title\}`\}/);
});
