import "server-only";

import type { BlobRef } from "@gt/domain/blob";
import type { Grade } from "@gt/domain/candidate";
import type { Decision } from "@gt/domain/decision";
import { errorMessage } from "@gt/domain/errors";
import { SOURCES } from "@gt/domain/source";
import { sha256Hex } from "@gt/kernel/canonical";
import type { InitialDecision } from "@gt/kernel/decision/driver";
import type { ItemWords, RowWords } from "@gt/ui/board/port";

import { EXTRACT_COMMITTABLE } from "../../../foundry/plant.ts";
import { TECHNIQUE_LABEL, type GateResult, type MeshAsset } from "../../../foundry/mesh/types.ts";
import { patternsRel } from "../../../foundry/scout/knowledge.ts";
import { CANDIDATE_KINDS, cellId, type Asset3dCandidate, type Candidate, type CandidateId, type Night, type NightCommit, type SceneCandidate, type SceneClip } from "../../../foundry/scout/types.ts";
import { meshFileUrl } from "../../../library/feeds/mesh.ts";
import { decisionMap, type Loss } from "../types.ts";
import { extractAdapter, planLooks, type ExtractV1 } from "./extract.ts";
import { lookBrief, sceneBrief } from "./scoutBrief.ts";

// THE SCOUT PACKET'S CELLS, PURE - what lib/decision/v1/sources/scout.ts opens,
// previews and applies, planned from one read of the night. Kept apart from the
// adapter so the plan is a function of the read alone, and so each half stays
// under the file bound.
//
// THE SHAPE. One row per candidate, in kind order (style, scene, finding,
// watch, asset3d), then the night's own order:
//   style    the extract adapter's own rows and cells (one row per look, the
//            gallery source its reference), each id under the candidate:
//            `c-01/<look>/replica-1`. Planned by extract.ts `planLooks`, so the
//            cells, grades, imported verdicts and losses are the extract
//            adapter's, never a second reading of the same run.
//   scene    its first keyframe as the reference (input, never output), its
//            replica stills `c-04/replica-N` and its clip `c-04/clip`.
//   finding  one TEXT cell `c-07/text`: the claim, the quote under it, the
//            template and step it would land in.
//   watch    one TEXT cell `c-09/text`: the entry and why.
//   asset3d  its concept as the reference, filed under `3d` (the run grid's category); one cell
//            per FINISHED variant of its mesh asset, `c-05/t2`, whose media is the finished glb
//            (the rigged one when rigged) and whose tile is its poster render - the viewer mounts
//            only in the zoom. Its words carry the work: technique, triangles against the class
//            budget, every gate's verdict and score, the variant's approach. A variant that failed
//            or has not finished is a Loss with its own sentence.
// A text cell's media is the content address of its own words (text/plain):
// the kernel holds candidates by blob, and the words are the thing judged.
//
// A CANDIDATE WITH NOTHING TO JUDGE is a Loss, not a cell: the Board has no
// cell it can draw and refuse to keep, and a failed render kept by a stray K
// would admit nothing anyway. Its `error` rides in the Loss verbatim, which
// the gate draws before the commit.

export type StyleRead = { readonly kind: "read"; readonly v1: ExtractV1 } | { readonly kind: "unread"; readonly error: string };
export type AssetRead = { readonly kind: "read"; readonly asset: MeshAsset } | { readonly kind: "unread"; readonly error: string };

export type ScoutV1 = {
  readonly night: Night;
  /** By style candidate id: its extract run as the extract adapter read it, or why it could not. */
  readonly styles: Readonly<Record<string, StyleRead>>;
  /** By asset3d candidate id: its mesh asset as the mesh store read it, or why it could not. */
  readonly assets: Readonly<Record<string, AssetRead>>;
  /** By night-relative file (a mesh file by `meshKey`): the content address of every picture, clip or glb a cell or a row may show. */
  readonly media: Readonly<Record<string, BlobRef>>;
  /** By finding or watch candidate id: the knowledge file its line would land in, as it stands now. */
  readonly knowledge: Readonly<Record<string, { readonly rel: string; readonly exists: boolean; readonly holds: boolean }>>;
  /** Repo-relative roots the consequence names: the night store and the knowledge tree. */
  readonly at: { readonly scout: string; readonly knowledge: string; readonly mesh: string };
};

