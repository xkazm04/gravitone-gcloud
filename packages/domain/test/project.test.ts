import { describe, expect, expectTypeOf, it } from "vitest";

import { type PartId, type ProjectId } from "../src/ids.ts";
import { partSchema } from "../src/part.ts";
import { projectPlanSchema, projectSchema, projectStateOf, recipeSchema, type ProjectPlan } from "../src/project.ts";
import { PRODUCERS, runSchema } from "../src/run.ts";
import { accept, glassHarborTrailer, PRICED, refuse } from "./_records.ts";

describe("project", () => {
  it("parses the prototype's Glass Harbor trailer as a head and its plan rows, with branded ids", () => {
    const p = accept(projectPlanSchema, glassHarborTrailer());
    expect(p.parts).toHaveLength(10);
    expectTypeOf<ProjectPlan["project"]["id"]>().toEqualTypeOf<ProjectId>();
    expectTypeOf<ProjectPlan["parts"][number]["after"]>().toEqualTypeOf<PartId[]>();
  });
  it("stores no state: a head that carries one is a head with an unknown key, and is stripped", () => {
    const head = accept(projectSchema, { ...glassHarborTrailer().project, state: "running" });
    expect("state" in head).toBe(false);
  });
  it("leaves absent optional keys absent", () => {
    const { styleId: _s, runtimeS: _r, launchedAt: _l, ...bare } = glassHarborTrailer().project;
    const p = accept(projectSchema, bare);
    for (const k of ["styleId", "takeId", "topic", "runtimeS", "launchedAt", "discardedAt"]) expect(k in p, k).toBe(false);
  });
  it("names its recipe from @gt/catalog's recipe table", () => {
    accept(recipeSchema, "film/short-educational-video");
    accept(recipeSchema, "album-video");
    accept(recipeSchema, "style/forge-sweep");
    refuse(recipeSchema, "film/feature-length", "recipe");
    refuse(recipeSchema, "film/music-video", "recipe");
  });
  it("refuses a dependency on a part it does not have", () => {
    const p = glassHarborTrailer();
    p.parts[1]!.after = ["p-nowhere"];
    refuse(projectPlanSchema, p, "p-nowhere");
  });
  it("refuses a plan with a cycle", () => {
    const p = glassHarborTrailer();
    p.parts[0]!.after = ["cut"];
    refuse(projectPlanSchema, p, "cycle");
  });
  it("refuses duplicate part ids", () => {
    const p = glassHarborTrailer();
    p.parts[1]!.id = "research";
    p.parts[1]!.after = [];
    refuse(projectPlanSchema, p, "unique");
  });
  it("refuses a caller-shaped revision", () => {
    refuse(projectSchema, { ...glassHarborTrailer().project, rev: 0 }, "rev");
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
  const gate = { id: "gate:cut", kind: "gate", judges: "cut", verdict: "packet-review", after: ["cut"] };
  it("a gate waits for the part it judges", () => {
    accept(partSchema, gate);
    refuse(partSchema, { ...gate, after: [] }, "judges");
  });
  it("refuses a part that waits for itself, or names a dependency twice", () => {
    const work = { id: "cut", kind: "cut", option: "cut/ffmpeg/ffmpeg-compositor", units: 1, after: ["motion"] };
    refuse(partSchema, { ...work, after: ["cut"] }, "itself");
    refuse(partSchema, { ...work, after: ["motion", "motion"] }, "once");
  });
  it("refuses a work part with no option, and an operator kind with one", () => {
    refuse(partSchema, { id: "cut", kind: "cut", units: 1, after: [] }, "option");
    expect("option" in accept(partSchema, { id: "slot", kind: "slot", option: "x", after: [] })).toBe(false);
  });
});

describe("run", () => {
  const run = {
    id: "suno-queue-20",
    lane: "audio",
    producer: "suno",
    recipe: "track/music",
    input: { lane: "audio", text: "a slow bed under the rain", kind: "music" },
    units: 2,
    option: "track/suno/v6",
    estimate: { seconds: 960, usd: null, unpricedReason: "Suno credits are not priced per prompt" },
    createdAt: "2026-10-14T07:02:00Z",
  };
  it("parses a Floor run, and stores no state or queue position (both are read)", () => {
    const r = accept(runSchema, { ...run, state: "queued", queuePos: 2 });
    expect("state" in r || "queuePos" in r).toBe(false);
  });
  it("refuses a resource lane where a media lane goes", () => {
    refuse(runSchema, { ...run, lane: "box.chrome" }, "lane");
  });
  it("refuses a composer input that does not match its lane's shape", () => {
    refuse(runSchema, { ...run, input: { lane: "audio", text: "x", kind: "speech" } }, "input");
  });
  it("holds the record to what launched it: a composer's lane, a producer's own name", () => {
    refuse(runSchema, { ...run, lane: "video" }, "lane");
    const own = { ...run, producer: "suno", input: { producer: "suno", proposal: "p-rain" } };
    accept(runSchema, own);
    refuse(runSchema, { ...own, producer: "mv" }, "runs under suno");
  });
  it("carries the estimate's law through", () => {
    refuse(runSchema, { ...run, estimate: { seconds: 1, usd: null } }, "unpricedReason");
    accept(runSchema, { ...run, estimate: PRICED });
  });
  it("names producers by ProducerName, which every part kind's default producer is one of", () => {
    expect(PRODUCERS).toContain("suno");
    expect(PRODUCERS).not.toContain("publish");
  });
});
