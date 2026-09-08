/**
 * CX SCREEN CAPTURE — one screen, one PNG, for the /cx walk.
 *
 *   NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3007
 *   node pipeline/cx-capture.mjs <screen-id> <out.png> [--width 1920]
 *
 * The /cx skill's Phase 3 needs "the command that yields a PNG" for a named
 * screen in a named state. This is that command. Screen ids match the overlay's
 * `## Screens` table (.claude/cx/config.md) and are resolved HERE, once, so a
 * stop note never carries a URL and a route change breaks one file rather than
 * every stop note in the vault.
 *
 * The dev-auth bypass is required: every screen but the landing sits behind
 * <AuthGate>, and the bypass only exists in a non-production build
 * (lib/devAuth.ts). If the banner is absent this exits 3 rather than
 * photographing a sign-in wall and calling it the Projects shelf.
 *
 * WHY PLAYWRIGHT AND NOT THE BROWSER TOOLS: a docked side panel pins the
 * browser viewport (measured 2026-09-08: innerWidth stuck at 920 with the
 * window resized to 2320), and this app's shell is 1760px wide. A capture that
 * cannot control its own width cannot show the screen the user actually meets.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.CX_BASE ?? "http://localhost:3007";
const PROJECT = process.env.CX_PROJECT ?? "seed-glass-harbor";

/** id -> how to reach it. `go` may navigate, click, and settle; it receives the
 *  page and must leave it on the screen the id names. */
const SCREENS = {
  landing: { url: "/" },
  projects: { url: "/projects" },
  // seeded once, then emptied — see the `wipe` block below for why this is
  // NOT what a new account sees.
  "projects-empty": { url: "/projects", wipe: true },
  "wizard-discipline": { url: "/projects/new" },
  "wizard-template": { url: "/projects/new", picks: 1 },
  "wizard-style": { url: "/projects/new", picks: 2 },
  "wizard-name": { url: "/projects/new", picks: 3 },
  "studio-research": { url: `/studio/${PROJECT}?step=research` },
  "studio-script": { url: `/studio/${PROJECT}?step=script` },
  "studio-frames": { url: `/studio/${PROJECT}?step=frames` },
  // `via` — the steps the user passes THROUGH to get here, in order.
  //
  // A studio step does not only render, it WRITES: useFrames saves its derived
  // frames to the "frames" key, debounced 600ms, and the Score step downstream
  // reads that key. Jumping straight to ?step=score therefore photographs the
  // honest empty state ("this project has no frames for them to sit on") rather
  // than the populated screen — correct behaviour, wrong screen, and it read as
  // a failed acceptance until the cause was found (2026-09-08).
  //
  // Nobody reaches step 4 without passing step 3. Walking the upstream steps is
  // what the user does, so it is what the capture does.
  "studio-score": { url: `/studio/${PROJECT}?step=score`, via: ["frames"] },
  "studio-cut": { url: `/studio/${PROJECT}?step=cut`, via: ["frames", "score"] },
  "library-styles": { url: "/library" },
  "library-assets": { url: "/library", tab: "Assets" },
  "library-animations": { url: "/library", tab: "Animations" },
  playground: { url: "/playground" },
  foundry: { url: "/foundry" },
};

const [id, out, ...rest] = process.argv.slice(2);
const widthArg = rest.indexOf("--width");
const WIDTH = widthArg >= 0 ? Number(rest[widthArg + 1]) : 1920;

if (!id || !SCREENS[id]) {
  console.error(`usage: node pipeline/cx-capture.mjs <screen-id> <out.png> [--width N]`);
  console.error(`screens: ${Object.keys(SCREENS).join(", ")}`);
  process.exit(2);
}
const spec = SCREENS[id];
const target = out ?? `${id}.png`;
mkdirSync(path.dirname(path.resolve(target)), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

// WARM THE SHELF FIRST — and this is not a nicety, it is the difference between
// photographing the studio and photographing an error.
//
// A studio screen is reached by its project id, but the seeded project is
// MINTED on the first visit to /projects and lives in localStorage. Playwright
// launches a fresh profile every run, so a direct deep-link to
// /studio/<id>?step=score lands on "Nothing to open here" — which is a real
// screen, renders at the same size, and produces a ~1MB PNG that looks like a
// successful capture until you open it. Measured 2026-09-08: two seam captures
// came back byte-similar and both were the empty state.
//
// Visiting /projects first is also how the user actually arrives: nobody types
// a studio URL. So this is fidelity, not a workaround.
if (spec.url.startsWith("/studio")) {
  await page.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2800);
}

