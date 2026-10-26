// THE DAY-LINE'S KEY (app/(studio)/projects/runs/_runs/legend.ts): every job state's look has a
// swatch, and that swatch's label names the state - an interrupted job (whose vendor may have been
// paid) is amber, and the amber swatch must say so rather than only "at weir".

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { jobMachine } from "@gt/domain/job.machine";
import { STATUS } from "@gt/ui/components/status/status.ts";

import { legendOf } from "../../app/(studio)/projects/runs/_runs/legend.ts";

describe("the day-line key", () => {
  it("names every job state under the swatch of the look that paints it", () => {
    const key = legendOf();
    const unnamed = jobMachine.states.filter((state) => {
      const entry = key.find((k) => k.look === STATUS.job[state].look);
      return entry === undefined || !entry.label.split(" · ").includes(STATUS.job[state].label);
    });
    expect(unnamed).toEqual([]);
  });

  it("keeps the weir's own word on the amber swatch, and one swatch per look", () => {
    const key = legendOf();
    expect(key.find((k) => k.look === "awaiting")?.label).toMatch(/^at weir · /);
    expect(new Set(key.map((k) => k.look)).size).toBe(key.length);
  });

  it("is what Runs draws: no literal key is left in the page", () => {
    const src = readFileSync(new URL("../../app/(studio)/projects/runs/_runs/Runs.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/LEGEND = legendOf\(\)/);
    expect(src).not.toMatch(/label: "at weir"/);
  });
});
