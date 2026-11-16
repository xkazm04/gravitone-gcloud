// A FILM WITH A HELD TAKE EXPORTS ON THE SERVER (lib/cut/deriveTimeline.ts, lib/producers/cut.ts `framesDocument`).
// deriveTimeline built a held take's URL with lib/sound/client `takeFileUrl`, a "use client" export: on
// the server a client reference that throws when called, so the export step failed for every film
// whose Score had a take in the sound store. lib/parts/verdict.ts and fixtureCut.ts routed around it by
// never passing a store listing; the producer does pass one. The reference is stood in below as it is in
// parts-verdict-server.test.ts; the sound store is a stub that holds take `t1` and nothing else.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../lib/sound/client.ts", () => ({
  takeFileUrl: (id: string) => {
    if (typeof window === "undefined") throw new Error("Attempted to call takeFileUrl() from the server but takeFileUrl is on the client.");
    return `BROWSER-URL:${id}`;
  },
}));
vi.mock("../../lib/sound/takes.ts", () => ({
  getTake: async (id: string) => {
    if (id !== "t1") throw new Error(`no take ${id}`);
    return { id };
  },
}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-cut-held-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "k.sqlite");
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  return dir;
});

import { rmSync } from "node:fs";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import { ok, type Result } from "@gt/domain/errors";
import { blobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPart, writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { deriveTimeline } from "../../lib/cut/deriveTimeline.ts";
import { takeFileHref } from "../../lib/sound/takeHref.ts";
import { cutProducer, cutUnits } from "../../lib/producers/cut.ts";
import { blobRootOf, driveStep, launchPartAct, partActReceipt } from "../../lib/producers/research.ts";

const OP = { kind: "operator", id: "op" } as const;
const NOW = Date.parse("2026-11-08T09:00:00Z");
let kernel: Kernel | undefined;
afterAll(() => {
  kernel?.close();
  rmSync(ROOT, { recursive: true, force: true });
});

function store(): Store {
  if (kernel === undefined) {
    const k = openKernel(path.join(ROOT, "k.sqlite"));
    if (!k.ok) throw k.error;
    kernel = k.value;
  }
  return kernel.store;
}
function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}
const unit = (id: string, startS: number, blob: BlobRef) => ({ id, sourceId: "r", beatRef: { at: `0:${String(startS).padStart(2, "0")}`, beatId: id }, ordinal: 1, ofBeat: 1, startS, holdS: 10, kind: "shot", beatKind: "hook", title: id, line: "", plate: { state: "ready", blob }, clip: { status: "not-started", motion: "" }, elements: [], texts: [] });
function land(projectId: string, part: string, recs: Record<string, unknown>): void {
  must(writePart(store(), { projectId, partId: `${projectId}/${part}`, baseRev: "current", act: "land", op: { seed: part }, label: "seed", by: { kind: "machine", id: "seed" }, next: () => ok(recs) }));
}

const SPOT = { id: "c1", title: "bed", sceneIds: ["u1", "u2"], note: "", activeTakeId: "t1", takeIds: ["t1"] };

describe("a film with a held take, on the server path", () => {
  it("exports: the document is built, the export is booked, the held take rides as a take", async () => {
    must(compose(store(), { recipe: "film/trailer" }, OP, { id: "h1" }));
    const blob = must(await blobStore(blobRootOf(store())).put(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]), "image/png"));
    land("h1", "frames", { frames: { units: [unit("u1", 0, blob), unit("u2", 10, blob)], renderId: "r" } });
    land("h1", "score", { score: { spots: [SPOT] } });
    const ref = { projectId: "h1", partId: "h1/cut", act: "export-animatic" };
    const r = must(partActReceipt(store(), ref, cutUnits, { mode: "dry", now: NOW }));
    const l = must(launchPartAct(store(), ref, cutUnits, { mode: "dry", now: NOW, token: r.token, actor: OP, dryOnly: false }));
    if (l.kind !== "launched") throw new Error("stale");
    const report = must(await driveStep((lane, h) => cutProducer(lane, h), store(), l.jobId, { dryOnly: true }));
    expect(report.job?.error?.message).toBeUndefined();
    expect(report.outcome).toBe("done");
    const ex = (readPart(store(), { projectId: "h1", partId: "h1/cut" }).ok ? must(readPart(store(), { projectId: "h1", partId: "h1/cut" })).records.get("cut")?.["exports"] : []) as unknown[];
    expect(ex).toHaveLength(1);
  });

  it("deriveTimeline: on the server a held take's src is the route href, not the client function's", () => {
    const blob = { sha256: "a".repeat(64), bytes: 1, mime: "image/png" };
    const cut = deriveTimeline({ projectId: "h1", project: { title: "T", logline: "", targetS: 20 }, units: [unit("u1", 0, blob), unit("u2", 10, blob)] as never, spots: [SPOT] as never, storeTakeIds: new Set(["t1"]) });
    const music = cut.clips.find((c) => c.track === "music");
    expect(music?.status).toBe("ok");
    expect(music?.src).toBe(takeFileHref("t1"));
  });

  it("deriveTimeline: in a browser the URL still comes through the client door (credential and all)", () => {
    vi.stubGlobal("window", {});
    try {
      const blob = { sha256: "a".repeat(64), bytes: 1, mime: "image/png" };
      const cut = deriveTimeline({ projectId: "h1", project: { title: "T", logline: "", targetS: 20 }, units: [unit("u1", 0, blob), unit("u2", 10, blob)] as never, spots: [SPOT] as never, storeTakeIds: new Set(["t1"]) });
      expect(cut.clips.find((c) => c.track === "music")?.src).toBe("BROWSER-URL:t1");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
