import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { redoOf, staleAfter } from "@gt/domain/productionGraph";

vi.mock("server-only", () => ({}));

const { acceptSwap, checkFixture, fixtureProductions, previewSwap, resetFixtureProductions, setVerdict } = await import("../../app/(studio)/scout/canvas/_port/fixtureProduction.ts");
const imported: unknown = (await import("../../lib/production/fixtureProduction.json", { with: { type: "json" } })).default;

// The canvas's fixture production (spark character-cores S1, WP1): the Unlatched first minute as imported by
// pipeline/production-fixture.mts. The JSON holds WP0's types; a recast stales every keyframe that drew her, every take
// and the cut, never the track or the look; a swap previews 2-3 take-start frames and prices the redo it would queue.

let dir = "";
let was: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "production-fixture-"));
  was = process.env["PRODUCTION_FIXTURE_DIR"];
  process.env["PRODUCTION_FIXTURE_DIR"] = dir;
  resetFixtureProductions();
});

afterEach(() => {
  if (was === undefined) delete process.env["PRODUCTION_FIXTURE_DIR"];
  else process.env["PRODUCTION_FIXTURE_DIR"] = was;
  rmSync(dir, { recursive: true, force: true });
});

const fixture = () => {
  const f = checkFixture(imported);
  if (!f.ok) throw new Error(f.error.message);
  return f.value;
};

describe("the Unlatched fixture production", () => {
  it("validates against the production graph's types", () => {
    const { production, cores } = fixture();
    const per = (s: string) => production.nodes.filter((n) => n.station === s).length;
    expect([per("track"), per("cast"), per("clip"), per("cut")]).toEqual([1, 1, 6, 1]);
    expect(per("keyframe")).toBeGreaterThanOrEqual(6);
    expect(production.track.seconds).toBeLessThanOrEqual(107);
    expect(cores[0]?.id).toBe("chr:unlatched-lead");
    expect(cores.length).toBeGreaterThanOrEqual(20);
    for (const n of production.nodes) if (n.media !== undefined) expect(n.media.src).toMatch(/^\/api\/foundry\/file\?.*kind=production/);
  });

  it("refuses a node made from a node that is not there", () => {
    const { production, cores } = fixture();
    const broken = { production: { ...production, nodes: [...production.nodes, { ...production.nodes[0], id: "x", madeFrom: ["nope"] }] }, cores };
    expect(checkFixture(broken).ok).toBe(false);
  });

  it("a recast stales every keyframe that drew her, every take and the cut, never the track or the look", () => {
    const { production } = fixture();
    const stale = new Set(staleAfter(production.nodes, "cast"));
    const station = (id: string) => production.nodes.find((n) => n.id === id)?.station;
    for (const n of production.nodes) {
      if (n.station === "track" || n.station === "look" || n.station === "cast") expect(stale.has(n.id)).toBe(false);
      if (n.station === "clip" || n.station === "cut") expect(stale.has(n.id)).toBe(true);
      if (n.station === "keyframe") expect(stale.has(n.id)).toBe(n.madeFrom.includes("cast"));
    }
    for (const k of ["K00", "K01", "K02", "K03", "K04", "K05"]) expect(stale.has(`kf:${k}`) && stale.has(`clip:${k}`)).toBe(true);
    expect([...stale].every((id) => ["keyframe", "clip", "cut"].includes(station(id) ?? ""))).toBe(true);
  });

  it("a swap previews 2-3 take-start frames and prices the redo it would queue", async () => {
    const { production, cores } = fixture();
    const to = cores[1]?.id as string;
    const p = previewSwap({ production: production.id, core: to });
    if (!p.ok) throw new Error(p.error.message);
    expect(p.value.frames.length).toBeGreaterThanOrEqual(2);
    expect(p.value.frames.length).toBeLessThanOrEqual(3);
    expect(p.value.frames.every((f) => f.state === "pending" && f.madeFrom.includes(to))).toBe(true);
    const stale = staleAfter(production.nodes, "cast");
    expect(p.value.stale).toEqual(stale);
    const count = (s: string) => production.nodes.filter((n) => stale.includes(n.id) && n.station === s).length;
    expect(p.value.redo).toEqual(redoOf(production.nodes, stale));
    expect([p.value.redo.keyframes.n, p.value.redo.clips.n, p.value.redo.cuts]).toEqual([count("keyframe"), 6, 1]);
    expect(previewSwap({ production: production.id, core: production.cast.id }).ok).toBe(false);
    expect((await fixtureProductions.cores()).ok).toBe(true);
  });

  it("a frame the experiment drew previews made, with the eye's drift", () => {
    const { production, cores } = fixture();
    const core = cores[1]?.id.replace(/^chr:/, "") as string;
    mkdirSync(path.join(dir, "experiment", core), { recursive: true });
    writeFileSync(path.join(dir, "experiment", core, "K00.png"), "png");
    writeFileSync(path.join(dir, "experiment", "drift.json"), JSON.stringify({ [`${core}/K00`]: { identity: "holds", room: "drifts", wardrobe: "holds", reason: "the desk moved", by: "fable-5.2" } }));
    const p = previewSwap({ production: production.id, core: `chr:${core}` });
    if (!p.ok) throw new Error(p.error.message);
    expect(p.value.frames[0]).toMatchObject({ state: "made", drift: { room: "drifts" } });
    expect(p.value.frames[0]?.media?.src).toContain("kind=production");
    expect(p.value.frames[1]?.state).toBe("pending");
  });

  it("accept recasts and stales downstream; a verdict sets and clears", async () => {
    const { production, cores } = fixture();
    expect((await fixtureProductions.productions()).ok).toBe(true);
    const to = cores[2] as (typeof cores)[number];
    const a = acceptSwap({ production: production.id, core: to.id });
    if (!a.ok) throw new Error(a.error.message);
    expect(a.value.production.cast.id).toBe(to.id);
    const by = new Map(a.value.production.nodes.map((n) => [n.id, n.state]));
    expect([by.get("track"), by.get("look"), by.get("clip:K03"), by.get("cut")]).toEqual(["made", "made", "stale", "stale"]);
    const v = setVerdict({ production: production.id, node: "clip:K01", verdict: "reject", reasons: ["identity"], note: "her face drifts" });
    if (!v.ok) throw new Error(v.error.message);
    expect(v.value.production.nodes.find((n) => n.id === "clip:K01")?.verdict).toEqual({ verdict: "reject", reasons: ["identity"], note: "her face drifts" });
    const c = setVerdict({ production: production.id, node: "clip:K01", verdict: null, reasons: [] });
    if (!c.ok) throw new Error(c.error.message);
    expect(c.value.production.nodes.find((n) => n.id === "clip:K01")?.verdict).toBeUndefined();
  });
});
