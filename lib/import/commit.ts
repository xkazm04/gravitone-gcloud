import type { BlobRef } from "@gt/domain/blob";
import { parseAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { packetSchema } from "@gt/domain/packet";
import { isWork } from "@gt/domain/part";
import type { BlobStore } from "@gt/kernel/blob";
import { canonical } from "@gt/kernel/canonical";
import { commit } from "@gt/kernel/decision/commit";
import { consequenceToken } from "@gt/kernel/decision/consequence";
import { openPacket, type Author } from "@gt/kernel/decision/driver";
import { currentDecisions } from "@gt/kernel/decision/read";
import { append } from "@gt/kernel/events";
import { recordImportedJobIn } from "@gt/kernel/job";
import { digestOf } from "@gt/kernel/parts/core";
import { projectRecords, writePartIn } from "@gt/kernel/parts/driver";
import { stepPacketId } from "@gt/kernel/parts/gates";
import { launchOf, modelOptions } from "@gt/kernel/records/options";
import { loadParts, loadProject, putPart, putProject } from "@gt/kernel/records/schema";
import { compose } from "@gt/kernel/records/write";
import type { NotPromise, Store, Tx } from "@gt/kernel/store";

import type { Archive } from "./archive.ts";
import { planImport, type ProjectPreview, type StagedProject } from "./project.ts";

// THE IMPORT, COMMITTED (Phase 4 wave D, L42) - a staged v1 project (./project.ts) written as a
// kernel Project in ONE transaction: the plan through the creation door every composed project
// goes through (records/write.ts `compose`, so an imported project is an ordinary citizen with a
// provenance stamp - registry import-normalization: "validated, user-confirmed entities cross
// into the normal creation door of the host model"), its records landed through the parts
// module's door, a done job per part that holds work, a committed packet per signed-off gate,
// and the `project.imported` event that names the import record. A throw anywhere rolls all of
// it back: all or nothing per project, v1's own rule for an archive (lib/studioArchive.ts).
//
// THE TOKEN (COMMON decision 3, the receipt's law, applied to an import): the confirm carries the
// preview's token; the plan is staged again from what the store holds now and a different token
// is a stale preview, answered with the fresh one, nothing written.
//
// BLOBS FIRST, OUTSIDE THE TRANSACTION. The blob store is content-addressed and idempotent, and a
// transaction cannot await; bytes written for a project whose transaction then rolls back are
// unreferenced files a re-import writes to the same names - never a reference to nothing.
//
// The v1 rows are never written: the browser keeps them until wave D retires the shelf.

export const IMPORT_ACTOR: Actor = { kind: "machine", id: "v1-import" };

export type ImportOutcome = {
  readonly v1Id: string;
  readonly id: string;
  readonly title: string;
  readonly outcome: "imported" | "skipped" | "refused";
  readonly reason?: string;
  readonly launched: boolean;
  readonly ratified: readonly string[];
};

export type Committed = { readonly kind: "stale"; readonly fresh: readonly ProjectPreview[]; readonly token: string } | { readonly kind: "done"; readonly outcomes: readonly ImportOutcome[] };

export type CommitDeps = {
  readonly store: Store;
  readonly blobs: BlobStore;
  /** The operator who confirmed. */
  readonly actor: Actor;
  /** After a launched project lands: open the gates its READY parts now owe (lib/parts/gates.ts). */
  readonly afterLanded?: (projectId: string) => Promise<void>;
};

/** A store whose transactions are the caller's: the creation door runs inside the import's one tx. */
function within(t: Tx, location: string): Store {
  return {
    location,
    tx: <T,>(fn: (t: Tx) => NotPromise<T>): Result<T> => ok(fn(t) as T),
    read: <T,>(fn: (r: Tx) => NotPromise<T>): Result<T> => ok(fn(t) as T),
    snapshot: () => err("refused", "an import's transaction takes no snapshot"),
    close: () => undefined,
  };
}

const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

const json = (v: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(v));
const dayOf = (at: string): string => at.slice(0, 10);

type Put = { record: BlobRef; gates: Map<string, BlobRef> };

async function putBytes(blobs: BlobStore, s: StagedProject): Promise<Result<Put>> {
  for (const b of s.blobs) {
    const r = await blobs.put(b.bytes, b.ref.mime);
    if (!r.ok) return r;
    if (r.value.sha256 !== b.ref.sha256) return err("internal", `blob ${b.ref.sha256} landed as ${r.value.sha256}`);
  }
  const record = await blobs.put(json(s.record), "application/json");
  if (!record.ok) return record;
  const gates = new Map<string, BlobRef>();
  for (const gate of s.signed.keys()) {
    const judged = s.parts.find((p) => p.key === gate);
    const kind = judged !== undefined && judged.kind === "gate" ? judged.judges : gate;
    const held = Object.fromEntries(s.steps.flatMap((x) => (x.held?.owner === kind ? [[x.held.key, x.held.record]] : [])));
    const r = await blobs.put(new TextEncoder().encode(canonical(held)), "application/json");
    if (!r.ok) return r;
    gates.set(gate, r.value);
  }
  return ok({ record: record.value, gates });
}

/** The project's rows, inside `t`. Throws (rolling the import back) on any refusal. */
function land(t: Tx, location: string, s: StagedProject, put: Put, actor: Actor): void {
  const p = s.preview;
  const c = compose(within(t, location), { recipe: p.recipe, title: p.title.slice(0, 200), ...(s.styleId === undefined ? {} : { styleId: s.styleId }), units: s.units }, actor, { id: p.id });
  if (!c.ok) throw c.error;
  const head = loadProject(t, p.id);
  putProject(t, { ...head, runtimeS: s.runtimeS, rev: head.rev + 1, ...(p.launched ? { launchedAt: t.at } : {}) }, head.rev);
  const day = dayOf(t.at);
  for (const row of loadParts(t, p.id)) {
    const part = row.part;
    const key = part.id.slice(p.id.length + 1);
    if (!isWork(part) || !p.done.includes(key)) continue;
    const picked = launchOf(part.kind, part.option, day) ?? launchOf(part.kind, modelOptions(part.kind, day)[0]?.key ?? "", day);
    if (picked === undefined) throw new AppError("internal", `import: a ${part.kind} part has no option`);
    const jobId = `job:part:${part.id}`;
    // A terminal job for work v1 did, through the job machine (kernel `recordImportedJobIn`): the
    // `job.imported` event says so; nothing claimed a lane or spent (spend reconciles at 0).
    recordImportedJobIn(t, { id: jobId, of: { kind: "part", id: part.id }, producer: picked.producer, lane: picked.option.lane, correlation: { projectId: p.id }, units: part.units, data: { from: "v1", v1Project: p.v1Id } }, IMPORT_ACTOR);
    putPart(t, p.id, { ...row, jobId });
  }
  const byOwner = new Map<string, Record<string, unknown>>();
  for (const step of s.steps) {
    if (step.held === undefined) continue;
    byOwner.set(step.held.owner, { ...(byOwner.get(step.held.owner) ?? {}), [step.held.key]: step.held.record });
  }
  for (const [owner, records] of byOwner) {
    must(writePartIn(t, { projectId: p.id, partId: `${p.id}/${owner}`, baseRev: "current", act: "land", op: { import: p.v1Id }, label: "imported from v1", by: IMPORT_ACTOR, next: () => ok(records) }));
  }
  const author: Author = { by: "operator", surface: "import", who: actor.id };
  for (const [gateKey, at] of s.signed) {
    const gatePartId = `${p.id}/${gateKey}`;
    const media = put.gates.get(gateKey);
    const judged = s.parts.find((x) => x.key === gateKey);
    if (media === undefined || judged === undefined || judged.kind !== "gate") throw new AppError("internal", `import: gate ${gateKey} has no evidence`);
    const lane = judged.judges === "score" ? "audio" : judged.judges === "frames" ? "image" : "video";
    const packet = must(parseAt("imported sign-off packet", packetSchema, { id: stepPacketId(gatePartId), lane, source: "step", mode: "packet-review", state: "open", partId: gatePartId, title: `${p.title} · ${judged.judges} · imported sign-off`, items: [{ id: judged.judges, jobId: `job:part:${p.id}/${judged.judges}`, media, grades: [] }] }));
    openPacket(t, { packet, initial: [{ candidate: judged.judges, verdict: "keep", note: `imported sign-off, v1 at ${at}`, by: "operator", surface: "import", at }] }, author);
    const v1Digest = media.sha256;
    must(commit(t, { ...author, packetId: packet.id, ticket: `v1-import:${p.v1Id}:${gateKey}`, token: consequenceToken(currentDecisions(t, packet.id).decisions, v1Digest), v1Digest }));
  }
  const held = Object.fromEntries([...projectRecords(t, p.id).records].map(([k, v]) => [k, digestOf(v)]));
  const created = typeof s.row["createdAt"] === "number" && s.row["createdAt"] > 0 ? new Date(s.row["createdAt"]).toISOString() : undefined;
  append(t, {
    actor,
    type: "project.imported",
    subject: { kind: "project", id: p.id },
    data: { projectId: p.id, v1Id: p.v1Id, record: put.record, held, launched: p.launched, done: [...p.done], ratified: [...p.ratified], losses: p.losses.map((l) => ({ ...l })) },
    ...(created === undefined ? {} : { occurredAt: created, atSrc: "recorded" as const }),
    key: `v1-import:${p.v1Id}:project`,
  });
}

/**
 * Commit an archive's import on the preview's token. Each project is its own transaction (one
 * that fails does not take the others with it - each outcome says what happened to it).
 */
export async function commitImport(deps: CommitDeps, archive: Archive, token: string): Promise<Result<Committed>> {
  const planned = deps.store.read((r) => planImport(r, archive));
  if (!planned.ok) return planned;
  if (planned.value.token !== token) return ok({ kind: "stale", fresh: planned.value.projects.map((p) => p.preview), token: planned.value.token });
  const outcomes: ImportOutcome[] = [];
  for (const s of planned.value.projects) {
    const p = s.preview;
    const base = { v1Id: p.v1Id, id: p.id, title: p.title, launched: false, ratified: [] };
    if (p.outcome !== "import") {
      outcomes.push({ ...base, outcome: p.outcome === "skip" ? "skipped" : "refused", ...(p.reason === undefined ? {} : { reason: p.reason }) });
      continue;
    }
    const put = await putBytes(deps.blobs, s);
    if (!put.ok) {
      outcomes.push({ ...base, outcome: "refused", reason: put.error.message });
      continue;
    }
    const w = deps.store.tx((t) => land(t, deps.store.location, s, put.value, deps.actor));
    if (!w.ok) {
      // A row that appeared since the preview is the re-import race: the other import won.
      const raced = deps.store.read((r) => r.get("SELECT 1 AS x FROM projects WHERE id = ?", p.id) !== undefined);
      outcomes.push({ ...base, outcome: raced.ok && raced.value ? "skipped" : "refused", reason: w.error.message });
      continue;
    }
    if (p.launched && deps.afterLanded !== undefined) await deps.afterLanded(p.id);
    outcomes.push({ ...base, outcome: "imported", launched: p.launched, ratified: p.ratified });
  }
  return ok({ kind: "done", outcomes });
}
