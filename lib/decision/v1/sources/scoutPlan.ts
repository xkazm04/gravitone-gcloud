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
import { mss } from "../../../foundry/scout/track.ts";
import { CANDIDATE_KINDS, cellId, parseCellId, type Asset3dCandidate, type Candidate, type CandidateId, type DirectionCandidate, type IdeaCandidate, type IdeaTarget, type Night, type NightCommit, type SceneCandidate, type SceneClip, type Seed, type StoryboardCandidate, type TrackCandidate, type VisualizerCandidate } from "../../../foundry/scout/types.ts";
import { WORDS_PART } from "../../../foundry/scout/storyboardKept.ts";
import { stillOf } from "../../../foundry/scout/visualizer.ts";
import { meshFileUrl } from "../../../library/feeds/mesh.ts";
import { decisionMap, type Loss } from "../types.ts";
import { extractAdapter, planLooks, type ExtractV1 } from "./extract.ts";
import { lookBrief, sceneBrief } from "./scoutBrief.ts";
import { museFacts, scoutFileUrl } from "./scoutWing.ts";

// THE SCOUT PACKET'S CELLS, PURE - what lib/decision/v1/sources/scout.ts opens,
// previews and applies, planned from one read of the night. Kept apart from the
// adapter so the plan is a function of the read alone, and so each half stays
// under the file bound.
//
// THE SHAPE. One row per candidate, in kind order (style, scene, finding, watch, asset3d, idea,
// direction), then the night's own order:
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
//   idea     ONE cell `c-12/board`, its artboard (`ideas/c-12.png`) the media, filed under
//            `ideas`: the row is the idea's title, its aim (a new idea's one-sentence why; a legacy idea has none), its use and its studio prompt, the cell's
//            meta its target and anchor - all the brief's words, verbatim. Kept, it develops
//            next night into its target; that act reads the night's record, so nothing but
//            `night.committed` is written for it. A stats idea (spark stats-reels) is the same
//            cell: its tile is its strip's frame 120 at the same path, its meta `stats reel · ...`.
//            An idea with a genre names it after its target: `scene · music video · watch: ...`.
//   direction  one TEXT cell `c-14/text` under `notes`: its title, the brief's own words (format ·
//            genre · style · tone for audience · premise) and how many kept cells it stands on.
//   track    (spark scout-decision-graph) one cell per Suno clip `c-15/a1`..`aN`, its mp3 the media,
//            filed under `music` (the audio tab): the row is the seed's sentence - what Suno was
//            asked for - and each clip's meta `track · <genre> › <subgenre> · <N> clips` with its
//            model and length. Kept, a clip is the next night's visualizer.
//   visualizer  ONE cell `c-16/video`, its mp4 the media, under `videos`: the row is the song's
//            title, its still the reference, the meta `visualizer · <m:ss> · still: idea|studio`.
//            A track or a visualizer still collecting when the night closed is a Loss, as any
//            pending candidate is. An idea grown from a seed names the seed's sentence in its meta.
//   storyboard  (spark scout-storyboards) ONE run under `storyboards`, judged whole: a cell per frame on disk,
//            `c-10/panel-N` (N its panel index, 1-based), then ONE text cell `c-10/words` - the paragraph, a
//            blank line, the bullets as `- ` lines - so the run's face is a still. The row is its title and its
//            paragraph; the words cell's meta the idea it composes, the frame count, `local · free` and its seed.
//            A dry or words-only board is the words cell alone; a failed board is a Loss. The cell ids are what
//            lib/foundry/scout/storyboardKept.ts parses: the words kept, or any cell kept and none rejected.
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
  /** By seed ref: every seed a candidate grows from, as the seed store has it (absent: none was read). */
  readonly seeds?: Readonly<Record<string, Seed>>;
  /** By track clip ref (`<night>/<c-id>/<aN>`): the clip each visualizer plays - its title and the track's sentence. */
  readonly tracks?: Readonly<Record<string, { readonly title: string; readonly sentence: string }>>;
  /** By idea ref (`<night>/<c-id>`): the title of each idea a storyboard composes, where its night was readable. */
  readonly ideas?: Readonly<Record<string, string>>;
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

