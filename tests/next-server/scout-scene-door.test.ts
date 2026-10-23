// THE SCENE ENGINE'S DOORS (spark media-training-loop WP2) - lib/foundry/scout/scene.ts with no
// kernel and no vendor: the recipe door (shape, palette jobs, no names), the timing read off the
// source's cut timestamps, the replica request (no reference image), and the clip-source guard
// that keeps every source file away from a video vendor.

import { describe, expect, it } from "vitest";

import {
  clipRequestOf,
  clipSourceOf,
  denylistOf,
  draftOf,
  frameInstruction,
  namesIn,
  pickFrames,
  recipeOf,
  replicaRequest,
  rhythmOf,
  sceneTiming,
  standDraft,
  stripComments,
} from "../../lib/foundry/scout/scene.ts";
import type { Night, SceneCandidate, SceneRecipe, ScoutSource } from "../../lib/foundry/scout/types.ts";

const SOURCE: ScoutSource = {
  id: "s-01",
  url: "https://example.test/watch?v=1",
  kind: "video",
  title: "Harbour Chase - Official Trailer",
  channel: "Moonfall Pictures",
  why: "a held wide shot against fast cutting",
  found: "search",
  rights: "reference-only",
  status: "ingested",
  files: ["sources/s-01/k-001.jpg", "sources/s-01/k-002.jpg", "sources/s-01/k-003.jpg", "sources/s-01/k-004.jpg"],
  durationS: 10,
  at: { "sources/s-01/k-001.jpg": 1, "sources/s-01/k-002.jpg": 2.5, "sources/s-01/k-003.jpg": 4, "sources/s-01/k-004.jpg": 7 },
};

const RECIPE: SceneRecipe = {
  shot: "wide",
  camera: "low angle",
  motion: "slow push-in",
  composition: "figure left third",
  lighting: "hard key from frame right",
  palette: ["teal ground", "amber accent"],
  rhythm: "held long",
  durationS: 3,
  prompt: "A photoreal film still of a lone figure on a wet quay at night.",
};

const scene = (over: Partial<SceneCandidate> = {}): SceneCandidate => ({
  id: "c-01",
  kind: "scene",
  sourceIds: ["s-01"],
  status: "pending",
  keyframes: ["sources/s-01/k-001.jpg", "sources/s-01/k-002.jpg"],
  replicas: ["scenes/c-01/replica-1.png", "scenes/c-01/replica-2.png"],
  recipe: RECIPE,
  ...over,
});

const night = (c: SceneCandidate = scene()): Night => ({
  id: "2026-10-22",
  startedAt: "2026-10-22T20:00:00.000Z",
  ceilingUsd: 15,
  target: 20,
  clipCap: 2,
  dry: true,
  state: "open",
  sources: [SOURCE],
  candidates: [c],
  jobs: [],
});

/** A well-formed answer in craft words only. */
const GOOD = {
  shot: "wide",
  camera: "low and level, the figure on the left third, a wide lens with the near edge stretched",
  motion: "camera pushes in slowly; rain drifts right to left; the figure holds",
  composition: "one figure against a long receding line of lamps, open water on the right",
  lighting: "a hard sodium key from frame right; everything left of the figure falls to black",
  palette: [
    { colour: "teal", job: "ground" },
    { colour: "sodium amber", job: "light" },
    { colour: "near-black", job: "shadow" },
  ],
  rhythm: "held long against quick cutting around it",
  duration_s: 4,
  prompt: "A photoreal film still: a wide low shot of a lone figure in a long coat on a wet quay at night, a hard amber key from the right, teal air, the left of frame falling to black, rain drifting across the lamps.",
};

