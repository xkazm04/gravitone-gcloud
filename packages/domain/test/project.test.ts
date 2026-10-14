import { describe, expect, expectTypeOf, it } from "vitest";

import { type PartId, type ProjectId } from "../src/ids.ts";
import { partDoneState, partSchema } from "../src/part.ts";
import { projectSchema, projectStateOf, recipeSchema, type Project } from "../src/project.ts";
import { runSchema } from "../src/run.ts";
import { accept, glassHarborTrailer, PRICED, refuse } from "./_records.ts";

describe("project", () => {
  it("parses the prototype's Glass Harbor trailer, with branded ids", () => {
    const p = accept(projectSchema, glassHarborTrailer());
    expect(p.parts).toHaveLength(6);
    // The record type itself; the door's `Parsed<>` view of a brand is a known
    // Phase 0 defect (door.ts flattens branded strings as objects), reported.
    expectTypeOf<Project["id"]>().toEqualTypeOf<ProjectId>();
    expectTypeOf<Project["parts"][number]["after"]>().toEqualTypeOf<PartId[]>();
  });
  it("leaves absent optional keys absent", () => {
    const { styleId: _s, runtimeS: _r, ...bare } = glassHarborTrailer();
    const p = accept(projectSchema, bare);
    for (const k of ["styleId", "takeId", "topic", "runtimeS"]) expect(k in p, k).toBe(false);
    expect("gate" in p.parts[0]!).toBe(false);
  });
  it("names its recipe from @gt/catalog's templates", () => {
    accept(recipeSchema, "film/short-educational-video");
    accept(recipeSchema, "album-video");
    refuse(recipeSchema, "film/feature-length", "(root)");
    refuse(recipeSchema, "film/music-video", "(root)");
  });
  it("refuses a dependency on a part it does not have", () => {
    const p = glassHarborTrailer();
    p.parts[1]!.after = ["p-nowhere"];
    refuse(projectSchema, p, "p-nowhere");
  });
  it("refuses a plan with a cycle", () => {
    const p = glassHarborTrailer();
    p.parts[0]!.after = ["p-cut"];
    refuse(projectSchema, p, "cycle");
  });
  it("refuses duplicate part ids", () => {
    const p = glassHarborTrailer();
    p.parts[1]!.id = "p-research";
    p.parts[1]!.after = [];
    refuse(projectSchema, p, "unique");
  });
  it("refuses a stored state that disagrees with its parts", () => {
    refuse(projectSchema, { ...glassHarborTrailer(), state: "running" }, "awaiting_gate");
  });
  it("refuses a caller-shaped revision", () => {
    refuse(projectSchema, { ...glassHarborTrailer(), rev: 0 }, "rev");
  });
  it("derives its state with the prototype's precedence", () => {
    const of = (...s: ("draft" | "queued" | "running" | "paused" | "awaiting_gate" | "ratified" | "failed" | "blocked")[]) =>
      projectStateOf(s.map((state) => ({ state })));
    expect(of("ratified", "failed", "awaiting_gate")).toBe("blocked");
    expect(of("ratified", "awaiting_gate", "running")).toBe("awaiting_gate");
    expect(of("ratified", "running", "queued")).toBe("running");
    expect(of("ratified", "ratified")).toBe("ratified");
    expect(of("draft", "draft")).toBe("draft");
    // a paused part in a launched project is waiting, not an unlaunched plan
    expect(of("ratified", "paused")).toBe("queued");
  });
});

describe("part", () => {
  const part = glassHarborTrailer().parts[5]!;
  it("only a gated part waits at the Weir", () => {
    const { gate: _g, ...ungated } = part;
    refuse(partSchema, ungated, "Weir");
    expect(partDoneState({ gate: "verdict" })).toBe("awaiting_gate");
    expect(partDoneState({})).toBe("ratified");
  });
  it("refuses a part that waits for itself, or names a dependency twice", () => {
    refuse(partSchema, { ...part, after: ["p-cut"] }, "itself");
    refuse(partSchema, { ...part, after: ["p-motion", "p-motion"] }, "once");
  });
  it("refuses a media lane where a resource lane goes", () => {
    refuse(partSchema, { ...part, lane: "video" }, "lane");
  });
});

describe("run", () => {
  const run = {
    id: "suno-queue-20",
    lane: "audio",
    producer: "suno",
    prompt: "Suno queue · 4 prompts",
    estimate: { seconds: 960, usd: null, unpricedReason: "Suno credits are not priced per prompt" },
    queuePos: 2,
    state: "queued",
  };
  it("parses a queued Floor run", () => {
    expect(accept(runSchema, run).queuePos).toBe(2);
  });
  it("has a queue position exactly while queued", () => {
    refuse(runSchema, { ...run, state: "running" }, "queuePos");
    const { queuePos: _q, ...noPos } = run;
    refuse(runSchema, noPos, "queuePos");
  });
  it("names both its project and its part, or neither", () => {
    refuse(runSchema, { ...run, projectId: "seed-why-bitcoin" }, "partId");
    accept(runSchema, { ...run, projectId: "seed-why-bitcoin", partId: "p-frames" });
  });
  it("refuses a resource lane where a media lane goes", () => {
    refuse(runSchema, { ...run, lane: "box.chrome" }, "lane");
  });
  it("carries the estimate's law through", () => {
    refuse(runSchema, { ...run, estimate: { seconds: 1, usd: null } }, "unpricedReason");
    accept(runSchema, { ...run, estimate: PRICED });
  });
});
