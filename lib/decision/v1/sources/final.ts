import "server-only";

import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { judgeCutIn } from "@gt/kernel/productions/audio";
import { cutsOnBoard, readCut, readProduction } from "@gt/kernel/productions/store";
import type { Store } from "@gt/kernel/store";
import { canonical, sha256Hex } from "@gt/kernel/canonical";

import { kernel } from "../../../kernelStore.ts";
import { packetIdOf } from "../../../ledger/v1/packet.ts";
import type { WeirItem } from "../../../ledger/v1/types.ts";
import { blobOfAddress } from "../../../producers/productionCut.ts";
import { blobRootOf } from "../../../kernelProcess.ts";
import { buildConsequence, committedOutcome, decisionMap, mintPacket, runIdOf, type AdapterRef, type DecisionAdapter, type DecisionsAt, type OpenPlan, type Preview } from "../types.ts";

// A PRODUCTION'S FINAL CUT AS A PACKET (spark concept-casting-stages S5): `pkt:final:<production id>/<cut id>`, one video
// decided in a matrix cull. Keep approves (the production is done); reject, which must name a reason, returns the cut and
// the production stays at cutting.
//
// THE PILE IS KERNEL-NATIVE (./proof.ts, ./spend.ts): the cuts live in the kernel, so the on-board cuts are read beside
// liveNow (app/(studio)/_shell/live.ts) and each carries its packet id, not a ledger Source the sync would walk. That is why
// this source has no row in runs-live.probe.spec.ts `predicates()` or ledger-reconcile.probe.spec.ts `SOURCES`: neither
// walks it. No pile shows a final cut twice: a take is not its own pile, and only a cut on the Board reaches this one.

const REF_RE = /^(prdn:[a-z0-9-]+)\/(cut-\d+)$/;

/** What an apply is, the same operator every Board commit is written as (./proof.ts OPERATOR). */
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const CELL = "final";

export type FinalV1 = { readonly runId: string; readonly productionId: string; readonly cutId: string; readonly title: string; readonly video: string; readonly media: { readonly sha256: string; readonly bytes: number; readonly mime: string }; readonly takes: readonly string[]; readonly format: string };

export type FinalDeps = { readonly store: () => Result<Store> };

export function makeFinalAdapter(deps: FinalDeps): DecisionAdapter<FinalV1> {
  async function read(ref: AdapterRef): Promise<Result<FinalV1>> {
    const m = REF_RE.exec(ref.runId);
    const productionId = m?.[1];
    const cutId = m?.[2];
    if (productionId === undefined || cutId === undefined) return err("invalid", `a final packet is <production>/<cut>, not ${ref.runId}`);
    const s = deps.store();
    if (!s.ok) return s;
    const got = s.value.read((r) => ({ production: readProduction(r, productionId), cut: readCut(r, productionId, cutId) }));
    if (!got.ok) return got;
    const { production: p, cut } = got.value;
    if (p === undefined || cut === undefined) return err("not-found", `production: no ${ref.runId}`);
    if (cut.state !== "on-board" || cut.video === undefined) return err("not-found", `production: ${ref.runId} is ${cut.state}, not waiting on the Board`);
    const media = await blobOfAddress(blobRootOf(s.value), cut.video, "video/mp4");
    if (media === undefined) return err("not-found", `production: ${ref.runId}'s video is not in the blob store`);
    return ok({ runId: ref.runId, productionId, cutId, title: p.title, video: cut.video, media, takes: cut.takes, format: cut.format });
  }

  function packet(v1: FinalV1): Result<OpenPlan> {
    const minted = mintPacket({
      id: packetIdOf("final", v1.runId),
      lane: "video",
      source: "final",
      mode: "matrix-cull",
      state: "open",
      runId: v1.runId,
      title: `${v1.title} · final cut`,
      items: [{ id: CELL, jobId: `production:${v1.productionId}`, media: v1.media, row: CELL, grades: [] }],
    });
    if (!minted.ok) return minted;
    return ok({
      packet: minted.value,
      initial: [],
      present: {
        items: { [CELL]: { label: `${v1.title}, ${v1.cutId}`, meta: `${v1.format} · ${v1.takes.join(", ")}` } },
        rows: [{ id: CELL, label: "final cut" }],
        meta: `${v1.format} · ${v1.productionId}`,
      },
      urls: { [CELL]: v1.video },
      losses: [],
    });
  }

  function consequence(v1: FinalV1, at: DecisionsAt): Result<Preview> {
    const d = decisionMap(at.decisions).get(CELL);
    const writes: Preview["consequence"]["writes"][number][] = [];
    if (d?.verdict === "keep") {
      if (d.by !== "operator") return err("refused", `final cut ${v1.runId}: only an operator approves a final cut`);
      writes.push({ kind: "index-row", target: `production ${v1.productionId}`, candidate: CELL, detail: `approved · the production moves to done (${v1.cutId})` });
    } else if (d?.verdict === "reject") {
      writes.push({ kind: "index-row", target: `production ${v1.productionId}`, candidate: CELL, detail: `returned · the production stays at cutting${d.reasons.length === 0 ? "" : ` (${d.reasons.join(", ")})`}` });
    }
    const v1Digest = sha256Hex(canonical({ source: "final", run: v1.runId, video: v1.media.sha256 }));
    return ok({ v1Digest, consequence: buildConsequence(at, [CELL], { writes }, v1Digest) });
  }

  async function apply(claim: Parameters<DecisionAdapter<FinalV1>["apply"]>[0]): Promise<Result<void>> {
    const done = committedOutcome(claim);
    if (!done.ok) return done;
    const run = runIdOf(claim);
    if (!run.ok) return run;
    const m = REF_RE.exec(run.value);
    const productionId = m?.[1];
    const cutId = m?.[2];
    if (productionId === undefined || cutId === undefined) return err("invalid", `a final packet is <production>/<cut>, not ${run.value}`);
    const s = deps.store();
    if (!s.ok) return s;
    const d = decisionMap(claim.decisions).get(CELL);
    if (d === undefined || d.verdict === null) return ok(undefined);
    if (d.by !== "operator") return err("refused", `final cut ${run.value}: only an operator approves a final cut`);
    const verdict = d.verdict === "keep" ? "approved" : "returned";
    const note = [...d.reasons, ...(d.note === undefined ? [] : [d.note])].join("; ");
    const r = s.value.tx((t) => judgeCutIn(t, productionId, cutId, verdict, OPERATOR, note === "" ? undefined : note));
    return r.ok ? ok(undefined) : r;
  }

  return { source: "final", read, packet, consequence, apply };
}

const liveStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

export const finalAdapter: DecisionAdapter<FinalV1> = makeFinalAdapter({ store: liveStore });

/** The cuts waiting on the Board, as Weir piles. */
export function finalPiles(store: Store): Result<WeirItem[]> {
  return store.read((r): WeirItem[] =>
    cutsOnBoard(r).map(({ productionId, title, cut }) => {
      const runId = `${productionId}/${cut.id}`;
      return { source: "final", id: runId, title: `${title} · final cut`, media: "video", kind: "cull", since: cut.at, decided: 0, pending: 1, href: `/scout/productions?from=${encodeURIComponent(productionId)}`, packetId: packetIdOf("final", runId) };
    }),
  );
}

/** The live store's final-cut piles, for the request's Weir read (app/(studio)/_shell/live.ts). */
export function liveFinalPiles(): Result<WeirItem[]> {
  const s = liveStore();
  return s.ok ? finalPiles(s.value) : s;
}
