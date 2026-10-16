// LANE - THE LIVE APP: EVERY (studio) ROUTE HOLDS THE TYPE FLOOR AND STARTS LEGIBLE.
//
// WHY THIS RUNG. Plan §3.5 sets the new world's floors where v1 hopes to end: no readable
// text under 12 px (the prototype's law: tokens.css "nothing a user must read is under
// 12px", NOTES.md "no label under 12 px"), and 0 contrast misses on a new route. Both are
// properties of COMPUTED style - a token can be right and v1's root cascade, which this world
// still nests under until Phase 6, can shrink or fade it - so they exist only in a page.
// kit.live.spec.ts held the 12 px floor on /kit alone; this holds it on every route.
//
// THE ROUTES ARE WALKED, NOT LISTED: every app/(studio)/**/page.tsx, read off the filesystem,
// so a route is a requirement the day its page lands. Route groups `(x)` add no segment.
// Dynamic segments (`[id]`, `[...x]`, `[[...x]]`) and parallel/intercepting slots are
// SKIPPED, named in the skip, because a URL for them needs a record the lane would have to
// invent - their static parents are still walked.
//
// THE 14 px BODY RULE IS NOT ASSERTED, and that is a reading, not an omission: the prototype
// sets body at 14-15 px (tokens.css `--fs-ui`, `--fs-body`) but marks no element as body in
// the DOM, so any selector here would be this file's guess at the design. When the design
// marks a body role, it gets its assertion here.
//
// LEGIBILITY uses the lane's own measurer (tests/live/_legibility.ts) with the legibility
// spec's settling rule. A route starts at ZERO findings. The one exception is /kit, which
// carries Lot 9's baselined findings - read from legibility-baseline.json["kit"], not copied,
// so the ratchet there is the same one: a fresh finding fails, and an entry that stops
// reproducing fails too.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { DEFAULT_GROUND, findingKey, measurerSource, type Finding } from "./_legibility";

const ROOT = process.cwd();
const STUDIO = join(ROOT, "app", "(studio)");
const TYPE_FLOOR_PX = 12;

type Route = { url: string; skip?: string };

function studioRoutes(): Route[] {
  const out: Route[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (e.name === "page.tsx") {
        const segs = relative(STUDIO, dir).split(sep).filter((s) => s !== "" && !/^\(.*\)$/.test(s));
        const url = `/${segs.join("/")}`;
        const odd = segs.find((s) => s.startsWith("[") || s.startsWith("@") || s.startsWith("(."));
        out.push(odd === undefined ? { url } : { url, skip: `segment "${odd}" needs a real record to address; its static parents are walked` });
      }
    }
  };
  walk(STUDIO);
  return out.sort((a, b) => a.url.localeCompare(b.url));
}

/** Lot 9's findings on /kit, the only route allowed to start above zero (plan §3.5). Any other
 *  route may baseline ONLY disabled controls (`route:<url>`): they keep the prototype's dimming
 *  under WCAG 1.4.3's exemption (owner ruling 2026-10-15, plan §8 decision 7), and the key says
 *  so, so the same control enabled is still a finding. */
function allowedFindings(url: string): string[] | null {
  const base = JSON.parse(readFileSync(join(ROOT, "tests", "live", "legibility-baseline.json"), "utf8")) as Record<string, string[]>;
  if (url === "/kit") return base["kit"] ?? [];
  const own = base[`route:${url}`];
  if (own === undefined) return null;
  const notDisabled = own.filter((k) => !k.includes("[aria-disabled=true]"));
  if (notDisabled.length > 0) throw new Error(`legibility-baseline.json["route:${url}"] may hold disabled controls only: ${notDisabled.join("; ")}`);
  return own;
}

/** Visible text in the new world under the floor. sr-only text (a 1 px box) is the non-visual channel, not type. */
async function smallText(page: Page, floor: number): Promise<{ checked: number; small: string[] }> {
  return page.evaluate((floorPx) => {
    const world = document.querySelector('[data-world="next"]');
    if (world === null) return { checked: 0, small: ["no [data-world=next] root"] };
    const walker = document.createTreeWalker(world, NodeFilter.SHOW_TEXT);
    const small: string[] = [];
    let checked = 0;
    for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
      const el = n.parentElement;
      if (el === null || (n.textContent ?? "").trim() === "") continue;
      const box = el.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      checked++;
      const px = Number.parseFloat(cs.fontSize);
      if (px < floorPx) small.push(`${px}px ${el.tagName.toLowerCase()}.${el.className}: ${(n.textContent ?? "").trim().slice(0, 40)}`);
    }
    return { checked, small };
  }, floor);
}

/** The legibility spec's settling rule: animations off, two samples 700 ms apart, keep what both saw. */
async function settledFindings(page: Page): Promise<string[]> {
  const sample = async () => ((await page.evaluate(measurerSource({ ground: DEFAULT_GROUND }))) as Finding[]).map(findingKey);
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  await page.waitForTimeout(300);
  const first = new Set(await sample());
  await page.waitForTimeout(700);
  return [...new Set((await sample()).filter((k) => first.has(k)))].sort();
}

const ROUTES = studioRoutes();

test("the walk found the (studio) routes", () => {
  expect(ROUTES.filter((r) => r.skip === undefined).map((r) => r.url), "no static (studio) page found").toContain("/kit");
});

test("negative control: 11 px text in the new world reads red, 12 px reads green", async ({ page }) => {
  await page.setContent(`<body><div data-world="next"><p style="font-size:11px">too small</p><p style="font-size:12px">floor</p></div></body>`);
  const r = await smallText(page, TYPE_FLOOR_PX);
  expect(r.checked).toBe(2);
  expect(r.small).toHaveLength(1);
  expect(r.small[0]).toContain("too small");
});

for (const route of ROUTES) {
  test.describe(`(studio) ${route.url}`, () => {
    test.skip(route.skip !== undefined, route.skip);

    test.beforeEach(async ({ page }) => {
      await page.goto(route.url, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
      await expect(page.locator('[data-world="next"]').first()).toBeVisible();
      await page.waitForLoadState("networkidle");
    });

    test(`no visible text under ${TYPE_FLOOR_PX}px (computed, after v1's cascade)`, async ({ page }) => {
      const r = await smallText(page, TYPE_FLOOR_PX);
      expect(r.checked, "measured no text - the world root rendered empty").toBeGreaterThan(10);
      expect(r.small).toEqual([]);
    });

    test("legibility: zero contrast misses beyond the route's recorded baseline", async ({ page }) => {
      const keys = await settledFindings(page);
      const allowed = allowedFindings(route.url);
      const known = new Set(allowed ?? []);
      expect(keys.filter((k) => !known.has(k)), `NEW legibility findings on ${route.url} (floors: text 4.5, marks 3)`).toEqual([]);
      if (allowed !== null) expect(allowed.filter((k) => !keys.includes(k)), `baselined findings on ${route.url} no longer reproduce - delete them from legibility-baseline.json["kit"]`).toEqual([]);
    });
  });
}