/** A direction's line: `short · animated comedy sketch · cut-paper · dark humour for adults`. */
export const directionLine = (c: Pick<DirectionCandidate, "format" | "genre" | "style" | "tone" | "audience">): string => `${c.format} · ${c.genre} · ${c.style} · ${c.tone} for ${c.audience}`;

/** What a direction's verdict does, as the preview says it. */
export const DIRECTION_VERDICT = { keep: "a confirmed direction: the next nights work inside it", reject: "a refused direction" } as const;

function directionCell(night: Night, c: DirectionCandidate, out: Mutable): void {
  const words: ItemWords = { label: c.title, meta: `based on ${c.basedOn.length} kept`, prompt: `${directionLine(c)} · ${c.premise}` };
  const body = [`${c.format} · ${c.genre}`, c.title, c.style, c.tone, c.audience, c.premise, ...c.basedOn].join("\n");
  out.cells.push({ id: cellId(c.id, "text"), candidate: c.id, kind: "direction", row: c.id, jobId: `scout:${night.id}`, media: textRef(body), grades: [], url: scoutFileUrl(night.id, "night.json"), words });
  out.rows.push({ id: c.id, label: `direction · ${c.genre}`, group: "notes", ...(c.use === undefined ? {} : { use: c.use }) });
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
  const use = assetUse(c);
  out.rows.push({ id: c.id, label: clip40(`${a.brief.class} · ${a.brief.subject}`), group: "3d", ...(use === undefined ? {} : { use }), ...(concept !== undefined && media[concept] !== undefined ? { ref: scoutFileUrl(night.id, concept) } : {}) });
}

/**
 * A game asset's purpose as its row states it: the project first - `for pof` or `new project: <kind>` - then what
 * it is for there. Absent when the asset was briefed before either field (2026-10-23: the first 3D nights' rows
 * showed no purpose at all, and the operator rejected every one of them for it).
 */
export function assetUse(a: Pick<Asset3dCandidate, "use" | "serves">): string | undefined {
  const project = a.serves === undefined ? undefined : "project" in a.serves ? `for ${a.serves.project}` : `new project: ${a.serves.newProject}`;
  const parts = [project, a.use].filter((x): x is string => x !== undefined && x !== "");
  return parts.length === 0 ? undefined : parts.join(" · ");
}

/** An idea's one cell: the artboard. */
export const ideaCell = (candidate: CandidateId): string => cellId(candidate, "board");

/** An idea's target as the Board says it: `asset3d` is the act's name, a `3d asset` is the thing. */
export const IDEA_TARGET_WORD: Readonly<Record<IdeaTarget, string>> = { scene: "scene", style: "style", asset3d: "3d asset", stats: "stats reel", character: "character" };

/** An idea's target, genre and anchor: `scene · music video · watch: tag: risograph`. A `free` idea names no anchor ref; the first batch has no genre. */
export const ideaMeta = (c: Pick<IdeaCandidate, "target" | "anchor" | "genre">): string =>
  `${IDEA_TARGET_WORD[c.target]}${c.genre === undefined ? "" : ` · ${c.genre}`} · ${c.anchor.kind === "free" ? "free" : `${c.anchor.kind}: ${c.anchor.ref}`}`;

/** `seed: <first 40 characters of its sentence>`, for a candidate grown from a seed the store still has. */
const seedHead = (c: Pick<Candidate, "fromSeed">, seeds: ScoutV1["seeds"]): string | undefined => {
  const s = c.fromSeed === undefined ? undefined : seeds?.[c.fromSeed];
  return s === undefined ? undefined : `seed: ${clip40(s.sentence)}`;
};

