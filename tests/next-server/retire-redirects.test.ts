import { describe, expect, it } from "vitest";

import { IMPORT_HREF, v1StudioTarget, type ImportedPlan } from "../../app/(studio)/studio/[projectId]/redirect.ts";
import { kernelIdOf } from "../../lib/import/project.ts";
import { ARTICLE_LANE, articleRunTarget } from "../../app/(studio)/articles/redirect.ts";
import { FOUNDRY_TARGET } from "../../app/(studio)/foundry/redirect.ts";
import { playgroundTarget } from "../../app/(studio)/playground/redirect.ts";

// v1's studio addresses (`/studio/<v1 id>?step=<step>`, parked by studioNav.ts so a bookmark
// reopened its step) go to the Project the production became - `v1-<v1 id>` once imported.
const id = kernelIdOf("p-lx2k-abc");
const film: ImportedPlan = {
  id,
  parts: [
    { id: `${id}/research`, kind: "research" },
    { id: `${id}/script`, kind: "script" },
    { id: `${id}/gate:script`, kind: "gate" },
    { id: `${id}/frames`, kind: "frames" },
    { id: `${id}/cut`, kind: "cut" },
  ],
};

describe("a v1 studio address", () => {
  it("an imported project's step opens that part's editor", () => {
    expect(v1StudioTarget({ plan: film, step: "frames" })).toBe("/projects/v1-p-lx2k-abc/frames");
    expect(v1StudioTarget({ plan: film, step: "research" })).toBe("/projects/v1-p-lx2k-abc/research");
  });

  it("no step, an unknown step, a gate, or a step the recipe lacks opens the Plan", () => {
    expect(v1StudioTarget({ plan: film })).toBe("/projects/v1-p-lx2k-abc");
    expect(v1StudioTarget({ plan: film, step: "outputs" })).toBe("/projects/v1-p-lx2k-abc");
    expect(v1StudioTarget({ plan: film, step: "gate" })).toBe("/projects/v1-p-lx2k-abc");
    // `score` is an editor kind, but this recipe has no score part.
    expect(v1StudioTarget({ plan: film, step: "score" })).toBe("/projects/v1-p-lx2k-abc");
  });

  it("a project that is not imported yet goes to the one-click import, whatever its step", () => {
    expect(v1StudioTarget({ plan: null, step: "frames" })).toBe(IMPORT_HREF);
    expect(v1StudioTarget({ plan: null })).toBe("/projects/import");
  });

  it("the ids are encoded into the path, never spliced raw", () => {
    const odd = "v1-a b/c";
    expect(v1StudioTarget({ plan: { id: odd, parts: [{ id: `${odd}/cut`, kind: "cut" }] }, step: "cut" })).toBe("/projects/v1-a%20b%2Fc/cut");
  });
});

// Phase 6 wave C: v1's Foundry, Sound lab and Articles pages retired; each address is a redirect
// to where its work is done now (COMMON decision 5), so a bookmark, a skill's printed link or an
// old ledger row still lands.
describe("a v1 Foundry address", () => {
  it("opens the Floor", () => {
    expect(FOUNDRY_TARGET).toBe("/floor");
  });
});

describe("a v1 Sound lab address", () => {
  it("triage opens the Board's audio packet, whatever the kind", () => {
    expect(playgroundTarget({ m: "triage" })).toBe("/board/pkt%3Aaudio%3Aaudio%2Ftriage");
    expect(playgroundTarget({ m: "triage", kind: "sfx" })).toBe("/board/pkt%3Aaudio%3Aaudio%2Ftriage");
  });

  it("arrange and hunt open that section of the Audio desk, the kind carried", () => {
    expect(playgroundTarget({ m: "arrange" })).toBe("/audio?s=arrange");
    expect(playgroundTarget({ m: "arrange", kind: "sfx" })).toBe("/audio?s=arrange&kind=sfx");
    expect(playgroundTarget({ m: "hunt" })).toBe("/audio?s=hunt");
    expect(playgroundTarget({ m: "hunt", kind: "sfx" })).toBe("/audio?s=hunt&kind=sfx");
  });

  it("a hunt's deep link keeps its hunt; an id the store could not hold is dropped", () => {
    expect(playgroundTarget({ m: "hunt", h: "hunt-lx2k9" })).toBe("/audio?s=hunt&h=hunt-lx2k9");
    expect(playgroundTarget({ m: "hunt", kind: "sfx", h: "hn-efdbee99ac" })).toBe("/audio?s=hunt&kind=sfx&h=hn-efdbee99ac");
    expect(playgroundTarget({ m: "hunt", h: "../../etc" })).toBe("/audio?s=hunt");
  });

  it("no module, or one v1 never had, opens the desk; an unknown kind reads as music", () => {
    expect(playgroundTarget({})).toBe("/audio");
    expect(playgroundTarget({ kind: "sfx" })).toBe("/audio?kind=sfx");
    expect(playgroundTarget({ m: "studio", kind: "ambient" })).toBe("/audio");
    expect(playgroundTarget({ m: ["arrange", "hunt"] })).toBe("/audio?s=arrange");
  });
});

describe("a v1 Articles address", () => {
  it("the list and the topic form open the Floor's article lane", () => {
    expect(ARTICLE_LANE).toBe("/floor?lane=article");
  });

  it("a run's page opens its Board packet - the address the skills print", () => {
    expect(articleRunTarget("2026-10-14-two-clock-records")).toBe("/board/pkt%3Aarticle%3A2026-10-14-two-clock-records");
  });

  it("an id that cannot be a run id names no run, and lands on the lane", () => {
    expect(articleRunTarget("Not A Run")).toBe(ARTICLE_LANE);
    expect(articleRunTarget("")).toBe(ARTICLE_LANE);
    expect(articleRunTarget("../x")).toBe(ARTICLE_LANE);
  });
});
