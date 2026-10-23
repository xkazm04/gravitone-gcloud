#!/usr/bin/env node
//
// OPEN THE MEDIUM PROFILE — `npm run medium:browser`.
//
// Launches Chrome on the dedicated profile the Medium driver attaches to
// (lib/medium/browser.ts): --user-data-dir=~/.medium-chrome, CDP on 127.0.0.1:9335,
// straight onto medium.com/new-story. Detached, so the window outlives this script.
// If the port already answers, it does nothing and says so — a second Chrome
// on the same profile would only be refused by the first.
//
// Sign in once in that window (Google is fine); the profile keeps the session.
// The flags must stay equal to mediumChromeArgs() in lib/medium/browser.ts.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PORT = 9335; // lib/medium/types.ts MEDIUM_CDP_PORT
const PROFILE = join(homedir(), ".medium-chrome");
const URL = "https://medium.com/new-story";

async function answers() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function findChrome() {
  const override = process.env.MEDIUM_CHROME_PATH;
  if (override && existsSync(override)) return override;
  const rel = join("Google", "Chrome", "Application", "chrome.exe");
  for (const root of [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]) {
    if (root && existsSync(join(root, rel))) return join(root, rel);
  }
  for (const p of ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]) {
    if (existsSync(p)) return p;
  }
  return null;
}

if (await answers()) {
  console.log(`medium browser already running on 127.0.0.1:${PORT} (profile ${PROFILE}) - nothing to do`);
  process.exit(0);
}

const exe = findChrome();
if (!exe) {
  console.error("chrome.exe not found - set MEDIUM_CHROME_PATH to its full path");
  process.exit(1);
}

const child = spawn(
  exe,
  [`--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, "--no-first-run", "--no-default-browser-check", URL],
  { detached: true, stdio: "ignore" },
);
child.unref();

const until = Date.now() + 15_000;
while (Date.now() < until) {
  if (await answers()) {
    console.log(`medium browser up on 127.0.0.1:${PORT} (profile ${PROFILE}); sign in there once if it asks`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 500));
}
console.error(`chrome started but 127.0.0.1:${PORT} never answered - is another Chrome holding ${PROFILE}?`);
process.exit(1);
