import { describe, expect, it } from "vitest";

import { IMPORT_HREF, v1StudioTarget, type ImportedPlan } from "../../app/(studio)/studio/[projectId]/redirect.ts";
import { kernelIdOf } from "../../lib/import/project.ts";

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
