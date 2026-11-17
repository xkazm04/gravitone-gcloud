// A RELEASE'S SLEEVE TAKES, END TO END (spark studio-to-release WP3) - lib/producers/releaseSleeve.ts over a temp kernel:
// Codex is one press (dry under GRAVITONE_DRY_ONLY: four stand-in takes, measured as what they are); Leonardo is a
// receipt first, a stale token answers the fresh receipt, the confirm launches and the takes come back measured off
// their own bytes; Leonardo under dry-only is refused before a receipt; the step's "newest run" read finds the job.
// No vendor: fetch throws and the imaging engine is a fake.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-release-sleeve-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  return dir;
});

import { rmSync } from "node:fs";
import path from "node:path";

import type { Actor } from "@gt/domain/event";
import { closeProcessKernel, processKernel } from "@gt/kernel/process";

import type { GeneratedImages, GenerateRequest } from "../../lib/imaging/types.ts";
import { producers } from "../../lib/producers/registry.ts";
import { latestSleeveOf, launchSleeve, sleeveTakesOf, type SleeveEngines } from "../../lib/producers/releaseSleeve.ts";

vi.stubGlobal("fetch", () => Promise.reject(new Error("no network in this test")));

const LOC = path.join(ROOT, "kernel.sqlite");
const OP: Actor = { kind: "operator", id: "op-test" } as Actor;
const REL = "rel-0000000000c3";

afterAll(() => {
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const store = () => {
  const k = processKernel(LOC);
  if (!k.ok) throw k.error;
  return k.value.store;
};

/** A PNG header that says 3000 x 3000 truecolour: what a store-ready take's bytes would say. */
function pngHeader(): string {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, 3000);
  new DataView(b.buffer).setUint32(20, 3000);
  b[24] = 8;
  b[25] = 2;
  return Buffer.from(b).toString("base64");
}

function fakeFlare(seen: GenerateRequest[]): SleeveEngines {
  return {
    generate: async (req): Promise<GeneratedImages> => {
      seen.push(req);
      return { images: [{ base64: pngHeader(), mime: "image/png" }], provenance: { provider: "leonardo-flare", model: "openai/gpt-image-2.5-flare", modelBasis: "requested", costUsd: 0.01542, costBasis: "vendor-reported", durationMs: 1 } };
    },
  };
}

const ask = (o: Record<string, unknown> = {}) => ({ releaseId: REL, prompt: "Rain on marble steps at night, a lyre of light", provider: "codex", takes: 4, ...o });

describe("the sleeve takes", () => {
  it("binds the producer on both providers' lanes", () => {
    const p = producers();
    if (!p.ok) throw p.error;
    expect([...p.value.keys()].filter((k) => k.startsWith("release-sleeve@")).sort()).toEqual(["release-sleeve@cloud.leonardo", "release-sleeve@seat.text"]);
  });

  it("refuses an empty prompt before anything is queued", async () => {
    const r = await launchSleeve(store(), ask({ prompt: "  " }), { actor: OP, dryOnly: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe("sleeve takes need a prompt");
  });

  it("Codex under dry-only: one press, the job driven here, four stand-in takes measured as what they are", async () => {
    const seen: GenerateRequest[] = [];
    const r = await launchSleeve(store(), ask(), { actor: OP, dryOnly: true, now: 1_800_000_000_000, engines: fakeFlare(seen) });
    if (!r.ok) throw r.error;
    expect(r.value.kind).toBe("launched");
    if (r.value.kind !== "launched") return;
    const v = r.value.view;
    expect(v.state).toBe("done");
    expect(v.jobId).toMatch(/^job:release-sleeve:rel-0000000000c3:/);
    expect(v.candidates.map((c) => c.n)).toEqual([1, 2, 3, 4]);
    expect(v.candidates.every((c) => c.dry && c.widthPx === 1 && c.heightPx === 1 && !c.rgb && c.href.startsWith("/api/blob/"))).toBe(true);
    expect(seen).toEqual([]);
  });

  it("Leonardo under dry-only is refused before a receipt", async () => {
    const r = await launchSleeve(store(), ask({ provider: "leonardo" }), { actor: OP, dryOnly: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("GRAVITONE_DRY_ONLY=1 refuses a priced run");
  });

  it("Leonardo on a live box: the receipt, a stale token answered with the fresh one, then the confirm and four measured takes", async () => {
    const seen: GenerateRequest[] = [];
    const o = { actor: OP, dryOnly: false, engines: fakeFlare(seen) };
    const rc = await launchSleeve(store(), ask({ provider: "leonardo" }), { ...o, now: 1_800_000_100_000 });
    if (!rc.ok) throw rc.error;
    if (rc.value.kind !== "receipt") throw new Error(`expected a receipt, got ${rc.value.kind}`);
    expect(rc.value.usd).toBe(0.06);
    expect(seen).toEqual([]);

    const stale = await launchSleeve(store(), ask({ provider: "leonardo", prompt: "another prompt" }), { ...o, token: rc.value.token, now: 1_800_000_200_000 });
    if (!stale.ok) throw stale.error;
    expect(stale.value.kind).toBe("stale");

    const go = await launchSleeve(store(), ask({ provider: "leonardo" }), { ...o, token: rc.value.token, now: 1_800_000_300_000, drive: false });
    if (!go.ok) throw go.error;
    if (go.value.kind !== "launched") throw new Error(`expected a launch, got ${go.value.kind}`);
    const jobId = go.value.view.jobId ?? "";
    expect(go.value.view.state).toBe("queued");

    const { driveSleeve } = await import("../../lib/producers/releaseSleeve.ts");
    const d = await driveSleeve(store(), jobId, { dryOnly: false, engines: fakeFlare(seen) });
    if (!d.ok) throw d.error;
    const v = sleeveTakesOf(store(), jobId);
    if (!v.ok) throw v.error;
    expect(v.value.state).toBe("done");
    expect(v.value.candidates.map((c) => [c.widthPx, c.heightPx, c.rgb, c.dry, c.provider])).toEqual(Array.from({ length: 4 }, () => [3000, 3000, true, false, "leonardo-flare"]));
    expect(seen.map((s) => [s.aspect, s.prefer, s.count])).toEqual(Array.from({ length: 4 }, () => ["1:1", "leonardo-flare", 1]));

    const latest = latestSleeveOf(store(), REL);
    if (!latest.ok) throw latest.error;
    expect(latest.value?.jobId).toBe(jobId);
    const none = latestSleeveOf(store(), "rel-0000000000ff");
    expect(none.ok && none.value).toBeNull();
  });
});
