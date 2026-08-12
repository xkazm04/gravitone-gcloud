/**
 * Drive the gated /studio/[projectId] route: tab split, background jobs,
 * the follow-up serialisation rule, and the notification bell.
 *
 *   node pipeline/drive-studio.mjs [baseURL]
 *
 * Auth: the route is gated. This drives the SIGNED-OUT path plus whatever the
 * gate exposes, and reports honestly on what it could not reach.
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
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

// --- routing: the old query form must be gone, the segment must resolve
const res = await page.goto(`${BASE}/studio/p-does-not-exist`, { waitUntil: "domcontentloaded" });
check("dynamic segment /studio/[projectId] serves", res.status() < 400, `HTTP ${res.status()}`);
await page.waitForTimeout(600);

// The gate sends a signed-out visitor to the landing page. That IS the gate
// working — an inline sign-in form on a project URL would leak the fact that
// the project exists. (First written expecting an inline gate; the redirect is
// the better behaviour and the assertion was wrong.)
const path = new URL(page.url()).pathname;
check("signed-out visitor cannot reach a project", path === "/" || path === "/projects",
      `redirected to ${path}`);
check("gate leaks nothing about the project",
      !/notebook|bitcoin|triage/i.test(await page.locator("body").innerText()));

// --- the bell is part of the frame, so it should exist wherever the frame does
await page.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(600);
const frameShown = (await page.getByTestId("bell").count()) > 0;
if (frameShown) check("notification bell mounts in the app frame", true, "bell present");
else console.log("SKIP  notification bell — signed out, the frame does not render. NOT VERIFIED.");

check("no page errors on any route", errors.length === 0, errors.slice(0, 2).join(" | "));

await page.screenshot({ path: `${SHOTS}/studio-route.png`, fullPage: true });

console.log(`
NOT VERIFIED BY THIS RUN (needs a signed-in Firebase session):
  · the Topic / Triage board tab split and the board's locked state
  · the Clear confirmation dialog
  · background research jobs and the bell's unread counting
  · the one-follow-up-per-project rule in the browser
These are typechecked and built, not driven. Treat them as unverified.`);
await browser.close();

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
if (bad.length) { console.log("FAILURES:"); bad.forEach((f) => console.log(`  - ${f.n}${f.d ? " — " + f.d : ""}`)); process.exit(1); }
