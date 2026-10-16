// LANE — THE LIVE APP, IN A REAL BROWSER: LEGIBILITY.
//
// WHY THIS CLAIM IS HERE AND NOT ONE RUNG DOWN. The defect that survived this repo's
// biggest refactor — a Ghost outline at ~0.12 effective alpha — passed every gate
// and was found only by photographing the screen. Effective contrast is the product
// of colour alpha x every ancestor's opacity x the backdrop, and none of that exists
// without computed styles from a real layout engine. The measurer
// (tests/live/_legibility.ts) runs in the page; its arithmetic is pinned in Node by
// tests/golden-path/legibility-composite.spec.ts.
//
// WHAT IS WALKED. `SCREENS` from pipeline/cx-screens.mjs — the SAME table
// pipeline/cx-capture.mjs photographs — so a screen id added there is measured here.
// `LEGIBILITY_SCREENS=projects,kit-parts` narrows a local run.
//
// THE RATCHET. Findings are keyed by kind + selector and compared against
// tests/live/legibility-baseline.json, which may only SHRINK:
//   - a finding not in the baseline fails the run, naming its selector;
//   - a baseline entry that no longer reproduces ALSO fails ("remove it") — a stale
//     entry would otherwise let the same defect back in unnoticed.
// `LEGIBILITY_UPDATE=1` rewrites the baseline and refuses to grow it;
// `LEGIBILITY_SEED=1` (with UPDATE) permits growth, for the lane's first run or a
// deliberate re-baseline that will show in the diff.
//
// THE NEGATIVE CONTROL. A fixture seeded with the 2026-09 Ghost values must read
// red, or a measurer that silently measures nothing would pass every screen.
//
// FLOORS: text 4.5 (Almanac 7), non-text marks 3. Rules and omissions are written
// at the top of _legibility.ts.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { PROJECT, SCREENS } from "../../pipeline/cx-screens.mjs";

import { DEFAULT_GROUND, findingKey, measurerSource, type Finding } from "./_legibility";

type Reach = { url: string; via?: string[]; tab?: string; picks?: number; open?: string; wipe?: boolean };
const TABLE = SCREENS as Record<string, Reach>;
const PROJECT_ID = PROJECT as string;

const BASELINE = join(process.cwd(), "tests", "live", "legibility-baseline.json");
const UPDATE = process.env.LEGIBILITY_UPDATE === "1";
const SEED = process.env.LEGIBILITY_SEED === "1";
const ONLY = process.env.LEGIBILITY_SCREENS?.split(",").filter(Boolean);

type Baseline = Record<string, string[]>;
const baseline: Baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const measured: Baseline = {};

async function measureNow(page: Page): Promise<Finding[]> {
  return page.evaluate(measurerSource({ ground: DEFAULT_GROUND })) as Promise<Finding[]>;
}

/**
 * The verdict for a settled screen. Entrance animations are switched off (a node caught
 * mid-fade has a transient opacity that is not the screen's legibility) and the page is
 * measured twice, 700ms apart: only a finding present in BOTH samples counts, so a
 * ratchet baseline is a property of the screen rather than of the instant it was read.
 */
async function measureSettled(page: Page): Promise<string[]> {
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  await page.waitForTimeout(300);
  const first = new Set((await measureNow(page)).map(findingKey));
  await page.waitForTimeout(700);
  const second = (await measureNow(page)).map(findingKey);
  return [...new Set(second.filter((k) => first.has(k)))].sort();
}

