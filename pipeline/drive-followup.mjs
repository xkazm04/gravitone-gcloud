/**
 * The two tests asked for:
 *   1. deepen f-liquidity — the load-bearing, LOW-confidence vendor stat
 *   2. ask "What about onchain data, do they provide any hints regarding
 *      behavior of whales?"
 *
 * The assertion that matters is not that something came back. It is that a
 * follow-up can make the notebook WORSE — a queue that can only add is a queue
 * that launders whatever it finds.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3182";
const SHOTS = "pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/captures";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (n, ok, d = "") => { results.push({ n, ok, d }); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on("pageerror", (e) => check("no page errors", false, e.message.slice(0, 150)));

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Research", exact: false }).first().click();
await page.waitForTimeout(300);
await page.getByTestId("load-saved-run").click();
await page.waitForTimeout(400);

check("only the Triage board remains",
      (await page.getByTestId("variant-queue").count()) === 0 &&
      (await page.getByTestId("variant-map").count()) === 0);

// ---------- 1 · deepen the low-confidence card
const card = await page.getByTestId("card-f-liquidity").innerText();
check("f-liquidity is flagged load-bearing at low confidence",
      /load-bearing/i.test(card) && /low/i.test(card) && /second source/i.test(card));

await page.getByTestId("deepen-f-liquidity").click();
await page.waitForTimeout(400);

const item = await page.getByTestId("followup-item-f-liquidity").innerText();
check("deepened card appears in the follow-up queue", item.length > 0);
check("the system writes the reason for you",
      /already flags this as needing a second source/i.test(item), item.split("\n").find(l => /second source/i.test(l))?.slice(0, 80));

// ---------- 2 · the typed question
await page.getByTestId("followup-question").fill(
  "What about onchain data, do they provide any hints regarding behavior of whales?",
);
await page.getByTestId("followup-ask").click();
await page.waitForTimeout(300);
const queueTxt = await page.getByTestId("followup").innerText();
check("question is queued alongside the deepened card", /question/i.test(queueTxt) && /whales/i.test(queueTxt));

await page.screenshot({ path: `${SHOTS}/followup-queued.png`, fullPage: true });

// ---------- run it
await page.getByRole("button", { name: /Run \d+ follow-up/i }).click();
await page.waitForTimeout(1400);
const done = await page.getByTestId("followup").innerText();

check("f-liquidity follow-up returns WEAKENED", /weakened/i.test(done));
check("it KILLS the fact rather than confirming it", /\bkills\b/i.test(done));
check("it names the breakdown that argues against the fact",
      /M2 grew more than 12%|broke down/i.test(done));
check("it adds a stronger replacement fact", /adds/i.test(done) && /f-m2-divergence/.test(done));

check("whale question returns RESOLVED", /resolved/i.test(done));
check("it answers the actual question — different cohorts",
      /different cohorts|DIFFERENT COHORTS/i.test(done));
check("it cites the mid-tier distribution that cancels the whale buying",
      /77,800|midtier|mid-sized/i.test(done));
check("it resolves the notebook's open contradiction", /resolves/i.test(done));

check("the queue states a follow-up can weaken as well as strengthen",
      /weaken the notebook as well as strengthen/i.test(done));
check("applying is deferred — the current script is unaffected",
      /current script is unaffected/i.test(done));

await page.screenshot({ path: `${SHOTS}/followup-returned.png`, fullPage: true });

// ---------- narrow viewport
await page.setViewportSize({ width: 768, height: 1024 });
await page.waitForTimeout(400);
const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("768px: no horizontal overflow", ov <= 1, `${ov}px`);

await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
if (bad.length) { console.log("FAILURES:"); bad.forEach((f) => console.log(`  - ${f.n}${f.d ? " — " + f.d : ""}`)); process.exit(1); }
