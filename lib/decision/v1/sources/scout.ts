import "server-only";

import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import type { ConsequenceItem } from "@gt/domain/board";
import type { Decision } from "@gt/domain/decision";
import type { Actor } from "@gt/domain/event";
import type { Genre } from "@gt/domain/genre";
import type { LoadSummary } from "@gt/domain/load";
import { err, ok, type Result } from "@gt/domain/errors";
import type { ApplyClaim } from "@gt/kernel/decision/apply";
import type { Store } from "@gt/kernel/store";
import { bornGenre, bornVenture, listGenres } from "@gt/kernel/ventures/store";

import { planExtractCommit } from "../../../foundry/commitPlan.ts";
import { getExtractRun, patchExtractVerdicts } from "../../../foundry/extract/store.ts";
import type { ExtractVerdictRecord } from "../../../foundry/extract/types.ts";
import { genreLead, leadCell, leadEventsOf, readRestated, verifiedRestates, type LeadDraft } from "../../../foundry/scout/leadEvents.ts";
import { leadsFile, queueEvents, readQueue } from "../../../foundry/scout/leads.ts";
import { processNightLoad } from "../../../foundry/scout/load.ts";
import { appendCharacter, appendFinding, appendTechnique, appendWatch, knowledgeRoot } from "../../../foundry/scout/knowledge.ts";
import { meshRoot, mutateAsset, readAsset, resolveInAsset, withVariant } from "../../../foundry/mesh/store.ts";
import { deskAbs, deskCellUrl, readDeskNight, saveDeskNight } from "../../../foundry/local-draws/desk.ts";
import { followNight } from "../../../foundry/scout/episodeMoves.ts";
import { openOf, remainderLine, splitPart } from "../../../foundry/scout/parts.ts";
import { mutateNight, nightDir, nightRoot, readNight, resolveInNight } from "../../../foundry/scout/store.ts";
import type { GenreProposalCandidate, Night, NightId, VentureProposalCandidate } from "../../../foundry/scout/types.ts";
import { wingRunId, type ScoutWing } from "../../../foundry/scout/wing.ts";
import { activeWing } from "../../../foundry/scout/wingScope.ts";
import { kernel } from "../../../kernelStore.ts";
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
import { DIRECTION_VERDICT, IDEA_TARGET_WORD, MUSIC_VERDICT, PROPOSAL_REJECTED, STORYBOARD_VERDICT, bornLine, build, commitOf, extractDecisions, ideaCell, meshKey, pieceCell, pieceVerdictLine, sameOutcome, sheetCellOf, sheetVerdictLine, visualizerCell, within, wordsCell, type AssetRead, type ScoutV1, type StyleRead } from "./scoutPlan.ts";
import { reelCutVerdictLine, reelVerdictLine } from "./scoutReelCells.ts";
import { reelCell, reelCutCell } from "../../../foundry/scout/reelTaste.ts";
import { musicOf } from "./scoutMusic.ts";
import { nightRefusal, partOfBuilt, partWords, settledPart, withPart } from "./scoutPart.ts";
import { inWing, isCharacter, keptTechnique, knowledgeOf, knowledgeWrite, nightOfRun, packetMeta, partOfRun } from "./scoutWing.ts";

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
//            for a direction what they work inside or steer away from (taste.ts). A track's
//   track    kept clip is the next night's visualizer and a kept visualizer the music ladder's first
//   visualizer  rung (spark scout-decision-graph): both read that record too, nothing else is written.
//   storyboard  nothing of its own either (spark scout-storyboards): kept whole, the record makes it the root a
//            full-video act names (keptStoryboardFor); the preview says so on its words cell. One that carries
//            a technique (spark scout-vision) files it as a finding's line in its step's PATTERNS.md, same marker.
//   genre    (spark scout-vision S2) a kept proposal BIRTHS its genre or venture in the kernel (packages/kernel/src/
//   venture  ventures/ bornGenre, bornVenture - idempotent on the proposal `<night>/<c-id>`, so a redelivery births
//            nothing twice); the preview names the birth. A rejected one is the record alone: its reasons ban it.
//   piece    a kept piece queues its genre's `genre-publishable` registry lead (leadEvents.ts genreLead) with the leads;
//            the genre's publishable state is derived from the record (lib/foundry/scout/genres.ts), never written.
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
//
// EITHER WING (spark scout-muse): `muse:<night>` is a muse night, decided the same way inside its own root
// (./scoutWing.ts inWing); its findings land in its techniques.md, its watch lines in its watchlist, and a
// kept character idea's card in its characters.md.
//
// IN PARTS (spark scout-storyboards, ./scoutPart.ts, lib/foundry/scout/parts.ts): the night commits with cells left
// undecided, and they open as the remainder packet `pkt:scout:<run>:<n>`. Each part's writes run for its own
// cells; the record merges every part, and the night is `committed` once nothing is left open. A style is decided
// whole: one with an undecided look holds every look for the remainder, its decided looks written as verdicts only.

