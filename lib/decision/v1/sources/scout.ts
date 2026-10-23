import "server-only";

import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import type { ConsequenceItem } from "@gt/domain/board";
import type { Decision } from "@gt/domain/decision";
import type { LoadSummary } from "@gt/domain/load";
import { err, ok, type Result } from "@gt/domain/errors";
import type { ApplyClaim } from "@gt/kernel/decision/apply";

import { planExtractCommit } from "../../../foundry/commitPlan.ts";
import { getExtractRun, patchExtractVerdicts } from "../../../foundry/extract/store.ts";
import type { ExtractVerdictRecord } from "../../../foundry/extract/types.ts";
import { leadCell, leadEventsOf, readRestated, verifiedRestates } from "../../../foundry/scout/leadEvents.ts";
import { leadsFile, queueEvents, readQueue } from "../../../foundry/scout/leads.ts";
import { processNightLoad } from "../../../foundry/scout/load.ts";
import { FINDINGS_HEADING, WATCH_HEADING, WATCHLIST_REL, appendFinding, appendWatch, knowledgeRoot, knowledgeState, markerOf, patternsRel } from "../../../foundry/scout/knowledge.ts";
import { meshRoot, mutateAsset, readAsset, resolveInAsset, withVariant } from "../../../foundry/mesh/store.ts";
import { mutateNight, nightDir, readNight, resolveInNight, scoutRoot } from "../../../foundry/scout/store.ts";
import type { Night, NightId } from "../../../foundry/scout/types.ts";
import { packetIdOf } from "../../../ledger/v1/packet.ts";
import { modelItemId } from "../../../library/feeds/mesh.ts";
import { sceneShelf } from "../../../library/feeds/scout.ts";
import {
  buildConsequence,
  committedOutcome,
  decisionMap,
  fromV1,
  mediaRefs,
  mintPacket,
  runIdOf,
  v1Call,
  v1DigestOf,
  type AdapterRef,
  type ConsequenceParts,
  type DecisionAdapter,
  type DecisionsAt,
  type OpenPlan,
  type Preview,
} from "../types.ts";
import { extractAdapter, importVerdict, lookDecision, recordOf, same, type LookDecision } from "./extract.ts";
import { DIRECTION_VERDICT, IDEA_TARGET_WORD, build, commitOf, extractDecisions, ideaCell, meshKey, sameOutcome, within, type AssetRead, type ScoutV1, type StyleRead } from "./scoutPlan.ts";

// ONE /scout NIGHT AS A PACKET - foundry-out/scout/<night>/night.json
// (lib/foundry/scout/store.ts) read through readNight, decided as ONE matrix
// cull with a row per candidate (./scoutPlan.ts holds the shape), and
// committed back through the writers each kind already has:
//
//   style    the extract run's own verdicts and commit: the extract adapter's
//            apply over this candidate's cells (patchExtractVerdicts, then
//            commitExtractRun - kept looks join the catalogue as `candidate`
//            styles). A style whose every look is rejected has its verdicts
//            written and its run left uncommitted: v1 refuses to commit a run
//            that keeps nothing ("Keep at least one style first."), and one
//            rejected candidate must not refuse the whole night.
//   finding  a kept one, a line in its step's PATTERNS.md (../../../foundry/
//   watch    scout/knowledge.ts); a kept watch line, a line in the watchlist.
//   asset3d  each judged variant's `verdict` in its mesh asset (lib/foundry/mesh/store.ts
//            mutateAsset): kept or rejected, what the Library's mesh feed shelves it by.
//   idea     nothing of its own: the record below is what the next nights develop or block, and
//            for a direction what they work inside or steer away from (taste.ts).
//   leads    what the keeps EARNED for the ai-registry (../../../foundry/scout/
//            leadEvents.ts) into the lead queue, once by key; the preview names each.
//   all      every verdict, its reasons and its note into `night.committed`,
//            state `committed` - LAST, so a night that says committed has had
//            every other write. Scenes are admitted by that record alone: the
//            Library's scout feed shelves a kept scene from it.
//
// A DRY NIGHT ran on stand-ins: its verdicts are recorded (`dry: true`, the
// next night's taste still learns from them) and nothing else is written.
//
// IDEMPOTENT, AND CRASH-SAFE BY ORDER. Each write is a no-op the second time:
// the extract adapter's apply is (a committed run with the same outcome is
// success), a knowledge line carries a marker, and `night.committed` is
// compared, never overwritten - the same kept and rejected cells is success, a
// different outcome is a loud refusal. A crash between any two writes leaves a
// prefix the next delivery completes.

