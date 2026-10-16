import "server-only";

import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { PartVerdict } from "@gt/domain/partView";
import type { PlanView } from "@gt/domain/produce";
import { STEP_RECORDS, type StepKey } from "@gt/domain/steps/registry";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import { canonical } from "@gt/kernel/canonical";
import { openPacket, type Author } from "@gt/kernel/decision/driver";
import { readPartIn } from "@gt/kernel/parts/driver";
import { releaseAfterGate, stepPacketId } from "@gt/kernel/parts/gates";
import type { Store } from "@gt/kernel/store";

import { kernel } from "@/lib/kernelStore";
import { OUT_DIRNAME } from "@/lib/fixtures/mode";
import { buildConsequence, committedOutcome, mintPacket, v1DigestOf, type DecisionAdapter, type OpenPlan } from "@/lib/decision/v1/types";

import { projectRead, verdictInput } from "./context.ts";
import { isGateKind, partVerdict, type GateKind } from "./verdict.ts";

// THE STEP GATES AS BOARD PACKETS (COMMON decision 10, STEPS-DESIGN §0.2) - v1's per-step
// sign-off, proof and adoption, deferred from Phase 3 (the registry named `step` "not decidable:
// kept in browser IndexedDB"). A gate part opens ONE packet, `pkt:step:<gatePartId>`, when the
// part it judges says READY (./verdict.ts); the operator decides it at the Board like any pile;
// its commit is what ratifies the gate (the plan reads the packet, @gt/kernel/parts/gates) and its
// apply releases what the plan held behind it (`releaseHeld`).
//
// What v1 had: a "Lock step" button (lib/projects.ts signOff) whose only blocker was "not empty,
// not blocked", while three of six steps could not reach a defined finish at all and two wrote
// `done` on mount (INVENTORY §7.3). Here a gate cannot open on a part that is not READY, and a
// commit over a part that moved since its preview is refused (the consequence token carries the
// digest of the part's records - hitl-approval: the approval binds to what was shown).
//
// The candidates are what the gate judges: frames -> each plate (its own blob); score -> each
// cue with the take it uses; cut -> the cut with its finish line. A cue or a cut is a small JSON
// document put in the blob store, so a Candidate's media stays a content address.
//
// DEVIATION (recorded): the brief's desk modes (frames matrix-cull, score pick) are not open to
// a `step` packet - @gt/domain/source allows `step` packet-review only, and widening it is the
// Director's one line (`step: { modes: ["packet-review", "matrix-cull"] ... }`). Until then every
// gate is a packet review whose items are those candidates; a verdict per item is kept in the
// decision log, and only the commit moves the plan.

export type GateDeps = {
  readonly store: () => Result<Store>;
  readonly blobs: (store: Store) => BlobStore;
  readonly now: () => number;
};

const blobRoot = (store: Store): string => (store.location === ":memory:" ? path.resolve(OUT_DIRNAME, "blobs") : path.join(path.dirname(store.location), "blobs"));

export const LIVE_GATES: GateDeps = {
  store: () => {
    const k = kernel();
    return k.ok ? ok(k.value.store) : k;
  },
  blobs: (store) => blobStore(blobRoot(store)),
  now: () => Date.now(),
};

type ItemSpec = { readonly id: string; readonly label: string; readonly meta?: string; readonly media?: BlobRef; readonly doc?: unknown };

export type StepV1 = {
  readonly projectId: string;
  readonly gatePartId: string;
  readonly judgedPartId: string;
  readonly kind: GateKind;
  readonly title: string;
  readonly verdict: PartVerdict;
  readonly jobId: string;
  readonly items: readonly (ItemSpec & { readonly media: BlobRef })[];
  /** The digest of the judged part's records: what the preview and the commit bind to. */
  readonly digest: string;
};

const LANE: Readonly<Record<GateKind, "image" | "audio" | "video">> = { frames: "image", motion: "video", score: "audio", cut: "video" };