/** Repo-relative, forward slashes: the roots a consequence names. */
const rel = (abs: string): string => path.relative(process.cwd(), abs).replace(/\\/g, "/");

/** The read, with what the registry leads are derived from (the nights its findings restate, the keys queued) and the night's load (never digested). */
type ScoutRead = ScoutV1 & { readonly wing: ScoutWing; readonly earlier: ReadonlyMap<NightId, Night>; readonly queued: readonly string[]; readonly load?: LoadSummary; readonly desk?: true; /** The part this read opens (absent: 1, the night's own packet). */ readonly part?: number; /** The kernel's genres, read when the night holds a piece (its lead names the genre). */ readonly genres?: readonly Genre[] };

/** The kernel a kept proposal is born into and a piece's genre is read from; the process's (lib/kernelStore.ts) when absent. */
export type ScoutAdapterDeps = { readonly store?: () => Result<Store> };

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

/** The kernel's genres, when the night holds a piece; none read otherwise. */
function genresFor(night: Night, storeOf: () => Result<Store>): Result<readonly Genre[] | undefined> {
  if (!night.candidates.some((c) => c.kind === "piece")) return ok(undefined);
  const s = storeOf();
  return s.ok ? s.value.read((r) => listGenres(r)) : s;
}

/** The `genre-publishable` lead each kept piece queues (spark scout-vision S2), for a genre the kernel holds. */
function pieceLeads(night: Night, kept: Iterable<string>, genres: readonly Genre[] | undefined): LeadDraft[] {
  const keeps = new Set(kept);
  const out: LeadDraft[] = [];
  for (const c of night.candidates) {
    const cell = `${c.id}/video`;
    const g = c.kind === "piece" && keeps.has(cell) ? genres?.find((x) => x.id === c.genre) : undefined;
    if (g !== undefined) out.push(genreLead(night.id, { id: g.id, name: g.name, use: g.use, cells: [cell] }));
  }
  return out;
}

/** A kept proposal's birth in one kernel transaction; a second delivery of the same proposal births nothing. */
function birthOf(storeOf: () => Result<Store>, night: NightId, c: GenreProposalCandidate | VentureProposalCandidate, actor: Actor): Result<void> {
  const s = storeOf();
  if (!s.ok) return s;
  const proposal = `${night}/${c.id}`;
  const r =
    c.kind === "genre"
      ? s.value.tx((t) => bornGenre(t, { name: c.name, bornFrom: c.fromStoryboard, proposal, use: c.use ?? "", look: c.look, grammar: c.grammar }, actor))
      : s.value.tx((t) => bornVenture(t, { name: c.name, kind: c.ventureKind, frame: c.frame, proposal }, actor));
  return r.ok ? ok(undefined) : err(r.error.code, `${c.kind} ${c.id} (${c.name}): ${r.error.message}`, { cause: r.error });
}

/* ── read ──────────────────────────────────────────────────────────────────── */

