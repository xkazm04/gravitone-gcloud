/**
 * DRIVES THE EDUCATIONAL BOARD ONLY. The Research step branches on the
 * project's discipline (app/_phases/research/ResearchStep.tsx): trailer and
 * free-in-beats-mode projects render the beat-variant board, which has no
 * columns, no cards and none of the testids below. Point this at an
 * educational project.
 */
/**
 * Drive the RESEARCH step's triage board through the gated studio.
 *
 *   NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3183
 *   node pipeline/drive-research-step.mjs http://localhost:3183
 *
 * Rewritten 2026-08-12. The previous version drove the landing page and clicked
 * `variant-board` / `variant-queue` / `variant-map` — the three prototype tabs,
 * deleted when the triage board was picked as the baseline. It had been failing
 * at its first click ever since.
 *
 * Scope: COLUMN INTEGRITY. drive-signed-in.mjs already covers conclusions, the
 * descope signal and the follow-up rules; this covers the thing that has no
 * other check — whether each card is in the column a reviewer would look for it
 * in. Follow-up round 1 wrote three facts and did not tag any of them, so all
 * three fell through `?? DEFAULT_DIMENSION` into "The number" and a reviewer
 * reading the demand story would never have found them.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3183";
const SHOTS = "pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/captures";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (n, ok, d = "") => { results.push({ n, ok, d }); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
if ((await page.getByTestId("dev-auth-banner").count()) === 0) {
  console.log("\nDEV BYPASS NOT ACTIVE:  NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3183\n");
  await browser.close();
  process.exit(3);
}

await page.getByTestId(/^cell-.*-research$/).first().click();
await page.waitForTimeout(2500);

const board = page.getByTestId("tab-board");
if (await board.isDisabled().catch(() => true)) {
  await page.getByTestId("load-saved-run").click();
  await page.waitForTimeout(900);
}
await board.click();
await page.waitForTimeout(900);

/* ------------------------------------------------------- 1 · every column draws */
const COLUMNS = ["the-number", "flows", "actors", "macro", "politics", "counter-case", "conclusions"];
for (const c of COLUMNS)
  check(`column ${c} renders`, (await page.getByTestId(`column-${c}`).count()) > 0);

/* --------------------------------------- 2 · cards are in the column that owns them */
// Where each card ACTUALLY is, read off the DOM rather than off the source table
// the surface is built from — otherwise this only re-states CARD_DIMENSION.
const placement = await page.evaluate(() => {
  const out = {};
  document.querySelectorAll('[data-testid^="column-"]').forEach((sec) => {
    const col = sec.getAttribute("data-testid").replace("column-", "");
    sec.querySelectorAll('[data-testid^="card-"]').forEach((card) => {
      out[card.getAttribute("data-testid").replace("card-", "")] = col;
    });
  });
  return out;
});

const EXPECTED = {
  // the three facts follow-up round 1 added — the ones that were mis-filed
  "f-m2-divergence": "macro",
  "f-whale-absorb": "flows",
  "f-midtier-distribute": "flows",
  // a spot-check of the original tagging, so a wholesale regression is caught too
  "f-ath": "the-number",
  "f-mnav": "actors",
  "f-sbr": "politics",
  "steel-man": "counter-case",
};
for (const [id, want] of Object.entries(EXPECTED))
  check(`${id} sits in ${want}`, placement[id] === want, `found in ${placement[id] ?? "NO COLUMN"}`);

/* ------------------------------------- 3 · nothing lands in a column by accident */
// The notebook has 21 facts + 3 mechanisms + 4 reversals + steel-man + 7
// conclusions. If a later follow-up adds an untagged fact it will silently
// appear under "The number"; this bounds that column so it cannot happen quietly.
const inNumber = Object.entries(placement).filter(([, c]) => c === "the-number").length;
check("the price column holds only price facts", inNumber === 4, `${inNumber} cards`);

const total = Object.keys(placement).length;
check("every card is on the board somewhere", total === 36, `${total} cards placed`);

await page.screenshot({ path: `${SHOTS}/research-columns.png`, fullPage: true });

/* ------------------------------------------ 4 · an empty column reads as a gap */
const conclusions = await page.getByTestId("column-conclusions").innerText();
check("conclusions explain why none are taken yet",
      /none taken|reasoned, not researched/i.test(conclusions));

check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
if (bad.length) { console.log("FAILURES:"); bad.forEach((f) => console.log(`  - ${f.n}${f.d ? " — " + f.d : ""}`)); process.exit(1); }