function specsOf(kind: GateKind, records: ReadonlyMap<string, Readonly<Record<string, unknown>>>, verdict: PartVerdict): ItemSpec[] {
  const get = (key: StepKey) => records.get(key);
  const list = (x: unknown): readonly unknown[] => (Array.isArray(x) ? x : []);
  const str = (o: unknown, k: string): string | undefined => (typeof o === "object" && o !== null && k in o && typeof (o as Record<string, unknown>)[k] === "string" ? String((o as Record<string, unknown>)[k]) : undefined);
  if (kind === "frames") {
    const units = list(get("frames")?.["units"]);
    if (units.length > 0)
      return units.map((u) => {
        const plate = typeof u === "object" && u !== null && "plate" in u ? u.plate : undefined;
        const blob = STEP_RECORDS.frames.schema.shape.units.element.shape.plate.safeParse(plate);
        const id = str(u, "id") ?? "unit";
        return { id, label: str(u, "title") ?? id, ...(blob.success && blob.data.blob !== undefined ? { media: blob.data.blob } : { doc: { unit: id, plate } }) };
      });
    return [{ id: "frames", label: "frames", doc: { ads: get("ads-shots") ?? null } }];
  }
  if (kind === "score") {
    const spots = list(get("score")?.["spots"]);
    if (spots.length > 0) return spots.map((s) => ({ id: str(s, "id") ?? "cue", label: str(s, "title") ?? "cue", ...(str(s, "activeTakeId") === undefined ? {} : { meta: str(s, "activeTakeId") }), doc: s }));
    return [{ id: "bed", label: "bed", doc: get("ads-score") ?? null }];
  }
  return [{ id: kind, label: kind, meta: verdict.codes.map((c) => c.text).join(" · "), doc: { [kind]: get(kind === "cut" ? "cut" : "motion-direction") ?? null, finish: get("ads-finish") ?? null, verdict } }];
}

const json = (doc: unknown): Uint8Array => new TextEncoder().encode(canonical(doc));

/** The gate part, the part it judges and its verdict, read now, with its candidates in the blob store. */
export async function readGate(deps: GateDeps, gatePartId: string): Promise<Result<StepV1>> {
  const s = deps.store();
  if (!s.ok) return s;
  const store = s.value;
  const now = deps.now();
  const read = store.read((r) => {
    const row = r.get("SELECT project_id FROM parts WHERE part_id = ?", gatePartId);
    if (row === undefined) return err("not-found", `no gate part ${gatePartId}`);
    const projectId = String(row["project_id"]);
    const pr = projectRead(r, projectId, now);
    const gate = pr.plan.parts.find((p) => p.id === gatePartId);
    if (gate === undefined || gate.kind !== "gate" || !("judges" in gate) || gate.judges === undefined) return err("invalid", `${gatePartId} is not a gate part`);
    const judged = pr.plan.parts.find((p) => p.id === gate.judges);
    if (judged === undefined || !isGateKind(judged.kind))
      return err("refused", `the gate of a ${judged?.kind ?? "missing"} part opens from its producer's own packet, not a step packet`);
    const kind = judged.kind;
    const snap = readPartIn(r, { projectId, partId: judged.id });
    const verdict = partVerdict(kind, verdictInput(pr, snap));
    const owned = [...snap.records].filter(([k]) => STEP_RECORDS[k as StepKey]?.owner === kind);
    return ok({ projectId, plan: pr.plan, judgedPartId: judged.id, kind, verdict, specs: specsOf(kind, snap.records, verdict), digest: v1DigestOf({ kind, records: owned, verdict }), jobId: "jobId" in judged && judged.jobId !== undefined ? judged.jobId : `job:part:${judged.id}` });
  });
  if (!read.ok) return read;
  if (!read.value.ok) return read.value;
  const g = read.value.value;
  const blobs = deps.blobs(store);
  const items: (ItemSpec & { media: BlobRef })[] = [];
  for (const spec of g.specs) {
    if (spec.media !== undefined) {
      items.push({ ...spec, media: spec.media });
      continue;
    }
    const put = await blobs.put(json(spec.doc ?? null), "application/json");
    if (!put.ok) return put;
    items.push({ ...spec, media: put.value });
  }
  return ok({ projectId: g.projectId, gatePartId, judgedPartId: g.judgedPartId, kind: g.kind, title: titleOf(g.plan, g.kind), verdict: g.verdict, jobId: g.jobId, items, digest: g.digest });
}

const titleOf = (plan: PlanView, kind: GateKind): string => `${plan.project.title} · ${kind}`;
const textOf = (v: PartVerdict): string => v.codes.map((c) => c.text).join(" · ");

