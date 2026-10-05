// LANE — WHICH PICTURE STANDS FOR A STYLE (pure).
//
// app/foundry/styleArt.ts was lifted out of StylesShelf.tsx on 2026-10-05 when a
// second reader — the plant header's Styles station (app/foundry/plant.tsx) —
// needed the same answer as the shelf's cards. Two readers of one rule is the
// shape where the rule forks, so the rule is pinned here, once: the order of
// preference for a style's face, where a kept render's file is, and how
// families are read when the stored one says nothing.

import { test, expect } from "@playwright/test";

import { familyCounts, familyOf, heroOf, keptPath, keptRows } from "@/app/foundry/styleArt";
import type { Catalogue, LedgerRow, StyleDef } from "@/lib/foundry/types";

const style = (over: Partial<StyleDef> = {}): StyleDef => ({
  id: "green-tint-noir",
  name: "Green-Tint Noir",
  family: "cinematic",
  status: "candidate",
  origin: { kind: "readback" },
  observables: {},
  recipe: "",
  negative: "",
  evidence: [],
  ...over,
});

const row = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  run: "2026-10-04-noir-study",
  scene: "rooftop",
  style: "green-tint-noir",
  mechanism: "ref-early",
  seed: 20261004,
  verdict: "keep",
  craft: 0.8,
  style_score: 0.7,
  has_text: false,
  at: "2026-10-04T00:00:00.000Z",
  ...over,
});

/** The run and path a /api/foundry/file URL names. */
const target = (url: string) => {
  const q = new URL(url, "http://x").searchParams;
  return { run: q.get("run"), path: q.get("path"), kind: q.get("kind") };
};

test("style art: a kept render is the path the forge wrote it to", () => {
  expect(keptPath(row())).toBe("scenes/rooftop/candidates/green-tint-noir--ref-early--s20261004.png");
});

test("style art: kept forge work outranks every exemplar", () => {
  const s = style({ exemplars: [{ kind: "extract", run: "x", file: "styles/t.jpg", role: "transfer" }] });
  const h = heroOf(s, [row()]);
  expect(h?.what).toBe("kept render");
  expect(target(h!.url)).toEqual({ run: "2026-10-04-noir-study", path: keptPath(row()), kind: null });
});

test("style art: without kept work — transfer, then replica, then source", () => {
  const ex = (role: "source" | "replica" | "transfer") => ({ kind: "extract" as const, run: "r", file: `${role}.jpg`, role });
  expect(heroOf(style({ exemplars: [ex("source"), ex("replica"), ex("transfer")] }), [])?.what).toBe("transfer");
  expect(heroOf(style({ exemplars: [ex("source"), ex("replica")] }), [])?.what).toBe("replica");
  const src = heroOf(style({ exemplars: [ex("source")] }), []);
  expect(src?.what).toBe("source");
  expect(target(src!.url).kind).toBe("extract");
});

test("style art: no picture at all is null, never a placeholder URL", () => {
  expect(heroOf(style(), [])).toBeNull();
});

test("style art: only KEPT rows of THIS style are kept rows", () => {
  const cat: Catalogue = {
    styles: [style()],
    ledger: [row(), row({ verdict: "reject" }), row({ style: "cel-anime" })],
  };
  expect(keptRows(cat, cat.styles[0])).toHaveLength(1);
});

test("style art: `unsorted` is derived from observables; a stored family is kept", () => {
  expect(familyOf(style({ family: "cinematic" }))).toBe("cinematic");
  expect(familyOf(style({ family: "unsorted", observables: { medium: "photograph" } }))).toBe("photo");
});

test("style art: families count biggest first, ties by name", () => {
  const fams = familyCounts([style({ family: "photo" }), style({ family: "cinematic" }), style({ family: "cinematic" }), style({ family: "animation" })]);
  expect(fams).toEqual([
    ["cinematic", 2],
    ["animation", 1],
    ["photo", 1],
  ]);
});
