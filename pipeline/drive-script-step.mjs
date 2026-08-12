/**
 * Drive the SCRIPT step (step 2) in a real browser, through the gated studio.
 *
 *   NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3183
 *   node pipeline/drive-script-step.mjs http://localhost:3183
 *
 * Rewritten 2026-08-12. The previous version drove the landing page and clicked
 * variant tabs named "Wire desk / Assay bench / Foundry" — tabs deleted when the
 * Assay bench was picked as the baseline, on a route that moved behind auth.
 * It had been failing at its first click ever since and testing nothing.
 *
 * The assertion this file exists for: the CONSTRAINT LEDGER used to address
 * notebook unknowns by array index. A follow-up resolved one, the array shrank,
 * and `NOTEBOOK.unknowns[3].impact` threw — taking the whole step down. tsc and
 * `next build` were both green through all of it. Only a click found it.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3183";
const SHOTS = "pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/captures";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (n, ok, d = "") => { results.push({ n, ok, d }); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

if ((await page.getByTestId("dev-auth-banner").count()) === 0) {
  console.log("\nDEV BYPASS NOT ACTIVE. Start the dev server with the flag:");
  console.log("  NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3183\nNothing was tested.\n");
  await browser.close();
  process.exit(3);
}

/* ------------------- 1 · a project with no research shows the empty state */
// Step 2 no longer runs research of its own. Glass Harbor has none, so it must
// say so rather than render three scripts against another project's notebook.
await page.getByTestId("cell-seed-glass-harbor-script").click();
await page.waitForTimeout(2200);
const unresearched = await page.locator("main").innerText();
check("an unresearched project says so in Step 2", /no notebook for this project yet/i.test(unresearched));
check("it does not render scripts anyway", (await page.getByTestId(/^render-/).count()) === 0);
check("Step 2 no longer offers a topic field", (await page.getByLabel("Topic").count()) === 0);
check("Step 2 no longer offers a research run", (await page.getByTestId("load-saved-run").count()) === 0);
check("Step 2 no longer carries the run log", !/run log|procedure/i.test(unresearched));
check("the evidence log is not in Step 2 any more", (await page.getByTestId("open-notebook").count()) === 0);

/* -------------------------------------------- 2 · the researched project renders */
await page.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
await page.getByTestId("cell-seed-why-bitcoin-script").click();
await page.waitForTimeout(2500);
check("it deep-links to the Script step", /\/studio\/seed-why-bitcoin\?step=script/.test(page.url()),
      new URL(page.url()).pathname + new URL(page.url()).search);

const renders = await page.getByTestId(/^render-/).count();
check("all three renders draw with no run", renders === 3, `${renders} columns`);
check("the step did not throw while drawing them", errors.length === 0,
      errors.slice(0, 2).join(" | "));

/* ---------------------------------------------------- 3 · the constraint ledger */
const NOTEBOOK_UNKNOWNS = 4;
for (const id of ["reversal-chain", "adjudication", "derived-short"]) {
  const ledger = page.getByTestId(`ledger-${id}`);
  if (!(await ledger.count())) { check(`${id}: ledger renders`, false); continue; }
  const rows = await ledger.locator("li").count();
  check(`${id}: every unknown is scored`, rows === NOTEBOOK_UNKNOWNS,
        `${rows}/${NOTEBOOK_UNKNOWNS} rows`);
  // A row that cannot resolve its unknown must be REPORTED, not dropped. If this
  // banner ever appears, the ledger is scoring against a rule that no longer
  // exists — which is the failure the id-keying was meant to make impossible.
  const dangling = await ledger.getByTestId("ledger-dangling").count();
  check(`${id}: no ledger row points at a missing unknown`, dangling === 0);
}

/* ------------------------------- 4 · a resolved unknown is not a silent pass */
const rc = await page.getByTestId("ledger-reversal-chain").innerText();
check("the reversal chain still declares its at-risk row", /at risk/i.test(rc), rc.split("\n")[1]);
check("a lifted constraint is called out, not scored as clean",
      /this limit has since been lifted/i.test(rc));

// The short clip's only HONOURED row is against u-spot-price, which is still
// open; its other three rows are not-applicable. So nothing is superseded and
// nothing is at risk — "clean" is the correct verdict, and asserting anything
// louder would be testing a wish rather than the rule.
const ds = await page.getByTestId("ledger-derived-short").innerText();
check("a clip constrained only by open unknowns reads clean",
      /clean/i.test(ds) && !/at risk/i.test(ds), ds.split("\n")[1]);
check("supersession is per-unknown, not per-render",
      !/this limit has since been lifted/i.test(ds));

await page.screenshot({ path: `${SHOTS}/script-ledger.png`, fullPage: true });

/* ------------------------------------------------------- 6 · the beats open */
await page.getByRole("button", { name: /read the beats/i }).first().click();
await page.waitForTimeout(600);
check("the full beat chain opens in a modal", /full beat chain/i.test(await page.locator("body").innerText()));
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
check("Escape closes it", !/full beat chain/i.test(await page.locator("body").innerText()));

check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
if (bad.length) { console.log("FAILURES:"); bad.forEach((f) => console.log(`  - ${f.n}${f.d ? " — " + f.d : ""}`)); process.exit(1); }
