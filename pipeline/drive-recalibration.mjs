/**
 * Drive Step 2's four tabs, the sticky notebook, and the recalibration loop.
 *
 *   NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3183
 *   node pipeline/drive-recalibration.mjs http://localhost:3183
 *
 * The rules under test are the user's, and every one of them is a thing the UI
 * could plausibly get wrong while still compiling:
 *   · notes AGGREGATE — nothing regenerates until you ask once, for all of them
 *   · one recalibration per project; while it runs, notes are locked
 *   · Candidates and Tracks never show the candidate
 *   · a candidate is not a baseline until accepted
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3183";
const SHOTS = "pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/captures";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (n, ok, d = "") => { results.push({ n, ok, d }); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 1150 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
if ((await page.getByTestId("dev-auth-banner").count()) === 0) {
  console.log("\nDEV BYPASS NOT ACTIVE:  NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3183\n");
  await browser.close();
  process.exit(3);
}
const goStep2 = async () => {
  await page.goto(`${BASE}/studio/seed-why-bitcoin?step=script`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2800);
};
await goStep2();

/* ------------------------------------------- 1 · four standalone top-level tabs */
for (const t of ["candidates", "coverage", "spend", "tracks"])
  check(`tab ${t} is top-level`, (await page.getByTestId(`view-${t}`).count()) > 0);
check("the nested matrix picker is gone", (await page.getByTestId("matrix-variant-ledger").count()) === 0);

await page.getByTestId("view-coverage").click();
await page.waitForTimeout(1200);
check("Coverage renders (variant A relabelled)", (await page.getByTestId("matrix-coverage").count()) > 0);

/* --------------------------------- 2 · titles in full, and zero rows are present */
const rows = await page.getByTestId(/^row-/).count();
check("every card has a row, including the unspent", rows === 36, `${rows}/36`);

// f-etf-absorbed has a long title and is unused by the reversal chain.
const row = page.getByTestId("row-f-etf-absorbed");
const full = "Inflows have been positive but insufficient: holders who bought near these levels use recoveries to reduce positions, so ETF buying is absorbed by sellers rather than lifting price";
check("the title is rendered in full, not truncated", (await row.innerText()).includes(full),
      (await row.innerText()).split("\n").slice(-1)[0].slice(0, 60) + "…");
const clipped = await row.locator("p").first().evaluate((el) => el.scrollWidth > el.clientWidth + 1);
check("the title is not visually clipped either", !clipped);

// a conclusion: no render used it, so it must show zeros rather than be hidden
const zero = page.getByTestId("cell-reversal-chain-c-correlation-is-the-product");
check("an unused card shows 0s rather than vanishing", (await zero.innerText()).trim() === "0s",
      (await zero.innerText()).trim());

/* ------------------------------------------------ 3 · the sticky notebook, x3 */
for (const p of ["dock", "margin", "pad"]) {
  await page.getByTestId(`notebook-${p}`).click();
  await page.waitForTimeout(500);
  check(`notebook placement ${p} renders`, (await page.getByTestId(`sticky-${p}`).count()) > 0);
}
await page.getByTestId("notebook-dock").click();
await page.waitForTimeout(400);

/* ---------------------------------------------- 4 · stacking notes on a track */
await page.getByTestId("note-handle-f-etf-absorbed").click();
await page.waitForTimeout(400);
check("clicking a track id opens a composer", (await page.getByTestId("composer-f-etf-absorbed").count()) > 0);
await page.getByTestId("note-more-focus-f-etf-absorbed").click();
await page.waitForTimeout(300);
await page.getByTestId("note-move-earlier-f-etf-absorbed").click();
await page.waitForTimeout(300);
check("bullets stack against one track", (await page.getByTestId("note-handle-f-etf-absorbed").innerText()).includes("2"),
      await page.getByTestId("note-handle-f-etf-absorbed").innerText());