/** Repo-relative, forward slashes: the roots a consequence names. */
const rel = (abs: string): string => path.relative(process.cwd(), abs).replace(/\\/g, "/");

/** The read, with what the registry leads are derived from (the nights its findings restate, the keys queued) and the night's load (never digested). */
type ScoutRead = ScoutV1 & { readonly earlier: ReadonlyMap<NightId, Night>; readonly queued: readonly string[]; readonly load?: LoadSummary };

/* ── read ──────────────────────────────────────────────────────────────────── */

async function read(ref: AdapterRef): Promise<Result<ScoutRead>> {
  const id = ref.runId;
  const got = await v1Call(() => readNight(id));
  if (!got.ok) return got;
  const night = got.value;
  const styles: Record<string, StyleRead> = {};
  const assets: Record<string, AssetRead> = {};
  const files: { key: string; abs: string }[] = [];
  const knowledge: Record<string, { rel: string; exists: boolean; holds: boolean }> = {};
  for (const c of night.candidates) {
    if (c.kind === "style") {
      if (c.extractRunId === undefined) continue;
      const ex = await extractAdapter.read({ runId: c.extractRunId });
      styles[c.id] = ex.ok ? { kind: "read", v1: ex.value } : { kind: "unread", error: ex.error.message };
    } else if (c.kind === "scene" || c.kind === "idea") {
      for (const f of c.kind === "scene" ? [c.keyframes[0], ...c.replicas, c.clip?.path] : [c.image]) {
        if (f === undefined) continue;
        try {
          files.push({ key: f, abs: resolveInNight(id, f) });
        } catch (e) {
          return fromV1(e);
        }
      }
    } else if (c.kind === "asset3d") {
      try {
        for (const f of c.concepts) if (f !== "") files.push({ key: f, abs: resolveInNight(id, f) });
      } catch (e) {
        return fromV1(e);
      }
      if (c.assetId === undefined) continue;
      const a = await v1Call(() => readAsset(c.assetId ?? ""));
      if (!a.ok) {
        assets[c.id] = { kind: "unread", error: a.error.message };
        continue;
      }
      assets[c.id] = { kind: "read", asset: a.value };
      for (const v of a.value.variants) {
        const glb = v.files.rigged ?? v.files.glb;
        if (v.status !== "finished" || glb === undefined) continue;
        try {
          files.push({ key: meshKey(a.value.id, glb), abs: resolveInAsset(a.value.id, glb) });
        } catch (e) {
          return fromV1(e);
        }
      }
    } else if (c.kind !== "direction") {
      const r = c.kind === "finding" ? await v1Call(async () => patternsRel(c.template, c.step)) : ok(WATCHLIST_REL);
      if (!r.ok) continue;
      const s = await v1Call(() => knowledgeState(r.value, markerOf(id, c.id)));
      if (!s.ok) return s;
      knowledge[c.id] = { rel: r.value, ...s.value };
    }
  }
  const media = await mediaRefs(files);
  if (!media.ok) return media;
  const queue = await v1Call(() => readQueue());
  if (!queue.ok) return queue;
  const earlier = await readRestated(night, readNight);
  const load = processNightLoad(night);
  return ok({ ...(load === undefined ? {} : { load }), night, styles, assets, media: Object.fromEntries(media.value), knowledge, at: { scout: rel(scoutRoot()), knowledge: rel(knowledgeRoot()), mesh: rel(meshRoot()) }, earlier, queued: queue.value.events.map((e) => e.key) });
}

