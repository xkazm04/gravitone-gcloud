// LANE - the recorded end reason (useAuth.lastTransition) reaches a rendered surface.
// Card: 'Session ended' is tracked but never shown. A deliberate sign-out stays silent.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && !e.name.startsWith(".")) walk(p, out); }
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

// SEED=1 points the probe at HEAD's pre-fix copy to prove it goes red.
const landing = process.env.SESSION_ENDED_SEED ?? "app/_landing/parts.tsx";

test("lastTransition is read by a rendered surface and shows session-ended only", () => {
  const root = process.cwd();
  const files = ["app", "components"].flatMap((d) => walk(join(root, d)));
  expect(files.length).toBeGreaterThan(0);
  const readers = files.filter((f) => /lastTransition/.test(stripComments(readFileSync(f, "utf8"))));
  expect(readers.length).toBeGreaterThan(0);

  const s = stripComments(readFileSync(join(root, landing), "utf8"));
  expect(s.length).toBeGreaterThan(0);
  expect(s).toMatch(/lastTransition/);
  expect(s).toMatch(/"session-ended"/);
  expect(s).toMatch(/StaleBadge/);
  expect(s).not.toMatch(/"signed-out"\s*:/);
  const words = [...s.matchAll(/"(session ended|account changed)"/g)].map((m) => m[1]);
  expect(words.length).toBeGreaterThan(0);
  for (const w of words) expect(w.split(/\s+/).length).toBeLessThanOrEqual(6);
});
