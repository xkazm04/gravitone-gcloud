// LANE — A DRIVEN JOB'S ELAPSED COUNT MUST TICK, AND ONLY WHILE IT RUNS.
// A driven job's record is untouched between start and settle, so a pure
// `elapsed(job)` printed at render froze at "0s" for a minutes-long export. The
// clock now lives in `useElapsed` (usePolling, enabled only while running); the
// number stays outside every live region so a 1 Hz tick is not voiced.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

// STATIC, and it has to be. This read used to be `await import("../../lib/jobs")`
// so the test could assert the export exists at runtime, and it threw
// `Cannot find module '@/lib/imagingClient'` from lib/turns/client.ts — a CJS
// require stack. A runtime import() inside a test is resolved by Node, which
// knows nothing about the `@/` alias, so the first aliased import ANYWHERE in the
// loaded graph fails; a static import is transformed by Playwright with
// tsconfig's `paths` applied. Driven both ways: `../../lib/jobs` and `@/lib/jobs`
// both fail dynamically, the static form passes. The assertion below is also
// stronger this way — a missing export now fails `tsc` as well.
import { formatElapsed } from "@/lib/jobs";

import { stripComments } from "./_helpers";

const read = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"));

test("formatElapsed uses the repo's m:ss convention from a minute up", () => {
  expect(typeof formatElapsed, "lib/jobs exports formatElapsed").toBe("function");
  expect([formatElapsed(0), formatElapsed(59_400), formatElapsed(60_000), formatElapsed(347_000), formatElapsed(-5)]).toEqual([
    "0s",
    "59s",
    "1:00",
    "5:47",
    "0s",
  ]);
});

test("useElapsed ticks via usePolling, enabled only while the job is running", () => {
  const s = read("lib/jobs.tsx");
  expect(s.length).toBeGreaterThan(0);
  // \r? because a Windows checkout with core.autocrlf=true hands the file over CRLF.
  const m = /export function useElapsed[^]*?\r?\n}\r?\n/.exec(s);
  expect(m, "useElapsed exists").not.toBeNull();
  expect(m![0]).toMatch(/usePolling\([^]*?,\s*1000,\s*j\.status === "running"\)/);
  expect(m![0]).not.toMatch(/setInterval/);
});

test("no consumer prints the clockless elapsed(), and none puts the count in a live region", () => {
  const files = [
    "components/ui/NotificationBell.tsx",
    "app/_phases/cut/music-video/MusicVideoExport.tsx",
    "app/_phases/frames/music-video/MusicVideoFrames.tsx",
  ];
  for (const f of files) {
    const s = read(f);
    expect(s.length).toBeGreaterThan(0);
    expect(s, `${f} clockless elapsed(`).not.toMatch(/(?<![\w.])elapsed\(/);
    expect(s, `${f} uses the ticking hook`).toMatch(/useElapsed|JobElapsed/);
  }
  for (const f of files.slice(1)) {
    const s = read(f);
    // the live element closes before the clock span opens
    expect(s).toMatch(/<span role="status">[^<]*<\/span>[^]*?<span aria-hidden="true">\{clock\} elapsed/);
    expect(s).not.toMatch(/<p[^>]*role="status"/);
  }
});
