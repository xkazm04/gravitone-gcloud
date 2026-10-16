import "server-only";

import path from "node:path";

import { blobRefSchema, type BlobRef } from "@gt/domain/blob";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Decision } from "@gt/domain/decision";
import type { PacketMode } from "@gt/domain/packet";
import type { PartVerdict } from "@gt/domain/partView";
import type { PlanView } from "@gt/domain/produce";
import { STEP_RECORDS, type StepKey } from "@gt/domain/steps/registry";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import { canonical } from "@gt/kernel/canonical";
import { committedResult } from "@gt/kernel/decision/commit";
import { openPacket, type Author } from "@gt/kernel/decision/driver";
import { readPartIn, writePart } from "@gt/kernel/parts/driver";
import { releaseAfterGate, stepPacketId } from "@gt/kernel/parts/gates";
import type { Reader, Store } from "@gt/kernel/store";

import { kernel } from "@/lib/kernelStore";
import { OUT_DIRNAME } from "@/lib/fixtures/mode";
import { buildConsequence, committedOutcome, decisionMap, mintPacket, v1DigestOf, type DecisionAdapter, type OpenPlan } from "@/lib/decision/v1/types";

import { projectRead, verdictInput } from "./context.ts";
import { isGateKind, partVerdict, type GateKind } from "./verdict.ts";

// THE STEP GATES AS BOARD PACKETS (COMMON decision 10, STEPS-DESIGN §0.2) - v1's per-step sign-off
// (a "Lock step" button blocked only by "empty/blocked", lib/projects.ts signOff, INVENTORY §7.3).
// A gate opens a packet when the part it judges is READY (./verdict.ts); its commit ratifies the
// gate (the plan reads the packet) and its apply releases what the plan held (`releaseHeld`). A
// commit over records that moved since its preview is refused (hitl-approval: the token binds them).
// THE DESK PER KIND (L39; @gt/domain/source now lets `step` be culled):
//   frames  a MATRIX CULL, one candidate per plate. The apply marks a REJECTED plate `rejected` in
//           the frames record (`cullNext`: its pixels leave the cut, a re-render is owed), so the
//           frames verdict leaves READY by itself;
//   score   a PICK: rows are cues, candidates their takes, ONE keep per row (a second is refused
//           at the preview, the cue named); the kept take becomes the cue's take in use;
//   motion, cut   a packet review, as L36 had every gate.
// A cull RATIFIES only when every row holds exactly one keep (`ratifies`); one with a reject is a
// failed attempt, like a returned review. ATTEMPTS (Director's ruling): a failed attempt is final,
// so the gate reopens on the next READY as a NEW packet, `pkt:step:<gate>#<n>` (attempt 1 keeps
// L36's id). DEVIATION until the Director lands the kernel line: @gt/kernel/parts/gates
// `gatePacketFact` reads attempt 1 only and any commit as ratified, so the PLAN shows a failed
// cull ratified; the release here already follows `ratifies`. The kernel patch is in L39's report.

export type GateDeps = { readonly store: () => Result<Store>; readonly blobs: (store: Store) => BlobStore; readonly now: () => number };

/** Where a store's blobs live: beside its file (an in-memory store uses the fixtures' out dir). */
export const blobRootOf = (store: Store): string => (store.location === ":memory:" ? path.resolve(OUT_DIRNAME, "blobs") : path.join(path.dirname(store.location), "blobs"));

export const LIVE_GATES: GateDeps = {
  store: () => {
    const k = kernel();
    return k.ok ? ok(k.value.store) : k;
  },
  blobs: (store) => blobStore(blobRootOf(store)),
  now: () => Date.now(),
};

/** A blob as the browser fetches it (app/api/blob/[sha]); the type is the ref's. A ROUTE address,
 *  not an object URL: this runs on the server, where there is no document to own one, and the
 *  name says so because `blobUrl` is this repo's object-URL minter (lib/musicClient.ts), whose
 *  callers owe a `revokeObjectURL` (tests/golden-path/object-url-ownership.probe.spec.ts). */
