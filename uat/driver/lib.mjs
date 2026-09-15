// UAT L2 core — the shared bootstrap, target resolver, predicate waits and
// evidence capture behind drive-script.mjs.
//
// PERSISTENT PROFILE. Every product record in this app is IndexedDB in the
// browser profile (lib/studioDb.ts) — there is no server database — so an L2
// that wants its projects to SURVIVE the run drives one persistent Chromium
// profile at `uat/.profile/` (gitignored) instead of a throwaway context. Nothing
// here ever clears it. Isolation between Characters is by project, not by
// context: each creates its own.
//
// Exit codes are the verdict (see drive-script.mjs): an `expect` that fails is a
// FINDING, never a reason to loosen the assertion.

import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const BASE = process.env.BASE_URL ?? "http://localhost:3183";
export const PROFILE = process.env.PROFILE_DIR ?? "uat/.profile";
export const SHOT_DIR = process.env.SHOT_DIR ?? "uat/runs/_scratch/shots";
export const CREATED = process.env.CREATED_FILE ?? join(dirname(SHOT_DIR), "created.json");
const HEADED = process.env.HEADED === "1";

export async function boot(runName) {
  mkdirSync(SHOT_DIR, { recursive: true });
  mkdirSync(PROFILE, { recursive: true });
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: !HEADED,
    viewport: { width: 1600, height: 1100 },
    // Reduced motion: the deck's deal-in springs and the bell's flashes are
    // animation; the evidence is the settled state.
    reducedMotion: "reduce",
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const journal = { run: runName, startedAt: new Date().toISOString(), steps: [], checks: [], pageErrors: [], console: [] };
  page.on("pageerror", (e) => journal.pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") journal.console.push(`${m.type()}: ${m.text()}`.slice(0, 400));
  });
  const log = (s) => {
    journal.steps.push({ at: Date.now(), s });
    process.stderr.write(`· ${s}\n`);
  };
  return { ctx, page, journal, log };
}

/* ── target resolver ──────────────────────────────────────────────────────── */

/** A target is: a string (exact testid first, then role=button by name, then
 *  text), or `{ testid }`, `{ css }`, `{ role, name }`, `{ text }`. */
export function resolveAll(page, t) {
  if (typeof t === "string") {
    return page.getByTestId(t).or(page.getByRole("button", { name: t })).or(page.getByText(t, { exact: true }));
  }
  if (t.testid) return page.getByTestId(t.testid);
  if (t.css) return page.locator(t.css);
  if (t.role) return page.getByRole(t.role, { name: t.name, exact: t.exact ?? false });
  if (t.text) return page.getByText(t.text, { exact: t.exact ?? false });
  if (t.label) return page.getByLabel(t.label);
  throw new Error(`unresolvable target ${JSON.stringify(t)}`);
}
/** One element — the first match. `count`/`has` use resolveAll instead. */
export function resolve(page, t) {
  return resolveAll(page, t).first();
}

/* ── the helper surface handed to a script ───────────────────────────────── */

