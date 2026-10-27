// THE PROJECTS PAGE'S ONE RENDER (app/(studio)/projects/page.tsx), its error doors: the produce side
// is stubbed so a refusal the fixture cannot make can be handed to it, and the two client islands
// are stubs (the element the page returns carries what it decided).
//
//   1. A list read that fails is the page's error, as a plan read that fails already was. The page
//      drew a refused list as an empty one, so a store that would not open read as "no
//      compositions", the v1 import offered over projects that were never read.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { err, ok } from "@gt/domain/errors";

vi.mock("server-only", () => ({}));

const side = vi.hoisted(() => ({ list: (): unknown => undefined, open: (): unknown => undefined, jobsRead: 0 }));

vi.mock("../../app/(studio)/projects/_port/wire.ts", () => ({ PRODUCE_PORT: {} }));
vi.mock("../../app/(studio)/projects/_port/port.ts", () => ({
  produceNow: () => Date.parse("2026-10-16T09:00:00Z"),
  serverProduce: () => ({
    listProjects: () => side.list(),
    composeChoices: () => ok({ recipes: [], styles: [], takes: [], topics: [] }),
    floorRunsOpen: () => side.open(),
    listJobs: () => (side.jobsRead++, ok([])),
    loadPlan: () => err("not-found", "no plan in this stub"),
  }),
}));
vi.mock("../../app/(studio)/projects/_plan/NoPlan.tsx", () => ({
  NoPlan: () => null,
}));
vi.mock("../../app/(studio)/projects/_plan/Plan.tsx", () => ({
  Plan: () => null,
}));

const { default: ProjectsPage } = await import("../../app/(studio)/projects/page.tsx");
const render = () => ProjectsPage({ searchParams: Promise.resolve({}) });

beforeEach(() => {
  side.list = () => ok({ projects: [], truncated: false });
  side.open = () => ok(0);
  side.jobsRead = 0;
});

describe("1. a list read that fails is the page's error", () => {
  it("throws the refusal instead of drawing an empty list", async () => {
    side.list = () => err("unavailable", "the kernel store could not open: SQLITE_CANTOPEN");
    await expect(render()).rejects.toMatchObject({ code: "unavailable", message: "the kernel store could not open: SQLITE_CANTOPEN" });
  });

  it("draws the empty list when the read answers no project", async () => {
    const el = await render();
    expect(el.props).toMatchObject({ list: { projects: [], truncated: false }, floorRuns: 0, composing: false });
  });
});

describe("2. the Floor run count is its own read, not a full jobs view", () => {
  it("draws the count the port answers and reads no job list for it", async () => {
    side.open = () => ok(3);
    const el = await render();
    expect(el.props).toMatchObject({ floorRuns: 3 });
    expect(side.jobsRead).toBe(0);
  });
});
