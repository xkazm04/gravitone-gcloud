// FRAMES ON THE PROJECT'S STYLE (Phase 5, L56): a frames act is drawn in the style the PROJECT is
// bound to, through the Style store - its block compiled into every image prompt, its approved
// proofs attached as references - and the receipt names the style and how many references ride
// along. A project with no style is drawn in a NAMED default and the receipt says which miss it
// covers. The look is in the receipt's token: an approval landing between the receipt and its
// confirm makes the confirm stale. The engines are stubs: no vendor is ever called.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PRESETS } from "@gt/catalog/presets";
import { ok, type Result } from "@gt/domain/errors";
import { blockDigest, compileStyleBlock } from "@gt/domain/style.ratchet";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";
import { applyStyleOp, readStyle } from "@gt/kernel/styles/driver";
import { draftFromV1Theme, importV1ThemeIn } from "@gt/kernel/styles/v1theme";

import { framesProducer, framesUnits, type ImagingEngines } from "../../lib/producers/frames.ts";
import { driveStep, launchPartAct, partActReceipt } from "../../lib/producers/research.ts";
import type { GenerateRequest, GeneratedImages } from "../../lib/imaging/types.ts";

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
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const BLOCK = PRESETS[2]?.block;
if (BLOCK === undefined) throw new Error("the catalog needs a third preset for this test");
const DIGEST = blockDigest(BLOCK);
const DEFAULT = PRESETS[0];
if (DEFAULT === undefined) throw new Error("no default preset");

const unit = (id: string, at: string) => ({
  id, sourceId: "r1", beatRef: { at }, ordinal: 1, ofBeat: 1, startS: 0, holdS: 5, kind: "beat", beatKind: "hook", title: `beat ${id}`, line: "a line",
  plate: { subject: `a wide quiet field of soft grey shapes, ${id}`, state: "empty" },
  clip: { status: "not-started", motion: "" }, elements: [], texts: [],
});

/** A v1 theme with three approvals (one per problem), one pending; locked when asked. */
const theme = (locked: boolean) => ({
  id: "th-ink", name: "Ink Harbor", origin: "preset", presetId: PRESETS[2]?.id, block: BLOCK, elements: [], createdAt: 0, updatedAt: 0,
  proofs: [
    { id: "a1", label: "the fall", state: "approved", trialId: "peak-and-fall", blockDigest: DIGEST, createdAt: Date.parse("2026-09-01T00:00:00Z") },
    { id: "a2", label: "the wish list", state: "approved", trialId: "wish-list", blockDigest: DIGEST, createdAt: Date.parse("2026-09-02T00:00:00Z") },
    { id: "a3", label: "the booking", state: "approved", trialId: "booking-not-meal", blockDigest: DIGEST, createdAt: Date.parse("2026-09-03T00:00:00Z") },
    { id: "p1", label: "the flywheel", state: "pending", trialId: "flywheel", blockDigest: DIGEST, createdAt: Date.parse("2026-09-04T00:00:00Z") },
  ],
  ...(locked ? { lockedAt: Date.parse("2026-09-05T00:00:00Z") } : {}),
});

const PROOFS = ["a1", "a2", "a3", "p1"];
/** Each proof's own bytes: the pixel plus its index, so each has its own digest. */
const bytesOf = (p: string): Buffer => Buffer.concat([Buffer.from(PIXEL, "base64"), Buffer.from([PROOFS.indexOf(p)])]);

type U = { store: Store; blobs: BlobStore; shas: Record<string, string> };

/** A temp kernel with a frames part seeded, and (optionally) the v1 theme imported as a style, its
 *  proofs' bytes in the store's own blob directory (distinct bytes, so distinct digests). */
async function universe(id: string, o: { styleId?: string; theme?: "locked" | "draft" } = {}): Promise<U> {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-frames-style-"));
  dirs.push(dir);
  const k = must(openKernel(path.join(dir, "k.sqlite")));
  open.push(k);
  const store = k.store;
  const blobs = blobStore(path.join(dir, "blobs"));
  const shas: Record<string, string> = {};
  if (o.theme !== undefined) {
    const refs = new Map<string, Awaited<ReturnType<BlobStore["put"]>>>();
    for (const p of PROOFS) refs.set(p, await blobs.put(new Uint8Array(bytesOf(p)), "image/png"));
    for (const [p, r] of refs) shas[p] = must(r).sha256;
    const d = must(draftFromV1Theme(theme(o.theme === "locked"), (pid) => {
      const r = refs.get(pid);
      return r?.ok === true ? r.value : undefined;
    }));
    must(store.tx((t) => importV1ThemeIn(t, d, OP)));
  }
  must(compose(store, { recipe: "film/short-educational-video", ...(o.styleId === undefined ? {} : { styleId: o.styleId }) }, OP, { id }));
  must(writePart(store, { projectId: id, partId: `${id}/frames`, baseRev: "current", act: "land", op: { seed: true }, label: "seed", by: { kind: "machine", id: "test" }, next: () => ok({ frames: { units: [unit("u1", "0:00"), unit("u2", "0:05")], renderId: "r1" } }) }));
  return { store, blobs, shas };
}