function ideaCells(night: Night, c: IdeaCandidate, media: ScoutV1["media"], out: Mutable, seeds?: ScoutV1["seeds"]): void {
  if (c.status === "failed") {
    out.losses.push({ candidate: c.id, grade: "dropped", reason: c.error ?? "failed with no error recorded" });
    return;
  }
  const m = c.image === undefined ? undefined : media[c.image];
  if (c.image === undefined || m === undefined) {
    out.losses.push({ candidate: c.id, grade: "dropped", reason: c.image === undefined ? "rendered with no artboard recorded" : `${c.image} is not on disk` });
    return;
  }
  out.cells.push({
    id: ideaCell(c.id),
    candidate: c.id,
    kind: "idea",
    row: c.id,
    jobId: c.jobId ?? `scout:${night.id}`,
    media: m,
    grades: [],
    url: scoutFileUrl(night.id, c.image),
    words: { label: c.title, meta: [ideaMeta(c), ...museFacts(c), seedHead(c, seeds)].filter((x) => x !== undefined).join(" · "), prompt: c.prompt },
  });
  out.rows.push({ id: c.id, label: c.title, group: "ideas", prompt: c.prompt, ...(c.aim === undefined ? {} : { aim: c.aim }), ...(c.use === undefined ? {} : { use: c.use }) });
}

/** What a kept track clip and a kept visualizer do, as the preview says it. */
export const MUSIC_VERDICT = { track: "the next night renders its visualizer", visualizer: "rung 1 of the music ladder: the full video and its Short are next" } as const;

/** A visualizer's one cell. */
export const visualizerCell = (candidate: CandidateId): string => cellId(candidate, "video");

/** A track clip's meta: `track · synthwave › darksynth · 4 clips · v6-wild · 2:14`. */
export function trackMeta(c: Pick<TrackCandidate, "fromSeed" | "clips">, clip: TrackCandidate["clips"][number], seeds: ScoutV1["seeds"]): string {
  const s = c.fromSeed === undefined ? undefined : seeds?.[c.fromSeed];
  const n = c.clips.length;
  return ["track", ...(s === undefined ? [] : [`${s.genre} › ${s.subgenre}`]), `${n} clip${n === 1 ? "" : "s"}`, clip.model, ...(clip.durationS === undefined ? [] : [mss(clip.durationS)])].join(" · ");
}

function trackCells(night: Night, c: TrackCandidate, media: ScoutV1["media"], out: Mutable, seeds?: ScoutV1["seeds"]): void {
  if (c.status === "failed") {
    out.losses.push({ candidate: c.id, grade: "dropped", reason: c.error ?? "failed with no error recorded" });
    return;
  }
  let shown = 0;
  for (const clip of c.clips) {
    const m = media[clip.path];
    if (m === undefined) {
      out.losses.push({ candidate: cellId(c.id, clip.part), grade: "dropped", reason: `${clip.path} is not on disk` });
      continue;
    }
    out.cells.push({ id: cellId(c.id, clip.part), candidate: c.id, kind: "track", row: c.id, jobId: c.jobId ?? `scout:${night.id}`, media: m, grades: [], url: scoutFileUrl(night.id, clip.path), words: { label: clip.title, meta: trackMeta(c, clip, seeds), music: true } });
    shown++;
  }
  if (shown === 0) {
    if (c.clips.length === 0) out.losses.push({ candidate: c.id, grade: "dropped", reason: c.error ?? "rendered with no clip recorded" });
    return;
  }
  // A clip Suno made with no audio is named here, beside the ones that play.
  if (c.error !== undefined) out.losses.push({ candidate: c.id, grade: "approximate", reason: c.error });
  out.rows.push({ id: c.id, label: c.sentence, group: "music", ...(c.use === undefined ? {} : { use: c.use }) });
}

/** `visualizer · 3:42 · still: idea`. */
export const visualizerMeta = (c: Pick<VisualizerCandidate, "durationS" | "still">): string => {
  const still = stillOf(c);
  return ["visualizer", ...(c.durationS === undefined ? [] : [mss(c.durationS)]), ...(still === undefined ? [] : [`still: ${still}`])].join(" · ");
};