export type Cell = {
  readonly id: string;
  readonly candidate: CandidateId;
  readonly kind: Candidate["kind"];
  readonly row: string;
  readonly jobId: string;
  readonly media: BlobRef;
  readonly grades: readonly Grade[];
  readonly url: string;
  readonly words: ItemWords;
};

export type Built = {
  readonly cells: readonly Cell[];
  readonly rows: readonly RowWords[];
  readonly initial: readonly InitialDecision[];
  readonly losses: readonly Loss[];
  /** Style candidates whose looks are in the packet, by candidate id: the run they commit through. */
  readonly runs: Readonly<Record<string, ExtractV1>>;
};

/** v1's file route for a night file (app/api/foundry/file `kind=scout`, lib/foundry/scout/store.ts scoutFileStat). */
export function scoutFileUrl(night: string, rel: string): string {
  return `/api/foundry/file?${new URLSearchParams({ run: night, path: rel, kind: "scout" }).toString()}`;
}

/** The content address of a text cell: its words, as the blob they would be. */
export function textRef(text: string): BlobRef {
  return { sha256: sha256Hex(text), bytes: Buffer.byteLength(text, "utf8"), mime: "text/plain" };
}

const ORDER: Readonly<Record<Candidate["kind"], number>> = Object.fromEntries(CANDIDATE_KINDS.map((k, i) => [k, i])) as Record<Candidate["kind"], number>;

/** The media key of a mesh asset's file: never a night-relative path, so the two stores cannot collide. */
export const meshKey = (asset: string, rel: string): string => `mesh:${asset}/${rel}`;

/** At most 40 characters, cut on a word with an ellipsis. */
const clip40 = (s: string): string => (s.length <= 40 ? s : `${s.slice(0, 39).replace(/\s+\S*$/, "")}…`);