export const blobRouteUrl = (b: BlobRef): string => `/api/blob/${b.sha256}?type=${encodeURIComponent(b.mime)}`;

/* ── attempts ─────────────────────────────────────────────────────────────── */

/** Attempt 1 is L36's id; every later attempt is a new packet named by its number. */
export const attemptPacketId = (gatePartId: string, attempt: number): string => (attempt <= 1 ? stepPacketId(gatePartId) : `${stepPacketId(gatePartId)}#${attempt}`);

/** A packet's run ref (`<gatePartId>[#n]`, what the Board hands the adapter) split. */
export function splitAttempt(ref: string): { readonly gatePartId: string; readonly attempt: number } {
  const m = /^(.*)#(\d+)$/.exec(ref);
  return m === null ? { gatePartId: ref, attempt: 1 } : { gatePartId: m[1] ?? ref, attempt: Math.max(1, Number(m[2])) };
}

/** Did this committed cull ratify? Every row (a candidate with no row is a row of its own) holds exactly one keep. */
export function ratifies(r: Reader, packetId: string): boolean {
  const res = committedResult(r, packetId);
  if (res === undefined || !res.ok) return false;
  const kept = new Set<string>(res.value.kept);
  const rows = new Map<string, number>();
  for (const it of r.all("SELECT candidate_id, row FROM packet_items WHERE packet_id = ?", packetId)) {
    const id = String(it["candidate_id"]);
    const row = it["row"] === null || it["row"] === undefined ? `#${id}` : String(it["row"]);
    rows.set(row, (rows.get(row) ?? 0) + (kept.has(id) ? 1 : 0));
  }
  return rows.size > 0 && [...rows.values()].every((n) => n === 1);
}

export type Attempt = { readonly id: string; readonly attempt: number; readonly state: "open" | "ratified" | "failed" };

/** The gate's newest attempt, or undefined while none was opened. */
export function latestAttempt(r: Reader, gatePartId: string): Attempt | undefined {
  const base = stepPacketId(gatePartId);
  let best: { id: string; attempt: number; state: string; mode: string } | undefined;
  for (const row of r.all("SELECT id, state, mode FROM packets WHERE id = ? OR substr(id, 1, ?) = ?", base, base.length + 1, `${base}#`)) {
    const id = String(row["id"]);
    const attempt = id === base ? 1 : Number(id.slice(base.length + 1));
    if (!Number.isInteger(attempt)) continue;
    if (best === undefined || attempt > best.attempt) best = { id, attempt, state: String(row["state"]), mode: String(row["mode"]) };
  }
  if (best === undefined) return undefined;
  if (best.state === "open") return { id: best.id, attempt: best.attempt, state: "open" };
  if (best.state === "returned") return { id: best.id, attempt: best.attempt, state: "failed" };
  return { id: best.id, attempt: best.attempt, state: best.mode !== "matrix-cull" || ratifies(r, best.id) ? "ratified" : "failed" };
}

/* ── a cull's candidates and its effect on the records ────────────────────── */

type ItemSpec = { readonly id: string; readonly label: string; readonly meta?: string; readonly media?: BlobRef; readonly doc?: unknown; readonly row?: string; readonly rowLabel?: string };
type Obj = Readonly<Record<string, unknown>>;
const objOf = (x: unknown): Obj => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Obj) : {});
const listOf = (x: unknown): readonly unknown[] => (Array.isArray(x) ? x : []);
const refOf = (x: unknown): BlobRef | undefined => {
  const p = blobRefSchema.safeParse(x);
  return p.success ? p.data : undefined;
};

/** Each cue's takes as a pick's candidates (row = the cue); the ads bed is one row. A take's
 *  audio is its blob ref when the score record holds one (`takeBlobs`), else its record as JSON. */
