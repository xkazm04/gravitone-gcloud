import { disposeRoot } from "./scout-cli-harness.ts";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { armLive } from "@gt/kernel/dryrun";
import { append } from "@gt/kernel/events";
import { enqueue } from "@gt/kernel/job";
import { SCENE_REQUEST } from "@gt/producers/scout-scene/define";
import { closeProcessKernel, processKernel } from "@gt/kernel/process";
import { capped, extractGeminiWorst, nightBudget } from "../../lib/foundry/scout/budget.ts";
import { tasteOf } from "../../lib/foundry/scout/taste.ts";
import type { Night, ScoutSource } from "../../lib/foundry/scout/types.ts";

// The night's money from the kernel's own records, and the taste brief from
// committed verdicts. The live job here is a RECORD (an armed mode on an enqueued
// job nobody drives): nothing is called, nothing is spent.

afterAll(() => {
  closeProcessKernel();
  disposeRoot();
});

const OP = { kind: "operator", id: "op-test" } as const;
const k = processKernel(process.env["GRAVITONE_STORE_PATH"] ?? "");
if (!k.ok) throw k.error;
const store = k.value.store;

const base: Night = { id: "2026-10-02", startedAt: "2026-10-02T20:00:00.000Z", ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "open", sources: [], candidates: [], jobs: [] };

describe("nightBudget", () => {
  it("an unfinished live job holds its ceiling; a dry job and a job id the store never saw hold nothing; clips count the asking", () => {
    const arm = armLive(OP, new Date().toISOString(), "scout budget test", { dryOnly: false });
    if (!arm.ok) throw arm.error;
    const live = enqueue(store, { id: "job:run:scout-test-live", of: { kind: "run", id: "scout-test-live" }, producer: "scout-scene", lane: "cloud.google", mode: arm.value, ceilingUsd: 4.5 }, OP);
    const dry = enqueue(store, { id: "job:run:scout-test-dry", of: { kind: "run", id: "scout-test-dry" }, producer: "scout-scene", lane: "cloud.google", ceilingUsd: 9 }, OP);
    if (!live.ok || !dry.ok) throw new Error("enqueue");
    const night: Night = {
      ...base,
      jobs: [live.value.id, dry.value.id, "job:run:never-enqueued"],
      candidates: [
        // Failed at its read: it never reached the clip step, so it spends no clip.
        { id: "c-01", kind: "scene", sourceIds: ["s-01"], status: "failed", keyframes: [], replicas: [], clipRequested: true },
        { id: "c-02", kind: "scene", sourceIds: ["s-01"], status: "pending", keyframes: [], replicas: [] },
        // The vendor refused its clip: rendered with the error, and the asking counts.
        { id: "c-03", kind: "scene", sourceIds: ["s-01"], status: "rendered", keyframes: [], replicas: [], clipRequested: true, error: "clip: refused" },
      ],
    };
    const b = nightBudget(store, night);
    expect(b).toEqual({ ok: true, value: { ceilingUsd: 15, settledUsd: 0, uncappedUsd: 0, heldUsd: 4.5, remainingUsd: 10.5, clipsUsed: 1, clipCap: 2 } });
  });
});

describe("a scout scene's hold", () => {
  it("is its unbooked reads at their worst case, not the night's remainder it was launched with as its ceiling", () => {
    const arm = armLive(OP, new Date().toISOString(), "scout budget test", { dryOnly: false });
    if (!arm.ok) throw arm.error;
    const id = "job:scout-scene:2026-10-02:c-09";
    const j = enqueue(store, { id, of: { kind: "run", id: "scout:2026-10-02/c-09" }, producer: "scout-scene", lane: "gpu.local", mode: arm.value, ceilingUsd: 15 }, OP);
    if (!j.ok) throw j.error;
    const est = (usd: number) => ({ seconds: 10, usd, src: "model" as const });
    const w = store.tx((t) =>
      append(t, { actor: OP, type: SCENE_REQUEST, subject: { kind: "job", id }, data: { nightId: "2026-10-02", candidateId: "c-09", keyframes: ["sources/s-01/k-001.jpg", "sources/s-01/k-002.jpg"], replicas: 2, clip: true, estimates: { read: est(0.004), replica: est(0.0154), clip: est(0) }, by: "op-test" } }),
    );
    if (!w.ok) throw w.error;
    const b = nightBudget(store, { ...base, jobs: [id] });
    // Two reads at $0.004 are its Gemini; the two Leonardo stills and the local clip are uncapped and not held.
    expect(b.ok && b.value.heldUsd).toBe(0.008);
    expect(b.ok && b.value.remainingUsd).toBe(14.992);
  });
});

