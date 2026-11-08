import { describe, expect, it } from "vitest";

import { AppError } from "@gt/domain/errors";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { StepContext, StepOutcome } from "@gt/kernel/job-core";

import { defineScoutStoryboard, STORYBOARD_OUTAGE_LIMIT, type StoryboardPorts, type StoryboardRequest } from "../src/scout-storyboard/define.ts";

// An engine that could not be reached is retried by the kernel, not booked as an empty panel (spark outage-pauses-boards):
// the producer names its own breaker limit - long enough to wait out a ComfyUI restart, short enough to end inside a
// night - and a panel step's vendor-failure passes through the producer untouched, nothing booked, `ended` never told.
// The bound probe is tests/next-server/scout-storyboard-outage.test.ts.

const req: StoryboardRequest = { nightId: "n", candidateId: "c-01", aspect: "16:9", panels: [{ prompt: "a", seed: 1 }], estimates: { panel: { seconds: 96, usd: 0 } }, by: "op" };
const job = { id: "job:x", lane: "gpu.local" } as Job;

describe("the storyboard producer under an outage", () => {
  it("names its own breaker limit, past the kernel's default of three and under an hour of backoff", () => {
    const p = defineScoutStoryboard("gpu.local" as ResourceLane, {} as StoryboardPorts);
    expect(p.breakerLimit).toBe(STORYBOARD_OUTAGE_LIMIT);
    expect(STORYBOARD_OUTAGE_LIMIT).toBeGreaterThan(30);
    // Backoff doubles from 1 s and caps at 30 s (job-run.ts defaultBackoff): at its slowest the limit waits under 40 min.
    const slowest = Array.from({ length: STORYBOARD_OUTAGE_LIMIT - 1 }, (_, i) => Math.min(30_000, 1000 * 2 ** i)).reduce((a, b) => a + b, 0);
    expect(slowest).toBeLessThan(40 * 60_000);
  });

  it("passes a panel's vendor-failure through as it is: a retryable outcome, not a booked panel", async () => {
    const away: StepOutcome = { kind: "vendor-failure", message: "ComfyUI is not reachable" };
    const told: string[] = [];
    const ports: StoryboardPorts = {
      request: () => ({ ok: true, value: req }),
      panel: async () => away,
      clip: async () => {
        throw new AppError("internal", "no clip");
      },
      ended: async (_r, _j, e) => void told.push(e),
    };
    const p = defineScoutStoryboard("gpu.local" as ResourceLane, ports);
    await p.health?.(job);
    expect(await p.perform({ name: "panel:1", estimate: req.estimates.panel }, { job } as StepContext)).toBe(away);
    expect(told).toEqual([]);
  });
});
