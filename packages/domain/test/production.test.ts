import { describe, expect, it } from "vitest";

import { eventKeySchema, eventTypeSchema, subjectSchema } from "../src/event.ts";
import { parseAt } from "../src/door.ts";
import {
  CHARACTER_ID_RE,
  PRODUCTION_EVENTS,
  PRODUCTION_ID_RE,
  castRoundSchema,
  productionMachine,
  productionSchema,
  refusalOfMove,
  voicePickRefusal,
  type ProductionStage,
} from "../src/production.ts";

const LEGAL: Readonly<Record<ProductionStage, readonly ProductionStage[]>> = {
  accepted: ["hero", "dropped"],
  hero: ["rough", "proven", "dropped"],
  rough: ["hero", "proven", "dropped"],
  proven: ["casting", "dropped"],
  casting: ["audio", "dropped"],
  audio: ["cutting", "casting", "dropped"],
  cutting: ["done", "audio", "casting", "dropped"],
  done: [],
  dropped: [],
};

describe("the production move table", () => {
  it("is exactly the design's stages in the design's order", () => {
    expect(productionMachine.states).toEqual(["accepted", "hero", "rough", "proven", "casting", "audio", "cutting", "done", "dropped"]);
  });
  it("allows exactly the declared moves, every pair walked", () => {
    for (const from of productionMachine.states) {
      for (const to of productionMachine.states) {
        expect(`${from}->${to}:${String(productionMachine.can(from, to))}`).toBe(`${from}->${to}:${String(LEGAL[from].includes(to))}`);
      }
    }
  });
  it("never reaches casting before proven", () => {
    for (const from of ["accepted", "hero", "rough"] as const) expect(productionMachine.can(from, "casting")).toBe(false);
  });
  it("ends at done and dropped", () => {
    expect(productionMachine.next("done")).toEqual([]);
    expect(productionMachine.next("dropped")).toEqual([]);
  });
});

describe("a refused move says which move", () => {
  it("names both stages", () => {
    expect(refusalOfMove("hero", "casting", "operator")).toBe("production: hero -> casting is not a legal move");
  });
  it("lets only the operator mark a take proven, and names who tried", () => {
    expect(refusalOfMove("rough", "proven", "operator")).toBeUndefined();
    expect(refusalOfMove("rough", "proven", "agent")).toBe("production: only the operator may move a production to proven (agent tried, from rough)");
    expect(refusalOfMove("hero", "proven", "machine")).toContain("machine tried");
  });
  it("lets an agent make a move the operator does not reserve", () => {
    expect(refusalOfMove("accepted", "hero", "agent")).toBeUndefined();
  });
});

describe("the wire identifiers pass the doors they will meet", () => {
  it("every event type passes the ledger's type door", () => {
    for (const t of Object.values(PRODUCTION_EVENTS)) expect(eventTypeSchema.safeParse(t).success, t).toBe(true);
  });
  it("lesson events stay clear of the sound lessons' lesson.confirmed", () => {
    expect(PRODUCTION_EVENTS.lessonProposed).toBe("production.lesson-proposed");
    expect(PRODUCTION_EVENTS.lessonAccepted).toBe("production.lesson-accepted");
  });
  it("a production id passes the event key and subject doors", () => {
    expect(eventKeySchema.safeParse("production:prdn:deep-vault:started").success).toBe(true);
    expect(subjectSchema.safeParse({ kind: "production", id: "prdn:deep-vault" }).success).toBe(true);
  });
  it("ids have one shape", () => {
    expect(PRODUCTION_ID_RE.test("prdn:deep-vault")).toBe(true);
    expect(PRODUCTION_ID_RE.test("prod:deep-vault")).toBe(false);
    expect(CHARACTER_ID_RE.test("chr:01JC9Z0Q5V3T8K2M4N6P7R9S1T")).toBe(true);
    expect(CHARACTER_ID_RE.test("chr:bora")).toBe(false);
  });
});

const CARD = { name: "Bora", look: "black hooded cloak", personality: "dry" };
const reused = (i: number) => ({ id: `c-${i}`, origin: "reused", characterId: "chr:01JC9Z0Q5V3T8K2M4N6P7R9S1T", card: CARD, images: ["/a.webp"], usedBefore: [{ label: "night 11-03", at: "2026-11-03" }] });
const fresh = (i: number) => ({ id: `n-${i}`, origin: "new", card: CARD, images: [] });
const voice = (i: number) => ({ id: `v-${i}`, label: "warm", design: "[calm] warm alto" });
const round = {
  id: "round-1",
  productionId: "prdn:deep-vault",
  roleId: "archer",
  at: "2026-11-09",
  characters: [reused(1), reused(2), fresh(3), fresh(4), fresh(5)],
  voices: [voice(1), voice(2), voice(3), voice(4), voice(5)],
  picks: {},
  creditsUsed: 412,
  creditsRead: "character-cost-header",
};

describe("a casting round's door", () => {
  it("takes 5 characters, 5 voices and no picks yet", () => {
    const r = parseAt("round", castRoundSchema, round);
    expect(r.ok).toBe(true);
  });
  it("refuses a round short of 5 of either", () => {
    expect(parseAt("round", castRoundSchema, { ...round, voices: round.voices.slice(0, 4) }).ok).toBe(false);
    expect(parseAt("round", castRoundSchema, { ...round, characters: round.characters.slice(0, 4) }).ok).toBe(false);
  });
  it("refuses a reused candidate that does not say where it was used", () => {
    expect(parseAt("round", castRoundSchema, { ...round, characters: [{ ...reused(1), usedBefore: [] }, reused(2), fresh(3), fresh(4), fresh(5)] }).ok).toBe(false);
  });
  it("locks a voice pick until its preview was heard", () => {
    expect(voicePickRefusal({})).toBe("cast: play this voice's preview before picking it");
    expect(voicePickRefusal({ heardAt: "2026-11-09T10:00:00Z" })).toBeUndefined();
  });
});

describe("a production's door", () => {
  const base = { id: "prdn:deep-vault", title: "The Deep Vault", source: { kind: "episode", ref: "chn-heist/ep-14" }, stage: "hero", board: { logline: "A vault opens.", aspect: "16:9", panels: [{ id: "panel-1", beat: "the door", prompt: "a door", still: { sha256: "a".repeat(64), bytes: 1, mime: "image/png" } }] }, takes: [], roles: [], startedAt: "2026-11-09", startedBy: "operator" };
  it("reads a started production with its optional keys omitted", () => {
    const r = parseAt("production", productionSchema, base);
    expect(r.ok).toBe(true);
    if (r.ok) expect("ventureId" in r.value).toBe(false);
  });
  it("refuses the old id prefix and an unknown stage", () => {
    expect(parseAt("production", productionSchema, { ...base, id: "prod:deep-vault" }).ok).toBe(false);
    expect(parseAt("production", productionSchema, { ...base, stage: "kept" }).ok).toBe(false);
  });
  it("refuses a source kind outside the three", () => {
    expect(parseAt("production", productionSchema, { ...base, source: { kind: "night", ref: "x" } }).ok).toBe(false);
  });
});
