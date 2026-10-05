// LANE — A FAILED SHELF READ IS NOT AN EMPTY SHELF (static + pure).
//
// useAssets sets `assets = []` together with `error` when the read throws, so
// "failed" and "zero rows" reached the gallery as the same body: the alert, and
// beneath it "The shelf is empty" with a call to refill it, while the Library
// tab rail's Assets tally read 0. The two decisions are pure and live in
// shelf.ts; the call sites are source-ratcheted so they cannot go back.
import { readFileSync } from "node:fs";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";
import { galleryState, shelfCount } from "@/app/library/assets/shelf";

test("galleryState separates failure from zero rows", () => {
  expect(galleryState({ error: "x", total: 0, shown: 0 })).toBe("failed");
  expect(galleryState({ error: null, total: 0, shown: 0 })).toBe("empty");
  expect(galleryState({ error: "x", total: 5, shown: 5 })).toBe("grid");
  expect(galleryState({ error: null, total: 5, shown: 0 })).toBe("empty");
});

test("shelfCount reports no count while reading or after a failed read", () => {
  expect(shelfCount({ loaded: false, error: null, total: 0 })).toBeUndefined();
  expect(shelfCount({ loaded: true, error: "x", total: 0 })).toBeUndefined();
  expect(shelfCount({ loaded: true, error: null, total: 0 })).toBe(0);
  expect(shelfCount({ loaded: true, error: "x", total: 4 })).toBe(4);
});

test("the gallery and the count effect route through the pure decisions", () => {
  const gallery = stripComments(readFileSync("app/library/assets/ShelfGallery.tsx", "utf-8"));
  const hook = stripComments(readFileSync("app/library/assets/useShelf.ts", "utf-8"));
  expect(gallery.length, "read nothing").toBeGreaterThan(0);
  expect(gallery).toContain("galleryState(");
  expect(hook).toContain("shelfCount(");
});