/** A night-relative file's tail, for a label: `scenes/c-04/replica-1.jpg` -> `replica-1`. */
const stem = (rel: string): string => rel.slice(rel.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");

function styleCells(night: Night, c: Candidate & { kind: "style" }, read: StyleRead | undefined, out: Mutable): void {
  if (read === undefined) {
    out.losses.push({ candidate: c.id, grade: "dropped", reason: c.error ?? "no extract run was recorded for this style" });
    return;
  }
  if (read.kind === "unread") {
    out.losses.push({ candidate: c.id, grade: "dropped", reason: read.error });
    return;
  }
  const ex = read.v1;
  // A dry night's run is dry too: triaged here, never committed (the extract adapter refuses it).
  const plan = night.dry && ex.run.dry === true && EXTRACT_COMMITTABLE.includes(ex.run.status) ? planLooks(ex) : extractAdapter.packet(ex);
  if (!plan.ok) {
    out.losses.push({ candidate: c.id, grade: "dropped", reason: plan.error.message });
    return;
  }
  const p = plan.value;
  const under = (id: string): string => cellId(c.id, id);
  for (const it of p.packet.items) {
    out.cells.push({
      id: under(it.id),
      candidate: c.id,
      kind: "style",
      row: under(it.row ?? it.id),
      jobId: it.jobId,
      media: it.media,
      grades: it.grades,
      url: p.urls[it.id] ?? "",
      words: p.present.items[it.id] ?? { label: it.id },
    });
  }
  out.rows.push(
    ...p.present.rows.map((r) => {
      const look = ex.run.styles.find((st) => st.id === r.id);
      return { ...r, id: under(r.id), group: "art styles", ...(look === undefined ? {} : lookBrief(look)), ...(c.use === undefined ? {} : { use: c.use }) };
    }),
  );
  out.initial.push(...p.initial.map((d) => ({ ...d, candidate: under(d.candidate) })));
  out.losses.push(...p.losses.map((l) => ({ ...l, candidate: under(l.candidate ?? "") })));
  out.runs[c.id] = ex;
}

/**
 * A clip's meta: its length, and `local · free` when it was rendered on this box. The engine is
 * what the clip act recorded (lib/producers/scoutSceneActs.ts `ClipRecord`); a local clip books no
 * spend row, so the absence of a price is only "free" when the record says where it was made.
 */
export function clipMeta(clip: SceneClip): string {
  const engine = (clip as SceneClip & { readonly engine?: string }).engine;
  return engine === "ltx-local" ? `${clip.durationS}s · local · free` : `${clip.durationS}s`;
}

function sceneCells(night: Night, c: SceneCandidate, media: ScoutV1["media"], out: Mutable): void {
  const r = c.recipe;
  const jobId = c.jobId ?? `scout:${night.id}`;
  const shown: Cell[] = [];
  c.replicas.forEach((file, i) => {
    const m = media[file];
    if (m === undefined) return;
    shown.push({ id: cellId(c.id, `replica-${i + 1}`), candidate: c.id, kind: "scene", row: c.id, jobId, media: m, grades: [], url: scoutFileUrl(night.id, file), words: { label: `replica ${i + 1}`, ...(r === undefined ? {} : { prompt: `${r.composition} · ${r.lighting} · ${r.prompt}` }) } });
  });
  const clip = c.clip;
  const cm = clip === undefined ? undefined : media[clip.path];
  if (clip !== undefined && cm !== undefined) {
    shown.push({ id: cellId(c.id, "clip"), candidate: c.id, kind: "scene", row: c.id, jobId, media: cm, grades: [], url: scoutFileUrl(night.id, clip.path), words: { label: `clip · ${stem(clip.from)}`, meta: clipMeta(clip), ...(r === undefined ? {} : { prompt: `${r.motion} · ${r.rhythm}` }) } });
  }
  for (const f of c.replicas) if (media[f] === undefined) out.losses.push({ candidate: c.id, grade: "dropped", reason: `${f} is not on disk` });
  if (clip !== undefined && cm === undefined) out.losses.push({ candidate: c.id, grade: "dropped", reason: `${clip.path} is not on disk` });
  if (shown.length === 0) {
    out.losses.push({ candidate: c.id, grade: "dropped", reason: c.error ?? "the scene drew no replica on disk" });
    return;
  }
  if (c.status === "failed" && c.error !== undefined) out.losses.push({ candidate: c.id, grade: "approximate", reason: c.error });
  const key = c.keyframes[0];
  // The row's label is the shot and the camera's first clause - the label column is narrow, and the
  // whole recipe there made one row ~400px tall (2026-10-22 dry campaign). Composition, light and
  // the full prompt are each replica's own words, shown in the zoom.
  const label = r === undefined ? `scene ${c.id}` : clip40(`${r.shot} · ${r.camera.split(/[,;]/)[0] ?? r.camera}`);
  out.cells.push(...shown);
  out.rows.push({ id: c.id, label, group: "videos", ...(r === undefined ? {} : sceneBrief(r)), ...(c.use === undefined ? {} : { use: c.use }), ...(key !== undefined && media[key] !== undefined ? { ref: scoutFileUrl(night.id, key) } : {}) });
}

function textCell(night: Night, c: Candidate & { kind: "finding" | "watch" }, out: Mutable): void {
  if (c.kind === "finding") {
    // A line with nowhere to land is not judgeable: a keep could only fail the night's apply.
    try {
      patternsRel(c.template, c.step);
    } catch (e) {
      out.losses.push({ candidate: c.id, grade: "dropped", reason: errorMessage(e) });
      return;
    }
  }
  const words: ItemWords = c.kind === "finding" ? { label: c.claim, meta: `${c.template} · ${c.step}`, prompt: c.quote } : { label: c.entry, meta: "watchlist", prompt: c.why };
  const body = c.kind === "finding" ? `${c.template}/${c.step}\n${c.claim}\n${c.quote}` : `${c.entry}\n${c.why}`;
  out.cells.push({ id: cellId(c.id, "text"), candidate: c.id, kind: c.kind, row: c.id, jobId: c.jobId ?? `scout:${night.id}`, media: textRef(body), grades: [], url: scoutFileUrl(night.id, "night.json"), words });
  out.rows.push({ id: c.id, label: c.kind === "finding" ? `finding · ${c.template}` : "watch", group: c.kind === "finding" ? "notes" : "sources" });
}

/** Every gate a variant carries, as its verdict and score: `input pass 100 · mesh warn 85 · rig pass 92`. */
export const gateWords = (gates: readonly GateResult[]): string => gates.map((g) => `${g.name} ${g.verdict}${g.score === undefined ? "" : ` ${g.score}`}`).join(" · ");

const tris = (n: number): string => n.toLocaleString("en-US");

function assetCells(night: Night, c: Asset3dCandidate, read: AssetRead | undefined, media: ScoutV1["media"], out: Mutable): void {
  if (read === undefined) {
    out.losses.push({ candidate: c.id, grade: "dropped", reason: c.error ?? "no mesh asset was written for this brief" });
    return;
  }
  if (read.kind === "unread") {
    out.losses.push({ candidate: c.id, grade: "dropped", reason: read.error });
    return;
  }
  const a = read.asset;
  let shown = 0;
  for (const v of a.variants) {
    const id = cellId(c.id, v.id);
    const glb = v.files.rigged ?? v.files.glb;
    if (v.status !== "finished" || glb === undefined) {
      const why = v.status === "failed" ? (v.error ?? `${v.id} failed with no error recorded`) : v.status === "finished" ? `${v.id} is finished and names no glb` : `${v.id} is ${v.status}: its ${v.status === "pending" ? "mesh" : "finish"} job has not finished`;
      out.losses.push({ candidate: id, grade: "dropped", reason: why });
      continue;
    }
    const m = media[meshKey(a.id, glb)];
    if (m === undefined) {
      out.losses.push({ candidate: id, grade: "dropped", reason: `${a.id}/${glb} is not on disk` });
      continue;
    }
    const meta = [v.tris === undefined ? `budget ${tris(a.brief.budgetTris)} tris` : `${tris(v.tris)} / ${tris(a.brief.budgetTris)} tris`, gateWords(v.gates)].filter((x) => x !== "").join(" · ");
    out.cells.push({
      id,
      candidate: c.id,
      kind: "asset3d",
      row: c.id,
      jobId: v.jobs.at(-1) ?? c.jobId ?? `scout:${night.id}`,
      media: m,
      grades: [],
      url: meshFileUrl(a.id, glb),
      words: { label: `${v.technique} · ${TECHNIQUE_LABEL[v.technique]}`, meta, ...(v.approach === undefined ? {} : { prompt: v.approach }), ...(v.files.poster === undefined ? {} : { poster: meshFileUrl(a.id, v.files.poster) }) },
    });
    shown++;
  }
  if (shown === 0) return;
  const concept = c.concepts[0];
  out.rows.push({ id: c.id, label: clip40(`${a.brief.class} · ${a.brief.subject}`), group: "3d", ...(concept !== undefined && media[concept] !== undefined ? { ref: scoutFileUrl(night.id, concept) } : {}) });
}

type Mutable = { cells: Cell[]; rows: RowWords[]; initial: InitialDecision[]; losses: Loss[]; runs: Record<string, ExtractV1> };

/** Every cell, row, imported verdict and loss of the night's packet. */
export function build(v1: ScoutV1): Built {
  const out: Mutable = { cells: [], rows: [], initial: [], losses: [], runs: {} };
  const night = v1.night;
  const sorted = [...night.candidates].sort((a, b) => (ORDER[a.kind] ?? 0) - (ORDER[b.kind] ?? 0));
  for (const c of sorted) {
    if (c.status === "pending") {
      out.losses.push({ candidate: c.id, grade: "dropped", reason: "pending when the night closed: nothing to judge" });
      continue;
    }
    if (c.kind === "style") styleCells(night, c, v1.styles[c.id], out);
    else if (c.kind === "scene") sceneCells(night, c, v1.media, out);
    else if (c.kind === "asset3d") assetCells(night, c, v1.assets[c.id], v1.media, out);
    // STUB (spark scout-idea-artboards WP-I0): WP-I3 draws an idea as a one-cell run.
    else if (c.kind === "idea") out.losses.push({ candidate: c.id, grade: "dropped", reason: "idea cells are not drawn on the Board yet" });
    else if (c.status === "failed") out.losses.push({ candidate: c.id, grade: "dropped", reason: c.error ?? "failed with no error recorded" });
    else textCell(night, c, out);
  }
  return out;
}

/* ── one candidate's slice, as the extract adapter takes it ────────────────── */

const EXTRACT = SOURCES.extract;
const EXTRACT_REASONS: readonly string[] = EXTRACT.reasons;

/** The cell id inside its candidate (`c-01/haze/replica-1` -> `haze/replica-1`), or null for another candidate's. */
export function within(candidate: string, id: string): string | null {
  return id.startsWith(`${candidate}/`) ? id.slice(candidate.length + 1) : null;
}

/**
 * A scout decision as the extract adapter reads it: keyed by the run's own cell
 * id, with the reasons extract has words for; the scout's others (`motion`,
 * `rights`, `generic`) lead the note, cut at extract's bound, so v1's record
 * still says why.
 */
export function asExtractDecision(d: Decision, packetId: string, rest: string): Decision {
  const known = d.reasons.filter((r) => EXTRACT_REASONS.includes(r));
  const others = d.reasons.filter((r) => !EXTRACT_REASONS.includes(r));
  const text = [others.length > 0 ? `scout: ${others.join(", ")}` : "", d.note ?? ""].filter((s) => s !== "").join("\n");
  const note = text.length > EXTRACT.noteMax ? `${text.slice(0, EXTRACT.noteMax - 1)}…` : text;
  const { note: _was, ...base } = d;
  return { ...base, key: `${packetId}::${rest}`, reasons: known, ...(note === "" ? {} : { note }) };
}

/** The decisions on one style candidate's cells, as the extract adapter takes them. */
export function extractDecisions(decisions: readonly Decision[], packetId: string, candidate: string): Decision[] {
  const out: Decision[] = [];
  for (const d of decisionMap(decisions).values()) {
    const at = d.key.indexOf("::");
    const rest = within(candidate, at < 0 ? d.key : d.key.slice(at + 2));
    if (rest !== null) out.push(asExtractDecision(d, packetId, rest));
  }
  return out;
}

/* ── the night's record ────────────────────────────────────────────────────── */

/** What `night.committed` holds after this outcome: every verdict on the packet's cells, in packet order. */
export function commitOf(night: Night, items: readonly string[], decisions: readonly Decision[], at: string): NightCommit {
  const byCell = decisionMap(decisions);
  const kept: string[] = [];
  const rejected: string[] = [];
  const reasons: Record<string, readonly string[]> = {};
  const notes: Record<string, string> = {};
  let operator = false;
  for (const id of items) {
    const d = byCell.get(id);
    if (d === undefined || d.verdict === null) continue;
    if (d.by === "operator") operator = true;
    if (d.verdict === "keep") kept.push(id);
    else {
      rejected.push(id);
      if (d.reasons.length > 0) reasons[id] = [...d.reasons];
    }
    if (d.note !== undefined) notes[id] = d.note;
  }
  return { at, by: operator ? "operator" : "agent", kept, rejected, reasons, notes, dry: night.dry };
}

/** Two records hold the same outcome: the same cells kept and rejected, whenever and by whomever. */
export function sameOutcome(a: Pick<NightCommit, "kept" | "rejected">, b: Pick<NightCommit, "kept" | "rejected">): boolean {
  const key = (xs: readonly string[]) => [...xs].sort().join("\u0000");
  return key(a.kept) === key(b.kept) && key(a.rejected) === key(b.rejected);
}
