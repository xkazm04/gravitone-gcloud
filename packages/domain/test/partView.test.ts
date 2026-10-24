// The part view contract's few values (Phase 4 wave C, L38): which kinds have an editor, which
// face a discipline's editors wear, which acts a kind may launch, and the op trail's words.
import { describe, expect, expectTypeOf, test } from "vitest";

import { DISCIPLINES } from "@gt/catalog/projects";
import { RECIPES } from "@gt/catalog/recipes";

import {
  EDITOR_KINDS,
  PART_ACTS,
  actBelongs,
  albumOpLabel,
  finishOpLabel,
  framesOpLabel,
  isEditorKind,
  opLabel,
  researchFaceOf,
  scriptFaceOf,
  type AlbumOp,
  type CutOp,
  type ExplainerOp,
  type FramesOp,
  type MotionOp,
  type PartKind,
  type ResearchOp,
  type ScoreOp,
  type ScriptOp,
} from "../src/partView.ts";
import type { PartKind as RecordPartKind } from "../src/part.ts";

describe("editor kinds", () => {
  // Wave C grew the list: L39 frames and motion, L40 score, cut and the album and explainer parts.
  test("the studio's work kinds have an editor; gates, the slot and the still (no record yet) never do", () => {
    expect([...EDITOR_KINDS]).toEqual(["research", "script", "frames", "motion", "score", "cut", "words", "render", "article", "strips", "voice"]);
    expect(isEditorKind("research")).toBe(true);
    for (const k of ["gate", "slot", "still", "", "Research"]) expect(isEditorKind(k)).toBe(false);
  });

  test("every film recipe plans the six film editors, the album and the explainer theirs, so each reaches them from its Plan", () => {
    const plans = (id: string, kinds: readonly string[]) => {
      const keys = RECIPES.find((x) => x.id === id)?.parts.map((p) => p.kind) ?? [];
      for (const k of kinds) expect(keys, id).toContain(k);
    };
    for (const r of RECIPES.filter((x) => x.family === "film")) plans(r.id, ["research", "script", "frames", "motion", "score", "cut"]);
    plans("album-video", ["words", "render"]);
    plans("explainer", ["article", "strips", "voice", "cut"]);
  });
});

describe("part kinds", () => {
  test("the view names the same part kinds as the record door (one source: @gt/catalog/recipes)", () => {
    expectTypeOf<PartKind>().toEqualTypeOf<RecordPartKind>();
  });
});

describe("faces", () => {
  test("each discipline maps to one research face and the matching script face", () => {
    const seen = Object.fromEntries(DISCIPLINES.map((d) => [d, [researchFaceOf(d), scriptFaceOf(d)]]));
    expect(seen).toEqual({
      educational: ["notebook", "document"],
      trailer: ["beats", "trailer"],
      free: ["beats", "trailer"],
      "music-video": [null, null],
      ads: ["ads", "ads"],
    });
  });

  test("a free project's choice moves both faces together; no other discipline listens to it", () => {
    expect([researchFaceOf("free", "notebook"), scriptFaceOf("free", "notebook")]).toEqual(["notebook", "document"]);
    expect(researchFaceOf("trailer", "notebook")).toBe("beats");
    expect(scriptFaceOf("ads", "notebook")).toBe("ads");
  });
});

describe("acts", () => {
  test("an act belongs to exactly one kind", () => {
    const all = [...PART_ACTS.research, ...PART_ACTS.script];
    expect(new Set(all).size).toBe(all.length);
    for (const a of PART_ACTS.research) expect([actBelongs("research", a), actBelongs("script", a)]).toEqual([true, false]);
    for (const a of PART_ACTS.script) expect([actBelongs("research", a), actBelongs("script", a)]).toEqual([false, true]);
    expect(actBelongs("research", "launch")).toBe(false);
  });
});

