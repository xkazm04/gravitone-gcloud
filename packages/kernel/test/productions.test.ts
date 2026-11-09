import { afterAll, describe, expect, it } from "vitest";

import type { Actor } from "@gt/domain/event";
import type { ProductionBoard, ProductionSource } from "@gt/domain/production";

import { eventsMigrations } from "../src/events.ts";
import { productionMigrations } from "../src/productions/schema.ts";
import { appendTake, listProductions, markTakeProven, moveProductionIn, productionOfSource, readProduction, refusalOfTake, settleTake, startedEpisodes, startProductionIn } from "../src/productions/store.ts";
import type { Store } from "../src/store.ts";
import { must, steppingClock, templateStores } from "./helpers.ts";

// THE PRODUCTION RECORD (spark concept-casting-stages S1): one concept is one production; the stage only moves as the
// machine's table allows, refused with its sentence; takes are appended; only the operator proves one.

const tpl = templateStores([eventsMigrations, productionMigrations], { clock: steppingClock("2026-11-09T01:00:00.000Z") });
afterAll(() => tpl.dispose());

const OPERATOR: Actor = { kind: "operator", id: "owner" };
const AGENT: Actor = { kind: "agent", id: "athena" };
const SOURCE: ProductionSource = { kind: "episode", ref: "F1-11" };
const BOARD: ProductionBoard = { logline: "A bell rings, then time runs backward.", aspect: "16:9", panels: [{ id: "panel-1", beat: "the strike", prompt: "a bell", still: { sha256: "a".repeat(64), bytes: 4, mime: "image/png" } }] };

const start = (s: Store) => must(s.tx((t) => startProductionIn(t, { source: SOURCE, title: "The Pour", board: BOARD }, OPERATOR)));
const take = (kind: "hero" | "rough" = "hero") => ({ kind, beats: ["the strike"], frames: ["panel-1"], prompt: "a bell rings", seed: 7, engine: "minimax-h3-fl2v-turbo", jobId: "job:take-1", dry: true });
const ready = { state: "ready" as const, video: "/api/blob/abc?type=video/mp4", durationS: 5.17, gpuSeconds: 0 };
const events = (s: Store) => must(s.read((r) => r.all("SELECT actor_kind, type, data FROM events ORDER BY seq")));
const refused = (r: { ok: boolean; error?: { code: string; message: string } }) => (r.ok ? "ok" : `${r.error?.code}: ${r.error?.message}`);

describe("a production starts", () => {
  it("once per concept, reading back whole, and the start is the operator's", () => {
    const s = tpl.fresh();
    const p = start(s);
    expect(p).toMatchObject({ id: "prdn:the-pour", stage: "accepted", title: "The Pour", source: SOURCE, startedBy: "owner", takes: [], roles: [] });
    expect(start(s).id).toBe(p.id);
    expect(events(s).map((e) => e["type"])).toEqual(["production.started"]);
    expect(must(s.read((r) => productionOfSource(r, SOURCE)))?.id).toBe(p.id);
    expect(must(s.read((r) => listProductions(r))).map((x) => x.id)).toEqual([p.id]);
    expect(refused(s.tx((t) => startProductionIn(t, { source: { kind: "episode", ref: "F1-12" }, title: "Another", board: BOARD }, AGENT)))).toMatch(/refused: production: only the operator starts/);
  });

  it("mints a fresh id for another concept of the same title", () => {
    const s = tpl.fresh();
    start(s);
    const other = must(s.tx((t) => startProductionIn(t, { source: { kind: "codex-board", ref: "2026-11-08/F1-12" }, title: "The Pour", board: BOARD }, OPERATOR)));
    expect(other.id).toBe("prdn:the-pour-2");
  });

  it("names its started episodes, a dropped one included", () => {
    const s = tpl.fresh();
    const p = start(s);
    must(s.tx((t) => moveProductionIn(t, p.id, "dropped", OPERATOR)));
    expect([...must(s.read((r) => startedEpisodes(r)))]).toEqual(["F1-11"]);
  });
});

describe("the stage", () => {
  it("moves only as the machine allows, refused by name", () => {
    const s = tpl.fresh();
    const p = start(s);
    expect(refused(s.tx((t) => moveProductionIn(t, p.id, "casting", OPERATOR)))).toBe("refused: production: accepted -> casting is not a legal move");
    expect(refused(s.tx((t) => moveProductionIn(t, p.id, "hero", OPERATOR)))).toBe("ok");
    expect(must(s.read((r) => readProduction(r, p.id)))?.stage).toBe("hero");
    expect(refused(s.tx((t) => moveProductionIn(t, p.id, "proven", AGENT)))).toBe("refused: production: only the operator may move a production to proven (agent tried, from hero)");
  });

  it("a dropped production is terminal", () => {
    const s = tpl.fresh();
    const p = start(s);
    must(s.tx((t) => moveProductionIn(t, p.id, "dropped", OPERATOR)));
    expect(refused(s.tx((t) => moveProductionIn(t, p.id, "hero", OPERATOR)))).toBe("refused: production: dropped -> hero is not a legal move");
  });
});

