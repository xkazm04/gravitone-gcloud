#!/usr/bin/env node
// THE DRIVER — an inline step script, the whole journey in ONE process.
//
//   BASE_URL=http://localhost:3183 SHOT_DIR=uat/runs/<id>/shots \
//     node uat/driver/drive-script.mjs <runName> <<'EOF'
//   await goto("/projects");
//   expect("bypass banner present", await has("dev-auth-banner"));
//   EOF
//
// Helpers in scope (uat/driver/lib.mjs): goto · click · fill · waitFor ·
// waitEnabled · waitForText · waitUntil/poll · sleep · count · has · textOf ·
// attr · disabled · bodyText · url · snap · probe · expect · record · idb · log ·
// page (raw Playwright).
//
// Exit codes: 0 = ran, every expect held · 1 = the driver threw (env problem) ·
// 2 = ran, an expect FAILED — a finding. stdout is one JSON journal; progress
// is on stderr. HEADED=1 opens a visible browser on the same persistent profile.
//
// The profile at uat/.profile is NEVER cleared by this driver.

import { readFileSync } from "node:fs";
import { boot, helpers } from "./lib.mjs";

const runName = process.argv[2] ?? "unnamed";
const script = readFileSync(0, "utf8");

const booted = await boot(runName);
const h = helpers(booted);
const { journal } = booted;

let code = 0;
try {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction(...Object.keys(h), script);
  await fn(...Object.values(h));
} catch (e) {
  journal.error = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
  process.stderr.write(`DRIVER THREW: ${journal.error.split("\n")[0]}\n`);
  try { await h.snap("driver-threw"); } catch { /* the page may be gone; the journal already carries the error */ }
  code = 1;
} finally {
  journal.endedAt = new Date().toISOString();
  if (code === 0 && journal.checks.some((c) => !c.ok)) code = 2;
  process.stdout.write(JSON.stringify(journal, null, 2) + "\n");
  await booted.ctx.close();
}
process.exit(code);