/** The packet a READY part opens; refused, with the verdict's own words, when it is not ready. */
export function gatePacket(v1: StepV1): Result<OpenPlan> {
  if (v1.verdict.state !== "ready") return err("refused", `${v1.kind} is ${v1.verdict.state}: ${textOf(v1.verdict)}`);
  const packet = mintPacket({
    id: stepPacketId(v1.gatePartId),
    lane: LANE[v1.kind],
    source: "step",
    mode: "packet-review",
    state: "open",
    partId: v1.gatePartId,
    title: v1.title,
    items: v1.items.map((i) => ({ id: i.id, jobId: v1.jobId, media: i.media, grades: [] })),
  });
  if (!packet.ok) return packet;
  return ok({
    packet: packet.value,
    initial: [],
    present: {
      items: Object.fromEntries(v1.items.map((i) => [i.id, { label: i.label, ...(i.meta === undefined ? {} : { meta: i.meta }) }])),
      rows: [],
      meta: v1.title,
      oracle: { passed: true, summary: textOf(v1.verdict), digest: v1.digest },
    },
    urls: {},
    losses: [],
  });
}

export function makeStepAdapter(deps: GateDeps): DecisionAdapter<StepV1> {
  return {
    source: "step",
    read: (ref) => readGate(deps, ref.runId),
    packet: gatePacket,
    // A part that is no longer READY, or whose records moved since the preview, cannot be ratified
    // by it: the digest is in the token, so the commit is refused as a stale preview.
    consequence: (v1, at) => (v1.verdict.state === "ready" ? ok({ consequence: buildConsequence(at, v1.items.map((i) => i.id), {}, v1.digest), v1Digest: v1.digest }) : err("refused", `${v1.kind} is ${v1.verdict.state}: ${textOf(v1.verdict)}`)),
    // The commit IS the ratification (the plan reads the packet); what is left to deliver is the
    // release of the jobs the plan held behind the gate. Idempotent: a released job is not planned.
    // A returned review delivers nothing: the gate reads failed and the part is reworked.
    async apply(claim) {
      if (claim.outcome.act === "return") return ok(undefined);
      const c = committedOutcome(claim);
      if (!c.ok) return c;
      const s = deps.store();
      if (!s.ok) return s;
      const row = s.value.read((r) => r.get("SELECT project_id FROM parts WHERE part_id = ?", claim.packet.partId ?? ""));
      if (!row.ok) return row;
      if (row.value === undefined) return err("not-found", `packet ${claim.packetId} names no part of a project`);
      const actor: Actor = { kind: "machine", id: claim.holder };
      const released = releaseAfterGate(s.value, String(row.value["project_id"]), actor, deps.now());
      return released.ok ? ok(undefined) : released;
    },
  };
}

export const stepAdapter = makeStepAdapter(LIVE_GATES);

/**
 * Open the packet of every gate in the project whose judged part is READY and has none yet. The
 * real part side kicks this after a write (the Board lists what the kernel holds); idempotent by
 * packet id, so a second kick is a no-op. Returns the packets opened now.
 */
export async function openReadyGates(deps: GateDeps, projectId: string, author: Author): Promise<Result<string[]>> {
  const s = deps.store();
  if (!s.ok) return s;
  const store = s.value;
  const gates = store.read((r) =>
    r
      .all("SELECT part_id FROM parts WHERE project_id = ? ORDER BY ord", projectId)
      .map((x) => String(x["part_id"]))
      .filter((id) => id.slice(projectId.length + 1).startsWith("gate:") && r.get("SELECT 1 AS x FROM packets WHERE id = ?", stepPacketId(id)) === undefined),
  );
  if (!gates.ok) return gates;
  const opened: string[] = [];
  for (const gateId of gates.value) {
    const v1 = await readGate(deps, gateId);
    if (!v1.ok) {
      if (v1.error.code === "refused") continue;
      return v1;
    }
    const plan = gatePacket(v1.value);
    if (!plan.ok) continue;
    const o = store.tx((t) => openPacket(t, { packet: plan.value.packet }, author));
    if (!o.ok) return o;
    opened.push(o.value.id);
  }
  return ok(opened);
}