describe("a scout asset's hold", () => {
  it("is nothing: its concepts are Leonardo's and its gate, mesh and finish local, whatever ceiling it was launched with", () => {
    const arm = armLive(OP, new Date().toISOString(), "scout budget test", { dryOnly: false });
    if (!arm.ok) throw arm.error;
    const j = enqueue(store, { id: "job:scout-asset:2026-10-02:c-10", of: { kind: "run", id: "scout:2026-10-02/c-10" }, producer: "scout-asset", lane: "cloud.leonardo", mode: arm.value, ceilingUsd: 14.8 }, OP);
    if (!j.ok) throw j.error;
    const b = nightBudget(store, { ...base, jobs: [j.value.id] });
    expect(b.ok && b.value.heldUsd).toBe(0);
  });
});

describe("extractGeminiWorst", () => {
  // 2026-10-23: a 24-frame style run's receipt said $3.44 (Leonardo stills and the seat's turn in it); its
  // Gemini is one read a source plus a read-back a round and a transfer.
  it("holds a source's read and its read-backs at $0.002, never the stills or the grouping turn", () => {
    expect(extractGeminiWorst({ sources: 24, rounds: 1, transfers: 3 })).toBe(0.24);
    expect(extractGeminiWorst({ sources: 14, rounds: 1 })).toBe(0.056);
    expect(extractGeminiWorst({ sources: 0, rounds: 1, transfers: 99 })).toBeLessThan(0.05);
  });
});

describe("capped", () => {
  // The ceiling caps Gemini only (operator, 2026-10-23); the axes are the ones 2026-10-22's live night booked.
  it("Gemini and an unattributed row count; the Claude seat, Leonardo and the card do not", () => {
    expect(capped('{"call":"recognize","model":"google/gemini-3.6-flash"}')).toBe(true);
    expect(capped('{"producer":"scout-scene","provider":"imaging-router"}')).toBe(true);
    expect(capped("not json")).toBe(true);
    expect(capped('{"call":"reason","model":"claude-cli/claude-opus-5"}')).toBe(false);
    expect(capped('{"call":"generate","model":"leonardo-flare/openai/gpt-image-2.5-flare"}')).toBe(false);
    expect(capped({ producer: "scout-scene", provider: "imaging-router", model: "leonardo-studio/gpt-image-2.5-sunburst" })).toBe(false);
    expect(capped({ model: "comfyui/ltx-2.5-distilled" })).toBe(false);
  });
});

describe("tasteOf", () => {
  const src = (id: string, channel: string): ScoutSource => ({ id, url: `https://x.example/${id}`, kind: "image", title: `T ${id}`, channel, why: "w", found: "search", rights: "reference-only", status: "ingested", files: [] });
  const committed = (id: string, dry: boolean): Night => ({
    ...base,
    id,
    dry,
    state: "committed",
    sources: [src("s-01", "Kept Channel"), src("s-02", "Thrown Channel")],
    candidates: [
      { id: "c-01", kind: "style", sourceIds: ["s-01"], status: "rendered" },
      { id: "c-02", kind: "scene", sourceIds: ["s-02"], status: "rendered", keyframes: [], replicas: [] },
    ],
    committed: { at: "2026-10-03T07:00:00.000Z", by: "op", kept: ["c-01/riso/replica-1"], rejected: ["c-02/replica-1"], reasons: { "c-02/replica-1": ["subject", "rights"] }, notes: { "c-02/replica-1": "a franchise character" }, dry },
  });

  it("reads committed live nights only: kept and thrown per kind, reasons and notes verbatim, channels thrown twice", () => {
    const md = tasteOf([committed("2026-10-03", false), committed("2026-10-02", false), committed("2026-10-01", true)]);
    expect(md).toContain("## 2026-10-03");
    expect(md).not.toContain("## 2026-10-01");
    expect(md).toContain("- kept: 1 style");
    expect(md).toContain("- rejected: 1 scene");
    expect(md).toContain("threw scene c-02/replica-1 T s-02 (Thrown Channel): subject, rights - note: a franchise character");
    expect(md).toContain("- kept: Kept Channel 2");
    expect(md).toContain("- thrown twice or more, never kept: Thrown Channel");
  });

  it("lists the uses kept, and the uses refused AS uses, so the next night steers away from them", () => {
    const n = committed("2026-10-04", false);
    const withUses: Night = {
      ...n,
      candidates: [
        { id: "c-01", kind: "style", sourceIds: ["s-01"], status: "rendered", use: "children's cartoon series" },
        { id: "c-02", kind: "scene", sourceIds: ["s-02"], status: "rendered", keyframes: [], replicas: [], use: "stock b-roll for anything" },
      ],
      committed: { ...(n.committed as NonNullable<Night["committed"]>), reasons: { "c-02/replica-1": ["use case"] } },
    };
    const md = tasteOf([withUses]);
    expect(md).toContain("- kept: children's cartoon series");
    expect(md).toContain("- refused as a use: stock b-roll for anything");
    expect(md).toContain("T s-02 (Thrown Channel) - for stock b-roll for anything: use case");
  });

  it("says so when there is nothing to learn from yet", () => {
    expect(tasteOf([])).toContain("No committed live night yet");
  });
});