function takeItems(score: Obj | undefined, bed: Obj | undefined): ItemSpec[] {
  const rows: { id: string; title: string; rec: Obj }[] = listOf(score?.["spots"]).map((x) => ({ id: String(objOf(x)["id"] ?? "cue"), title: String(objOf(x)["title"] ?? objOf(x)["id"] ?? "cue"), rec: objOf(x) }));
  if (rows.length === 0 && bed !== undefined) rows.push({ id: "bed", title: "bed", rec: bed });
  return rows.flatMap(({ id, title, rec }) =>
    listOf(rec["takeIds"]).map((t) => {
      const take = String(t);
      const media = refOf(objOf(rec["takeBlobs"])[take]);
      const label = objOf(rec["takeLabels"])[take];
      const lbl = typeof label === "string" ? label : take;
      return { id: `${id}/${take}`, label: lbl, row: id, rowLabel: title, ...(rec["activeTakeId"] === take ? { meta: "in use" } : {}), ...(media === undefined ? { doc: { cue: id, take } } : { media }) };
    }),
  );
}

const pickRows = (items: readonly ItemSpec[]) => [...new Map(items.flatMap((i) => (i.row === undefined ? [] : [[i.row, { id: i.row, label: i.rowLabel ?? i.row }] as const]))).values()];
const rejectedPlates = (items: readonly ItemSpec[], d: ReadonlyMap<string, Decision>) => items.filter((i) => d.get(i.id)?.verdict === "reject");

/** The records a committed cull changes, or null when it changes none (a re-delivery). Frames: a
 *  rejected plate leaves the cut, marked with the packet that rejected it - unless its pixels were
 *  already replaced (a re-render landed since: that is new work, not the rejected plate). Score:
 *  each cue's kept take becomes the take in use. */
function cullNext(records: ReadonlyMap<string, Obj>, d: ReadonlyMap<string, Decision>, media: ReadonlyMap<string, BlobRef>, mark: { readonly packetId: string; readonly at: string }): Record<string, Obj> | null {
  const out: Record<string, Obj> = {};
  const frames = records.get("frames");
  if (frames !== undefined) {
    let moved = false;
    const units = listOf(frames["units"]).map((x) => {
      const u = objOf(x);
      const plate = objOf(u["plate"]);
      const shown = media.get(String(u["id"]));
      if (d.get(String(u["id"]))?.verdict !== "reject" || shown === undefined || refOf(plate["blob"])?.sha256 !== shown.sha256) return x;
      moved = true;
      const { blob: _gone, ...rest } = plate;
      void _gone;
      return { ...u, plate: { ...rest, state: "empty", rejected: { packetId: mark.packetId, at: mark.at, blob: shown } } };
    });
    if (moved) out["frames"] = { ...frames, units };
  }
  for (const key of ["score", "ads-score"] as const) {
    const rec = records.get(key);
    if (rec === undefined) continue;
    const pick = (cue: string, cur: unknown): unknown => [...d].find(([id, x]) => x.verdict === "keep" && id.startsWith(`${cue}/`))?.[0].slice(cue.length + 1) ?? cur;
    if (key === "ads-score") {
      const take = pick("bed", rec["activeTakeId"]);
      if (take !== rec["activeTakeId"]) out[key] = { ...rec, activeTakeId: take };
      continue;
    }
    const before = listOf(rec["spots"]).map(objOf);
    const spots = before.map((o) => {
      const take = pick(String(o["id"]), o["activeTakeId"]);
      return take === undefined ? o : { ...o, activeTakeId: take };
    });
    if (spots.some((o, i) => o !== before[i] && o["activeTakeId"] !== before[i]?.["activeTakeId"])) out[key] = { ...rec, spots };
  }
  return Object.keys(out).length === 0 ? null : out;
}

/* ── the gate as a v1 record ──────────────────────────────────────────────── */

export type StepV1 = {
  readonly projectId: string;
  readonly gatePartId: string;
  readonly attempt: number;
  readonly judgedPartId: string;
  readonly kind: GateKind;
  readonly discipline: string;
  readonly mode: PacketMode;
  readonly title: string;
  readonly verdict: PartVerdict;
  readonly jobId: string;
  readonly items: readonly (ItemSpec & { readonly media: BlobRef })[];
  /** The digest of the judged part's records: what the preview and the commit bind to. */
  readonly digest: string;
};

