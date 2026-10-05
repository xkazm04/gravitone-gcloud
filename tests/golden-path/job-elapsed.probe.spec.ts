// LANE — A DRIVEN JOB'S ELAPSED COUNT MUST TICK, AND ONLY WHILE IT RUNS.
// A driven job's record is untouched between start and settle, so a pure
// `elapsed(job)` printed at render froze at "0s" for a minutes-long export. The
// clock now lives in `useElapsed` (usePolling, enabled only while running); the
// number stays outside every live region so a 1 Hz tick is not voiced.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const read = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"));

test("formatElapsed uses the repo's m:ss convention from a minute up", async () => {
  const mod = (await import("../../lib/jobs")) as Record<string, unknown>;
  const f = mod.formatElapsed as ((ms: number) => string) | undefined;
  expect(typeof f, "lib/jobs exports formatElapsed").toBe("function");
  expect([f!(0), f!(59_400), f!(60_000), f!(347_000), f!(-5)]).toEqual(["0s", "59s", "1:00", "5:47", "0s"]);
});

test("useElapsed ticks via usePolling, enabled only while the job is running", () => {
  const s = read("lib/jobs.tsx");
  expect(s.length).toBeGreaterThan(0);
  const m = /export function useElapsed[^]*?\n}\n/.exec(s);
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