describe("the recipe door", () => {
  const deny = denylistOf([SOURCE]);
  const timing = sceneTiming(night(), scene());

  it("takes a well-formed craft answer and writes the palette as colour + job", () => {
    const r = recipeOf(GOOD, { deny, timing });
    expect(r.ok && r.value.palette).toEqual(["teal ground", "sodium amber light", "near-black shadow"]);
    expect(r.ok && r.value.shot).toBe("wide");
  });

  it("refuses an answer missing a field, naming the field", () => {
    const { lighting: _gone, ...missing } = GOOD;
    const r = recipeOf(missing, { deny, timing });
    expect(r.ok ? null : r.error.message).toMatch(/^scene recipe: lighting: /);
  });

  it("refuses a palette colour without a job, and a palette written as bare colours", () => {
    const noJob = recipeOf({ ...GOOD, palette: [{ colour: "teal" }, { colour: "amber", job: "accent" }] }, { deny, timing });
    expect(noJob.ok ? null : noJob.error.message).toMatch(/^scene recipe: palette\.0\.job: /);
    const bare = recipeOf({ ...GOOD, palette: ["teal", "amber"] }, { deny, timing });
    expect(bare.ok ? null : bare.error.code).toBe("invalid");
    const wrongJob = recipeOf({ ...GOOD, palette: [{ colour: "teal", job: "mood" }, { colour: "amber", job: "accent" }] }, { deny, timing });
    expect(wrongJob.ok).toBe(false);
  });

  it("refuses a shot size outside the six", () => {
    expect(recipeOf({ ...GOOD, shot: "cowboy" }, { deny, timing }).ok).toBe(false);
  });

  it("refuses a word of the source's own title or channel, in any case", () => {
    const r = recipeOf({ ...GOOD, prompt: GOOD.prompt.replace("wet quay", "wet harbour quay") }, { deny, timing });
    expect(r.ok ? null : r.error.code).toBe("refused");
    expect(r.ok ? null : r.error.message).toContain('"harbour" (the source\'s title or channel)');
    expect(recipeOf({ ...GOOD, composition: "a moonfall-style horizon" }, { deny, timing }).ok).toBe(false);
  });

  it("refuses a capital mid-sentence and keeps the craft term and acronyms it allows", () => {
    const r = recipeOf({ ...GOOD, motion: "the figure in a Jedi robe holds; camera pushes in" }, { deny, timing });
    expect(r.ok ? null : r.error.message).toContain('"Jedi" (a capital mid-sentence)');
    expect(recipeOf({ ...GOOD, camera: "a Dutch angle, low and wide; soft HDR rolloff" }, { deny, timing }).ok).toBe(true);
  });

  it("takes the shot's length and the cut's pace from the source's timestamps over the model's guess", () => {
    const r = recipeOf(GOOD, { deny, timing });
    expect(r.ok && r.value.durationS).toBe(3);
    expect(r.ok && r.value.rhythm).toBe("5 shots over 10 s, median 1.5 s, 30 cuts a minute; this shot holds 3 s");
    const still = recipeOf(GOOD, { deny, timing: { cuts: [], at: {} } });
    expect(still.ok && [still.value.durationS, still.value.rhythm]).toEqual([4, GOOD.rhythm]);
  });

  it("keeps the title's common words usable and builds the denylist from the rest", () => {
    expect(deny.sort()).toEqual(["chase", "harbour", "moonfall", "pictures"]);
    expect(namesIn(["rain on the quay. Harbour lights."], deny)).toEqual(['"Harbour" (the source\'s title or channel)']);
  });

  it("passes its own dry stand-in", () => {
    expect(draftOf(standDraft(timing), deny).ok).toBe(true);
  });
});

