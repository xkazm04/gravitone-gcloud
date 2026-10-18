import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ok, type Result } from "@gt/domain/errors";
import { blobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { makeRealPart } from "../../app/(studio)/projects/[id]/_part/real.ts";
import { openReadyGates, type GateDeps } from "../../lib/parts/gates.ts";

// F1 of docs/next/architecture-review-2026-10-18.md: the explainer's cut editor derives its verdict
// from strips and voice (fixtureCut.ts), the cut GATE from the frames record (lib/parts/verdict.ts).
// Real side, a temp store, dry: nothing here prices or calls a vendor.

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
const AUTHOR = { by: "operator", surface: "board", who: "op" } as const;
const NOW = Date.parse("2026-10-16T09:00:00Z");
const SHA = "9f2c6a1e0b7d4c3f8a5e2d1c0b9a8f7e6d5c4b3a29180f7e6d5c4b3a2918a0b1";
const ID = "x1";

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

function write(store: Store, key: string, record: object): void {
  const w = writePart(store, { projectId: ID, partId: `${ID}/${key}`, baseRev: "current", act: "land", op: { test: key }, label: key, by: { kind: "machine", id: "test" }, next: () => ok({ [key]: record }) });
  if (!w.ok) throw w.error;
}

const CARDS = ["card-1", "card-2", "card-3"];

function seeded(): { deps: GateDeps; port: ReturnType<typeof makeRealPart>; store: Store } {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-explainer-gate-"));
  dirs.push(dir);
  const k = must(openKernel(path.join(dir, "k.sqlite")));
  open.push(k);
  const store = k.store;
  must(compose(store, { recipe: "explainer" }, OP, { id: ID }));
  const deps: GateDeps = { store: () => ok(store), blobs: () => blobStore(path.join(dir, "blobs")), now: () => NOW };
  write(store, "strips", { cards: CARDS.map((id) => ({ id, section: "s1", title: id, caption: `${id} says one short thing here.`, state: "drawn", blob: { sha256: SHA, bytes: 7, mime: "image/png" } })) });
  const take = (id: string) => ({ id, label: "take 1", at: NOW, seconds: 4, mark: null, engine: { provider: "dry", model: "stand-in", usd: null, unpricedReason: "dry run", seconds: 0, mode: "dry" }, sections: [] });
  write(store, "voice", {
    text: {},
    takes: Object.fromEntries(CARDS.map((c) => [`t-${c}`, take(`t-${c}`)])),
    byLine: Object.fromEntries(CARDS.map((c) => [`line-${c}`, { takeIds: [`t-${c}`], active: `t-${c}` }])),
  });
  return { deps, store, port: makeRealPart({ store: () => ok(store), now: () => NOW, gates: deps }) };
}

describe("the explainer's cut gate on the real side", () => {
  it("opens when the cut editor reads ready", async () => {
    const { deps, port } = seeded();
    const cut = must(await port.loadPart({ projectId: ID, key: "cut" }));
    expect(cut.verdict.state).toBe("ready");
    expect(must(await openReadyGates(deps, ID, AUTHOR))).toEqual([`pkt:step:${ID}/gate:cut`]);
  });

  it("stays shut while a line is not recorded, as the editor says", async () => {
    const { deps, port, store } = seeded();
    write(store, "voice", { text: {}, takes: {}, byLine: {} });
    const cut = must(await port.loadPart({ projectId: ID, key: "cut" }));
    expect(cut.verdict.state).toBe("working");
    expect(must(await openReadyGates(deps, ID, AUTHOR))).toEqual([]);
  });
});