describe("op labels", () => {
  const ops: readonly (ResearchOp | ScriptOp)[] = [
    { op: "descope", cardId: "f-ath" },
    { op: "restore", cardId: "f-ath" },
    { op: "like", cardId: "f-ath", on: true },
    { op: "like", cardId: "f-ath", on: false },
    { op: "deepen", cardId: "f-ath", on: true },
    { op: "confirm-scope" },
    { op: "queue-follow-up", prompt: "who holds it?" },
    { op: "drop-follow-up", id: "fu-1" },
    { op: "decide-effect", followUpId: "fu-1", index: 0, decision: "applied" },
    { op: "decide-effect", followUpId: "fu-1", index: 0, decision: "rejected" },
    { op: "set-face", face: "notebook" },
    { op: "pick-beat", slotId: "cold-open", variantId: "v1" },
    { op: "pick-beat", slotId: "cold-open", variantId: null },
    { op: "compose-spine" },
    { op: "set-brief", field: "cta", value: "Pack one" },
    { op: "pick-idea", ideaId: "idea-2" },
    { op: "adopt", candidateId: "reversal-chain" },
    { op: "adopt", candidateId: null },
    { op: "note-add", cardId: "f-etf", kind: "descope" },
    { op: "note-remove", noteId: "n-1" },
    { op: "accept", versionId: "v2" },
    { op: "accept-over-gate", versionId: "v2" },
    { op: "discard-staged", versionId: "v2" },
    { op: "restore-version", versionId: "v1" },
    { op: "patch-beat", beatId: "b1", text: "x" },
    { op: "reset-beat", beatId: "b1" },
    { op: "set-connector", beatId: "b1", connector: "BUT" },
    { op: "pick-scenario", scenarioId: "sc-1" },
  ];

  test("every op has words, and two different edits never read the same in the trail", () => {
    const labels = ops.map(opLabel);
    for (const l of labels) expect(l.trim().length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test("the trail names what the op touched", () => {
    expect(opLabel({ op: "descope", cardId: "f-ath" })).toBe("descope f-ath");
    expect(opLabel({ op: "like", cardId: "f-ath", on: false })).toBe("unlike f-ath");
    expect(opLabel({ op: "confirm-scope" })).toBe("confirm scope");
    expect(opLabel({ op: "decide-effect", followUpId: "fu", index: 1, decision: "applied" })).toBe("apply effect 2");
  });
});

// The later kinds' trails (_part/kinds.ts `label` calls these). Keyed by op name, so an op added to
// a union without a sample here is a type error, not an unlabelled line nobody looked at.
describe("op labels of the later kinds", () => {
  const frames: { readonly [K in (FramesOp | MotionOp)["op"]]: readonly (FramesOp | MotionOp)[] } = {
    "move-layer": [{ op: "move-layer", unitId: "c:b1:0", layer: "text", layerId: "t1", x: 1, y: 2 }],
    "resize-layer": [{ op: "resize-layer", unitId: "c:b1:0", layer: "element", layerId: "e1", w: 3, h: 4 }],
    "order-layer": [
      { op: "order-layer", unitId: "c:b1:0", layer: "element", layerId: "e1", dir: 1 },
      { op: "order-layer", unitId: "c:b1:0", layer: "element", layerId: "e1", dir: -1 },
    ],
    "hide-layer": [
      { op: "hide-layer", unitId: "c:b1:0", layer: "text", layerId: "t1", hidden: true },
      { op: "hide-layer", unitId: "c:b1:0", layer: "text", layerId: "t1", hidden: false },
    ],
    "remove-layer": [{ op: "remove-layer", unitId: "c:b1:0", layer: "text", layerId: "t1" }],
    "set-text": [{ op: "set-text", unitId: "c:b1:0", textId: "t1", value: "x" }],
    "add-text": [{ op: "add-text", unitId: "c:b1:0", role: "caption" }],
    "bind-fact": [
      { op: "bind-fact", unitId: "c:b1:0", textId: "t1", factId: "f1" },
      { op: "bind-fact", unitId: "c:b1:0", textId: "t1", factId: null },
    ],
    "set-subject": [{ op: "set-subject", unitId: "c:b1:0", subject: "a harbour" }],
    "set-clip-motion": [{ op: "set-clip-motion", unitId: "c:b1:0", motion: "push in" }],
    "adopt-alt": [{ op: "adopt-alt", unitId: "c:b1:0", altId: "c:b1:0~a1" }],
    "accept-direction": [
      { op: "accept-direction", units: "all", overwrite: false },
      { op: "accept-direction", units: ["c:b1:0", "c:b2:0"], overwrite: true },
    ],
    "discard-direction": [{ op: "discard-direction" }],
    "revert-direction": [{ op: "revert-direction" }, { op: "revert-direction", unitId: "c:b1:0" }],
    rederive: [{ op: "rederive" }],
    "adopt-image": [{ op: "adopt-image", shotId: "s1", takeId: "tk1" }],
    "accept-motion": [{ op: "accept-motion", unitId: "c:b1:0" }],
    "clear-motion": [{ op: "clear-motion", unitId: "c:b1:0" }],
    "adopt-clip": [{ op: "adopt-clip", shotId: "s1", clipId: "cl1" }],
  };
  const finish: { readonly [K in (ScoreOp | CutOp)["op"]]: readonly (ScoreOp | CutOp)[] } = {
    "cue-span": [{ op: "cue-span", cueId: "q1", first: "s1", last: "s3" }],
    "cue-field": [
      { op: "cue-field", cueId: "q1", field: "title", value: "x" },
      { op: "cue-field", cueId: "q1", field: "note", value: "x" },
    ],
    "cue-bpm": [
      { op: "cue-bpm", cueId: "q1", bpm: 92 },
      { op: "cue-bpm", cueId: "q1", bpm: null },
    ],
    "cue-add": [{ op: "cue-add" }],
    "cue-delete": [{ op: "cue-delete", cueId: "q1" }],
    "take-use": [{ op: "take-use", cueId: "q1", takeId: "tk1" }],
    "take-mark": [
      { op: "take-mark", cueId: "q1", takeId: "tk1", mark: "kept" },
      { op: "take-mark", cueId: "q1", takeId: "tk1", mark: "rejected" },
      { op: "take-mark", cueId: "q1", takeId: "tk1", mark: null },
    ],
    "take-note": [{ op: "take-note", cueId: "q1", takeId: "tk1", section: 0, note: "softer" }],
    nudge: [
      { op: "nudge", clipId: "v1", ms: 40 },
      { op: "nudge", clipId: "v1", ms: -40 },
    ],
    snap: [{ op: "snap", clipId: "v1" }],
    super: [{ op: "super", shotId: "s1", text: "x" }],
    "end-card": [
      { op: "end-card", field: "cta", value: "x" },
      { op: "end-card", field: "line", value: "x" },
    ],
    "end-hold": [{ op: "end-hold", holdS: 2 }],
    aspect: [
      { op: "aspect", aspect: "9:16", on: true },
      { op: "aspect", aspect: "9:16", on: false },
    ],
  };
  const album: { readonly [K in (AlbumOp | ExplainerOp)["op"]]: readonly (AlbumOp | ExplainerOp)[] } = {
    "words-field": [
      { op: "words-field", field: "title", value: "x" },
      { op: "words-field", field: "description", value: "x" },
    ],
    "words-tags": [{ op: "words-tags", tags: ["a", "b"] }],
    "render-res": [{ op: "render-res", res: "1440p" }],
    "voice-use": [{ op: "voice-use", lineId: "l1", takeId: "tk1" }],
    "voice-mark": [
      { op: "voice-mark", lineId: "l1", takeId: "tk1", mark: "kept" },
      { op: "voice-mark", lineId: "l1", takeId: "tk1", mark: "rejected" },
      { op: "voice-mark", lineId: "l1", takeId: "tk1", mark: null },
    ],
    "voice-line": [{ op: "voice-line", lineId: "l1", text: "x" }],
  };

  test.each([
    ["frames and motion", Object.values(frames).flat().map((op) => framesOpLabel(op))],
    ["score and cut", Object.values(finish).flat().map((op) => finishOpLabel(op))],
    ["album and explainer", Object.values(album).flat().map((op) => albumOpLabel(op))],
  ])("%s: every op has words, and two different edits never read the same", (_, labels) => {
    for (const l of labels) expect(l.trim().length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test("the trail says which way an edit went", () => {
    expect(framesOpLabel({ op: "order-layer", unitId: "c:b1:0", layer: "element", layerId: "e1", dir: 1 })).toBe("forward e1");
    expect(framesOpLabel({ op: "hide-layer", unitId: "c:b1:0", layer: "text", layerId: "t1", hidden: false })).toBe("show t1");
    expect(framesOpLabel({ op: "set-subject", unitId: "c:b1:0", subject: "x" })).toBe("subject b1:0");
    expect(finishOpLabel({ op: "nudge", clipId: "v1", ms: 40 })).toBe("+40ms v1");
    expect(finishOpLabel({ op: "nudge", clipId: "v1", ms: -40 })).toBe("-40ms v1");
    expect(finishOpLabel({ op: "take-mark", cueId: "q1", takeId: "tk1", mark: "rejected" })).toBe("reject tk1");
    expect(finishOpLabel({ op: "take-note", cueId: "q1", takeId: "tk1", section: 0, note: "x" })).toBe("note tk1 §1");
    expect(albumOpLabel({ op: "voice-mark", lineId: "l1", takeId: "tk1", mark: "kept" })).toBe("keep tk1");
  });
});