describe("takes", () => {
  it("a hero take appends, walks accepted to hero, and settles once", () => {
    const s = tpl.fresh();
    const p = start(s);
    const a = must(s.tx((t) => appendTake(t, p.id, take(), OPERATOR)));
    expect(a.take).toMatchObject({ id: "take-1", kind: "hero", state: "rendering", seed: 7, engine: "minimax-h3-fl2v-turbo", dry: true, jobId: "job:take-1", prompt: "a bell rings", frames: ["panel-1"] });
    expect(a.production.stage).toBe("hero");
    expect(must(s.tx((t) => settleTake(t, p.id, "take-1", ready, OPERATOR)))).toMatchObject({ state: "ready", durationS: 5.17, gpuSeconds: 0 });
    const again = must(s.tx((t) => settleTake(t, p.id, "take-1", { state: "failed", error: "late" }, OPERATOR)));
    expect(again.state).toBe("ready");
    expect(events(s).map((e) => e["type"])).toEqual(["production.started", "production.staged", "production.take", "production.take"]);
    const b = must(s.tx((t) => appendTake(t, p.id, take(), OPERATOR)));
    expect(b.take.id).toBe("take-2");
  });

  it("a rough cut is refused before a hero take has landed, and takes the stage to rough after", () => {
    const s = tpl.fresh();
    const p = start(s);
    expect(refused(s.tx((t) => appendTake(t, p.id, take("rough"), OPERATOR)))).toBe("refused: production: a rough cut cannot be rendered from accepted");
    must(s.tx((t) => appendTake(t, p.id, take(), OPERATOR)));
    expect(refused(s.tx((t) => appendTake(t, p.id, take("rough"), OPERATOR)))).toBe("refused: production: a rough cut comes only after a hero take has landed");
    must(s.tx((t) => settleTake(t, p.id, "take-1", ready, OPERATOR)));
    const r = must(s.tx((t) => appendTake(t, p.id, take("rough"), OPERATOR)));
    expect(r.production.stage).toBe("rough");
    expect(refusalOfTake(r.production, "rough")).toBeUndefined();
  });

  it("the operator proves a ready take; an agent is refused, and a take still rendering cannot be proven", () => {
    const s = tpl.fresh();
    const p = start(s);
    must(s.tx((t) => appendTake(t, p.id, take(), OPERATOR)));
    expect(refused(s.tx((t) => markTakeProven(t, p.id, "take-1", OPERATOR)))).toBe("refused: production: take-1 is rendering; only a take that landed can be proven");
    must(s.tx((t) => settleTake(t, p.id, "take-1", ready, OPERATOR)));
    expect(refused(s.tx((t) => markTakeProven(t, p.id, "take-1", AGENT)))).toBe("refused: production: only the operator may move a production to proven (agent tried, from hero)");
    const done = must(s.tx((t) => markTakeProven(t, p.id, "take-1", OPERATOR)));
    expect(done.stage).toBe("proven");
    expect(done.takes[0]).toMatchObject({ provenBy: "owner", state: "ready" });
    expect(events(s).at(-1)?.["type"]).toBe("production.staged");
    expect(refused(s.tx((t) => appendTake(t, p.id, take(), OPERATOR)))).toBe("refused: production: a hero take cannot be rendered from proven");
  });

  it("the schema holds what a hand edit would break: a board is fixed, a take is never deleted", () => {
    const s = tpl.fresh();
    const p = start(s);
    must(s.tx((t) => appendTake(t, p.id, take(), OPERATOR)));
    expect(s.tx((t) => t.run("UPDATE productions SET board = '{}' WHERE id = ?", p.id)).ok).toBe(false);
    expect(s.tx((t) => t.run("UPDATE production_takes SET seed = 9 WHERE production_id = ?", p.id)).ok).toBe(false);
    expect(s.tx((t) => t.run("DELETE FROM production_takes WHERE production_id = ?", p.id)).ok).toBe(false);
    expect(s.tx((t) => t.run("DELETE FROM productions WHERE id = ?", p.id)).ok).toBe(false);
  });
});
