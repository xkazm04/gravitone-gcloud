// THE PROOF DECISION SOURCE (lib/decision/v1/sources/proof.ts, Phase 5 L56): a style's PENDING
// proofs, read from the Style table, opened as a matrix cull (a row per trial problem), previewed
// with what the verdicts do to the ratchet, committed through the REAL kernel, and applied as the
// atelier's own `judge-proof` op at the style's revision - one op per verdict, styles.json
// re-exported once. A second delivery writes nothing; a proof the atelier judged otherwise since
// is refused, never overwritten; a LOCKED style is left out, as v1's Board left it out.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PRESETS } from "@gt/catalog/presets";
import { ok } from "@gt/domain/errors";
import { blockDigest } from "@gt/domain/style.ratchet";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";
import { applyStyleOp, readStyle } from "@gt/kernel/styles/driver";
import { draftFromV1Theme, importV1ThemeIn } from "@gt/kernel/styles/v1theme";
import { addProofsIn } from "@gt/kernel/styles/writers";

import { makeProofAdapter, proofPiles } from "../../lib/decision/v1/sources/proof.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const root = mkdtempSync(path.join(tmpdir(), "gt-dv1-proof-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let open: Kernel[] = [];
afterEach(() => {
  for (const k of open) k.close();
  open = [];
});

const OP = { kind: "operator", id: "op" } as const;
const BLOCK = PRESETS[1]?.block;
if (BLOCK === undefined) throw new Error("the catalog needs a second preset");
const DIGEST = blockDigest(BLOCK);
const SHA = (i: number) => i.toString(16).padStart(64, "0");
const day = (d: number) => Date.parse(`2026-09-${String(d).padStart(2, "0")}T10:00:00.000Z`);
const ID = "v1-theme:th-ink";
const blobDir = path.join(root, "blobs");

const proof = (id: string, state: string, trialId: string, d: number) => ({ id, label: `proof ${id}`, state, trialId, blockDigest: DIGEST, createdAt: day(d), model: "nb2", costUsd: 0.039 });
const theme = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id === "th-ink" ? "Ink Harbor" : "Blueprint",
  origin: "preset",
  block: BLOCK,
  elements: [],
  createdAt: 0,
  updatedAt: 0,
  proofs: [proof("a1", "approved", "peak-and-fall", 1), proof("p1", "pending", "wish-list", 2), proof("p2", "pending", "booking-not-meal", 3), proof("p3", "pending", "flywheel", 4), proof("r1", "rejected", "the-exit", 5)],
  ...over,
});

type World = { readonly store: Store; readonly adapter: ReturnType<typeof makeProofAdapter>; readonly exports: () => number };

/** A temp style store holding Ink Harbor (unlocked, three proofs pending) and Blueprint (locked,
 *  with a pending proof of its own), imported the way the importer imports v1 themes. */
function world(): World {
  const k = must(openKernel(path.join(root, `s-${Math.random().toString(36).slice(2)}.sqlite`)));
  open.push(k);
  let i = 0;
  for (const t of [theme("th-ink"), theme("th-blue", { lockedAt: day(6) })]) {
    const d = must(draftFromV1Theme(t, () => ({ sha256: SHA(++i), bytes: 100, mime: "image/png" })));
    must(k.store.tx((tx) => importV1ThemeIn(tx, d, OP)));
  }
  let exported = 0;
  const adapter = makeProofAdapter({ store: () => ok(k.store), exportStyles: () => void exported++ });
  return { store: k.store, adapter, exports: () => exported };
}

const stateOf = (w: World, id: string) => must(readStyle(w.store, ID)).style.proofs.find((p) => p.id === id)?.state;

describe("the pile", () => {
  it("every unlocked style with a proof waiting is one Weir pile, named bare; a locked style is left out", () => {
    const w = world();
    const piles = must(w.store.read(proofPiles));
    expect(piles).toEqual([expect.objectContaining({ source: "proof", id: ID, pending: 3, media: "image", kind: "cull", packetId: `pkt:proof:${ID}`, href: `/library/style/${encodeURIComponent(ID)}` })]);
  });

  it("the bare id resolves to the pile at its cutoff: the pending proofs, a row per trial problem", async () => {
    const w = world();
    const flow = await openFlow(w.adapter, ID, blobDir);
    expect(flow.plan.packet.id).toBe(`pkt:proof:${ID}/${day(4)}`);
    expect(flow.plan.packet.items.map((c) => [c.id, c.row])).toEqual([
      ["p1", "inventory"],
      ["p2", "analogy"],
      ["p3", "mechanism"],
    ]);
    expect(flow.plan.present.meta).toBe(`Ink Harbor · candidate · block ${DIGEST}`);
  });

  it("a locked style's proofs are final, in v1's words", async () => {
    const w = world();
    const r = await w.adapter.read({ runId: "v1-theme:th-blue" });
    expect(r.ok ? "" : r.error.message).toBe("This style is locked; its proofs are final.");
  });

  it("a proof that lands while the pile is open waits for the next pile", async () => {
    const w = world();
    const flow = await openFlow(w.adapter, ID, blobDir);
    must(w.store.tx((t) => addProofsIn(t, ID, [{ id: "late", label: "late", media: { sha256: SHA(99), bytes: 1, mime: "image/png" }, state: "pending", trialId: "the-exit", blockDigest: DIGEST, at: new Date(day(7)).toISOString() }], OP)));
    const again = must(await w.adapter.read({ runId: flow.plan.packet.runId ?? "" }));
    expect(must(w.adapter.packet(again)).packet.items.map((c) => c.id)).toEqual(["p1", "p2", "p3"]);
    const next = must(await w.adapter.read({ runId: ID }));
    expect(next.runId).toBe(`${ID}/${day(7)}`);
  });
});

