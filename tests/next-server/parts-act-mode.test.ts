// LIVE IS A NAMED FEW (spark audio-postproduction-research WP2, WP3; explainer-real-article-strips):
// the voice part's `record-line` and `fx-line` and the strips part's `draw-strips` are the only part
// acts whose receipt may read `live`, and only where this process may spend (no GRAVITONE_DRY_ONLY)
// and, for `record-line`, the vendor's key is configured. Every other act of every kind is priced
// and launched `dry` whatever the environment says - real.ts is shared code, and a mistake there
// opens spend for every part. Pinned twice: the pure rule over every act the editors offer, and
// the real side's receipts and confirm over a kernel store. Nothing here confirms a live act.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.hoisted(() => {
  process.env["SPEND_STORE"] = "memory";
});

import { ok, type Result } from "@gt/domain/errors";
import { PART_ACTS, type EditorKind } from "@gt/domain/partView";
import { blobStore } from "@gt/kernel/blob";
import { list } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { actModeOf, LIVE_ACTS } from "../../app/(studio)/projects/[id]/_part/actMode.ts";
import { makeRealPart } from "../../app/(studio)/projects/[id]/_part/real.ts";

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
const NOW = Date.parse("2026-10-24T09:00:00Z");
const KEY = "ELEVENLABS_API_KEY";

async function must<T>(p: Result<T> | Promise<Result<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

function universe(recipe: string, id: string): { store: Store; port: ReturnType<typeof makeRealPart> } {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-act-mode-"));
  dirs.push(dir);
  const k = openKernel(path.join(dir, "k.sqlite"));
  if (!k.ok) throw k.error;
  open.push(k.value);
  const store = k.value.store;
  const c = compose(store, { recipe }, OP, { id });
  if (!c.ok) throw c.error;
  return { store, port: makeRealPart({ store: () => ok(store), now: () => NOW, gates: { store: () => ok(store), blobs: () => blobStore(path.join(dir, "blobs")), now: () => NOW } }) };
}

describe("which act may be priced live", () => {
  it("is the voice part's two acts and the strips draw alone, over every act of every editor kind", () => {
    const live: string[] = [];
    for (const kind of Object.keys(PART_ACTS) as EditorKind[])
      for (const act of PART_ACTS[kind]) if (actModeOf(kind, act, { dryOnly: false, keyed: true }) === "live") live.push(`${kind}:${act}`);
    expect(live.sort()).toEqual(["strips:draw-strips", "voice:fx-line", "voice:record-line"]);
    expect([...LIVE_ACTS].sort()).toEqual(["strips:draw-strips", "voice:fx-line", "voice:record-line"]);
  });

  it("is dry under GRAVITONE_DRY_ONLY, and dry with no vendor key", () => {
    expect(actModeOf("voice", "record-line", { dryOnly: true, keyed: true })).toBe("dry");
    expect(actModeOf("voice", "record-line", { dryOnly: false, keyed: false })).toBe("dry");
    // fx-line speaks nothing: it is live without the vendor key, and dry under GRAVITONE_DRY_ONLY.
    expect(actModeOf("voice", "fx-line", { dryOnly: false, keyed: false })).toBe("live");
    expect(actModeOf("voice", "fx-line", { dryOnly: true, keyed: true })).toBe("dry");
    // draw-strips is a seat turn and a local capture: live without the vendor key, dry under GRAVITONE_DRY_ONLY.
    expect(actModeOf("strips", "draw-strips", { dryOnly: false, keyed: false })).toBe("live");
    expect(actModeOf("strips", "draw-strips", { dryOnly: true, keyed: true })).toBe("dry");
    expect(actModeOf("article", "write-article", { dryOnly: false, keyed: true })).toBe("dry");
  });
});

describe("the real side's receipts and confirm", () => {
  beforeEach(() => {
    process.env[KEY] = "test-key-not-a-real-one";
    delete process.env["GRAVITONE_DRY_ONLY"];
  });
  afterEach(() => {
    delete process.env[KEY];
    delete process.env["GRAVITONE_DRY_ONLY"];
  });

  it("prices the voice act live where this process may spend, and dry where it may not", async () => {
    const { store, port } = universe("explainer", "ex1");
    const cards = [{ id: "card-1", section: "s1", title: "one", caption: "Bitcoin is scarce by design.", state: "drawn" }];
    const w = writePart(store, { projectId: "ex1", partId: "ex1/strips", baseRev: "current", act: "land", op: { seed: "strips" }, label: "strips", by: { kind: "machine", id: "seed" }, next: () => ok({ strips: { cards } }) });
    if (!w.ok) throw w.error;
    const at = { projectId: "ex1", key: "voice", act: "record-line" as const, target: "line-card-1" };
    const live = await must(port.actReceipt(at));
    expect(live.mode).toBe("live");
    expect(live.lines[0]).toMatchObject({ lane: "cloud.elevenlabs", label: "record-line line-card-1 · 1 unit" });
    process.env["GRAVITONE_DRY_ONLY"] = "1";
    expect((await must(port.actReceipt(at))).mode).toBe("dry");
    delete process.env["GRAVITONE_DRY_ONLY"];
    delete process.env[KEY];
    expect((await must(port.actReceipt(at))).mode).toBe("dry");
  });

  it("prices and launches every other act dry, with the key set and live allowed", async () => {
    const { store, port } = universe("film/ad-social-15", "ad1");
    let rev = 1;
    for (const [field, value] of [["product", "Rainshell"], ["proposition", "It keeps you dry."], ["cta", "Pack one today"]] as const) {
      const r = await must(port.opPart({ projectId: "ad1", key: "research", baseRev: rev, op: { op: "set-brief", field, value } }));
      if (r.kind !== "applied") throw new Error("conflict");
      rev = r.view.rev;
    }
    const receipt = await must(port.actReceipt({ projectId: "ad1", key: "research", act: "generate-ideas" }));
    expect(receipt.mode).toBe("dry");
    // A launch in another mode than its receipt would answer `stale` (the mode is in the token).
    const launched = await must(port.act({ projectId: "ad1", key: "research", act: "generate-ideas", token: receipt.token }));
    expect(launched.kind).toBe("launched");
    const jobs = await must(list(store));
    expect(jobs.map((j) => j.mode.kind)).toEqual(["dry"]);
  });
});