const ref = (id: string) => ({ projectId: id, partId: `${id}/frames`, act: "render-plates" });
const label = (u: U, id: string): string => must(partActReceipt(u.store, ref(id), framesUnits, { mode: "dry", now: NOW })).lines[0]?.label ?? "";

/** A live stub that records every request it is asked (never a vendor). */
function recorder(): { eng: ImagingEngines; asked: GenerateRequest[] } {
  const asked: GenerateRequest[] = [];
  return {
    asked,
    eng: {
      generate: async (req) => {
        asked.push(req);
        return { images: [{ base64: PIXEL, mime: "image/png" }], provenance: { provider: "google", model: "fake-image", modelBasis: "requested", durationMs: 1, costUsd: 0.04, costBasis: "vendor-reported" } as GeneratedImages["provenance"] };
      },
      recognize: async () => {
        throw new Error("not asked");
      },
    },
  };
}

async function liveRun(u: U, id: string, eng: ImagingEngines): Promise<void> {
  const r = must(partActReceipt(u.store, ref(id), framesUnits, { mode: "live", now: NOW }));
  const l = must(launchPartAct(u.store, ref(id), framesUnits, { mode: "live", now: NOW, token: r.token, actor: OP, dryOnly: false }));
  if (l.kind !== "launched") throw new Error("stale");
  const run = must(await driveStep((lane, hooks) => framesProducer(lane, hooks, eng, () => u.blobs), u.store, l.jobId, { dryOnly: false }));
  expect(run.outcome).toBe("done");
}

describe("a project bound to a locked style", () => {
  it("the receipt names the style and its reference count", async () => {
    const u = await universe("fs", { styleId: "v1-theme:th-ink", theme: "locked" });
    expect(label(u, "fs")).toBe("render-plates · 2 units · style Ink Harbor · 3 refs");
  });

  it("every plate's prompt carries the style's block in full, and its approved proofs ride along as references - never the pending one", async () => {
    const u = await universe("fl", { styleId: "v1-theme:th-ink", theme: "locked" });
    const { eng, asked } = recorder();
    await liveRun(u, "fl", eng);
    expect(asked).toHaveLength(2);
    for (const req of asked) {
      expect(req.prompt.startsWith(compileStyleBlock(BLOCK))).toBe(true);
      expect(req.references?.map((x) => x.base64)).toEqual(["a1", "a2", "a3"].map((p) => bytesOf(p).toString("base64")));
    }
  });
});

describe("a project with no usable style is drawn in the NAMED default, and says so", () => {
  it("no style bound: the default preset, the miss on the receipt, no references", async () => {
    const u = await universe("fn");
    expect(label(u, "fn")).toBe(`render-plates · 2 units · default style ${DEFAULT.name} · the project has no style of its own`);
    const { eng, asked } = recorder();
    await liveRun(u, "fn", eng);
    for (const req of asked) {
      expect(req.prompt.startsWith(compileStyleBlock(DEFAULT.block))).toBe(true);
      expect(req.references).toBeUndefined();
    }
  });

  it("an imported project whose theme did not come along: `missing`, never another style standing in", async () => {
    const u = await universe("fm", { styleId: "v1-theme:th-gone", theme: "locked" });
    expect(label(u, "fm")).toBe(`render-plates · 2 units · default style ${DEFAULT.name} · its style is not in the style store`);
  });
});

describe("the look is in the receipt's token", () => {
  it("an approval landing between the receipt and its confirm makes the confirm stale; nothing launches", async () => {
    const u = await universe("ft", { styleId: "v1-theme:th-ink", theme: "draft" });
    const r = must(partActReceipt(u.store, ref("ft"), framesUnits, { mode: "dry", now: NOW }));
    expect(r.lines[0]?.label).toContain("3 refs");
    const row = must(readStyle(u.store, "v1-theme:th-ink"));
    must(applyStyleOp(u.store, { styleId: row.style.id, baseRev: row.rev, op: { kind: "judge-proof", proofId: "p1", state: "approved" } }, OP));
    const l = must(launchPartAct(u.store, ref("ft"), framesUnits, { mode: "dry", now: NOW, token: r.token, actor: OP }));
    expect(l.kind).toBe("stale");
    if (l.kind === "stale") expect(l.fresh.lines[0]?.label).toContain("4 refs");
  });
});