function visualizerCells(night: Night, c: VisualizerCandidate, v1: Pick<ScoutV1, "media" | "tracks">, out: Mutable): void {
  if (c.status === "failed") {
    out.losses.push({ candidate: c.id, grade: "dropped", reason: c.error ?? "failed with no error recorded" });
    return;
  }
  const m = c.video === undefined ? undefined : v1.media[c.video];
  if (c.video === undefined || m === undefined) {
    out.losses.push({ candidate: c.id, grade: "dropped", reason: c.video === undefined ? "rendered with no video recorded" : `${c.video} is not on disk` });
    return;
  }
  const song = v1.tracks?.[c.track];
  out.cells.push({
    id: visualizerCell(c.id),
    candidate: c.id,
    kind: "visualizer",
    row: c.id,
    jobId: c.jobId ?? `scout:${night.id}`,
    media: m,
    grades: [],
    url: scoutFileUrl(night.id, c.video),
    words: { label: song?.title ?? c.track, meta: visualizerMeta(c), ...(song === undefined ? {} : { prompt: song.sentence }) },
  });
  const ref = c.still !== undefined && v1.media[c.still] !== undefined ? scoutFileUrl(night.id, c.still) : undefined;
  out.rows.push({ id: c.id, label: clip40(song?.title ?? `visualizer · ${c.track}`), group: "videos", ...(c.use === undefined ? {} : { use: c.use }), ...(ref === undefined ? {} : { ref }) });
}

/** What a kept storyboard does, as the preview says it. */
export const STORYBOARD_VERDICT = { keep: "ready for a full video", reject: "refused: no full video grows from it" } as const;

/** A storyboard's frame cell (`c-10/panel-2`) and its words cell (`c-10/words`). */
export const panelCell = (candidate: CandidateId, i: number): string => cellId(candidate, `panel-${i + 1}`);
export const wordsCell = (candidate: CandidateId): string => cellId(candidate, WORDS_PART);

/** A storyboard's words as the card reads them: the paragraph, a blank line, then each bullet as a `- ` line. */
export const storyboardBody = (c: Pick<StoryboardCandidate, "paragraph" | "bullets">): string => [c.paragraph, "", ...c.bullets.map((b) => `- ${b}`)].join("\n");

function storyboardCells(night: Night, c: StoryboardCandidate, v1: Pick<ScoutV1, "media" | "seeds" | "ideas">, out: Mutable): void {
  if (c.status === "failed") {
    out.losses.push({ candidate: c.id, grade: "dropped", reason: c.error ?? "failed with no error recorded" });
    return;
  }
  const jobId = c.jobId ?? `scout:${night.id}`;
  let frames = 0;
  (c.images ?? []).forEach((file, i) => {
    if (file === null) return;
    const m = v1.media[file];
    if (m === undefined) {
      out.losses.push({ candidate: panelCell(c.id, i), grade: "dropped", reason: `${file} is not on disk` });
      return;
    }
    out.cells.push({ id: panelCell(c.id, i), candidate: c.id, kind: "storyboard", row: c.id, jobId, media: m, grades: [], url: scoutFileUrl(night.id, file), words: { label: `frame ${i + 1}`, ...(c.panels[i] === undefined ? {} : { prompt: c.panels[i] }) } });
    frames++;
  });
  // A panel the engine refused names itself in `error` (`panel N: ...`), beside the frames that drew.
  if (c.error !== undefined) out.losses.push({ candidate: c.id, grade: "approximate", reason: c.error });
  const body = storyboardBody(c);
  const framesWord = frames === c.panels.length ? `${frames} frame${frames === 1 ? "" : "s"}` : `${frames} of ${c.panels.length} frames`;
  const idea = v1.ideas?.[c.fromIdea];
  const meta = [`idea: ${idea === undefined ? c.fromIdea : clip40(idea)}`, framesWord, "local · free", seedHead(c, v1.seeds)].filter((x) => x !== undefined).join(" · ");
  out.cells.push({ id: wordsCell(c.id), candidate: c.id, kind: "storyboard", row: c.id, jobId, media: textRef(body), grades: [], url: scoutFileUrl(night.id, "night.json"), words: { label: c.title, meta, prompt: body } });
  out.rows.push({ id: c.id, label: c.title, group: "storyboards", prompt: c.paragraph, ...(c.aim === undefined ? {} : { aim: c.aim }), ...(c.use === undefined ? {} : { use: c.use }) });
}

type Mutable = { cells: Cell[]; rows: RowWords[]; initial: InitialDecision[]; losses: Loss[]; runs: Record<string, ExtractV1> };