/* ── packet ────────────────────────────────────────────────────────────────── */

function refusal(n: Night): string | undefined {
  if (n.state === "open") return "The night is still running.";
  if (n.state === "committed" || n.committed !== undefined) return "This night is already committed.";
  return undefined;
}

function packet(v1: ScoutV1 & Pick<ScoutRead, "load">): Result<OpenPlan> {
  const n = v1.night;
  const no = refusal(n);
  if (no !== undefined) return err("refused", `scout night ${n.id}: ${no}`);
  const b = build(v1);
  if (b.cells.length === 0) return err("refused", `scout night ${n.id} has nothing rendered to judge`);
  const minted = mintPacket({
    id: packetIdOf("scout", n.id),
    lane: "image",
    source: "scout",
    mode: "matrix-cull",
    state: "open",
    runId: n.id,
    title: `scout ${n.id}`,
    items: b.cells.map((c) => ({ id: c.id, jobId: c.jobId, media: c.media, row: c.row, grades: c.grades })),
  });
  if (!minted.ok) return minted;
  const failed = n.candidates.filter((c) => c.status === "failed").length;
  const shown = new Set(b.cells.map((c) => c.candidate)).size;
  return ok({
    packet: minted.value,
    initial: b.initial,
    present: {
      items: Object.fromEntries(b.cells.map((c) => [c.id, c.words])),
      rows: b.rows,
      oracle: { passed: failed === 0 && n.stop !== "failure", summary: `${shown} candidates · ${b.cells.length} cells · ${failed} failed${n.stop === undefined ? "" : ` · stopped: ${n.stop}`}` },
      meta: `scout · ${n.sources.length} sources${n.dry ? " · dry" : ""}`,
      ...(v1.load === undefined ? {} : { load: v1.load }),
    },
    urls: Object.fromEntries(b.cells.map((c) => [c.id, c.url])),
    losses: b.losses,
  });
}

/* ── consequence ───────────────────────────────────────────────────────────── */

/** One style candidate's looks, from its cells' decisions (the extract adapter's own rule). */
function looksOf(items: readonly { readonly id: string; readonly row?: string | undefined }[], decisions: readonly Decision[]): Map<string, LookDecision> {
  const byCell = decisionMap(decisions);
  const cells = new Map<string, (Decision | undefined)[]>();
  for (const it of items) {
    const look = it.row ?? it.id.slice(0, it.id.lastIndexOf("/"));
    cells.set(look, [...(cells.get(look) ?? []), byCell.get(it.id)]);
  }
  return new Map([...cells].map(([look, ds]) => [look, lookDecision(ds)]));
}

const nothingKept = (looks: ReadonlyMap<string, LookDecision>): boolean => looks.size > 0 && [...looks.values()].every((d) => d.verdict === "reject");

function digestOf(v1: ScoutRead): string {
  const runs = Object.entries(v1.styles).map(([cid, s]) => [cid, s.kind === "read" ? planExtractCommit(s.v1.run, s.v1.verdicts, { styles: [...s.v1.catalogue.styles] }).token : s.error]);
  const shas = (m: Readonly<Record<string, BlobRef>>) => Object.entries(m).map(([k, b]) => [k, b.sha256]).sort();
  // An asset's variants by status: a finish that lands between the preview and the commit is a different packet.
  const assets = Object.entries(v1.assets).map(([cid, r]) => [cid, r.kind === "read" ? r.asset.variants.map((v) => `${v.id}:${v.status}`) : r.error]);
  // An earlier night committed between the preview and the commit turns a restatement into a lead: a different packet.
  const restated = [...verifiedRestates(v1.night, v1.earlier).keys()].sort();
  return v1DigestOf({ source: "scout", night: v1.night.id, state: v1.night.state, candidates: v1.night.candidates, media: shas(v1.media), runs: runs.sort(), assets: assets.sort(), restated });
}

