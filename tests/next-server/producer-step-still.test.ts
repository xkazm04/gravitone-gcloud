// THE ALBUM STILL PART'S TAKES AS ONE KERNEL JOB (Phase 4 wave C, L37): a receipt over the plan
// facts (a still part has no units snapshot: it is null), its confirm, four takes as blobs booked on the
// job and landed on the `still` record (the adopted one is the gate's pick, so it stays null), and a second
// confirm of the same receipt while the job is live adopts it (one purchase).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Result } from "@gt/domain/errors";
import { blobStore } from "@gt/kernel/blob";
import { loadOutputs } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";

import { stillProducer, stillUnits } from "../../lib/producers/still.ts";
import { driveStep, launchPartAct, partActReceipt } from "../../lib/producers/research.ts";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
let open: Kernel[] = [];
afterEach(() => {
  for (const k of open) k.close();
  open = [];
});
const OP = { kind: "operator", id: "op" } as const;
const NOW = Date.parse("2026-10-16T09:00:00Z");
const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

describe("still takes", () => {
  it("four takes, dry, each a blob booked on the job; a second confirm adopts the live job", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gt-step-still-"));
    dirs.push(dir);
    const k = openKernel(path.join(dir, "k.sqlite"));
    if (!k.ok) throw k.error;
    open.push(k.value);
    const store = k.value.store;
    must(compose(store, { recipe: "album-video", title: "Night Market" }, OP, { id: "al" }));
    const ref = { projectId: "al", partId: "al/still", act: "still-takes" };
    const r = must(partActReceipt(store, ref, stillUnits, { mode: "dry", now: NOW }));
    expect(r).toMatchObject({ mode: "dry", subject: { kind: "part", act: "still-takes" }, lines: [{ units: 1 }] });
    const a = must(launchPartAct(store, ref, stillUnits, { mode: "dry", now: NOW, token: r.token, actor: OP }));
    // The queue moved (the job is in it), so the same token is stale; confirming the fresh
    // receipt finds the live job instead of buying a second batch.
    const again = must(launchPartAct(store, ref, stillUnits, { mode: "dry", now: NOW, token: r.token, actor: OP }));
    if (a.kind !== "launched" || again.kind !== "stale") throw new Error("expected a launch, then a stale receipt");
    const b = must(launchPartAct(store, ref, stillUnits, { mode: "dry", now: NOW, token: again.fresh.token, actor: OP }));
    if (b.kind !== "launched") throw new Error("stale twice");
    expect(b).toMatchObject({ jobId: a.jobId, adopted: true });
    const run = must(await driveStep(stillProducer, store, a.jobId, { dryOnly: true }));
    expect(run.outcome).toBe("done");
    expect(run.wouldCalls?.length).toBe(4);
    const outs = must(store.read((x) => loadOutputs(x, a.jobId)));
    const takes = [...outs.values()].filter((o) => o.step.startsWith("unit:take:"));
    expect(takes.length).toBe(4);
    const blobs = blobStore(path.join(dir, "blobs"));
    for (const t of takes) expect(await blobs.has(t.value["blob"] as never)).toBe(true);
    const rec = must(readPart(store, { projectId: "al", partId: "al/still" })).records.get("still");
    const landed = (rec?.["takes"] ?? []) as { id: string; blob: unknown }[];
    expect(landed.map((t) => t.blob)).toEqual(takes.map((t) => t.value["blob"]));
    expect(new Set(landed.map((t) => t.id)).size).toBe(4);
    expect(rec?.["adopted"]).toBeNull();
  });
});
