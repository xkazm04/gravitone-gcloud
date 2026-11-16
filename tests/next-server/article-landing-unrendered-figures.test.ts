// A FIGURE LOST AT LANDING IS ON THE RECORD (lib/articles/landing.ts landingRecord). land()
// goes on when a figure fails to render to PNG for the Medium package - the registry copy
// carries no PNGs - but the loss used to reach only console.error, so run.json said nothing.
// Every landing write (progress, landed, failed gate) now goes through landingRecord, which
// names the unrendered figures on the run's landing record.
import { describe, expect, it } from "vitest";

import { landingRecord } from "../../lib/articles/landing.ts";
import type { ArticleLanding } from "../../lib/articles/types.ts";

const base: ArticleLanding = { slug: "post", branch: "article/post", gates: [{ lane: "technical-writing", mode: "check", ok: true }] };

describe("landingRecord", () => {
  it("unrendered_figures_are_recorded_not_only_logged", () => {
    const rec = landingRecord(base, ["02-flow.svg", "table-01.png"]);
    expect(rec.unrenderedFigures).toEqual(["02-flow.svg", "table-01.png"]);
    expect(rec).toMatchObject({ ...base, medium: "medium" });
  });

  it("every_figure_rendered_leaves_the_field_absent_not_empty", () => {
    const rec = landingRecord(base, []);
    expect("unrenderedFigures" in rec).toBe(false);
    expect(rec).toEqual({ ...base, medium: "medium" });
  });

  it("records_a_copy_not_the_caller_array", () => {
    const failed = ["01-a.svg"];
    const rec = landingRecord(base, failed);
    failed.push("02-b.svg");
    expect(rec.unrenderedFigures).toEqual(["01-a.svg"]);
  });
});