function consequence(v1: ScoutRead, at: DecisionsAt): Result<Preview> {
  const n = v1.night;
  const no = refusal(n);
  if (no !== undefined) return err("refused", `scout night ${n.id}: ${no}`);
  const b = build(v1);
  const ids = b.cells.map((c) => c.id);
  const byCell = decisionMap(at.decisions);
  const kept = new Set(ids.filter((id) => byCell.get(id)?.verdict === "keep"));
  const v1Digest = digestOf(v1);
  const nightFile = { kind: "file" as const, target: `${v1.at.scout}/${n.id}/night.json` };
  if (n.dry) {
    return ok({ v1Digest, consequence: buildConsequence(at, ids, { writes: [{ ...nightFile, detail: "committed · dry: the verdicts only; no style, scene or knowledge is admitted" }] }, v1Digest) });
  }
  type Mut<T> = T extends readonly (infer U)[] ? U[] : never;
  const parts: { [K in "writes" | "promotions" | "renames" | "nearDuplicates"]: Mut<NonNullable<ConsequenceParts[K]>> } = { writes: [], promotions: [], renames: [], nearDuplicates: [] };
  const under = (cid: string, x: string | undefined): string | undefined => (x === undefined ? undefined : `${cid}/${x}`);
  for (const [cid, ex] of Object.entries(b.runs)) {
    const items = b.cells.filter((c) => c.candidate === cid).map((c) => ({ id: within(cid, c.id) ?? c.id, row: within(cid, c.row) ?? c.row }));
    const decisions = extractDecisions(at.decisions, at.packetId, cid);
    if (nothingKept(looksOf(items, decisions))) {
      parts.writes.push({ kind: "file", target: `foundry-out/extract/${ex.run.id}/verdicts.json`, candidate: cid, detail: "every look rejected: the verdicts only, the run stays uncommitted" });
      continue;
    }
    const p = extractAdapter.consequence(ex, { packetId: at.packetId, rev: at.rev, decisions });
    if (!p.ok) return err(p.error.code, `style ${cid}: ${p.error.message}`, { cause: p.error });
    const c = p.value.consequence;
    const re = <T extends ConsequenceItem>(x: T): T => ({ ...x, ...(x.candidate === undefined ? {} : { candidate: under(cid, x.candidate) }) });
    parts.writes.push(...c.writes.map(re));
    parts.promotions.push(...c.promotions.map(re));
    parts.renames.push(...c.renames);
    parts.nearDuplicates.push(...c.nearDuplicates.map((d) => ({ ...d, candidate: under(cid, d.candidate) ?? d.candidate })));
  }
  for (const c of n.candidates) {
    if (c.kind === "scene") {
      const shelf = sceneShelf(n, c, kept);
      if (shelf !== null) parts.promotions.push({ target: shelf.id, candidate: shelf.cell, detail: `a reference-only ${shelf.format} in the Library` });
    } else if (c.kind === "asset3d") {
      const r = v1.assets[c.id];
      if (r?.kind !== "read") continue;
      for (const v of r.asset.variants) {
        const cell = `${c.id}/${v.id}`;
        const d = byCell.get(cell)?.verdict;
        if (d !== "keep" && d !== "reject") continue;
        parts.writes.push({ kind: "file", target: `${v1.at.mesh}/${r.asset.id}/asset.json`, candidate: cell, detail: `${v.id}: ${d === "keep" ? "kept" : "rejected"}` });
        if (d === "keep") parts.promotions.push({ target: modelItemId(r.asset.id, v.id), candidate: cell, detail: "a publishable model in the Library" });
      }
    } else if (c.kind === "finding" || c.kind === "watch") {
      const cell = `${c.id}/text`;
      const k = v1.knowledge[c.id];
      if (!kept.has(cell) || k === undefined) continue;
      const heading = c.kind === "finding" ? FINDINGS_HEADING : WATCH_HEADING;
      parts.writes.push({ kind: "file", target: `${v1.at.knowledge}/${k.rel}`, candidate: cell, detail: k.holds ? "already holds this line" : `${k.exists ? "" : "new file · "}a line under ${heading}` });
    } else if (c.kind === "idea" || c.kind === "direction") {
      const cell = c.kind === "idea" ? ideaCell(c.id) : `${c.id}/text`;
      const d = byCell.get(cell)?.verdict;
      if (d === "keep" || d === "reject") parts.writes.push({ ...nightFile, candidate: cell, detail: c.kind === "direction" ? DIRECTION_VERDICT[d] : d === "keep" ? `develops next night as a ${IDEA_TARGET_WORD[c.target]}` : "blocked" });
    }
  }
  for (const e of leadEventsOf({ night: n, kept, earlier: v1.earlier })) {
    const cell = leadCell(e);
    parts.writes.push({ kind: "file", target: rel(leadsFile()), ...(cell === undefined ? {} : { candidate: cell }), detail: `${v1.queued.includes(e.key) ? "already queued" : "queues a registry lead"}: ${e.kind} ${e.refs[0] ?? ""}` });
  }
  parts.writes.push({ ...nightFile, detail: "committed: every verdict, its reasons and its note" });
  return ok({ v1Digest, consequence: buildConsequence(at, ids, parts, v1Digest) });
}