async function read(ref: AdapterRef, storeOf: () => Result<Store>): Promise<Result<ScoutRead>> {
  const { run: id, part } = splitPart(ref.runId);
  const wing = activeWing();
  const got = await v1Call(() => readNight(id));
  // A scout night wins when both exist, so a desk id can never hide one. A desk night is the scout wing's, and whole.
  let desk = false;
  let night: Night;
  if (got.ok) night = got.value;
  else {
    const alt = wing === "scout" && part === 1 ? await readDeskNight(id) : null;
    if (alt === null) return got;
    night = alt;
    desk = true;
  }
  const locate = (rel: string): string => (desk ? deskAbs(id, rel) : resolveInNight(id, rel));
  const styles: Record<string, StyleRead> = {};
  const assets: Record<string, AssetRead> = {};
  const files: { key: string; abs: string }[] = [];
  const knowledge = await knowledgeOf(night);
  if (!knowledge.ok) return knowledge;
  for (const c of night.candidates) {
    if (c.kind === "style") {
      if (c.extractRunId === undefined) continue;
      const ex = await extractAdapter.read({ runId: c.extractRunId });
      styles[c.id] = ex.ok ? { kind: "read", v1: ex.value } : { kind: "unread", error: ex.error.message };
    } else if (c.kind === "scene" || c.kind === "idea") {
      for (const f of c.kind === "scene" ? [c.keyframes[0], ...c.replicas, c.clip?.path] : [c.image]) {
        if (f === undefined) continue;
        try {
          files.push({ key: f, abs: locate(f) });
        } catch (e) {
          return fromV1(e);
        }
      }
    } else if (c.kind === "asset3d") {
      try {
        for (const f of c.concepts) if (f !== "") files.push({ key: f, abs: locate(f) });
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
    } else if (c.kind === "track" || c.kind === "visualizer" || c.kind === "storyboard" || c.kind === "piece" || c.kind === "sheet" || c.kind === "reel" || c.kind === "reel-cut") {
      // Every cell file must be listed here, or media misses it: a storyboard's frames and a trial's clips too (a failed
      // panel or clip is null), a piece's cut, and a character's reference sheet (spark scout-vision S3).
      const own =
        c.kind === "track"
          ? c.clips.map((x) => x.path)
          : c.kind === "storyboard"
            ? [...(c.images ?? []).map((f) => f ?? undefined), ...(c.clips ?? []).map((x) => x?.path)]
            : c.kind === "piece"
              ? [c.video]
              : c.kind === "sheet" || c.kind === "reel"
                ? [c.image]
                : c.kind === "reel-cut"
                  ? [c.video]
                : [c.video, c.still];
      try {
        for (const f of own) if (f !== undefined) files.push({ key: f, abs: locate(f) });
      } catch (e) {
        return fromV1(e);
      }
    }
  }
  const media = await mediaRefs(files);
  if (!media.ok) return media;
  const queue = await v1Call(() => readQueue());
  if (!queue.ok) return queue;
  const earlier = await readRestated(night, readNight);
  const load = processNightLoad(night);
  const music = await musicOf(night);
  if (!music.ok) return music;
  const genres = genresFor(night, storeOf);
  if (!genres.ok) return genres;
  return ok({ ...(genres.value === undefined ? {} : { genres: genres.value }), ...(load === undefined ? {} : { load }), ...(desk ? { desk: true } : {}), ...(part === 1 ? {} : { part }), ...music.value, wing, night, styles, assets, media: Object.fromEntries(media.value), knowledge: knowledge.value, at: { scout: rel(nightRoot(night.id)), knowledge: rel(knowledgeRoot()), mesh: rel(meshRoot()) }, earlier, queued: queue.value.events.map((e) => e.key) });
}

/* ── packet ────────────────────────────────────────────────────────────────── */

function packet(v1: ScoutV1 & Pick<ScoutRead, "wing" | "load" | "desk" | "part">): Result<OpenPlan> {
  const n = v1.night;
  const part = v1.part ?? 1;
  const no = nightRefusal(n, part);
  if (no !== undefined) return err("refused", `scout night ${n.id}: ${no}`);
  const b = partOfBuilt(build(v1), n, part);
  if (b.cells.length === 0) return err("refused", `scout night ${n.id} has nothing rendered to judge`);
  const run = wingRunId(v1.wing, n.id, part);
  const minted = mintPacket({
    id: packetIdOf("scout", run),
    lane: "image",
    source: "scout",
    mode: "matrix-cull",
    state: "open",
    runId: run,
    title: `${v1.wing} ${n.id}${part === 1 ? "" : ` · part ${part}`}`,
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
      meta: packetMeta(v1.wing, n),
      ...(v1.load === undefined ? {} : { load: v1.load }),
    },
    urls: Object.fromEntries(b.cells.map((c) => [c.id, v1.desk ? deskUrl(n, c.candidate, c.url) : c.url])),
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
  // A part that landed between the preview and the commit is a different packet too: the record is read.
  return v1DigestOf({ source: "scout", night: v1.night.id, state: v1.night.state, candidates: v1.night.candidates, media: shas(v1.media), runs: runs.sort(), assets: assets.sort(), restated, part: v1.part ?? 1, committed: v1.night.committed ?? null });
}

/** A desk night's picture is served from the local-draws route, not the scout file route. */
function deskUrl(night: Night, candidate: string, fallback: string): string {
  const c = night.candidates.find((x) => x.id === candidate);
  return c?.kind === "idea" && c.image !== undefined ? deskCellUrl(night.id, c.image) : fallback;
}

function consequence(v1: ScoutRead, at: DecisionsAt): Result<Preview> {
  const n = v1.night;
  const part = v1.part ?? 1;
  const no = nightRefusal(n, part);
  if (no !== undefined) return err("refused", `scout night ${n.id}: ${no}`);
  const b = partOfBuilt(build(v1), n, part);
  const ids = b.cells.map((c) => c.id);
  const byCell = decisionMap(at.decisions);
  const kept = new Set(ids.filter((id) => byCell.get(id)?.verdict === "keep"));
  const v1Digest = digestOf(v1);
  // What this part leaves for the next: its undecided cells, and every cell of a style still holding one (commitOf).
  const left = openOf(commitOf(n, ids, at.decisions, "")).length;
  if (ids.length > 0 && left === ids.length) return err("refused", `scout night ${n.id}: nothing decided; ${left} undecided`);
  const next = packetIdOf("scout", wingRunId(v1.wing, n.id, part + 1));
  const nightFile = { kind: "file" as const, target: `${v1.at.scout}/${n.id}/night.json` };
  const remainder = left === 0 ? [] : [{ ...nightFile, detail: remainderLine(left, next) }];
  // A desk commit names no scout path. Taste, knowledge and the library are not in the write. A desk night is whole.
  if (v1.desk) {
    if (left > 0) return err("refused", `desk night ${n.id} commits whole: ${left} undecided`);
    return ok({ v1Digest, consequence: buildConsequence(at, ids, { writes: [{ kind: "file", target: `local-draws/${n.id}/night.json`, detail: "verdicts stay on this desk; scout taste, knowledge and the library are not written" }] }, v1Digest) });
  }
  if (n.dry) {
    const dry = part === 1 && left === 0 ? "committed · dry: the verdicts only; no style, scene or knowledge is admitted" : `${partWords(part, left)} · dry: the verdicts only`;
    return ok({ v1Digest, consequence: buildConsequence(at, ids, { writes: [{ ...nightFile, detail: dry }, ...remainder] }, v1Digest) });
  }
  type Mut<T> = T extends readonly (infer U)[] ? U[] : never;
  const parts: { [K in "writes" | "promotions" | "renames" | "nearDuplicates"]: Mut<NonNullable<ConsequenceParts[K]>> } = { writes: [], promotions: [], renames: [], nearDuplicates: [] };
  const under = (cid: string, x: string | undefined): string | undefined => (x === undefined ? undefined : `${cid}/${x}`);
  for (const [cid, ex] of Object.entries(b.runs)) {
    const items = b.cells.filter((c) => c.candidate === cid).map((c) => ({ id: within(cid, c.id) ?? c.id, row: within(cid, c.row) ?? c.row }));
    const decisions = extractDecisions(at.decisions, at.packetId, cid);
    if (items.some((it) => (byCell.get(`${cid}/${it.id}`)?.verdict ?? null) === null)) {
      parts.writes.push({ kind: "file", target: `foundry-out/extract/${ex.run.id}/verdicts.json`, candidate: cid, detail: `a look undecided: the decided looks' verdicts only, every look to ${next}` });
      continue;
    }
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
      if (kept.has(cell) && k !== undefined) parts.writes.push(knowledgeWrite(v1.at.knowledge, c, k, cell));
    } else if (c.kind === "idea" || c.kind === "direction") {
      const cell = c.kind === "idea" ? ideaCell(c.id) : `${c.id}/text`;
      const d = byCell.get(cell)?.verdict;
      if (d === "keep" || d === "reject") parts.writes.push({ ...nightFile, candidate: cell, detail: c.kind === "direction" ? DIRECTION_VERDICT[d] : d === "keep" ? `develops next night as a ${IDEA_TARGET_WORD[c.target]}` : "blocked" });
      const k = v1.knowledge[c.id];
      if (d === "keep" && k !== undefined) parts.writes.push(knowledgeWrite(v1.at.knowledge, c, k, cell));
    } else if (c.kind === "track" || c.kind === "visualizer") {
      // A kept clip is the next night's visualizer, a kept visualizer the ladder's first rung; both read the record below.
      for (const cell of c.kind === "track" ? c.clips.map((x) => `${c.id}/${x.part}`) : [visualizerCell(c.id)]) {
        const d = byCell.get(cell);
        if (d?.verdict === "keep") parts.writes.push({ ...nightFile, candidate: cell, detail: MUSIC_VERDICT[c.kind] });
        else if (d?.verdict === "reject") parts.writes.push({ ...nightFile, candidate: cell, detail: `rejected${d.reasons.length === 0 ? "" : `: ${d.reasons.join(", ")}`}` });
      }
    } else if (c.kind === "storyboard") {
      // Judged whole (lib/foundry/scout/storyboardKept.ts): its words kept, or a cell kept and none rejected.
      const mine = ids.filter((id) => id.startsWith(`${c.id}/`)).map((id) => [id, byCell.get(id)?.verdict] as const);
      const words = wordsCell(c.id);
      const rejected = mine.some(([, v]) => v === "reject");
      const verdict = kept.has(words) || (mine.some(([, v]) => v === "keep") && !rejected) ? "keep" : rejected ? "reject" : undefined;
      if (verdict !== undefined) parts.writes.push({ ...nightFile, candidate: words, detail: STORYBOARD_VERDICT[verdict] });
      const k = v1.knowledge[c.id];
      if (verdict === "keep" && k !== undefined) parts.writes.push(knowledgeWrite(v1.at.knowledge, c, k, words));
    } else if (c.kind === "genre" || c.kind === "venture") {
      const words = wordsCell(c.id);
      const d = byCell.get(words)?.verdict;
      if (d === "keep") parts.promotions.push({ target: c.kind === "genre" ? "genres" : "ventures", candidate: words, detail: bornLine(c) });
      else if (d === "reject") parts.writes.push({ ...nightFile, candidate: words, detail: PROPOSAL_REJECTED });
    } else if (c.kind === "piece") {
      // Kept, the genre is publishable - derived from this record, nothing else written; its lead is named below.
      const cell = pieceCell(c.id);
      const d = byCell.get(cell)?.verdict;
      if (d === "keep" || d === "reject") parts.writes.push({ ...nightFile, candidate: cell, detail: pieceVerdictLine(c, d) });
    } else if (c.kind === "sheet") {
      // Kept, it is her reference - derived from this record (characters.ts keptCharacters), nothing else written.
      const cell = sheetCellOf(c.id);
      const d = byCell.get(cell)?.verdict;
      if (d === "keep" || d === "reject") parts.writes.push({ ...nightFile, candidate: cell, detail: sheetVerdictLine(c, d) });
    } else if (c.kind === "reel" || c.kind === "reel-cut") {
      // Kept, a reel makes its full cut due (taste `## Reels to cut`) and a cut is the output - derived from this record.
      const cell = c.kind === "reel" ? reelCell(c.id) : reelCutCell(c.id);
      const d = byCell.get(cell)?.verdict;
      if (d === "keep" || d === "reject") parts.writes.push({ ...nightFile, candidate: cell, detail: c.kind === "reel" ? reelVerdictLine(d) : reelCutVerdictLine(d) });
    }
  }
  // What the keeps earn, over every part's keeps; a later part names only the leads it adds.
  const allKept = new Set([...kept, ...(n.committed?.kept ?? [])]);
  for (const e of [...leadEventsOf({ night: n, kept: allKept, earlier: v1.earlier }), ...pieceLeads(n, allKept, v1.genres)]) {
    const cell = leadCell(e);
    const queued = v1.queued.includes(e.key);
    if (queued && part > 1) continue;
    parts.writes.push({ kind: "file", target: rel(leadsFile()), ...(cell === undefined ? {} : { candidate: cell }), detail: `${queued ? "already queued" : "queues a registry lead"}: ${e.kind} ${e.refs[0] ?? ""}` });
  }
  parts.writes.push({ ...nightFile, detail: partWords(part, left) }, ...remainder);
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
  return verdictsOnly(runId, looks);
}

/**
 * A style held for the remainder (a look still undecided, commitOf): the looks this part decided reach v1 as
 * verdicts and the run stays uncommitted, so the remainder packet opens every look with them imported.
 */
async function holdStyle(claim: ApplyClaim, cid: string, runId: string): Promise<Result<void>> {
  const items = claim.packet.items.flatMap((it) => {
    const id = within(cid, it.id);
    return id === null ? [] : [{ id, row: within(cid, it.row ?? "") ?? id.slice(0, id.lastIndexOf("/")) }];
  });
  const looks = looksOf(items, extractDecisions(claim.decisions, claim.packetId, cid));
  return verdictsOnly(runId, new Map([...looks].filter(([, d]) => d.verdict !== null)));
}

/** Looks' verdicts written to an extract run, no commit; a committed run must already hold the same keeps. */
async function verdictsOnly(runId: string, looks: ReadonlyMap<string, LookDecision>): Promise<Result<void>> {
  const fresh = await v1Call(() => getExtractRun(runId));
  if (!fresh.ok) return fresh;
  const { run, verdicts } = fresh.value;
  if (run.status === "committed") {
    const kept = new Set(run.committed?.kept ?? []);
    const differ = [...looks].filter(([look, d]) => (d.verdict === "keep") !== kept.has(look)).map(([look]) => look);
    if (differ.length === 0) return ok(undefined);
    return err("refused", `extract run ${runId} was committed in v1 with other verdicts: ${differ.map((l) => `${l} is ${kept.has(l) ? "kept" : "not kept"} in v1, ${looks.get(l)?.verdict ?? "undecided"} here`).join("; ")}`);
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

async function apply(claim: ApplyClaim, storeOf: () => Result<Store>): Promise<Result<void>> {
  const done = committedOutcome(claim);
  if (!done.ok) return done;
  const runId = runIdOf(claim);
  if (!runId.ok) return runId;
  const id = nightOfRun(runId.value);
  const got = await v1Call(() => readNight(id));
  if (!got.ok) {
    const desk = activeWing() === "scout" ? await readDeskNight(id) : null;
    if (desk === null) return got;
    const items = claim.packet.items.map((it) => it.id);
    const record = commitOf(desk, items, claim.decisions, new Date().toISOString());
    if (desk.committed !== undefined) {
      if (sameOutcome(desk.committed, record)) return ok(undefined);
      return err("refused", `desk night ${id} was committed with other verdicts`);
    }
    if (desk.state === "open") return err("conflict", `desk night ${id}: The night is still running.`);
    const saved = await v1Call(() => saveDeskNight({ ...desk, state: "committed", committed: record }));
    if (!saved.ok) return saved;
    return ok(undefined);
  }
  const night = got.value;
  const part = partOfRun(runId.value);
  const items = claim.packet.items.map((it) => it.id);
  // This part's own record: its decided cells, and `open` = what it leaves (a style holding an undecided look whole).
  const record = commitOf(night, items, claim.decisions, new Date().toISOString());
  const held = new Set(openOf(record));

  const settled = (n: Night): Result<void> | undefined => settledPart(id, n.committed, record, part);
  const before = settled(night);
  // A redelivery of a part already merged still walks the episodes: a crash between the record and the moves is made up here.
  if (before?.ok === true) await followNight(night);
  if (before !== undefined) return before;
  if (night.state === "open") return err("conflict", `scout night ${id}: The night is still running.`);

  if (!night.dry) {
    const kept = new Set(record.kept);
    const earlier = await readRestated(night, readNight);
    const restated = verifiedRestates(night, earlier);
    // A kept proposal is born by the operator's keep; a record no operator decided is the agent's, delivered by this holder.
    const actor: Actor = record.by === "operator" ? { kind: "operator", id: "board" } : { kind: "machine", id: claim.holder };
    for (const c of night.candidates) {
      if (c.kind === "style" && c.extractRunId !== undefined) {
        const holding = items.some((it) => it.startsWith(`${c.id}/`) && held.has(it));
        const r = holding ? await holdStyle(claim, c.id, c.extractRunId) : await applyStyle(claim, c.id, c.extractRunId);
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
      } else if (isCharacter(c) && kept.has(ideaCell(c.id))) {
        const r = await v1Call(() => appendCharacter(id, c));
        if (!r.ok) return r;
      } else if (c.kind === "storyboard") {
        const t = keptTechnique(night, record, c);
        const r = t === undefined ? ok(undefined) : await v1Call(() => appendTechnique(id, c, t));
        if (!r.ok) return r;
      } else if (c.kind === "asset3d" && c.assetId !== undefined) {
        const r = await applyAsset(c.assetId, c.id, record);
        if (!r.ok) return r;
      } else if ((c.kind === "genre" || c.kind === "venture") && kept.has(wordsCell(c.id))) {
        const r = birthOf(storeOf, id, c, actor);
        if (!r.ok) return r;
      }
    }
    // Then what the keeps earned, over every part's keeps: once by key, so a redelivery queues nothing.
    const allKept = [...(night.committed?.kept ?? []), ...record.kept];
    const genres = genresFor(night, storeOf);
    if (!genres.ok) return genres;
    const leads = [...leadEventsOf({ night, kept: allKept, earlier }), ...pieceLeads(night, allKept, genres.value)];
    const queued = leads.length === 0 ? ok([]) : await v1Call(() => queueEvents(leads));
    if (!queued.ok) return queued;
  }
  // Last: the record that says every write above has happened - this part merged into the night's, the night
  // `committed` only once nothing is left open.
  const after = await v1Call(() => mutateNight(id, (n) => withPart(n, record, part)));
  if (!after.ok) return after;
  // The verdict ends a channel episode's candidate: kept, or thrown (lib/foundry/scout/episodeMoves.ts; never fails the commit).
  await followNight(after.value);
  return settled(after.value) ?? err("internal", `scout night ${id}: the commit record did not land in ${nightDir(id)}`);
}

/** The scout adapter over a kernel (a test hands its own; production the process's). */
export function makeScoutAdapter(deps: ScoutAdapterDeps = {}): DecisionAdapter<ScoutRead> {
  const storeOf = deps.store ?? processStore;
  return inWing<ScoutRead>({ source: "scout", partial: true, read: (ref) => read(ref, storeOf), packet, consequence, apply: (claim) => apply(claim, storeOf) });
}

export const scoutAdapter: DecisionAdapter<ScoutRead> = makeScoutAdapter();
