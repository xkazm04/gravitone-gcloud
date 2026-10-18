import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { IMPORT_HREF, v1StudioTarget, type ImportedPlan } from "../../app/(studio)/studio/[projectId]/redirect.ts";
import { kernelIdOf } from "../../lib/import/project.ts";
import { ARTICLE_LANE, articleRunAddress, articleRunTarget } from "../../app/(studio)/articles/redirect.ts";
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

  it("a run at its gate opens its Board packet - the address the skills print", () => {
    expect(articleRunTarget("2026-10-14-two-clock-records", "awaiting-approval")).toBe("/board/pkt%3Aarticle%3A2026-10-14-two-clock-records");
  });

  it("a run in any other state opens its history in the Ledger, never a Board refusal", () => {
    for (const status of ["drafting", "landed", "failed", "rejected", "approved"] as const) {
      expect(articleRunTarget("2026-10-14-two-clock-records", status)).toBe("/ledger?q=2026-10-14-two-clock-records");
    }
    expect(articleRunTarget("2026-10-14-two-clock-records", null)).toBe("/ledger?q=2026-10-14-two-clock-records");
  });

  it("an id that cannot be a run id names no run, and lands on the lane", () => {
    expect(articleRunTarget("Not A Run", "awaiting-approval")).toBe(ARTICLE_LANE);
    expect(articleRunTarget("", null)).toBe(ARTICLE_LANE);
    expect(articleRunTarget("../x", "awaiting-approval")).toBe(ARTICLE_LANE);
  });
});

// The reader: the status comes from the run's own run.json in the article store.
describe("a v1 Articles address, read from the store", () => {
  let dir = "";
  const prev = process.env["ARTICLES_STORE_DIR"];
  const run = (id: string, body: string): void => {
    mkdirSync(path.join(dir, id), { recursive: true });
    writeFileSync(path.join(dir, id, "run.json"), body);
  };
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "l74-articles-"));
    process.env["ARTICLES_STORE_DIR"] = dir;
    run("at-gate", JSON.stringify({ id: "at-gate", status: "awaiting-approval" }));
    run("still-drafting", JSON.stringify({ id: "still-drafting", status: "drafting" }));
    run("went-out", JSON.stringify({ id: "went-out", status: "landed" }));
    run("torn", "{ not json");
  });
  afterAll(() => {
    if (prev === undefined) delete process.env["ARTICLES_STORE_DIR"];
    else process.env["ARTICLES_STORE_DIR"] = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  it("routes by the status run.json holds", async () => {
    expect(await articleRunAddress("at-gate")).toBe("/board/pkt%3Aarticle%3Aat-gate");
    expect(await articleRunAddress("still-drafting")).toBe("/ledger?q=still-drafting");
    expect(await articleRunAddress("went-out")).toBe("/ledger?q=went-out");
  });

  it("a run the store has never seen, or cannot read, opens the Ledger", async () => {
    expect(await articleRunAddress("never-ran")).toBe("/ledger?q=never-ran");
    expect(await articleRunAddress("torn")).toBe("/ledger?q=torn");
  });

  it("a junk id lands on the lane without touching the store", async () => {
    expect(await articleRunAddress("../at-gate")).toBe(ARTICLE_LANE);
  });
});