describe("the preview", () => {
  it("names each verdict, the export, and what the ratchet does: proven, and the lock gate after", async () => {
    const w = world();
    const flow = await openFlow(w.adapter, ID, blobDir);
    flow.patch([
      { candidate: "p1", verdict: "keep" },
      { candidate: "p2", verdict: "keep" },
      { candidate: "p3", verdict: "reject", note: "the arrow reads as decoration" },
    ]);
    const c = must(flow.preview()).consequence;
    expect(c.counts).toEqual({ kept: 2, rejected: 1, undecided: 0 });
    expect(c.writes.map((x) => x.detail)).toEqual(["approved", "approved", "rejected · the arrow reads as decoration", "re-exported from the style store"]);
    expect(c.promotions.map((p) => [p.target, p.detail])).toEqual([
      ["Ink Harbor · proven", "operator keeps in 3 distinct cells"],
      ["Ink Harbor · lock gate", "would admit a lock (3 problems covered)"],
    ]);
  });

  it("a proof the atelier judged otherwise since is a conflict at the preview", async () => {
    const w = world();
    const flow = await openFlow(w.adapter, ID, blobDir);
    flow.patch([{ candidate: "p1", verdict: "keep" }]);
    const row = must(readStyle(w.store, ID));
    must(applyStyleOp(w.store, { styleId: ID, baseRev: row.rev, op: { kind: "judge-proof", proofId: "p1", state: "rejected" } }, OP));
    const p = flow.preview(must(await w.adapter.read({ runId: flow.plan.packet.runId ?? "" })));
    expect(p.ok ? "" : p.error.message).toBe("proof p1 was rejected in the atelier since this pile opened; the commit would overwrite it");
  });
});

describe("the apply: the atelier's judge-proof op, at the style's rev", () => {
  /** Committed through the real kernel; the claim is the one its outbox hands the applier. */
  async function committed(w: World) {
    const flow = await openFlow(w.adapter, ID, blobDir);
    flow.patch([
      { candidate: "p1", verdict: "keep" },
      { candidate: "p2", verdict: "keep" },
      { candidate: "p3", verdict: "reject", note: "the arrow reads as decoration" },
    ]);
    must(flow.commit() as Parameters<typeof must>[0]);
    return flow.claim();
  }

  it("each verdict is one op on the style's log, its evidence appended, the export re-written once", async () => {
    const w = world();
    const before = must(readStyle(w.store, ID));
    must(await w.adapter.apply(await committed(w)));
    const after = must(readStyle(w.store, ID));
    expect(after.rev).toBe(before.rev + 3);
    expect(after.style.status).toBe("proven");
    expect(["p1", "p2", "p3"].map((id) => stateOf(w, id))).toEqual(["approved", "approved", "rejected"]);
    expect(after.style.proofs.find((p) => p.id === "p3")?.note).toBe("the arrow reads as decoration");
    // The imported sheet's history (a1 kept, r1 rejected), then the three verdicts, appended.
    expect(after.style.evidence.filter((e) => e.mechanism === "proof").map((e) => [e.scene, e.verdict])).toEqual([
      ["quantity", "keep"],
      ["flow", "reject"],
      ["inventory", "keep"],
      ["analogy", "keep"],
      ["mechanism", "reject"],
    ]);
    const ops = must(w.store.read((r) => r.all("SELECT kind FROM style_ops WHERE style_id = ? AND rev > ? ORDER BY rev", ID, before.rev))).map((o) => o["kind"]);
    expect(ops).toEqual(["judge-proof", "judge-proof", "judge-proof"]);
    expect(w.exports()).toBe(1);
  });

  it("a second delivery finds its own verdicts and writes nothing - and re-exports, so a failed export heals", async () => {
    const w = world();
    const claim = await committed(w);
    must(await w.adapter.apply(claim));
    const rev = must(readStyle(w.store, ID)).rev;
    must(await w.adapter.apply(claim));
    expect(must(readStyle(w.store, ID)).rev).toBe(rev);
    expect(w.exports()).toBe(2);
  });

  it("a proof the atelier judged otherwise after the commit is refused, never overwritten", async () => {
    const w = world();
    const claim = await committed(w);
    const row = must(readStyle(w.store, ID));
    must(applyStyleOp(w.store, { styleId: ID, baseRev: row.rev, op: { kind: "judge-proof", proofId: "p3", state: "approved" } }, OP));
    const r = await w.adapter.apply(claim);
    expect(r.ok ? "" : `${r.error.code}: ${r.error.message}`).toBe("refused: proof p3 is approved in the atelier; this packet would have it rejected - judge it there");
    expect(stateOf(w, "p3")).toBe("approved");
    // p1 and p2 came before the refused verdict: a refused outcome lands none of itself.
    expect(["p1", "p2"].map((id) => stateOf(w, id))).toEqual(["pending", "pending"]);
    expect(must(readStyle(w.store, ID)).rev).toBe(row.rev + 1);
  });
});