// Walk the upstream steps so their writers run before the target step reads.
for (const step of spec.via ?? []) {
  await page.goto(`${BASE}/studio/${PROJECT}?step=${step}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000); // > the 600ms save debounce, with room for a derive
}

// THE EMPTY SHELF IS NOT THE FIRST-RUN SHELF, and clearing storage gets you the
// wrong one of the two.
//
// A fresh account is HANDED a demo shelf: lib/useProjects.ts seeds six fictional
// projects when `rows.length === 0 && !alreadySeeded(uid)`, then sets
// `gravitone.seeded.<uid>`. So `localStorage.clear()` drops the flag too and the
// seed simply runs again — measured 2026-09-08, the "empty" capture came back
// with all six demo rows. What a real new user sees IS the populated shelf.
//
// The genuinely empty shelf is a POST-DELETION state: seeded once, then emptied.
// Reached by keeping the seeded flag and dropping only the records — no uid
// needed, which keeps this honest if the key format changes.
if (spec.wipe) {
  await page.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000); // let the seed land and mark itself
  await page.evaluate(async () => {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith("gravitone.seeded.")) localStorage.removeItem(k);
    }
    for (const db of await indexedDB.databases()) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  });
  await page.waitForTimeout(700);
}

await page.goto(BASE + spec.url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3200);

if (spec.url !== "/" && (await page.getByTestId("dev-auth-banner").count()) === 0) {
  console.error("DEV BYPASS NOT ACTIVE — start the server with NEXT_PUBLIC_DEV_AUTH=1.");
  console.error("Nothing was captured; a sign-in wall is not the screen you asked for.");
  await browser.close();
  process.exit(3);
}

if (spec.tab) {
  await page.getByRole("button", { name: spec.tab, exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(1600);
}

// The wizard is one deck: each stage is reached by committing the stage before
// it, so "the style stage" means "two picks in". Picking IS the Next click
// (app/_projects/wizard/CreateWizard.tsx), so a click on the first card of the
// current stage advances exactly one stage.
for (let i = 0; i < (spec.picks ?? 0); i++) {
  const card = page.locator("[data-testid^='deck-card']").first();
  if (await card.count()) {
    await card.click().catch(() => {});
  } else {
    await page.locator("button").filter({ hasText: /./ }).nth(2 + i).click().catch(() => {});
  }
  await page.waitForTimeout(1400);
}

// Refuse to call an error state a capture. The studio's not-found screen is the
// one that masquerades most convincingly; the shelf's own empty state is legal
// (that IS `projects-empty`), so only guard the deep screens.
const notFound = await page.getByText("Nothing to open here").count();
if (notFound && spec.url.startsWith("/studio")) {
  console.error(`REFUSED: ${id} rendered the studio's not-found screen, not the screen you asked for.`);
  console.error(`The project "${PROJECT}" does not exist in this browser profile. Set CX_PROJECT, or`);
  console.error(`check that /projects seeds it. Nothing was written to ${target}.`);
  await browser.close();
  process.exit(4);
}

await page.waitForTimeout(600);
await page.screenshot({ path: target, fullPage: true });
const meta = await page.evaluate(() => ({
  title: document.title,
  url: location.pathname + location.search,
  h: document.documentElement.scrollHeight,
}));
console.log(`captured ${id} -> ${target}  (${meta.url}, ${WIDTH}x${meta.h})`);
if (errors.length) console.log(`page errors: ${errors.length} — ${errors[0].slice(0, 120)}`);
await browser.close();