// a second track, a different instruction
await page.getByTestId("note-handle-f-supply-2pct").click();
await page.waitForTimeout(400);
await page.getByTestId("note-descope-f-supply-2pct").click();
await page.waitForTimeout(400);
check("the dock aggregates across tracks", /2 tracks|notes · 3/i.test(await page.getByTestId("sticky-dock").innerText()),
      (await page.getByTestId("sticky-dock").innerText()).split("\n")[0]);
await page.screenshot({ path: `${SHOTS}/notes-dock.png`, fullPage: true });

/* ------------------------------------- 5 · one recalibration, and notes lock */
await page.getByTestId("run-recalibration").click();
await page.waitForTimeout(1200);
check("the run is announced", (await page.getByTestId("recalibrating").count()) > 0);
check("a second recalibration cannot be started", (await page.getByTestId("run-recalibration").count()) === 0);
const handleDisabled = await page.getByTestId("note-handle-f-mnav").isDisabled().catch(() => false);
check("notes are locked while it runs", handleDisabled);

await page.waitForTimeout(11000);
check("a candidate is staged, not applied", (await page.getByTestId("candidate-bar").count()) > 0);
check("the version switch appears", (await page.getByTestId("version-bar").count()) > 0);

/* ------------------------------------------------ 6 · the before/after reads */
await page.getByTestId("show-candidate").click();
await page.waitForTimeout(600);
const focused = await page.getByTestId("row-f-etf-absorbed").innerText();
check("a 'more focus' note moved the weight up", /\+\d+s/.test(focused), focused.split("\n")[0]);
const dropped = await page.getByTestId("row-f-supply-2pct").innerText();
check("a 'descope' note removed it", /-\d+s/.test(dropped) || /✕/.test(dropped), dropped.split("\n")[0]);

await page.getByTestId("show-baseline").click();
await page.waitForTimeout(500);
check("switching back shows the baseline",
      !/\+\d+s/.test(await page.getByTestId("row-f-etf-absorbed").innerText()));
await page.getByTestId("show-candidate").click();
await page.waitForTimeout(500);

// the spend bar compares the same versions
await page.getByTestId("view-spend").click();
await page.waitForTimeout(900);
check("the spend bar offers the same comparison", (await page.getByTestId("version-bar").count()) > 0);
check("it can sort by what moved", (await page.getByTestId("sort-change").count()) > 0);
await page.screenshot({ path: `${SHOTS}/spend-compare.png`, fullPage: true });

/* -------------------------- 7 · Candidates and Tracks stay on the baseline */
await page.getByTestId("view-candidates").click();
await page.waitForTimeout(700);
check("Candidates says it is baseline-only", (await page.getByTestId("baseline-only").count()) > 0);
check("Candidates has no version switch", (await page.getByTestId("version-bar").count()) === 0);
await page.getByTestId("view-tracks").click();
await page.waitForTimeout(700);
check("Tracks says it is baseline-only", (await page.getByTestId("baseline-only").count()) > 0);
check("Tracks has no version switch", (await page.getByTestId("version-bar").count()) === 0);

/* ------------------------------------------------- 8 · accepting is explicit */
await page.getByTestId("view-coverage").click();
await page.waitForTimeout(800);
await page.getByTestId("accept-candidate").click();
await page.waitForTimeout(800);
check("accepting clears the candidate", (await page.getByTestId("candidate-bar").count()) === 0);
check("accepting clears the answered notes",
      (await page.getByTestId("note-handle-f-etf-absorbed").innerText()).trim() === "f-etf-absorbed",
      await page.getByTestId("note-handle-f-etf-absorbed").innerText());

// the accepted weights are now the baseline, and survive a reload
await goStep2();
await page.getByTestId("view-coverage").click();
await page.waitForTimeout(1200);
const afterReload = await page.getByTestId("row-f-supply-2pct").innerText();
check("the accepted baseline survives a reload", /✕/.test(afterReload), afterReload.split("\n")[0]);

check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
if (bad.length) { console.log("FAILURES:"); bad.forEach((f) => console.log(`  - ${f.n}${f.d ? " — " + f.d : ""}`)); process.exit(1); }