export function helpers({ page, journal, log }) {
  const shotIndex = { n: 0 };
  const T = Number(process.env.STEP_TIMEOUT_MS ?? 20_000);

  const goto = async (path) => {
    log(`goto ${path}`);
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
  };
  const click = async (t, opts = {}) => {
    const loc = resolve(page, t);
    await loc.waitFor({ state: "visible", timeout: opts.ms ?? T });
    log(`click ${JSON.stringify(t)}`);
    await loc.click({ timeout: opts.ms ?? T });
    await page.waitForTimeout(opts.settle ?? 250);
  };
  const fill = async (t, value) => {
    const loc = resolve(page, t);
    await loc.waitFor({ state: "visible", timeout: T });
    log(`fill ${JSON.stringify(t)} ← ${JSON.stringify(value).slice(0, 80)}`);
    await loc.fill(String(value));
  };
  const waitFor = async (t, opts = {}) => {
    await resolve(page, t).waitFor({ state: opts.state ?? "visible", timeout: opts.ms ?? T });
  };
  const waitEnabled = async (t, opts = {}) => {
    const loc = resolve(page, t);
    await loc.waitFor({ state: "visible", timeout: opts.ms ?? T });
    await page.waitForFunction((el) => el && !el.disabled && el.getAttribute("aria-disabled") !== "true", await loc.elementHandle(), { timeout: opts.ms ?? T });
  };
  const waitForText = async (re, opts = {}) => {
    const scope = opts.within ? resolve(page, opts.within) : page.locator("body");
    await scope.getByText(re).first().waitFor({ state: "visible", timeout: opts.ms ?? T });
  };
  const waitUntil = async (fn, opts = {}) => {
    const t0 = Date.now();
    const ms = opts.ms ?? T;
    while (Date.now() - t0 < ms) {
      if (await fn()) return Date.now() - t0;
      await page.waitForTimeout(opts.every ?? 250);
    }
    throw new Error(`waitUntil timed out after ${ms}ms: ${opts.label ?? "(unlabelled)"}`);
  };
  const poll = waitUntil;
  const sleep = (ms) => page.waitForTimeout(ms);
  const count = async (t) => resolveAll(page, t).count();
  const has = async (t) => (await resolveAll(page, t).count()) > 0;
  const textOf = async (t) => (await resolve(page, t).innerText()).trim();
  const attr = async (t, name) => resolve(page, t).getAttribute(name);
  const disabled = async (t) => resolve(page, t).isDisabled();
  const bodyText = async () => page.locator("body").innerText();
  const url = () => page.url();

  const snap = async (name) => {
    const stem = `${String(++shotIndex.n).padStart(2, "0")}-${name}`;
    const png = join(SHOT_DIR, `${stem}.png`);
    await page.screenshot({ path: png, fullPage: true });
    const text = await page.locator("body").innerText();
    writeFileSync(join(SHOT_DIR, `${stem}.text.txt`), text);
    let aria = "";
    try {
      aria = await page.locator("body").ariaSnapshot();
      writeFileSync(join(SHOT_DIR, `${stem}.aria.yml`), aria);
    } catch { /* an ARIA snapshot is evidence, not a verdict — a page mid-navigation may refuse one */ }
    log(`snap ${stem}`);
    return { stem, png, text, aria };
  };

  /** Interactive elements only, with stable handles — cheaper than a full ARIA
   *  snapshot when deciding what to touch. */
  const probe = async () => {
    const items = await page.evaluate(() => {
      const out = [];
      const els = document.querySelectorAll("button, a[href], input, textarea, select, [role=button], [role=tab]");
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        out.push({
          tag: el.tagName.toLowerCase(),
          testid: el.getAttribute("data-testid") ?? undefined,
          text: (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 70),
          disabled: el.disabled || el.getAttribute("aria-disabled") === "true" || undefined,
          pressed: el.getAttribute("aria-pressed") ?? undefined,
          href: el.getAttribute("href") ?? undefined,
        });
      }
      return out;
    });
    return items;
  };

  const expect = (label, ok, extra = {}) => {
    journal.checks.push({ label, ok: !!ok, ...extra });
    process.stderr.write(`${ok ? "ok  " : "FAIL"} ${label}${extra.detail ? " — " + extra.detail : ""}\n`);
    return !!ok;
  };

  /** Record what this run WROTE into the shared profile (the persistence rule). */
  const record = (entry) => {
    let cur = [];
    try { if (existsSync(CREATED)) cur = JSON.parse(readFileSync(CREATED, "utf8")); } catch { /* a damaged ledger starts over; the profile is the record */ }
    cur.push({ ...entry, at: new Date().toISOString(), run: journal.run });
    mkdirSync(dirname(CREATED), { recursive: true });
    writeFileSync(CREATED, JSON.stringify(cur, null, 2));
    log(`recorded ${entry.id ?? "?"} → ${CREATED}`);
  };

  /** Read the product's own IndexedDB from inside the page — the truth the DOM
   *  is drawn from. `store` is "projects" | "steps" | "themes". */
  const idb = async (store, key) => {
    return page.evaluate(async ({ store, key }) => {
      const dbs = await indexedDB.databases();
      const name = dbs.map((d) => d.name).find((n) => n && /studio|gravitone/i.test(n)) ?? dbs[0]?.name;
      if (!name) return { error: "no database" };
      const db = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const stores = Array.from(db.objectStoreNames);
      const target = stores.find((s) => s === store) ?? stores.find((s) => s.includes(store));
      if (!target) return { error: `no store ${store}`, stores };
      const tx = db.transaction(target, "readonly");
      const os = tx.objectStore(target);
      const rows = await new Promise((res, rej) => { const r = key ? os.get(key) : os.getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      db.close();
      return rows;
    }, { store, key });
  };

  return { page, goto, click, fill, waitFor, waitEnabled, waitForText, waitUntil, poll, sleep, count, has, textOf, attr, disabled, bodyText, url, snap, probe, expect, record, idb, log, BASE };
}
