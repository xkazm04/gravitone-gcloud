import { disposeRoot } from "./scout-cli-harness.ts";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { armLive } from "@gt/kernel/dryrun";
import { enqueue } from "@gt/kernel/job";
import { closeProcessKernel, processKernel } from "@gt/kernel/process";
import { nightBudget } from "../../lib/foundry/scout/budget.ts";
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
        { id: "c-01", kind: "scene", sourceIds: ["s-01"], status: "failed", keyframes: [], replicas: [], clipRequested: true },
        { id: "c-02", kind: "scene", sourceIds: ["s-01"], status: "pending", keyframes: [], replicas: [] },
      ],
    };
    const b = nightBudget(store, night);
    expect(b).toEqual({ ok: true, value: { ceilingUsd: 15, settledUsd: 0, heldUsd: 4.5, remainingUsd: 10.5, clipsUsed: 1, clipCap: 2 } });
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

  it("says so when there is nothing to learn from yet", () => {
    expect(tasteOf([])).toContain("No committed live night yet");
  });
});
