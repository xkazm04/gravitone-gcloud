// A run's brief on the Board (lib/decision/v1/sources/scoutBrief.ts): the work's own words - a
// look's recipe and observables, a scene's recipe - never a sentence about the desk.
import { describe, expect, it } from "vitest";

import { firstClause, lookBrief, sceneBrief } from "../../lib/decision/v1/sources/scoutBrief.ts";

describe("a run's brief", () => {
  it("a look's aim is its recipe's first sentence; its checks the observables that decide and hold the look", () => {
    const b = lookBrief({
      recipe: "A hand-coloured etching and aquatint on laid paper, washes of muted watercolour over fine line. Grain shows through.",
      observables: { render_mode: "illustrated", medium: "etching-aquatint", detail_density: "high", surface_realism: "stylised", atmospherics: "none", particle_fx: "none", palette_strategy: "muted-washes", black_handling: "line-only", edge_treatment: "inked-line", finish: "paper-grain", focus: "deep" },
    });
    expect(b.aim).toBe("A hand-coloured etching and aquatint on laid paper, washes of muted watercolour over fine line.");
    expect(b.checks).toEqual(["medium: etching aquatint", "render mode: illustrated", "palette strategy: muted washes", "edge treatment: inked line", "finish: paper grain", "black handling: line only"]);
  });

  it("a long first sentence is cut on a word, with the cut marked", () => {
    const long = `A ${"very ".repeat(60)}long clause.`;
    const a = firstClause(long);
    expect(a.length).toBeLessThanOrEqual(181);
    expect(a.endsWith("…")).toBe(true);
    expect(a).not.toMatch(/\s…$/);
  });

  it("a scene's aim is its composition and light; its checks shot, camera, motion and palette roles", () => {
    const b = sceneBrief({ shot: "wide", camera: "eye level, 35mm", motion: "slow push-in", composition: "trio silhouetted against a factory window", lighting: "dusk backlight, no fill", palette: ["navy ground", "amber sky"], rhythm: "long hold", durationS: 5, prompt: "p" });
    expect(b).toEqual({
      aim: "trio silhouetted against a factory window; dusk backlight, no fill.",
      checks: ["shot: wide", "camera: eye level, 35mm", "motion: slow push-in", "palette: navy ground, amber sky"],
    });
  });

  it("a composition that ends its own sentence does not leave a stray full stop before the light", () => {
    const b = sceneBrief({ shot: "wide", camera: "c", motion: "m", composition: "figures over a dark floor.", lighting: "evening backlight.", palette: [], rhythm: "r", durationS: 5, prompt: "p" });
    expect(b.aim).toBe("figures over a dark floor; evening backlight.");
  });
});
