import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ok, type Result } from "@gt/domain/errors";
import type { PartView } from "@gt/domain/partView";
import { blobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";

import { fixtureSource } from "../../lib/notebook/source.ts";
import type { Store } from "@gt/kernel/store";

import { makeRealPart } from "../../app/(studio)/projects/[id]/_part/real.ts";

// THE REAL PART SIDE (L36) end to end over a kernel store: L38's PartPort verbs, answered from
// part records + the op log, with L38's per-kind intelligence called on this project's records.

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

function universe(recipe: string, id: string): { store: Store; port: ReturnType<typeof makeRealPart> } {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-parts-"));
  dirs.push(dir);
  const k = openKernel(path.join(dir, "k.sqlite"));
  if (!k.ok) throw k.error;
  open.push(k.value);
  const store = k.value.store;
  const c = compose(store, { recipe }, OP, { id });
  if (!c.ok) throw c.error;
  return { store, port: portOn(store, dir) };
}
const portOn = (store: Store, dir: string) => makeRealPart({ store: () => ok(store), now: () => NOW, gates: { store: () => ok(store), blobs: () => blobStore(path.join(dir, "blobs")), now: () => NOW } });

/** A ServerPart verb answers a Result or a promise of one (L37's async act); a test awaits both. */
async function must<T>(p: Result<T> | Promise<Result<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}
type Applied = { kind: "applied"; view: PartView } | { kind: "conflict"; current: PartView };
const applied = async (r: Result<Applied> | Promise<Result<Applied>>): Promise<PartView> => {
  const o = await must(r);
  if (o.kind !== "applied") throw new Error("expected applied, got conflict");
  return o.view;
};

describe("an ads project's research and script, over the kernel", () => {
  it("edits the brief at its rev, answers a stale base with the view as it is, and undoes by append", async () => {
    const { port } = universe("film/ad-social-15", "ad1");
    const v0 = await must(port.loadPart({ projectId: "ad1", key: "research" }));
    expect(v0).toMatchObject({ kind: "research", rev: 1, data: { face: "ads", missing: ["product", "proposition", "cta"] }, verdict: { state: "empty" } });
    const v1 = await applied(port.opPart({ projectId: "ad1", key: "research", baseRev: 1, op: { op: "set-brief", field: "product", value: "Rainshell" } }));
    expect(v1.rev).toBe(2);
    expect(v1.ops.map((o) => o.label)).toEqual(["brief product"]);
    const stale = await must(port.opPart({ projectId: "ad1", key: "research", baseRev: 1, op: { op: "set-brief", field: "cta", value: "Buy" } }));
    expect(stale.kind).toBe("conflict");
    expect(stale.kind === "conflict" ? stale.current.rev : 0).toBe(2);
    const undone = await applied(port.undoPart({ projectId: "ad1", key: "research", baseRev: 2 }));
    expect(undone.data).toMatchObject({ face: "ads", brief: { product: "" } });
    expect(undone.ops).toEqual([]);
    expect(undone.rev).toBe(3);
  });

  it("prices an act first, refuses a stale token with the fresh receipt, lands a dry run, and reaches READY by picks", async () => {
    const { port } = universe("film/ad-social-15", "ad1");
    let rev = 1;
    for (const [field, value] of [["product", "Rainshell — a packable rain jacket"], ["proposition", "This jacket keeps you dry in a downpour."], ["cta", "Pack one today"]] as const) {
      rev = (await applied(port.opPart({ projectId: "ad1", key: "research", baseRev: rev, op: { op: "set-brief", field, value } }))).rev;
    }
    const receipt = await must(port.actReceipt({ projectId: "ad1", key: "research", act: "generate-ideas" }));
    expect(receipt).toMatchObject({ mode: "dry", subject: { kind: "part", partId: "ad1/research", rev } });
    rev = (await applied(port.opPart({ projectId: "ad1", key: "research", baseRev: rev, op: { op: "set-brief", field: "tone", value: "deadpan" } }))).rev;
    const stale = await must(port.act({ projectId: "ad1", key: "research", act: "generate-ideas", token: receipt.token }));
    expect(stale.kind).toBe("stale");
    const fresh = await must(port.actReceipt({ projectId: "ad1", key: "research", act: "generate-ideas" }));
    const launched = await must(port.act({ projectId: "ad1", key: "research", act: "generate-ideas", token: fresh.token }));
    expect(launched.kind).toBe("launched");
    const view = launched.kind === "launched" ? launched.view : v0Never();
    if (view.kind !== "research" || view.data.face !== "ads") throw new Error("not the ads face");
    expect(view.data.ideas.length).toBeGreaterThan(0);
    expect(view.ops.map((o) => o.label)).not.toContain("generate-ideas");
    const idea = view.data.ideas[0]?.id ?? "";
    const picked = await applied(port.opPart({ projectId: "ad1", key: "research", baseRev: view.rev, op: { op: "pick-idea", ideaId: idea } }));
    expect(picked.verdict).toMatchObject({ state: "ready", codes: [{ code: "idea-picked" }] });
    const script = await must(port.loadPart({ projectId: "ad1", key: "script" }));
    expect(script.upstream.missing).toEqual([]);
    const sr = await must(port.actReceipt({ projectId: "ad1", key: "script", act: "generate-scenarios" }));
    const sl = await must(port.act({ projectId: "ad1", key: "script", act: "generate-scenarios", token: sr.token }));
    const sv = sl.kind === "launched" ? sl.view : v0Never();
    if (sv.kind !== "script" || sv.data.face !== "ads") throw new Error("not the ads script");
    const pick = await applied(port.opPart({ projectId: "ad1", key: "script", baseRev: sv.rev, op: { op: "pick-scenario", scenarioId: sv.data.scenarios[0]?.id ?? "" } }));
    expect(pick.verdict.state).toBe("ready");
    expect(pick.tabs.find((t) => t.key === "research")?.verdict).toBe("ready");
  });

  it("refuses an op of another kind's editor, and a key with no editor", async () => {
    const { port } = universe("film/ad-social-15", "ad1");
    const wrong = await port.opPart({ projectId: "ad1", key: "research", baseRev: 1, op: { op: "pick-scenario", scenarioId: "x" } });
    expect(wrong.ok ? "" : wrong.error.code).toBe("invalid");
    const none = await port.loadPart({ projectId: "ad1", key: "gate:frames" });
    expect(none.ok ? "" : none.error.code).toBe("not-found");
  });
});

describe("a notebook scope survives a reload (the stored digest, not a recomputed one)", () => {
  it("confirms a scope on the dry run's notebook, and a fresh port still reads it confirmed", async () => {
    const { store, port } = universe("film/short-educational-video", "why-bitcoin");
    const r = await must(port.actReceipt({ projectId: "why-bitcoin", key: "research", act: "run-research" }));
    const ran = await must(port.act({ projectId: "why-bitcoin", key: "research", act: "run-research", token: r.token }));
    const v = ran.kind === "launched" ? ran.view : v0Never();
    if (v.kind !== "research" || v.data.face !== "notebook") throw new Error("not the notebook face");
    const card = v.data.cards.find((c) => c.scope === "in" && !c.required)?.id ?? "";
    const d = await applied(port.opPart({ projectId: "why-bitcoin", key: "research", baseRev: v.rev, op: { op: "descope", cardId: card } }));
    const c = await applied(port.opPart({ projectId: "why-bitcoin", key: "research", baseRev: d.rev, op: { op: "confirm-scope" } }));
    expect(c.verdict.state).toBe("ready");
    const again = await must(portOn(store, path.dirname(store.location)).loadPart({ projectId: "why-bitcoin", key: "research" }));
    expect(again.verdict).toMatchObject({ state: "ready", codes: [{ code: "scope-confirmed" }] });
    if (again.kind !== "research" || again.data.face !== "notebook") throw new Error("not the notebook face");
    expect(again.data.cards.find((x) => x.id === card)?.scope).toBe("descoped");
  });
});

describe("a scope decided on the notebook's own digest is not orphaned by storage", () => {
  it("keeps v1's digest (computed over v1's key order) across the canonical store", async () => {
    const { store, port } = universe("film/short-educational-video", "imported");
    const src = fixtureSource();
    const nb = { topic: "why bitcoin", notebook: src.notebook, engine: null, source: { kind: src.kind, conclusions: src.conclusions, dimensions: src.dimensions, tags: src.tags, digest: src.digest } };
    await must(writePart(store, { projectId: "imported", partId: "imported/research", baseRev: "current", act: "land", op: { import: "v1" }, label: "import", by: { kind: "machine", id: "import" }, next: () => ok({ "research-notebook": nb, "research-scope": { scope: {}, confirmed: {}, digest: src.digest } }) }));
    const v = await must(port.loadPart({ projectId: "imported", key: "research" }));
    expect(v.verdict).toMatchObject({ state: "ready", codes: [{ code: "scope-confirmed" }] });
  });
});

describe("a gate that throws after an edit", () => {
  // The edit's gate check runs after the answer (real.ts `kick`): a throw inside it is the
  // part-gates log line, never an unhandled rejection in the server process.
  it("is logged, and the edit still answers applied", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gt-parts-"));
    dirs.push(dir);
    const k = openKernel(path.join(dir, "k.sqlite"));
    if (!k.ok) throw k.error;
    open.push(k.value);
    const store = k.value.store;
    const c = compose(store, { recipe: "film/ad-social-15" }, OP, { id: "ad1" });
    if (!c.ok) throw c.error;
    const gone = (): never => {
      throw new Error("clock gone");
    };
    const port = makeRealPart({ store: () => ok(store), now: () => NOW, gates: { store: () => ok(store), blobs: () => blobStore(path.join(dir, "blobs")), now: gone } });
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown): void => void unhandled.push(e);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    process.on("unhandledRejection", onUnhandled);
    try {
      const v = await applied(port.opPart({ projectId: "ad1", key: "research", baseRev: 1, op: { op: "set-brief", field: "product", value: "Rainshell" } }));
      expect(v.rev).toBe(2);
      await new Promise((res) => setTimeout(res, 50));
      expect(unhandled).toEqual([]);
      expect(logged.mock.calls.map((a) => String(a[0]))).toContain("[part-gates] ad1: clock gone");
    } finally {
      process.off("unhandledRejection", onUnhandled);
      logged.mockRestore();
    }
  });
});

function v0Never(): never {
  throw new Error("expected a launched act");
}