describe("timing and frames", () => {
  it("ports survey.py's rhythm: sub-0.15 s shots dropped, edges implied", () => {
    expect(rhythmOf([2, 2.1, 4], 6)).toBe("3 shots over 6 s, median 2 s, 30 cuts a minute");
    expect(rhythmOf([], 6)).toBeUndefined();
  });

  it("picks at most five keyframes, evenly, keeping the first and the last", () => {
    const files = Array.from({ length: 9 }, (_, i) => `k-${i}`);
    expect(pickFrames(files)).toEqual(["k-0", "k-2", "k-4", "k-6", "k-8"]);
    expect(pickFrames(["a", "b"])).toEqual(["a", "b"]);
  });

  it("hands each call the earlier readings and says which keyframe ends the shot", () => {
    const t = sceneTiming(night(), scene());
    const first = frameInstruction("PROMPT", { k: 1, of: 2, file: "sources/s-01/k-001.jpg", prior: [], timing: t });
    expect(first).toContain("Keyframe 1 of 2, at 1 s in the source.");
    expect(first).toContain("This is the first keyframe of the shot.");
    const last = frameInstruction("PROMPT", { k: 2, of: 2, file: "sources/s-01/k-002.jpg", prior: [standDraft(t)], timing: t });
    expect(last).toContain("The earlier keyframes of this shot read as:\n1. {");
    expect(last).toContain("your answer is the recipe for the whole shot");
    expect(stripComments("a <!-- hidden\nnote --> b")).toBe("a  b");
  });
});

describe("replicas and the clip-source guard", () => {
  it("draws a replica from the recipe's words alone, with no reference image", () => {
    const req = replicaRequest(RECIPE, 2);
    expect(req).toMatchObject({ prompt: RECIPE.prompt, aspect: "16:9", count: 1, seed: 2 });
    expect("references" in req).toBe(false);
  });

  it("refuses a source keyframe as a clip's image, whatever the candidate claims", () => {
    const n = night();
    const c = scene();
    expect(clipSourceOf(n, c, "sources/s-01/k-001.jpg")).toMatchObject({ ok: false, error: { code: "refused" } });
    // Even a keyframe smuggled into `replicas` never passes: the night's sources are the check.
    const smuggled = scene({ replicas: ["sources/s-01/k-001.jpg", "scenes/c-01/replica-1.png"] });
    const r = clipRequestOf(night(smuggled), smuggled);
    expect(r.ok ? null : r.error.message).toBe("c-01: sources/s-01/k-001.jpg is a source file (reference-only); it never reaches a video vendor");
    // A path outside this candidate's own scenes directory, or not among its replicas, is refused too.
    expect(clipSourceOf(n, c, "scenes/c-02/replica-1.png").ok).toBe(false);
    expect(clipSourceOf(n, scene({ replicas: ["scenes/c-01/../../sources/s-01/k-001.jpg"] }), "scenes/c-01/../../sources/s-01/k-001.jpg").ok).toBe(false);
  });

  it("animates the first replica, the recipe's motion with its style restated", () => {
    const r = clipRequestOf(night(), scene());
    expect(r.ok && r.value.from).toBe("scenes/c-01/replica-1.png");
    expect(r.ok && r.value.motion).toBe("slow push-in. Camera: low angle. Light: hard key from frame right.");
    expect(clipRequestOf(night(), scene({ replicas: [] })).ok).toBe(false);
  });
});

describe("the denylist keeps craft words (2026-10-22 dry campaign)", () => {
  it("a channel called Every Frame a Painting, or the Met's open access, bans no craft word - and still bans a name", () => {
    const deny = denylistOf([
      { title: "The Spielberg Oner", channel: "Every Frame a Painting" },
      { title: "Snowy Gorge (Met 56683, public domain)", channel: "The Met open access" },
    ]);
    for (const w of ["frame", "painting", "oner", "open", "access", "public", "domain", "gorge"]) expect(deny, w).not.toContain(w);
    expect(deny).toContain("spielberg");
    expect(namesIn(["hard warm key from frame left, an open doorway, painted flats"], deny)).toEqual([]);
    expect(namesIn(["a Spielberg-style push-in"], deny)).not.toEqual([]);
  });
});

describe("the denylist keeps short craft words (2026-10-22 live rehearsal)", () => {
  it("'How I Lit This Moody Brand Video' bans no lighting word, and still bans a name", () => {
    const deny = denylistOf([{ title: "How I Lit This Moody Brand Video | Cinematography Breakdown", channel: "Matt Aitia" }]);
    expect(namesIn(["a moody, low-key frame lit by one practical"], deny)).toEqual([]);
    expect(deny).toContain("aitia");
    expect(namesIn(["an Aitia-style setup"], deny)).not.toEqual([]);
  });
});
