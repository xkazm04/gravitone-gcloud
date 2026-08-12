/**
 * Drive the Step 2 weight tabs: footnotes, usage attributes, and the scope
 * round-trip between Step 2 and the Step 1 triage board.
 *
 *   NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3183
 *   node pipeline/drive-impact-matrix.mjs http://localhost:3183
 *
 * Narrowed 2026-08-12 when the three variants were promoted to top-level tabs:
 * the tab/notes/version behaviour moved to drive-recalibration.mjs. What is left
 * here is what only this file checks — the honesty footnotes each weight tab
 * owes, the per-cell usage attributes, and the scope round-trip.
 *
 * The claim each tab makes is that you can adjust scope FROM it and it is the
 * same decision the triage board made. That is only true if the scope record is
 * shared and persisted, so the last section walks Step 2 → Step 1 and back.
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

// Projects are seeded into IndexedDB when /projects mounts, so a cold context
// hitting /studio/<id> directly finds nothing and is redirected back. Seed first,
// then deep links work for the rest of the run.
await page.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

const gotoStep = async (step) => {
  await page.goto(`${BASE}/studio/seed-why-bitcoin?step=${step}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2800);
};

await gotoStep("script");
if ((await page.getByTestId("dev-auth-banner").count()) === 0) {
  console.log("\nDEV BYPASS NOT ACTIVE:  NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3183\n");
  await browser.close();
  process.exit(3);
}

/* -------------------------------------------- 1 · every weight tab owes the same */
const CARDS = 36;
for (const [tab, testid] of [["coverage", "matrix-coverage"], ["spend", "matrix-spend"], ["tracks", "matrix-tracks"]]) {
  await page.getByTestId(`view-${tab}`).click();
  await page.waitForTimeout(1000);
  check(`tab ${tab} renders`, (await page.getByTestId(testid).count()) > 0);
  const txt = await page.getByTestId(testid).innerText();
  check(`${tab}: reports research no render used`, /in no (render|track)/i.test(txt));
  check(`${tab}: reports the orphaned cut record`, /no longer has|f-liquidity/i.test(txt));
  check(`${tab}: states seconds are computed`, /computed from/i.test(txt));
  await page.screenshot({ path: `${SHOTS}/matrix-${tab}.png`, fullPage: true });
}

/* ------------------------------------------ 2 · Coverage's cells are real */
await page.getByTestId("view-coverage").click();
await page.waitForTimeout(900);
const cells = await page.getByTestId(/^cell-reversal-chain-/).count();
check("Coverage draws a cell per card", cells === CARDS, `${cells}/${CARDS}`);

// f-ath opens the reversal chain (beat 0:00, 12s) and is unused by the short.
const athRC = page.getByTestId("cell-reversal-chain-f-ath");
check("a spoken cell shows its seconds", /^\d+s$/.test((await athRC.innerText()).trim()), (await athRC.innerText()).trim());
check("a spoken cell is marked spoken", (await athRC.getAttribute("data-usage")) === "spoken");
check("an unused cell is marked unused",
      (await page.getByTestId("cell-derived-short-f-ath").getAttribute("data-usage")) === "unused");
// every conclusion is unused by every render — that is the finding
const c1 = await page.getByTestId("cell-reversal-chain-c-correlation-is-the-product").getAttribute("data-usage");
check("conclusions are unused by every render", c1 === "unused", `reversal-chain: ${c1}`);

/* ------------------------------------ 3 · scope adjusts, and it is ONE scope */
const TARGET = "f-yields";
const pip = page.getByTestId(`scope-${TARGET}`).first();
check("the matrix offers a scope control per row", (await pip.count()) > 0);
await pip.click();
await page.waitForTimeout(500);
check("descoping from the matrix registers", (await pip.getAttribute("aria-label")).includes("out of scope"),
      await pip.getAttribute("aria-label"));

// the same decision must be visible in the other tabs
await page.getByTestId("view-tracks").click();
await page.waitForTimeout(900);
const tracksPip = page.getByTestId(`scope-${TARGET}`).first();
check("the descope is the same decision in every tab",
      (await tracksPip.getAttribute("aria-label")).includes("out of scope"));

/* ------------------------- 5 · ...and the same decision the triage board made */
await gotoStep("research");
const board = page.getByTestId("tab-board");
if (await board.isDisabled().catch(() => true)) {
  await page.getByTestId("load-saved-run").click();
  await page.waitForTimeout(900);
}
await board.click();
await page.waitForTimeout(900);
check("a matrix descope reaches the triage board",
      (await page.getByTestId(`card-${TARGET}`).getAttribute("data-descoped")) === "true",
      `card-${TARGET} data-descoped=${await page.getByTestId(`card-${TARGET}`).getAttribute("data-descoped")}`);

// put it back, from the board this time, and confirm the matrix agrees
await page.getByTestId(`card-${TARGET}`).click();
await page.waitForTimeout(600);
await gotoStep("script");
await page.getByTestId("view-coverage").click();
await page.waitForTimeout(1000);
check("and a board decision reaches the matrix",
      (await page.getByTestId(`scope-${TARGET}`).first().getAttribute("aria-label")).includes("is in scope"));

check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
if (bad.length) { console.log("FAILURES:"); bad.forEach((f) => console.log(`  - ${f.n}${f.d ? " — " + f.d : ""}`)); process.exit(1); }