/** Every cell, row, imported verdict and loss of the night's packet. */
export function build(v1: ScoutV1): Built {
  const out: Mutable = { cells: [], rows: [], initial: [], losses: [], runs: {} };
  const night = v1.night;
  const sorted = [...night.candidates].sort((a, b) => (ORDER[a.kind] ?? 0) - (ORDER[b.kind] ?? 0));
  for (const c of sorted) {
    if (c.status === "pending") {
      const what = c.kind === "track" || c.kind === "visualizer" ? "still collecting" : "pending";
      out.losses.push({ candidate: c.id, grade: "dropped", reason: `${what} when the night closed: nothing to judge` });
      continue;
    }
    if (c.kind === "style") styleCells(night, c, v1.styles[c.id], out);
    else if (c.kind === "scene") sceneCells(night, c, v1.media, out);
    else if (c.kind === "asset3d") assetCells(night, c, v1.assets[c.id], v1.media, out);
    else if (c.kind === "idea") ideaCells(night, c, v1.media, out, v1.seeds);
    else if (c.kind === "direction") directionCell(night, c, out);
    else if (c.kind === "track") trackCells(night, c, v1.media, out, v1.seeds);
    else if (c.kind === "visualizer") visualizerCells(night, c, v1, out);
    else if (c.kind === "storyboard") storyboardCells(night, c, v1, out);
    // spark scout-vision S2 - WP0 stub: the piece and the two proposals draw no row until WP2/WP3 give them cells.
    else if (c.kind === "piece" || c.kind === "genre" || c.kind === "venture") out.losses.push({ candidate: c.id, grade: "dropped", reason: `${c.kind}: no packet row yet` });
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

/**
 * What `night.committed` holds after this outcome: every verdict on the packet's cells, in packet order.
 *
 * A COMMIT IN PARTS (spark scout-storyboards): a cell left undecided goes to `open`, for the remainder packet. A
 * STYLE candidate is decided whole or not at all: its looks commit through the extract run's own commit, which is
 * final and refuses a second one (lib/decision/v1/sources/extract.ts apply), so a style with any cell undecided
 * holds EVERY cell in `open` - its decided looks reach v1 as verdicts only, and its remainder cells open with
 * them imported (./scout.ts holdStyle). Every other kind's writes are per cell, and split freely.
 */
export function commitOf(night: Night, items: readonly string[], decisions: readonly Decision[], at: string): NightCommit {
  const byCell = decisionMap(decisions);
  const decided = (id: string): boolean => {
    const v = byCell.get(id)?.verdict;
    return v === "keep" || v === "reject";
  };
  const kept: string[] = [];
  const rejected: string[] = [];
  const open: string[] = [];
  const reasons: Record<string, readonly string[]> = {};
  const notes: Record<string, string> = {};
  const held = heldStyles(night, items, decided);
  let operator = false;
  for (const id of items) {
    const d = byCell.get(id);
    const c = parseCellId(id)?.candidate;
    if (d === undefined || d.verdict === null || (c !== undefined && held.has(c))) {
      open.push(id);
      continue;
    }
    if (d.by === "operator") operator = true;
    if (d.verdict === "keep") kept.push(id);
    else {
      rejected.push(id);
      if (d.reasons.length > 0) reasons[id] = [...d.reasons];
    }
    if (d.note !== undefined) notes[id] = d.note;
  }
  return { at, by: operator ? "operator" : "agent", kept, rejected, reasons, notes, dry: night.dry, ...(open.length === 0 ? {} : { open }) };
}

/** The style candidates of the packet with a cell still undecided: held whole for the remainder (commitOf). */
export function heldStyles(night: Pick<Night, "candidates">, items: readonly string[], decided: (id: string) => boolean): ReadonlySet<string> {
  const styles = new Set(night.candidates.filter((c) => c.kind === "style").map((c) => c.id));
  const out = new Set<string>();
  for (const id of items) {
    const c = parseCellId(id)?.candidate;
    if (c !== undefined && styles.has(c) && !decided(id)) out.add(c);
  }
  return out;
}

/** Two records hold the same outcome: the same cells kept and rejected, whenever and by whomever. */
export function sameOutcome(a: Pick<NightCommit, "kept" | "rejected">, b: Pick<NightCommit, "kept" | "rejected">): boolean {
  const key = (xs: readonly string[]) => [...xs].sort().join("\u0000");
  return key(a.kept) === key(b.kept) && key(a.rejected) === key(b.rejected);
}