const LANE: Readonly<Record<GateKind, "image" | "audio" | "video">> = { frames: "image", motion: "video", score: "audio", cut: "video" };
const MODE: Readonly<Record<GateKind, PacketMode>> = { frames: "matrix-cull", score: "matrix-cull", motion: "packet-review", cut: "packet-review" };

function specsOf(kind: GateKind, records: ReadonlyMap<string, Readonly<Record<string, unknown>>>, verdict: PartVerdict): ItemSpec[] {
  const get = (key: StepKey) => records.get(key);
  const list = (x: unknown): readonly unknown[] => (Array.isArray(x) ? x : []);
  const str = (o: unknown, k: string): string | undefined =>
    typeof o === "object" && o !== null && k in o && typeof (o as Record<string, unknown>)[k] === "string" ? String((o as Record<string, unknown>)[k]) : undefined;
  if (kind === "frames") {
    const units = list(get("frames")?.["units"]);
    if (units.length > 0)
      return units.map((u) => {
        const plate = typeof u === "object" && u !== null && "plate" in u ? u.plate : undefined;
        const blob = STEP_RECORDS.frames.schema.shape.units.element.shape.plate.safeParse(plate);
        const id = str(u, "id") ?? "unit";
        const subject = str(plate, "subject");
        return { id, label: str(u, "title") ?? id, ...(subject === undefined ? {} : { meta: subject }), ...(blob.success && blob.data.blob !== undefined ? { media: blob.data.blob } : { doc: { unit: id, plate } }) };
      });
    return [{ id: "frames", label: "frames", doc: { ads: get("ads-shots") ?? null } }];
  }
  if (kind === "score") {
    const takes = takeItems(get("score"), get("ads-score"));
    if (takes.length > 0) return takes;
    return [{ id: "bed", label: "bed", doc: get("ads-score") ?? null }];
  }
  return [{ id: kind, label: kind, meta: verdict.codes.map((c) => c.text).join(" · "), doc: { [kind]: get(kind === "cut" ? "cut" : "motion-direction") ?? null, finish: get("ads-finish") ?? null, verdict } }];
}

const json = (doc: unknown): Uint8Array => new TextEncoder().encode(canonical(doc));

/** The gate part, the part it judges and its verdict, read now, with its candidates in the blob store.
 *  `ref` is the packet's run ref: the gate part id, `#<n>` for a later attempt. */
