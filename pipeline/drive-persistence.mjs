/**
 * Do jobs and notifications survive a hard reload?
 *
 *   NEXT_DIST_DIR=.next-drive NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3183
 *   node pipeline/drive-persistence.mjs http://localhost:3183
 */
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3183";
const results = [];
const check = (n, ok, d = "") => { results.push({ n, ok, d }); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (e) => check("no page errors", false, e.message.slice(0, 120)));

await page.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await page.evaluate(() => localStorage.removeItem("gravitone.jobs.v1"));

// open a project's research step and start a run
await page.getByTestId(/^cell-.*-research$/).first().click();
await page.waitForTimeout(2500);
await page.getByTestId("run-research").click();
await page.waitForTimeout(1500);
check("a research job is running", (await page.getByTestId("running-note").count()) > 0);

// HARD reload mid-run — this is what used to lose everything
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await page.getByTestId("bell").click();
await page.waitForTimeout(600);
const panel = await page.getByTestId("bell-panel").innerText();
check("the interrupted run survives a hard reload",
      (await page.getByTestId("bell-interrupted").count()) > 0, panel.split("\n").slice(0, 3).join(" / "));
check("it is reported as interrupted, not as running or done", /interrupted/i.test(panel));
check("it says what to do about it", /start it again/i.test(panel));

// now let a run FINISH, then reload — the unread event must persist
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.getByTestId("run-research").click().catch(() => {});
await page.waitForTimeout(16000);
const badgeBefore = await page.getByTestId("bell-count").count();
check("a finished run badges the bell", badgeBefore > 0);

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
check("the unread notification survives a hard reload",
      (await page.getByTestId("bell-count").count()) > 0);

await page.getByTestId("bell").click();
await page.waitForTimeout(500);
await page.getByTestId("bell-mark-all").click();
await page.waitForTimeout(400);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
check("marking read also survives a reload (no zombie badge)",
      (await page.getByTestId("bell-count").count()) === 0);

await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
if (bad.length) { console.log("FAILURES:"); bad.forEach((f) => console.log(`  - ${f.n}${f.d ? " — " + f.d : ""}`)); process.exit(1); }
