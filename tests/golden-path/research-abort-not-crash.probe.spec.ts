// LANE: the creator's own Abort is not a process crash.
//
// Abort is the only way a creator reaches `failed`, so every failed render they
// can see is their own click. It used to be drawn with the three crash signals
// (error Notice role=alert, rose "process ended here", "ended early").
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

function code(rel: string): string {
  const src = stripComments(readFileSync(join(process.cwd(), rel), "utf8"));
  expect(src.length, `${rel} read as empty`).toBeGreaterThan(200);
  return src;
}

test("stop() marks the failed state as stopped by the user", () => {
  const src = code("app/_phases/research/run/useResearchRun.ts");
  const stop = src.slice(src.indexOf("const stop = useCallback"));
  expect(stop.slice(0, stop.indexOf("const reset"))).toContain("stoppedByUser: true");
  expect(code("app/_phases/research/run/types.ts")).toContain("stoppedByUser");
});

test("RunStage branches on stoppedByUser with a non-error Notice", () => {
  const src = code("app/_phases/research/guided/RunStage.tsx");
  const at = src.indexOf("stoppedByUser");
  expect(at, "RunStage never reads stoppedByUser").toBeGreaterThan(-1);
  const near = src.slice(Math.max(0, at - 100), at + 600);
  expect(near).toContain("<Notice");
  // The stop branch picks "warning"; "error" survives only as the other arm.
  expect(near).toMatch(/stoppedByUser\s*\?\s*"warning"\s*:\s*"error"/);
});

test("RunTrace says 'stopped here' and keeps 'process ended here' for crashes", () => {
  const src = code("app/_phases/research/run/RunTrace.tsx");
  expect(src).toContain("stopped here");
  expect(src).toMatch(/!\s*stoppedByUser|stoppedByUser\s*\?/);
  expect(src).toContain("process ended here");
});

test("the status word reads stopped for a user stop", () => {
  expect(code("app/_phases/research/run/controls.tsx")).toMatch(/stoppedByUser\s*\?\s*"stopped"/);
});