/** Reach a screen the way cx-capture does: warm the shelf, walk upstream steps, then the screen. */
async function reach(page: Page, spec: Reach) {
  if (spec.url.startsWith("/studio")) {
    // The seeded project is minted on the first visit to /projects (see cx-capture.mjs).
    await page.goto("/projects", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2800);
  }
  for (const step of spec.via ?? []) {
    await page.goto(`/studio/${PROJECT_ID}?step=${step}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000); // > the 600ms save debounce
  }
  if (spec.wipe) {
    await page.goto("/projects", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await page.evaluate(async () => {
      for (const k of Object.keys(localStorage)) if (!k.startsWith("gravitone.seeded.")) localStorage.removeItem(k);
      for (const db of await indexedDB.databases()) if (db.name) indexedDB.deleteDatabase(db.name);
    });
    await page.waitForTimeout(700);
  }
  await page.goto(spec.url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3200);
  if (spec.url !== "/") await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
  if (spec.open) {
    await page.getByRole("button", { name: new RegExp(`^${spec.open}`) }).first().click().catch(() => {});
    await page.waitForTimeout(1600);
  }
  if (spec.tab) {
    const tab = page
      .getByRole("tab", { name: new RegExp(`^${spec.tab}`) })
      .or(page.getByRole("button", { name: spec.tab, exact: true }));
    await tab.first().click().catch(() => {});
    await page.waitForTimeout(1600);
  }
  for (let i = 0; i < (spec.picks ?? 0); i++) {
    const card = page.locator("[data-testid^='deck-card']").first();
    if (await card.count()) await card.click().catch(() => {});
    else await page.locator("button").filter({ hasText: /./ }).nth(2 + i).click().catch(() => {});
    await page.waitForTimeout(1400);
  }
  await page.waitForTimeout(600);
}

test("negative control: the 2026-09 Ghost values read red", async ({ page }) => {
  // `border-white/30` inside `opacity-40`, on the studio ground — as inline styles so the
  // control depends on no Tailwind build. Exactly one non-text finding is expected.
  await page.setContent(
    `<body style="margin:0;background:${DEFAULT_GROUND}"><div aria-hidden="true" style="opacity:.4;padding:16px">
       <div style="width:200px;height:40px;border:1px dashed rgba(255,255,255,.3)"></div>
     </div></body>`,
  );
  const found = await measureNow(page);
  expect(found.filter((f) => f.kind === "mark")).toHaveLength(1);
  expect(found.filter((f) => f.kind === "mark")[0].ratio).toBeLessThan(1.5);
});

test("positive control: a legible dashed outline and legible text read green", async ({ page }) => {
  await page.setContent(
    `<body style="margin:0;background:${DEFAULT_GROUND};color:#fff"><p>Readable</p>
       <div style="width:200px;height:40px;border:1px dashed rgba(255,255,255,.9)"></div></body>`,
  );
  expect(await measureNow(page)).toEqual([]);
});

test("a faint text label names its selector", async ({ page }) => {
  await page.setContent(
    `<body style="margin:0;background:${DEFAULT_GROUND}"><span data-testid="faint" style="color:rgba(255,255,255,.2)">hint</span></body>`,
  );
  const found = await measureNow(page);
  expect(found.map(findingKey)).toEqual(["text span[data-testid=faint]"]);
});

// Disabled controls keep the prototype's dimming and are baselined under WCAG 1.4.3's exemption
// (owner ruling 2026-10-15), so their key must say DISABLED: the same faint control while enabled
// is a different key, and a baseline entry for the one can never absorb the other (L47).
test("a disabled control's finding is keyed as disabled; the same control enabled is a different key", async ({ page }) => {
  const faint = "color:rgba(255,255,255,.3);background:none;border:0";
  await page.setContent(
    `<body style="margin:0;background:${DEFAULT_GROUND}"><nav><button aria-disabled="true" style="${faint}">play</button><button style="${faint}">play</button></nav></body>`,
  );
  const keys = (await measureNow(page)).map(findingKey);
  expect(keys).toEqual(["text nav > button[aria-disabled=true]", "text nav > button"]);
});

// Screens the lane cannot currently reach, each with its measured reason. A skip is listed
// here, in the open, rather than silently narrowing the walk.
const UNREACHABLE: Record<string, string> = {
  "library-animations":
    "MEASURED 2026-10-12: opening the Animations tab freezes the page under headless Chromium (waitForTimeout never returns; 120s test timeout, reproduced twice). A product finding in its own right.",
};

for (const id of Object.keys(TABLE)) {
  if (ONLY && !ONLY.includes(id)) continue;
  if (UNREACHABLE[id]) {
    test.fixme(`legibility: ${id}`, () => {});
    continue;
  }
  test(`legibility: ${id}`, async ({ page }) => {
    // Whether a run control is enabled depends on which engines THIS machine can reach
    // (a developer's box has a CLI, CI has none), and a disabled control is dimmed to
    // opacity-40, so the same screen measured differently in the two places
    // (2026-10-13: direct-the-cut read red only on CI). Pin the engine the baseline was
    // curated against: the preview keeps its real manifest and answers "an engine serves".
    await page.route("**/api/turns/preview", async (route) => {
      const res = await route.fetch();
      const body = await res.json().catch(() => null);
      if (!res.ok() || !body?.engine) return route.fulfill({ response: res });
      body.engine = { ...body.engine, available: true, provider: body.engine.provider ?? "pinned", rung: "preferred", transport: "local-subprocess", costBasis: "vendor-reported" };
      return route.fulfill({ response: res, json: body });
    });
    await reach(page, TABLE[id]);
    if (TABLE[id].wipe && (await page.locator(".gt-race").count()) > 0) {
      test.skip(true, "the wipe did not take (the seeded shelf re-populated) — not the empty shelf this id names");
    }
    const keys = await measureSettled(page);
    measured[id] = keys;
    if (UPDATE) return; // the afterAll writes the file
    const known = new Set(baseline[id] ?? []);
    const fresh = keys.filter((k) => !known.has(k));
    const stale = [...known].filter((k) => !keys.includes(k));
    expect(fresh, `NEW legibility findings on "${id}" (floors: text 4.5, Almanac 7, marks 3)`).toEqual([]);
    expect(stale, `baseline entries on "${id}" no longer reproduce — delete them from legibility-baseline.json`).toEqual([]);
  });
}

test.afterAll(() => {
  if (!UPDATE) return;
  const next: Baseline = { ...baseline };
  for (const [id, keys] of Object.entries(measured)) {
    const grew = keys.filter((k) => !(baseline[id] ?? []).includes(k));
    if (grew.length && !SEED) throw new Error(`refusing to GROW the baseline for "${id}" (${grew.join("; ")}); fix them, or pass LEGIBILITY_SEED=1`);
    next[id] = keys;
  }
  const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n");
});