export async function readGate(deps: GateDeps, ref: string): Promise<Result<StepV1>> {
  const s = deps.store();
  if (!s.ok) return s;
  const store = s.value;
  const now = deps.now();
  const { gatePartId, attempt } = splitAttempt(ref);
  const read = store.read((r) => {
    const row = r.get("SELECT project_id FROM parts WHERE part_id = ?", gatePartId);
    if (row === undefined) return err("not-found", `no gate part ${gatePartId}`);
    const projectId = String(row["project_id"]);
    const pr = projectRead(r, projectId, now);
    const gate = pr.plan.parts.find((p) => p.id === gatePartId);
    if (gate === undefined || gate.kind !== "gate" || !("judges" in gate) || gate.judges === undefined) return err("invalid", `${gatePartId} is not a gate part`);
    const judged = pr.plan.parts.find((p) => p.id === gate.judges);
    if (judged === undefined || !isGateKind(judged.kind)) return err("refused", `the gate of a ${judged?.kind ?? "missing"} part opens from its producer's own packet, not a step packet`);
    const kind = judged.kind;
    const snap = readPartIn(r, { projectId, partId: judged.id });
    const verdict = partVerdict(kind, verdictInput(pr, snap));
    const owned = [...snap.records].filter(([k]) => STEP_RECORDS[k as StepKey]?.owner === kind);
    const jobId = "jobId" in judged && judged.jobId !== undefined ? judged.jobId : `job:part:${judged.id}`;
    return ok({ projectId, plan: pr.plan, discipline: pr.discipline, judgedPartId: judged.id, kind, verdict, specs: specsOf(kind, snap.records, verdict), digest: v1DigestOf({ kind, records: owned, verdict }), jobId });
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
  const mode = g.kind === "frames" && g.specs.some((x) => x.media === undefined) ? "packet-review" : MODE[g.kind];
  const { plan, specs: _specs, ...rest } = g;
  void _specs;
  return ok({ ...rest, gatePartId, attempt, mode, title: titleOf(plan, g.kind, attempt), items });
}

const titleOf = (plan: PlanView, kind: GateKind, attempt: number): string => `${plan.project.title} · ${kind}${attempt > 1 ? ` · attempt ${attempt}` : ""}`;
const textOf = (v: PartVerdict): string => v.codes.map((c) => c.text).join(" · ");

/** The packet a READY part opens; refused, with the verdict's own words, when it is not ready. */
export function gatePacket(v1: StepV1): Result<OpenPlan> {
  if (v1.verdict.state !== "ready") return err("refused", `${v1.kind} is ${v1.verdict.state}: ${textOf(v1.verdict)}`);
  const items = v1.items.map((i) => ({ id: i.id, jobId: v1.jobId, media: i.media, ...(i.row === undefined ? {} : { row: i.row }), grades: [] }));
  const packet = mintPacket({ id: attemptPacketId(v1.gatePartId, v1.attempt), lane: LANE[v1.kind], source: "step", mode: v1.mode, state: "open", partId: v1.gatePartId, title: v1.title, items });
  if (!packet.ok) return packet;
  return ok({
    packet: packet.value,
    initial: [],
    present: {
      items: Object.fromEntries(v1.items.map((i) => [i.id, { label: i.label, ...(i.meta === undefined ? {} : { meta: i.meta }) }])),
      rows: pickRows(v1.items),
      meta: v1.title,
      oracle: { passed: true, summary: textOf(v1.verdict), digest: v1.digest },
    },
    urls: Object.fromEntries(v1.items.map((i) => [i.id, blobRouteUrl(i.media)])),
    losses: [],
  });
}

/** A pick keeps one take per cue: a row with two keeps is refused at the preview, named. */
function pickRefusal(v1: StepV1, keeps: ReadonlySet<string>): string | null {
  if (v1.kind !== "score" || v1.mode !== "matrix-cull") return null;
  const per = new Map<string, number>();
  for (const i of v1.items) if (i.row !== undefined && keeps.has(i.id)) per.set(i.row, (per.get(i.row) ?? 0) + 1);
  const over = [...per].filter(([, n]) => n > 1).map(([row]) => v1.items.find((i) => i.row === row)?.rowLabel ?? row);
  return over.length === 0 ? null : `${over.join(", ")}: a cue keeps one take`;
}

export function makeStepAdapter(deps: GateDeps): DecisionAdapter<StepV1> {
  return {
    source: "step",
    read: (ref) => readGate(deps, ref.runId),
    packet: gatePacket,
    // A part that is no longer READY, or whose records moved since the preview, cannot be ratified
    // by it: the digest is in the token, so the commit is refused as a stale preview.
    consequence: (v1, at) => {
      const unready = gatePacket(v1); // READY or refused, in the verdict\'s words (one check, one place)
      if (!unready.ok) return unready;
      const d = decisionMap(at.decisions);
      const keeps = new Set(v1.items.filter((i) => d.get(i.id)?.verdict === "keep").map((i) => i.id));
      const refusal = pickRefusal(v1, keeps);
      if (refusal !== null) return err("refused", refusal);
      const writes = v1.kind === "frames" ? rejectedPlates(v1.items, d).map((i) => ({ kind: "index-row" as const, target: `frames · ${i.label}`, candidate: i.id, detail: "rejected — a re-render is owed" })) : [];
      return ok({
        consequence: buildConsequence(
          at,
          v1.items.map((i) => i.id),
          { writes },
          v1.digest,
        ),
        v1Digest: v1.digest,
      });
    },
    // The commit IS the ratification (the plan reads the packet); what is left to deliver is the
    // record the cull changed (a rejected plate, a picked take) and the release of the jobs the
    // plan held behind the gate - only when the cull ratified. Idempotent: a plate already marked
    // by this packet, a take already in use and a released job are each left as they are.
    // A returned review delivers nothing: the gate reads failed and the part is reworked.
    async apply(claim) {
      if (claim.outcome.act === "return") return ok(undefined);
      const c = committedOutcome(claim);
      if (!c.ok) return c;
      const s = deps.store();
      if (!s.ok) return s;
      const store = s.value;
      const at = store.read((r) => {
        const row = r.get("SELECT project_id FROM parts WHERE part_id = ?", claim.packet.partId ?? "");
        if (row === undefined) return err("not-found", `packet ${claim.packetId} names no part of a project`);
        const projectId = String(row["project_id"]);
        const gate = projectRead(r, projectId, deps.now()).plan.parts.find((p) => p.id === claim.packet.partId);
        const judges = gate !== undefined && "judges" in gate ? gate.judges : undefined;
        return judges === undefined ? err("invalid", `${claim.packet.partId ?? ""} is not a gate part`) : ok({ projectId, judged: judges, ratified: claim.packet.mode !== "matrix-cull" || ratifies(r, claim.packetId) });
      });
      if (!at.ok) return at;
      if (!at.value.ok) return at.value;
      const { projectId, judged, ratified } = at.value.value;
      const actor: Actor = { kind: "machine", id: claim.holder };
      const landed = landCull(store, { projectId, partId: judged }, claim, actor);
      if (!landed.ok) return landed;
      if (!ratified) return ok(undefined);
      const released = releaseAfterGate(store, projectId, actor, deps.now());
      return released.ok ? ok(undefined) : released;
    },
  };
}

/** The cull's effect on the judged part's records, landed as a job write by the packet (never an
 *  operator op: ⌫ in the editor does not un-reject a plate the Board rejected). */
function landCull(store: Store, part: { readonly projectId: string; readonly partId: string }, claim: Parameters<DecisionAdapter<StepV1>["apply"]>[0], by: Actor): Result<null> {
  if (claim.packet.mode !== "matrix-cull") return ok(null);
  const d = decisionMap(claim.decisions);
  const media = new Map(claim.packet.items.map((i) => [String(i.id), i.media]));
  const snap = store.read((r) => readPartIn(r, part));
  if (!snap.ok) return snap;
  const next = cullNext(snap.value.records, d, media, { packetId: claim.packetId, at: claim.outcome.act === "commit" ? claim.outcome.result.at : "" });
  if (next === null) return ok(null);
  const w = writePart(store, { ...part, baseRev: "current", act: "land", op: { gate: claim.packetId }, label: `gate ${claim.packetId}`, by, next: () => ok(next) });
  return w.ok ? ok(null) : w;
}

export const stepAdapter = makeStepAdapter(LIVE_GATES);

/** Open the packet of every gate whose judged part is READY and whose newest attempt failed or
 *  does not exist (the real part side kicks this after a write); idempotent by packet id. */
export async function openReadyGates(deps: GateDeps, projectId: string, author: Author): Promise<Result<string[]>> {
  const s = deps.store();
  if (!s.ok) return s;
  const store = s.value;
  const next = (r: Reader, id: string): string[] => {
    const last = latestAttempt(r, id);
    return last === undefined ? [id] : last.state === "failed" ? [`${id}#${last.attempt + 1}`] : [];
  };
  const ids = (r: Reader): string[] => r.all("SELECT part_id FROM parts WHERE project_id = ? ORDER BY ord", projectId).map((x) => String(x["part_id"]));
  const gates = store.read((r) => ids(r).filter((id) => id.slice(projectId.length + 1).startsWith("gate:")).flatMap((id) => next(r, id)));
  if (!gates.ok) return gates;
  const opened: string[] = [];
  for (const ref of gates.value) {
    const v1 = await readGate(deps, ref);
    if (!v1.ok && v1.error.code === "refused") continue;
    if (!v1.ok) return v1;
    const plan = gatePacket(v1.value);
    if (!plan.ok) continue;
    const o = store.tx((t) => openPacket(t, { packet: plan.value.packet }, author));
    if (!o.ok) return o;
    opened.push(o.value.id);
  }
  return ok(opened);
}
