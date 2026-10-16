// The part view contract's few values (Phase 4 wave C, L38): which kinds have an editor, which
// face a discipline's editors wear, which acts a kind may launch, and the op trail's words.
import { describe, expect, test } from "vitest";

import { DISCIPLINES } from "@gt/catalog/projects";
import { RECIPES } from "@gt/catalog/recipes";

import { EDITOR_KINDS, PART_ACTS, actBelongs, isEditorKind, opLabel, researchFaceOf, scriptFaceOf, type ResearchOp, type ScriptOp } from "../src/partView.ts";

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
