// LANE — EVERY /kit HASH IS A DEEP LINK (static).
//
// The Parts tab's group jump links rewrite the hash to #g-<group>. A reload of that
// URL must open Parts, not Identity, and the tab rail must be the ARIA tabs pattern
// the other TabRail hosts follow: tabs carry a panelId and the panel is a tabpanel.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { kitModuleForHash } from "@/app/kit/catalog";

import { stripComments } from "./_helpers";

const ROOT = resolve(__dirname, "..", "..");
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), "utf8"));

test("hash -> module", () => {
  expect(kitModuleForHash("parts")).toBe("parts");
  expect(kitModuleForHash("#law")).toBe("law");
  expect(kitModuleForHash("g-forms")).toBe("parts");
  expect(kitModuleForHash("g-nope")).toBeNull();
  expect(kitModuleForHash("")).toBeNull();
});

test("KitView resolves its hash through kitModuleForHash", () => {
  const src = read("app/kit/KitView.tsx");
  expect(src.length).toBeGreaterThan(0);
  expect(src).toContain("kitModuleForHash(");
});

test("the rail controls a tabpanel", () => {
  const src = read("app/kit/KitView.tsx");
  expect(src.match(/role="tabpanel"/g) ?? []).toHaveLength(1);
  const ids = [...src.matchAll(/panelId:\s*"([^"]+)"/g)].map((m) => m[1]);
  expect(ids).toHaveLength(4);
  const id = ids[0];
  expect(new Set(ids).size).toBe(1);
  expect(src).toContain(`id="${id}"`);
});