/* ── apply ─────────────────────────────────────────────────────────────────── */

/** One style candidate's cells through the extract run's own writers. */
async function applyStyle(claim: ApplyClaim, cid: string, runId: string): Promise<Result<void>> {
  const items = claim.packet.items.flatMap((it) => {
    const id = within(cid, it.id);
    return id === null ? [] : [{ ...it, id, row: within(cid, it.row ?? "") ?? id.slice(0, id.lastIndexOf("/")) }];
  });
  if (items.length === 0) return ok(undefined);
  const decisions = extractDecisions(claim.decisions, claim.packetId, cid);
  const looks = looksOf(items, decisions);
  if (!nothingKept(looks)) {
    const sub = mintPacket({ ...claim.packet, source: "extract", runId, items });
    if (!sub.ok) return sub;
    const r = await extractAdapter.apply({ ...claim, packet: sub.value, decisions });
    return r.ok ? r : err(r.error.code, `style ${cid} (extract run ${runId}): ${r.error.message}`, { cause: r.error });
  }
  // Every look rejected: v1's verdicts, and no commit (v1 refuses one that keeps nothing).
  const fresh = await v1Call(() => getExtractRun(runId));
  if (!fresh.ok) return fresh;
  const { run, verdicts } = fresh.value;
  if (run.status === "committed") {
    const differ = (run.committed?.kept ?? []).filter((look) => looks.has(look));
    if (differ.length === 0) return ok(undefined);
    return err("refused", `extract run ${runId} was committed in v1 with other verdicts: ${differ.map((l) => `${l} is kept in v1, reject here`).join("; ")}`);
  }
  const set: Record<string, ExtractVerdictRecord> = {};
  for (const [look, d] of looks) {
    const current = verdicts[look];
    if (current !== undefined && same(importVerdict(current), d)) continue;
    set[look] = recordOf(d);
  }
  if (Object.keys(set).length === 0) return ok(undefined);
  const patched = await v1Call(() => patchExtractVerdicts(runId, { set, clear: [], baseRev: fresh.value.rev ?? 0, by: "human", surface: "board" }));
  return patched.ok ? ok(undefined) : patched;
}

/**
 * One asset's judged variants: each cell's verdict as the variant's `verdict`. Setting what is
 * already set writes nothing (mutateAsset keeps the object), so a second delivery is a no-op and a
 * crash after some variants leaves a prefix the next one completes.
 */
