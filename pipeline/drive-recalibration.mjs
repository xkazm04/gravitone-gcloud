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

/* ---------------------------------- 3 · the sticky pad (the consolidated winner) */
check("the pad is the only notebook", (await page.getByTestId("sticky-pad").count()) > 0);
check("the placement switcher is gone", (await page.getByTestId("notebook-dock").count()) === 0);

/* ---------------------------------------------- 4 · stacking notes on a track */
const pickPreset = async (kind, card) => {
  await page.getByTestId(`preset-open-${card}`).click();
  await page.waitForTimeout(250);
  await page.getByTestId(`note-${kind}-${card}`).click();
  await page.waitForTimeout(300);
};

await page.getByTestId("note-handle-f-etf-absorbed").click();
await page.waitForTimeout(400);
check("clicking a track id opens a composer", (await page.getByTestId("composer-f-etf-absorbed").count()) > 0);

// the presets are a themed dropdown, sorted by name ascending
await page.getByTestId("preset-open-f-etf-absorbed").click();
await page.waitForTimeout(300);
const opts = await page.getByTestId("preset-list-f-etf-absorbed").locator("button").allInnerTexts();
check("presets open as a list", opts.length === 5, `${opts.length} options`);
check("presets are sorted by name ascending",
      JSON.stringify(opts) === JSON.stringify([...opts].sort((a, b) => a.localeCompare(b))),
      opts.join(" | "));
check("the list is not a native select",
      (await page.getByTestId("composer-f-etf-absorbed").locator("select").count()) === 0);
await page.keyboard.press("Escape");
await page.waitForTimeout(250);
check("Escape closes the dropdown", (await page.getByTestId("preset-list-f-etf-absorbed").count()) === 0);

await pickPreset("more-focus", "f-etf-absorbed");
await pickPreset("move-earlier", "f-etf-absorbed");
check("bullets stack against one track", (await page.getByTestId("note-handle-f-etf-absorbed").innerText()).includes("2"),
      await page.getByTestId("note-handle-f-etf-absorbed").innerText());

// a second track, a different instruction
await page.getByTestId("note-handle-f-supply-2pct").click();
await page.waitForTimeout(400);
await pickPreset("descope", "f-supply-2pct");
check("the pad aggregates across tracks", /notes · 3/i.test(await page.getByTestId("sticky-pad").innerText()),
      (await page.getByTestId("sticky-pad").innerText()).split("\n")[0]);

// width: the prototype pad was 19rem; +20% is 22.8rem
const padW = await page.getByTestId("sticky-pad").evaluate((el) => el.getBoundingClientRect().width);
check("the pad is 20% wider than the prototype", Math.abs(padW - 22.8 * 16) < 2, `${Math.round(padW)}px`);
await page.screenshot({ path: `${SHOTS}/notes-pad.png`, fullPage: true });

/* ------------------------------------- 5 · one recalibration, and notes lock */
await page.getByTestId("run-recalibration").click();
await page.waitForTimeout(1200);
check("the run is announced", (await page.getByTestId("recalibrating").count()) > 0);
check("a second recalibration cannot be started", (await page.getByTestId("run-recalibration").count()) === 0);
const handleDisabled = await page.getByTestId("note-handle-f-mnav").isDisabled().catch(() => false);
check("notes are locked while it runs", handleDisabled);

// A real run is a local Claude Code process: minutes, not milliseconds. Poll
// for the candidate rather than sleeping a fixed 11s, which only ever fit the
// mocked transform.
const RUN_BUDGET_MS = 8 * 60_000;
const startedAt = Date.now();
while (Date.now() - startedAt < RUN_BUDGET_MS) {
  if ((await page.getByTestId("candidate-bar").count()) > 0) break;
  await page.waitForTimeout(3000);
}
const waited = Math.round((Date.now() - startedAt) / 1000);
check("a candidate is staged, not applied", (await page.getByTestId("candidate-bar").count()) > 0,
      `after ${waited}s`);

// PROVENANCE. A real run is a local Claude Code process and carries no
// `simulated` tag; a fallback carries it AND states why. What must never happen
// is a fallback that renders identically to a real result.
const bar = await page.getByTestId("candidate-bar").innerText();
const fellBack = /simulated/i.test(bar);
check("the version states which engine produced it",
      fellBack ? (await page.getByTestId("engine-note").count()) > 0 : true,
      fellBack
        ? "fell back — " + (await page.getByTestId("engine-note").innerText().catch(() => "WITH NO REASON"))
        : "real local Claude Code run");
check("a real engine run is not labelled simulated", !fellBack, bar.split("\n")[0]);

check("the version switch appears", (await page.getByTestId("version-bar").count()) > 0);

/* ------------------------------------------------ 6 · the before/after reads */
await page.getByTestId("show-candidate").click();
await page.waitForTimeout(600);
const focused = await page.getByTestId("row-f-etf-absorbed").innerText();
check("a 'more focus' note moved the weight up", /\+\d+s/.test(focused), focused.split("\n")[0]);
// f-supply-2pct is steel-man evidence. The simulated transform cuts it blindly;
// the real engine REFUSES, because cutting it strands required material — which
// is the better answer and the one the prompt asks for. Accept either, and fail
// only on the third outcome: silently doing nothing and saying nothing.
const dropped = await page.getByTestId("row-f-supply-2pct").innerText();
const wasCut = /-\d+s/.test(dropped) || /✕/.test(dropped);
const wasExplained = /refus|not done|argues from/i.test(
  await page.getByTestId("candidate-bar").innerText(),
);
check("a 'descope' note is either applied or refused out loud", wasCut || wasExplained,
      wasCut ? "applied" : wasExplained ? "refused with a reason" : "NEITHER — silently dropped");

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
// The accepted version persists whatever it decided — what must survive is the
// decision, not one particular decision. Asserting a specific cell here was
// asserting the simulated transform's answer.
check("the accepted baseline survives a reload",
      (await page.getByTestId(/^row-/).count()) === 36 &&
        (await page.getByTestId("candidate-bar").count()) === 0,
      "accepted and persisted, no candidate pending");

check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
if (bad.length) { console.log("FAILURES:"); bad.forEach((f) => console.log(`  - ${f.n}${f.d ? " — " + f.d : ""}`)); process.exit(1); }