async function applyAsset(assetId: string, cid: string, record: Pick<Night["committed"] & object, "kept" | "rejected">): Promise<Result<void>> {
  const verdictOf = (variant: string): "kept" | "rejected" | undefined => {
    const cell = `${cid}/${variant}`;
    return record.kept.includes(cell) ? "kept" : record.rejected.includes(cell) ? "rejected" : undefined;
  };
  const r = await v1Call(() =>
    mutateAsset(assetId, (a) => {
      let next = a;
      for (const v of a.variants) {
        const verdict = verdictOf(v.id);
        if (verdict !== undefined && v.verdict !== verdict) next = withVariant(next, { ...v, verdict });
      }
      return next;
    }),
  );
  return r.ok ? ok(undefined) : err(r.error.code, `game asset ${cid} (mesh asset ${assetId}): ${r.error.message}`, { cause: r.error });
}

async function apply(claim: ApplyClaim): Promise<Result<void>> {
  const done = committedOutcome(claim);
  if (!done.ok) return done;
  const runId = runIdOf(claim);
  if (!runId.ok) return runId;
  const id = runId.value;
  const got = await v1Call(() => readNight(id));
  if (!got.ok) return got;
  const night = got.value;
  const items = claim.packet.items.map((it) => it.id);
  const record = commitOf(night, items, claim.decisions, new Date().toISOString());

  const settled = (n: Night): Result<void> | undefined => {
    if (n.committed === undefined) return undefined;
    if (sameOutcome(n.committed, record)) return ok(undefined);
    const word = (r: Pick<Night["committed"] & object, "kept" | "rejected">, c: string): string => (r.kept.includes(c) ? "keep" : r.rejected.includes(c) ? "reject" : "undecided");
    const was = n.committed;
    const differ = [...new Set([...items, ...was.kept, ...was.rejected])].filter((c) => word(was, c) !== word(record, c));
    return err("refused", `scout night ${id} was committed with other verdicts: ${differ.map((c) => `${c} is ${word(was, c)} in v1, ${word(record, c)} here`).join("; ")}`);
  };
  const before = settled(night);
  if (before !== undefined) return before;
  if (night.state === "open") return err("conflict", `scout night ${id}: The night is still running.`);

  if (!night.dry) {
    const kept = new Set(record.kept);
    const earlier = await readRestated(night, readNight);
    const restated = verifiedRestates(night, earlier);
    for (const c of night.candidates) {
      if (c.kind === "style" && c.extractRunId !== undefined) {
        const r = await applyStyle(claim, c.id, c.extractRunId);
        if (!r.ok) return r;
      } else if (c.kind === "finding" && kept.has(`${c.id}/text`)) {
        const url = night.sources.find((s) => s.id === c.sourceIds[0])?.url;
        // n=2 only for a restatement the earlier night's record vouches for.
        const { restates: _said, ...alone } = c;
        const r = await v1Call(() => appendFinding(id, restated.has(c.id) ? c : alone, url));
        if (!r.ok) return r;
      } else if (c.kind === "watch" && kept.has(`${c.id}/text`)) {
        const r = await v1Call(() => appendWatch(id, c));
        if (!r.ok) return r;
      } else if (c.kind === "asset3d" && c.assetId !== undefined) {
        const r = await applyAsset(c.assetId, c.id, record);
        if (!r.ok) return r;
      }
    }
    // Then what the keeps earned: once by key, so a redelivery queues nothing.
    const leads = leadEventsOf({ night, kept: record.kept, earlier });
    const queued = leads.length === 0 ? ok([]) : await v1Call(() => queueEvents(leads));
    if (!queued.ok) return queued;
  }
  // Last: the record that says every write above has happened.
  const after = await v1Call(() => mutateNight(id, (n) => (n.committed !== undefined ? n : { ...n, state: "committed", committed: record })));
  if (!after.ok) return after;
  return settled(after.value) ?? err("internal", `scout night ${id}: the commit record did not land in ${nightDir(id)}`);
}

export const scoutAdapter: DecisionAdapter<ScoutRead> = { source: "scout", read, packet, consequence, apply };
