// AUDIO — a Suno production line: prompts nothing has been spent on, a serial
// queue rendering them on two models, and the clips waiting on a human; plus the
// Sound lab's takes, which keep the places they always had.
//
// Everything reads and writes through lib/sound/client.ts, because the sound
// store and the Suno queue are filesystem-backed and server-only and a client
// component cannot import them. The server stays the single authority:
// `applyRules` (lib/sound/takes.ts) for what a take may become, the queue
// (lib/sound/suno/queue.ts) for what a job may do. `admits()` ANTICIPATES their
// rules so the refusal happens in the hand, and `move()` writes and lets the
// server answer. Nothing here re-implements one.
//
//   proposed  every Suno proposal that is still a candidate (never queued, or
//             its last job failed - wearing the error - or was cancelled), and
//             every hunt leaf still an idea, failed, or a Suno leaf awaiting a
//             return that never came (no takes): all automatable now
//   working   Suno jobs, queued (with their place, "#2") or active (with
//             `progress`: the driver's phase on the model it is on, and the
//             start the card's clock counts from)
//   gate      `triage`: takes with no verdict and Suno clips with none - queue
//             clips and clips imported from the operator's Suno library
//             (`suno.import-library`, a triage cell verb; free, idempotent);
//             then `pending` (kept takes and kept clips), `remaster`, `edit`
//   done      Settled, in three bands: `tracks` (a take's stage finalized),
//             `videos` (music-video jobs not kept - queued with their place,
//             active with `progress`, failed wearing the error, finished and
//             unjudged, dropped) and `kept` (a video whose verdict is keep)
//
// THE QUEUE IS SUNO-ONLY. A hunt leaf dropped on `working` - an ElevenLabs one
// included - becomes ONE Suno proposal (server-side, idempotent per leaf) and is
// queued through it. ElevenLabs renders live in the Sound lab, not on the
// canvas.
//
// THE SPEND GATE IS THE ARM. A move into `working` without `live === true` is
// dry (`stubbedMove`, no write). With it, it enqueues: no confirm dialog, the
// money switch was the confirmation.
//
// WHAT IS NOT DRAWN, and why: a rejected take (leaving `kept` clears its stage);
// a hunt leaf that is rendering in the hunt tab or rendered (its takes are drawn
// instead) or that has a Suno proposal (the proposal, job or clips are drawn
// instead); a dropped Suno clip. `lastLoad().hidden` counts them.
//
// A CLIP'S LANE: its own `lane` when the operator moved it (persisted through
// PATCH /api/sound/suno/clips/[id]), else its job's. A library clip has no job:
// until it is moved it draws in the ungrouped lane under EVERY axis.
//
// THE QUEUE IS SWITCHED BY HAND. A prompt dropped on Queue (or "Queue all")
// waits there; the Queue column's cell menu starts and stops the worker
// (`suno.queue-start` spends, so the arm holds it while STUB). Every tile's
// menu can clear what it holds (`suno.clear-cell`): prompts and clip records
// are removed, queued jobs cancelled - nothing on suno.com is touched.
//
// A FAILED SUNO READ IS A DEGRADED STAGE, NOT A FAILED LANE. The takes and hunts
// still draw; proposed, working and gate say the queue could not be read.
//
// SETTLED IS THE SECOND HAND-SWITCHED QUEUE (lib/sound/mv). A take with a file
// or a KEPT Suno clip dropped on `done / videos` (or "Make video") becomes a
// music-video job - free: enqueueing never starts the queue. The Videos tile's
// menu starts it (`mv.queue-start` spends a Leonardo still and two text turns a
// job, so the arm holds it while STUB) and stops it. A video draws in its
// TRACK's lane, read the way the track itself is read under every axis: the
// card is the track's next life, not a new row. A failed music-video read
// degrades `done` alone; the finished tracks still draw.

import {
  cancelSunoJob,
  clearSunoRecords,
  createSunoProposal,
  deleteMv,
  deleteSunoProposal,
  enqueueMv,
  enqueueSuno,
  getGroups,
  getMv,
  getSuno,
  importMvFolder,
  importSunoLibraryClips,
  listHunts,
  listTakes,
  mvFileUrl,
  patchMv,
  patchSunoClip,
  patchTake,
  proposeSuno,
  regenerateMv,
  sendMvToCalendar,
  setMvQueueRunning,
  setSunoQueueRunning,
  setSunoVerdict,
  takeFileUrl,
  type Result,
} from "@/lib/sound/client";
import { MV_PARTS, type MvJob, type MvSnapshot, type MvSource } from "@/lib/sound/mv/types";
import type { Hunt, HuntNode, SoundGroups, SoundKind, SoundTake, Stage, TakePatch } from "@/lib/sound/types";
import { SUNO_MODEL_LABEL, SUNO_PHASE_WORD, sunoModelLabel, type SunoClip, type SunoJob, type SunoLane, type SunoProposal, type SunoSnapshot } from "@/lib/suno/types";
import { stackVersions, suggestLabel } from "@/lib/sound/arrangeModel";

import type {
  BoardVerb,
  CanonStage,
  GroupAxis,
  LaneDef,
  MoveOffer,
  MoveRequest,
  MoveResult,
  PipelineEntry,
  PipelineItem,
  PipelineSource,
  StageBand,
  VerbInput,
  VerbResult,
  VerbTarget,
} from "../pipeline";
import { lanesFromItems, makeVersionStamp, stubbedMove, UNGROUPED_LANE, type PipelineLoadNotes } from "../pipeline";
import type { BoardCount, BoardEntry } from "../source";
import { countEntries, itemId, itemsOf, SourceUnavailable, VerdictRefused } from "../source";
import type { BoardMedia, BoardVerdict } from "../types";

export const AUDIO_DECIDE_REFUSAL = "an audio take is judged in the Sound lab's Triage; the canvas moves stages";
export const AUDIO_LANE_ONLY_PROMPT = "a candidate has no row of its own until it is rendered";
export const AUDIO_UNJUDGED_REFUSAL = "judge it in Triage first: only a kept take has a stage";
export const AUDIO_ACTIVE_REFUSAL = "rendering now - it lands in triage when Suno finishes";
/** A clip on `done / tracks`: tracks are takes with local bytes. */
export const AUDIO_CLIP_DONE_REFUSAL = "a Suno clip is a link, not a file: drop it on videos to make a video";
export const AUDIO_CLIP_UNKEPT_REFUSAL = "keep the clip first: only a kept clip makes a video";
export const AUDIO_TAKE_NO_FILE_REFUSAL = "this take has no audio file to make a video from";
export const AUDIO_KEPT_BAND_REFUSAL = "kept is a verdict on a finished video: make one on videos first";
export const AUDIO_MV_REFUSAL = "a video stays in settled: keep it, or move it back to videos";
export const AUDIO_MV_LANE_REFUSAL = "a video draws in its track's lane";
export const AUDIO_MV_UNFINISHED_REFUSAL = "only a finished video is kept";
export const MV_ROUTE = "POST /api/sound/mv";
/** Where the operator's Suno downloads land (spark audio-music-video-queue). */
export const MV_IMPORT_DIR = "~/Downloads/Misu";
export const AUDIO_SUNO_LANE_REFUSAL = "a Suno prompt keeps the lane it was written in";
export const QUEUE_ROUTE = "POST /api/sound/suno/queue";

const GATE_BANDS: StageBand[] = [
  { id: "triage", label: "triage" },
  { id: "pending", label: "pending" },
  { id: "remaster", label: "remaster" },
  { id: "edit", label: "edit" },
];

const DONE_BANDS: StageBand[] = [
  { id: "tracks", label: "tracks" },
  { id: "videos", label: "videos" },
  { id: "kept", label: "kept" },
];

const bandsOf = (s: CanonStage): StageBand[] | null => (s === "gate" ? GATE_BANDS : s === "done" ? DONE_BANDS : null);

/** A drop on Settled with no band is a drop on its first band. Callers from
 *  before Settled had bands send `done` + null, and meant a finalized take. */
const bandFor = (to: CanonStage, band: string | null): string | null => (to === "done" && band === null ? "tracks" : band);

type TakeNative = { kind: "take"; take: SoundTake; versions: number; item: PipelineItem };
type IdeaNative = { kind: "idea"; hunt: Hunt; node: HuntNode; item: PipelineItem };
type ProposalNative = { kind: "proposal"; proposal: SunoProposal; item: PipelineItem };
type JobNative = { kind: "job"; job: SunoJob; position: number | null; item: PipelineItem };
type ClipNative = { kind: "clip"; clip: SunoClip; lane: SunoLane | null; item: PipelineItem };
type MvNative = { kind: "mv"; job: MvJob; position: number | null; item: PipelineItem };
type SunoNative = ProposalNative | JobNative | ClipNative;
type Native = TakeNative | IdeaNative | SunoNative | MvNative;

export type AudioPipelineSource = PipelineSource & { lastLoad(): PipelineLoadNotes };

/** Where a read of the sound store failed, as the Board's two failure states:
 *  a source that could not be reached (SourceUnavailable) and one that answered
 *  and failed (Error). Empty is neither: it is a successful read of nothing. */
function must<T>(r: Result<T>, route: string): T {
  if (r.ok) return r.data;
  if (r.status === 0 || r.status === 401 || r.status === 403) throw new SourceUnavailable(r.error);
  if (r.status === 404 && r.error === "HTTP 404") throw new SourceUnavailable(`${route} is not built here`);
  throw new Error(r.error);
}

const opOf = (kind: SoundKind) => (kind === "sfx" ? ("sfx" as const) : ("compose" as const));

function takeSite(t: SoundTake): { stage: CanonStage; band: string | null } {
  if (t.verdict !== "kept") return { stage: "gate", band: "triage" };
  const stage: Stage = t.stage ?? "pending";
  return stage === "finalized" ? { stage: "done", band: "tracks" } : { stage: "gate", band: stage };
}

/** The row a Suno item draws in under the `group` axis: its lane's value when
 *  it was written under that axis, the ungrouped row otherwise. */
const rowOf = (lane: SunoLane | null): string => (lane && lane.axis === "group" && lane.value ? lane.value : UNGROUPED_LANE);

const titleOf = (f: { title?: string; style: string }): string => f.title?.trim() || (f.style.length > 60 ? `${f.style.slice(0, 57)}...` : f.style);

/** "creating v6-wild"; "opening suno" names no model, it has not picked one. */
function phaseWord(job: SunoJob): string {
  if (!job.phase) return "starting";
  const word = SUNO_PHASE_WORD[job.phase];
  return job.phase === "attaching" || !job.model ? word : `${word} ${SUNO_MODEL_LABEL[job.model]}`;
}

const failMove = (reason: string, retryable = false): MoveResult => ({ ok: false, reason, retryable });

/** The first words of an engine's error, for a card that has one line. The
 *  detail carries the whole sentence (the item's note). */
function firstWords(s: string, n = 5): string {
  const words = s.trim().split(/\s+/);
  return words.length > n ? `${words.slice(0, n).join(" ")}...` : words.join(" ");
}

/** The state a video card leads with. An active job shows its phase as
 *  `progress` instead; a queued one its place. */
function mvState(j: MvJob): string | null {
  if (j.state === "failed") return `failed: ${firstWords(j.error ?? "no reason given")}`;
  if (j.state !== "done") return null;
  return j.verdict === "keep" ? "kept" : j.verdict === "drop" ? "dropped" : "done";
}

const isLive = (j: MvJob) => j.state === "queued" || j.state === "active";

export function makeAudioSource(opts: { now?: () => number } = {}): AudioPipelineSource {
  const now = opts.now ?? Date.now;
  const natives = new Map<string, Native>();
  /** Every proposal and job of the last read, drawn or not: a cancel returns
   *  the job's proposal, which was not on the board while it was queued. */
  let suno: SunoSnapshot | null = null;
  /** The music-video queue's last read; null when it could not be read. */
  let mv: MvSnapshot | null = null;
  /** Every take of the last read by id - a video's track may be a version the
   *  board does not draw (only a stack's head is drawn). */
  let takeById = new Map<string, SoundTake>();
  /** A lane a hunt leaf was dropped on: interface-local until it is queued,
   *  then written as its proposal's lane. */
  const laneOverride = new Map<string, string>();
  let groups: SoundGroups = { music: [], sfx: [] };
  let notes: PipelineLoadNotes = { hidden: [], damaged: [] };

  const stamp = makeVersionStamp();

  /* ── native → PipelineItem ──────────────────────────────────────────────── */

  const takeItem = (t: SoundTake, stackSize: number): TakeNative => {
    const site = takeSite(t);
    const lane = t.group ?? UNGROUPED_LANE;
    const id = itemId("audio", `take:${t.id}`);
    const media: BoardMedia[] = [...(t.file ? [{ kind: "audio" as const, src: takeFileUrl(t.id) }] : []), { kind: "text", text: t.prompt }];
    const verdict: BoardVerdict = t.verdict === "kept" ? "approve" : t.verdict === "rejected" ? "reject" : null;
    const item: PipelineItem = {
      id,
      source: "audio",
      title: t.title,
      projectId: t.projectId,
      group: t.group,
      media,
      machinePick: null,
      verdict,
      reasons: [...t.reasons],
      note: t.note,
      createdAt: t.createdAt,
      lane,
      placement: { stage: site.stage, band: site.band, lane },
      version: stamp(id, [t.verdict, t.stage, t.group, t.label, t.title, t.note, t.judgedAt, t.finalizedAt, stackSize, t.file?.bytes].join("|")),
    };
    return { kind: "take", take: t, versions: stackSize, item };
  };

  const ideaItem = (hunt: Hunt, node: HuntNode): IdeaNative => {
    const id = itemId("audio", `hunt:${hunt.id}:${node.id}`);
    const lane = laneOverride.get(id) ?? UNGROUPED_LANE;
    const item: PipelineItem = {
      id,
      source: "audio",
      title: node.label,
      projectId: null,
      group: lane === UNGROUPED_LANE ? null : lane,
      media: [{ kind: "text", text: node.prompt }],
      machinePick: node.rationale || null,
      verdict: null,
      reasons: [],
      note: node.state === "failed" ? node.error : null,
      createdAt: hunt.createdAt,
      lane,
      placement: { stage: "proposed", band: null, lane },
      version: stamp(id, [node.state, node.error, node.label, node.prompt, lane].join("|")),
    };
    return { kind: "idea", hunt, node, item };
  };

  const sunoBase = (id: string, lane: SunoLane | null, fields: { title?: string; style: string }, createdAt: number) => {
    const row = rowOf(lane);
    return {
      id,
      source: "audio" as const,
      title: titleOf(fields),
      projectId: null,
      group: row === UNGROUPED_LANE ? null : row,
      lane: row,
      createdAt: new Date(createdAt).toISOString(),
      reasons: [],
    };
  };

  const proposalItem = (p: SunoProposal): ProposalNative => {
    const id = itemId("audio", `suno:proposal:${p.id}`);
    const base = sunoBase(id, p.lane, p.fields, p.createdAt);
    const item: PipelineItem = {
      ...base,
      media: [{ kind: "text", text: p.fields.style }, ...(p.fields.lyrics ? [{ kind: "text" as const, text: p.fields.lyrics }] : [])],
      machinePick: p.note ?? null,
      verdict: null,
      note: p.error ?? null,
      placement: { stage: "proposed", band: null, lane: base.lane },
      version: stamp(id, [p.fields.title, p.fields.style, p.fields.lyrics, p.fields.exclude, p.error, base.lane].join("|")),
    };
    return { kind: "proposal", proposal: p, item };
  };

  const jobItem = (j: SunoJob, position: number | null): JobNative => {
    const id = itemId("audio", `suno:job:${j.id}`);
    const base = sunoBase(id, j.lane, j.fields, j.enqueuedAt);
    const active = j.state === "active";
    const item: PipelineItem = {
      ...base,
      media: [{ kind: "text", text: j.fields.style }],
      machinePick: null,
      verdict: null,
      note: null,
      placement: { stage: "working", band: null, lane: base.lane },
      ...(active ? { progress: { phase: phaseWord(j), startedAt: j.startedAt ?? now() } } : {}),
      version: stamp(id, [j.state, j.phase, j.model, j.startedAt, position, j.clipIds.length, base.lane].join("|")),
    };
    return { kind: "job", job: j, position, item };
  };

  /** The job's lane a clip falls back to; a library clip has none. */
  const jobLaneOf = (c: SunoClip): SunoLane | null => (c.jobId ? (suno?.jobs.find((j) => j.id === c.jobId)?.lane ?? null) : null);

  const clipItem = (c: SunoClip, jobLane: SunoLane | null): ClipNative => {
    const id = itemId("audio", `suno:clip:${c.id}`);
    const lane = c.lane ?? jobLane;
    const base = sunoBase(id, lane, { style: c.title || c.songId }, c.createdAt);
    const p = c.prompt;
    const band = c.verdict === "keep" ? "pending" : "triage";
    // An audio entry with no `src` is a clip Suno has not exposed a stream for
    // yet: the skin draws no live play button for it.
    const audio: BoardMedia = c.audioUrl ? { kind: "audio", src: c.audioUrl } : { kind: "audio" };
    const item: PipelineItem = {
      ...base,
      title: c.title || c.songId,
      // Lyrics ride as text media: the detail pane prints them whole, with
      // their line breaks (the style is a fact); a card face draws only audio.
      media: [
        audio,
        ...(c.imageUrl ? [{ kind: "image" as const, src: c.imageUrl }] : []),
        ...(p?.lyrics && p.lyrics !== "[Instrumental]" ? [{ kind: "text" as const, text: p.lyrics }] : []),
      ],
      machinePick: null,
      verdict: c.verdict === "keep" ? "approve" : null,
      note: null,
      placement: { stage: "gate", band, lane: base.lane },
      version: stamp(id, [c.verdict, c.audioUrl, c.title, c.durationS, base.lane, lane?.axis, lane?.value, p?.style, p?.lyrics].join("|")),
    };
    return { kind: "clip", clip: c, lane, item };
  };

  /** A video's lane is its TRACK's row: the take's group, the clip's lane (or
   *  its job's), ungrouped when the track is not in the last read. */
  const mvRowOf = (j: MvJob): string => {
    if (j.source.kind === "take") return takeById.get(j.source.id)?.group ?? UNGROUPED_LANE;
    const c = suno?.clips.find((x) => x.id === j.source.id);
    return c ? rowOf(c.lane ?? jobLaneOf(c)) : UNGROUPED_LANE;
  };

  const mvPositionOf = (j: MvJob): number | null => {
    if (j.state !== "queued" || !mv) return null;
    const active = mv.jobs.filter((x) => x.state === "active").length;
    const ahead = mv.jobs.filter((x) => x.state === "queued" && x.enqueuedAt < j.enqueuedAt).length;
    return active + ahead + 1;
  };

  const mvItem = (j: MvJob): MvNative => {
    const id = itemId("audio", `mv:${j.id}`);
    const lane = mvRowOf(j);
    const position = mvPositionOf(j);
    // A regenerate rewrites the files under the same URL; `v` keeps a browser
    // from serving the last render from its cache.
    const v = `&v=${j.endedAt ?? j.enqueuedAt}`;
    const media: BoardMedia[] = [
      ...(j.files.video ? [{ kind: "video" as const, src: `${mvFileUrl(j.id, "video")}${v}` }] : []),
      ...(j.files.still ? [{ kind: "image" as const, src: `${mvFileUrl(j.id, "still")}${v}` }] : []),
    ];
    const m = j.metadata;
    const item: PipelineItem = {
      id,
      source: "audio",
      title: j.source.title,
      projectId: null,
      group: lane === UNGROUPED_LANE ? null : lane,
      media,
      machinePick: j.treatment?.rationale ?? null,
      verdict: j.verdict === "keep" ? "approve" : j.verdict === "drop" ? "reject" : null,
      reasons: [],
      note: j.error ?? null,
      createdAt: new Date(j.enqueuedAt).toISOString(),
      lane,
      placement: { stage: "done", band: j.verdict === "keep" ? "kept" : "videos", lane },
      ...(j.state === "active" ? { progress: { phase: j.phase ?? "starting", startedAt: j.startedAt ?? now() } } : {}),
      version: stamp(id, [j.state, j.phase, j.verdict, j.error, j.startedAt, j.endedAt, position, j.files.video, j.files.still, j.slotId, j.redo?.join(","), m?.title, m?.description, m?.tags.join(","), lane].join("|")),
    };
    return { kind: "mv", job: j, position, item };
  };

  const factsOf = (n: Native): { name: string; value: string }[] => {
    switch (n.kind) {
      case "take": {
        const t = n.take;
        return [
          { name: "kind", value: t.kind },
          { name: "provider", value: t.provider },
          { name: "op", value: t.op },
          { name: "origin", value: t.origin },
          ...(t.durationS !== null ? [{ name: "length", value: `${t.durationS} s` }] : []),
          ...(t.label ? [{ name: "label", value: t.label }] : []),
          ...(n.versions > 1 ? [{ name: "versions", value: String(n.versions) }] : []),
        ];
      }
      case "idea":
        return [
          { name: "kind", value: n.hunt.kind },
          { name: "provider", value: n.node.provider },
          { name: "varies", value: n.node.axis },
        ];
      case "proposal": {
        const f = n.proposal.fields;
        return [
          { name: "style", value: f.style },
          { name: "origin", value: n.proposal.origin },
          ...(f.lyrics ? [{ name: "lyrics", value: f.lyrics === "[Instrumental]" ? "instrumental" : "written" }] : []),
          ...(f.exclude ? [{ name: "exclude", value: f.exclude }] : []),
        ];
      }
      case "job":
        return [
          // The queue position LEADS, so a face that prints the first fact
          // prints "#2" on a waiting card.
          ...(n.position !== null ? [{ name: "queue", value: `#${n.position}` }] : []),
          { name: "style", value: n.job.fields.style },
          { name: "models", value: n.job.models.map((m) => SUNO_MODEL_LABEL[m]).join(" + ") },
        ];
      case "clip": {
        const p = n.clip.prompt;
        return [
          // The MODEL leads: it is the chip a clip card carries.
          { name: "model", value: sunoModelLabel(n.clip.model) },
          ...(n.clip.durationS !== null ? [{ name: "length", value: `${Math.round(n.clip.durationS)} s` }] : []),
          { name: "origin", value: n.clip.origin === "library" ? "suno library" : "queue" },
          ...(p?.style ? [{ name: "style", value: p.style }] : []),
          ...(p?.lyrics ? [{ name: "lyrics", value: p.lyrics === "[Instrumental]" ? "instrumental" : "written" }] : []),
          ...(p?.exclude ? [{ name: "exclude", value: p.exclude }] : []),
          { name: "song", value: n.clip.songId },
        ];
      }
      case "mv": {
        const j = n.job;
        const state = mvState(j);
        const a = j.analysis;
        return [
          // The place or the state LEADS: the face prints it beside the title.
          ...(n.position !== null ? [{ name: "queue", value: `#${n.position}` }] : state ? [{ name: "state", value: state }] : []),
          { name: "track", value: j.source.kind === "take" ? "take" : "suno clip" },
          ...(a ? [{ name: "length", value: `${Math.round(a.durationS)} s` }] : []),
          ...(a?.tempoBpm.length ? [{ name: "tempo", value: `${Math.round(a.tempoBpm[0])} bpm` }] : []),
          ...(j.prompt ? [{ name: "prompt", value: "operator's own" }] : []),
          ...(j.redo?.length ? [{ name: "redo", value: j.redo.join(" + ") }] : []),
          ...(j.note ? [{ name: "redo note", value: j.note }] : []),
          ...(j.slotId ? [{ name: "calendar", value: j.slotId }] : []),
        ];
      }
    }
  };

  /** A video's YouTube text, whole, to copy out. The description already
   *  carries its chapter lines - the engine draws them in by code
   *  (lib/sound/mv/types.ts MvMetadata) - so they are not added twice here. */
  const textsOf = (n: Native): PipelineEntry["texts"] => {
    if (n.kind !== "mv" || !n.job.metadata) return undefined;
    const m = n.job.metadata;
    return [
      { label: "Title", value: m.title },
      { label: "Description", value: m.description },
      { label: "Tags", value: m.tags.join(", ") },
    ];
  };

  const hrefOf = (n: Native): string => {
    switch (n.kind) {
      case "take":
        return n.take.verdict !== "kept" ? "/playground?m=triage" : "/playground?m=arrange";
      case "idea":
        return "/playground?m=hunt";
      case "clip":
        return n.clip.url;
      case "mv":
        return n.job.files.video ? mvFileUrl(n.job.id, "video") : "/playground?m=arrange";
      default:
        return "https://suno.com/create";
    }
  };

  const entryOf = (n: Native): PipelineEntry => {
    const texts = textsOf(n);
    return {
      item: n.item,
      placement: n.item.placement,
      href: hrefOf(n),
      facts: factsOf(n),
      refuse: { approve: AUDIO_DECIDE_REFUSAL, reject: AUDIO_DECIDE_REFUSAL, clear: AUDIO_DECIDE_REFUSAL },
      ...(texts ? { texts } : {}),
    };
  };

  /* ── axes ───────────────────────────────────────────────────────────────── */

  const laneOfSuno = (n: SunoNative): SunoLane | null => (n.kind === "proposal" ? n.proposal.lane : n.kind === "job" ? n.job.lane : n.lane);

  /** A Suno item under an axis: the lane's value when it was written under
   *  THIS axis (so a right-click in lane X under "genre" draws in lane X), the
   *  axis's honest reading of a Suno item otherwise. */
  const sunoUnder = (n: SunoNative, axis: string, otherwise: string): string => {
    const lane = laneOfSuno(n);
    if (lane && lane.axis === axis && lane.value) return lane.value;
    // A library clip has no job, no proposal and no reading of its own under
    // any axis: ungrouped until the operator gives it a lane.
    return n.kind === "clip" && n.clip.origin === "library" ? UNGROUPED_LANE : otherwise;
  };
  const isSuno = (n: Native | undefined): n is SunoNative => !!n && (n.kind === "proposal" || n.kind === "job" || n.kind === "clip");
  const originOfSuno = (n: SunoNative): string => {
    if (n.kind === "proposal") return n.proposal.origin;
    const pid = n.kind === "job" ? n.job.proposalId : n.clip.jobId ? suno?.jobs.find((j) => j.id === n.clip.jobId)?.proposalId : undefined;
    return suno?.proposals.find((p) => p.id === pid)?.origin ?? UNGROUPED_LANE;
  };

  // Only axes every card really carries. `group` is the row and may be null
  // (the ungrouped row). `terms.genre[0]` is empty on an import and on every
  // effect: those fall in the unwritten row. NOT offered: `projectId` (set only
  // on origin "score") and `measured.durationS` (only after a browser
  // analysis) - an axis that reads blank for most cards cannot tell
  // "ungrouped" from "unwritten".
  const baseAxes: GroupAxis[] = [
    { id: "group", label: "row", of: (item) => item.lane },
    {
      id: "genre",
      label: "genre",
      of: (item) => {
        const n = natives.get(item.id);
        if (isSuno(n)) return sunoUnder(n, "genre", UNGROUPED_LANE);
        if (n?.kind === "idea") return n.node.terms.genre[0] ?? UNGROUPED_LANE;
        return n?.kind === "take" ? (n.take.terms.genre[0] ?? UNGROUPED_LANE) : UNGROUPED_LANE;
      },
    },
    {
      id: "provider",
      label: "provider",
      of: (item) => {
        const n = natives.get(item.id);
        if (!n) return UNGROUPED_LANE;
        if (isSuno(n)) return sunoUnder(n, "provider", "suno");
        return n.kind === "take" ? n.take.provider : n.kind === "idea" ? n.node.provider : UNGROUPED_LANE;
      },
    },
    {
      id: "op",
      label: "op",
      of: (item) => {
        const n = natives.get(item.id);
        if (!n) return UNGROUPED_LANE;
        if (isSuno(n)) return sunoUnder(n, "op", "compose");
        return n.kind === "take" ? n.take.op : n.kind === "idea" ? opOf(n.hunt.kind) : UNGROUPED_LANE;
      },
    },
    {
      id: "origin",
      label: "origin",
      of: (item) => {
        const n = natives.get(item.id);
        if (!n) return UNGROUPED_LANE;
        if (isSuno(n)) return sunoUnder(n, "origin", originOfSuno(n));
        return n.kind === "take" ? n.take.origin : n.kind === "idea" ? "hunt" : UNGROUPED_LANE;
      },
    },
  ];

  /** The drawn card of a video's track, when the board draws it. */
  const trackOf = (n: MvNative): Native | undefined =>
    natives.get(itemId("audio", n.job.source.kind === "take" ? `take:${n.job.source.id}` : `suno:clip:${n.job.source.id}`));

  // A VIDEO IS READ AS ITS TRACK under every axis, so it sits in the row its
  // track sits in whichever way the board is grouped. Under the row axis that
  // is its own `lane` (built from the track's); under the others it asks the
  // track's card, and a track the board does not draw leaves it ungrouped.
  const groupAxes: GroupAxis[] = baseAxes.map((a) =>
    a.id === "group"
      ? a
      : {
          ...a,
          of: (item: PipelineItem) => {
            const n = natives.get(item.id);
            if (n?.kind !== "mv") return a.of(item);
            const t = trackOf(n);
            return t && t.kind !== "mv" ? a.of(t.item) : UNGROUPED_LANE;
          },
        },
  );

  /** Declared rows first in their declared order (music, then effects), then rows
   *  that exist only in the data, then the ungrouped row last and always present:
   *  it is where a card is dropped to leave its row. */
  const lanes = (items: readonly PipelineItem[], axis: GroupAxis): LaneDef[] => {
    if (axis.id !== "group") return lanesFromItems(items, axis);
    const out: LaneDef[] = [];
    const seen = new Set<string>();
    const add = (key: string) => {
      if (key === UNGROUPED_LANE || seen.has(key)) return;
      seen.add(key);
      out.push({ key, label: key });
    };
    for (const g of [...groups.music, ...groups.sfx]) add(g);
    const orphans = lanesFromItems(items, axis).map((l) => l.key).filter((k) => k !== UNGROUPED_LANE && !seen.has(k));
    for (const k of orphans.sort((a, b) => a.localeCompare(b))) add(k);
    out.push({ key: UNGROUPED_LANE, label: "ungrouped" });
    return out;
  };

  /* ── what a drop would do ───────────────────────────────────────────────── */

  const refused = (reason: string): MoveOffer => ({ kind: "refused", reason });

  const admits = (item: PipelineItem, to: CanonStage, asked: string | null): MoveOffer => {
    const n = natives.get(item.id);
    if (!n) return refused("this card is not on the board any more");
    const here = n.item.placement;
    const band = bandFor(to, asked);
    const declared = bandsOf(to);
    if (declared ? band === null || !declared.some((b) => b.id === band) : band !== null) {
      return refused(declared ? `${to} is drawn in bands; drop on one` : `${to} has no bands`);
    }
    const same = to === here.stage && band === here.band;
    if (same) return { kind: "ok" };

    switch (n.kind) {
      case "idea":
      case "proposal":
        // The arm is the spend gate (move() answers dry without `live`): no confirm here.
        return to === "working" ? { kind: "ok" } : refused("nothing has been rendered yet: queue it first");
      case "job":
        if (n.job.state === "active") return refused(AUDIO_ACTIVE_REFUSAL);
        return to === "proposed" ? { kind: "ok" } : refused("a queued prompt lands in triage when Suno finishes");
      case "clip":
        if (to === "done") {
          if (band === "tracks") return refused(AUDIO_CLIP_DONE_REFUSAL);
          if (band === "kept") return refused(AUDIO_KEPT_BAND_REFUSAL);
          // Free: a job waits until the Videos tile is started, so no confirm.
          return n.clip.verdict === "keep" ? { kind: "ok" } : refused(AUDIO_CLIP_UNKEPT_REFUSAL);
        }
        if (to !== "gate") return refused("a rendered clip does not go back to being a prompt");
        return band === "triage" || band === "pending" ? { kind: "ok" } : refused("a Suno clip is kept or undecided; remaster and edit take an imported take");
      case "take": {
        const t = n.take;
        if (t.verdict !== "kept") return refused(AUDIO_UNJUDGED_REFUSAL);
        if (to === "proposed" || to === "working") return refused("a rendered take does not go back to being an idea");
        if (to === "done" && band === "videos") return t.file ? { kind: "ok" } : refused(AUDIO_TAKE_NO_FILE_REFUSAL);
        if (to === "done" && band === "kept") return refused(AUDIO_KEPT_BAND_REFUSAL);
        if (to === "done") {
          if (t.label?.trim()) return { kind: "ok" };
          return { kind: "needs", needs: "label", prompt: `Library label for "${t.title}", the name agents select it by. Suggested: ${suggestLabel(t, t.group)}` };
        }
        if (band === "triage") return refused("un-keeping a take is a verdict: do it in Triage");
        return { kind: "ok" };
      }
      case "mv": {
        // videos <-> kept is the verdict; nothing else moves a video.
        if (to !== "done" || band === "tracks") return refused(AUDIO_MV_REFUSAL);
        if (band === "kept") return n.job.state === "done" && n.job.verdict !== "drop" ? { kind: "ok" } : refused(AUDIO_MV_UNFINISHED_REFUSAL);
        return { kind: "ok" };
      }
    }
  };

  /* ── moves ──────────────────────────────────────────────────────────────── */

  const settle = (n: Native): PipelineItem => {
    natives.set(n.item.id, n);
    return n.item;
  };

  /** Fold a server answer into the last snapshot, so the next item built from
   *  it (a cancel's proposal, a job's position) reads the server's state. */
  const remember = (jobs: SunoJob[] = [], proposals: SunoProposal[] = [], clips: SunoClip[] = []) => {
    if (!suno) suno = { proposals: [], jobs: [], clips: [], driver: { ok: true }, queue: { running: false } };
    const put = <T extends { id: string }>(list: T[], xs: T[]) => {
      for (const x of xs) {
        const at = list.findIndex((y) => y.id === x.id);
        if (at < 0) list.push(x);
        else list[at] = x;
      }
    };
    put(suno.jobs, jobs);
    put(suno.proposals, proposals);
    put(suno.clips, clips);
  };

  const positionOf = (job: SunoJob): number | null => {
    if (job.state !== "queued" || !suno) return null;
    const active = suno.jobs.filter((j) => j.state === "active").length;
    const ahead = suno.jobs.filter((j) => j.state === "queued" && j.enqueuedAt < job.enqueuedAt).length;
    return active + ahead + 1;
  };

  const queued = async (r: Result<{ jobs: SunoJob[] }>): Promise<MoveResult> => {
    if (!r.ok) return failMove(r.error, r.status === 0);
    remember(r.data.jobs);
    const job = r.data.jobs[0];
    if (!job) return failMove("the queue answered with no job");
    return { ok: true, item: settle(jobItem(job, positionOf(job))) };
  };

  const huntRef = (n: IdeaNative) => `${n.hunt.id}:${n.node.id}`;

  const rememberMv = (jobs: MvJob[]) => {
    if (!mv) mv = { jobs: [], queue: { running: false }, driver: { ok: true } };
    for (const j of jobs) {
      const at = mv.jobs.findIndex((x) => x.id === j.id);
      if (at < 0) mv.jobs.push(j);
      else mv.jobs[at] = j;
    }
  };

  /** The track a take or clip card hands the video queue. */
  const mvSourceOf = (n: TakeNative | ClipNative): MvSource =>
    n.kind === "take" ? { kind: "take", id: n.take.id, title: n.take.title } : { kind: "clip", id: n.clip.id, title: n.item.title };

  /** Can this card become a video? null = yes, else the reason it cannot. */
  const mvRefusal = (n: Native): string | null => {
    if (n.kind === "take") return n.take.verdict !== "kept" ? AUDIO_UNJUDGED_REFUSAL : n.take.file ? null : AUDIO_TAKE_NO_FILE_REFUSAL;
    if (n.kind === "clip") return n.clip.verdict === "keep" ? null : AUDIO_CLIP_UNKEPT_REFUSAL;
    return "only a track becomes a video";
  };

  /** The live job a track already holds - an enqueue skips it, not doubles it. */
  const liveJobOf = (src: MvSource): MvJob | undefined => mv?.jobs.find((j) => isLive(j) && j.source.kind === src.kind && j.source.id === src.id);

  const enqueueVideo = async (src: MvSource): Promise<MoveResult> => {
    const r = await enqueueMv({ sources: [src] });
    if (!r.ok) return failMove(r.error, r.status === 0);
    rememberMv(r.data.jobs);
    const job = r.data.jobs[0] ?? liveJobOf(src);
    if (!job) return failMove("the video queue answered with no job");
    return { ok: true, item: settle(mvItem(job)) };
  };

  const move = async (req: MoveRequest): Promise<MoveResult> => {
    const n = natives.get(req.itemId);
    if (!n) return failMove("this card is not on the board any more");
    const offer = admits(n.item, req.to, req.band);
    if (offer.kind === "refused") return failMove(offer.reason);
    const axis = req.axis;
    const band = bandFor(req.to, req.band);
    const sameCell = req.to === n.item.placement.stage && band === n.item.placement.band;
    const laneMoved = req.lane !== undefined && req.lane !== n.item.lane;

    // A TRACK DROPPED ON VIDEOS becomes a job; the track stays where it was.
    // Free (nothing runs until the Videos tile is started), so no `live` gate.
    if (req.to === "done" && band === "videos" && (n.kind === "take" || n.kind === "clip")) return enqueueVideo(mvSourceOf(n));

    if (n.kind === "mv") {
      if (req.lane !== undefined && req.lane !== axisById(axis ?? "group").of(n.item)) return failMove(AUDIO_MV_LANE_REFUSAL);
      if (sameCell) return { ok: true, item: n.item };
      const r = await patchMv(n.job.id, { verdict: band === "kept" ? "keep" : null });
      if (!r.ok) return failMove(r.error, r.status === 0);
      rememberMv([r.data.job]);
      return { ok: true, item: settle(mvItem(r.data.job)) };
    }

    if (n.kind === "idea") {
      if (laneMoved && axis !== undefined && axis !== "group") return failMove(`only the row axis is written; ${axis} is read off the leaf`);
      if (sameCell) {
        if (!laneMoved) return { ok: true, item: n.item };
        laneOverride.set(n.item.id, req.lane!);
        return { ok: true, item: settle(ideaItem(n.hunt, n.node)) };
      }
      if (req.live !== true) return stubbedMove(n.item, QUEUE_ROUTE);
      const row = req.lane ?? laneOverride.get(n.item.id) ?? n.item.lane;
      const r = await queued(await enqueueSuno({ huntNodeIds: [huntRef(n)], lane: { axis: "group", value: row } }));
      if (r.ok) laneOverride.delete(n.item.id);
      return r;
    }

    if (n.kind === "clip") {
      // A clip moves between lanes (any gate band) and between triage and
      // pending, in one PATCH: the lane is written under the axis the board is
      // grouped by, and wins over the job's from then on.
      const ax = axis ?? "group";
      const under = axisById(ax).of(n.item);
      const lane: SunoLane | undefined = req.lane !== undefined && req.lane !== under ? { axis: ax, value: req.lane } : undefined;
      if (sameCell && !lane) return { ok: true, item: n.item };
      const r = await patchSunoClip(n.clip.id, {
        ...(sameCell ? {} : { verdict: req.band === "pending" ? ("keep" as const) : null }),
        ...(lane ? { lane } : {}),
      });
      if (!r.ok) return failMove(r.error, r.status === 0);
      remember([], [], [r.data.clip]);
      return { ok: true, item: settle(clipItem(r.data.clip, jobLaneOf(r.data.clip))) };
    }

    if (n.kind === "proposal" || n.kind === "job") {
      if (laneMoved) return failMove(AUDIO_SUNO_LANE_REFUSAL);
      if (sameCell) return { ok: true, item: n.item };
      if (n.kind === "proposal") {
        if (req.live !== true) return stubbedMove(n.item, QUEUE_ROUTE);
        return queued(await enqueueSuno({ proposalIds: [n.proposal.id] }));
      }
      if (n.kind === "job") {
        const r = await cancelSunoJob(n.job.id);
        if (!r.ok) return failMove(r.error, r.status === 0);
        remember([r.data.job]);
        natives.delete(n.item.id);
        const p = suno?.proposals.find((x) => x.id === n.job.proposalId);
        if (!p) return failMove("cancelled; its proposal was not in the last read - reload");
        return { ok: true, item: settle(proposalItem(p)) };
      }
    }

    if (req.lane !== undefined && axis !== undefined && axis !== "group") return failMove(`only the row axis is written; ${axis} is read off the take`);
    const t = n.take;
    const patch: TakePatch = {};
    if (req.lane !== undefined) {
      const g = req.lane === UNGROUPED_LANE ? null : req.lane;
      if (g !== t.group) patch.group = g;
    }
    const label = req.label?.trim();
    if (!sameCell) {
      if (req.to === "done") {
        if (offer.kind === "needs" && !label) return failMove("a finalized take needs a library label");
        patch.stage = "finalized";
      } else patch.stage = req.band as Stage;
    }
    if (label) patch.label = label;
    if (Object.keys(patch).length === 0) return { ok: true, item: n.item };
    const r = await patchTake(t.id, patch);
    if (!r.ok) return failMove(r.error, r.status === 0);
    return { ok: true, item: settle(takeItem(r.data.take, n.versions)) };
  };

  /* ── verbs ──────────────────────────────────────────────────────────────── */

  const axisById = (id: string): GroupAxis => groupAxes.find((a) => a.id === id) ?? groupAxes[0];

  /** The candidates drawn in one proposed cell. */
  const cellCandidates = (target: VerbTarget): (ProposalNative | IdeaNative)[] => {
    const axis = axisById(target.axis);
    const out: (ProposalNative | IdeaNative)[] = [];
    for (const n of natives.values()) {
      if ((n.kind === "proposal" || n.kind === "idea") && axis.of(n.item) === target.lane) out.push(n);
    }
    return out;
  };

  /** The Suno records drawn in one cell (lane x stage x band). Takes and hunt
   *  leaves live in other stores and are not ours to clear. */
  const cellSuno = (t: VerbTarget): SunoNative[] => {
    if (t.lane === undefined || t.stage === undefined) return [];
    const axis = axisById(t.axis);
    const out: SunoNative[] = [];
    for (const n of natives.values()) {
      if (!isSuno(n)) continue;
      const at = n.item.placement;
      if (at.stage === t.stage && (at.band ?? null) === (t.band ?? null) && axis.of(n.item) === t.lane) out.push(n);
    }
    return out;
  };

  /** "Delete all" for a tile: what it removes, and the consequence said first.
   *  A tile with nothing of ours in it offers none - an inert "Delete all 0"
   *  in every empty tile is a line to read past. */
  const clearVerb = (t: VerbTarget): BoardVerb | null => {
    const list = cellSuno(t);
    if (t.stage === "working") {
      const queued = list.filter((n) => n.kind === "job" && n.job.state === "queued").length;
      if (queued === 0) return null;
      return {
        id: "suno.clear-cell",
        label: `Cancel all ${queued} queued`,
        destructive: true,
        confirm: `${plural(queued, "queued prompt goes", "queued prompts go")} back to Proposed. A prompt Suno is creating now finishes.`,
      };
    }
    if (t.stage === "proposed") {
      const n = list.filter((x) => x.kind === "proposal").length;
      if (n === 0) return null;
      return {
        id: "suno.clear-cell",
        label: `Delete all ${n} here`,
        destructive: true,
        confirm: `${plural(n, "prompt is", "prompts are")} deleted. Hunt leaves stay with their hunt.`,
      };
    }
    if (t.stage === "gate") {
      const n = list.filter((x) => x.kind === "clip").length;
      if (n === 0) return null;
      return {
        id: "suno.clear-cell",
        label: `Delete all ${n} here`,
        destructive: true,
        confirm: `${plural(n, "clip leaves", "clips leave")} the board. The songs stay in your Suno library; a library import brings them back.`,
      };
    }
    return null;
  };

  /** The videos drawn in one Settled cell. */
  const cellMv = (t: VerbTarget): MvNative[] => {
    if (t.lane === undefined || t.stage !== "done") return [];
    const axis = axisById(t.axis);
    const out: MvNative[] = [];
    for (const n of natives.values()) if (n.kind === "mv" && n.item.placement.band === (t.band ?? null) && axis.of(n.item) === t.lane) out.push(n);
    return out;
  };

  const importVerb: BoardVerb = {
    id: "mv.import-folder",
    label: "Import audio folder",
    input: { kind: "text", label: "Folder", initial: { kind: "text", text: MV_IMPORT_DIR } },
  };

  /** Settled's tiles: tracks import, videos is the second queue. */
  const doneVerbs = (t: VerbTarget): BoardVerb[] => {
    if (t.band === "tracks") return [importVerb];
    if (t.band !== "videos") return [];
    const running = mv?.queue.running === true;
    const queued = mv?.jobs.filter((j) => j.state === "queued").length ?? 0;
    const list = cellMv(t);
    const clearable = list.filter((n) => n.job.state !== "active").length;
    const busy = list.length - clearable;
    return [
      running
        ? { id: "mv.queue-stop", label: "Stop videos" }
        : {
            id: "mv.queue-start",
            label: `Start videos · ${queued}`,
            spends: true,
            ...(queued === 0 ? { disabled: "nothing queued" } : mv && !mv.driver.ok ? { disabled: mv.driver.reason ?? "the still vendor cannot be reached" } : {}),
          },
      importVerb,
      ...(clearable
        ? [
            {
              id: "mv.clear-cell",
              label: `Delete all ${clearable} here`,
              destructive: true as const,
              confirm: `${plural(clearable, "video record and its render files are", "video records and their render files are")} deleted; queued ones are cancelled. The tracks stay.${busy ? " The video rendering now finishes." : ""}`,
            },
          ]
        : []),
    ];
  };

  const cellVerbs = (target: VerbTarget): BoardVerb[] => {
    if (target.lane === undefined) return [];
    if (target.stage === "done") return doneVerbs(target);
    const clear = clearVerb(target);
    const tail = clear ? [clear] : [];
    if (target.stage === "working") {
      const running = suno?.queue.running === true;
      const queued = suno?.jobs.filter((j) => j.state === "queued").length ?? 0;
      return [
        running
          ? { id: "suno.queue-stop", label: "Stop queue" }
          : {
              id: "suno.queue-start",
              label: `Start queue · ${queued}`,
              spends: true,
              ...(queued === 0 ? { disabled: "nothing queued" } : suno && !suno.driver.ok ? { disabled: suno.driver.reason } : {}),
            },
        ...tail,
      ];
    }
    // Reading the library is free: no `spends`, so the arm does not hold it.
    if (target.stage === "gate" && target.band === "triage") return [{ id: "suno.import-library", label: "Import Suno library" }, ...tail];
    if (target.stage !== "proposed") return tail;
    const n = cellCandidates(target).length;
    return [
      { id: "suno.write", label: "Write a prompt", input: { kind: "suno-fields" } },
      { id: "suno.draft", label: "Draft like this", input: { kind: "count", initial: { kind: "count", count: 4 } } },
      {
        id: "suno.queue-cell",
        label: `Queue all ${n} here`,
        spends: true,
        ...(n === 0 ? { disabled: "no prompt in this cell" } : {}),
      },
      ...tail,
    ];
  };

  /** The verbs a video card carries. Regenerate and Delete are shown in every
   *  state, inert with the reason where the job is not there yet; Keep / Drop
   *  only while a finished video waits on a verdict, Send to Calendar only
   *  once there is a video to send. */
  const mvVerbs = (j: MvJob): BoardVerb[] => {
    const settled = j.state === "done" || j.state === "failed";
    const unready = j.state === "queued" ? "queued" : j.state === "active" ? "rendering now" : j.state;
    const out: BoardVerb[] = [];
    if (j.state === "done" && j.verdict === null) {
      out.push(
        { id: "mv.keep", label: "Keep" },
        { id: "mv.drop", label: "Drop", confirm: "The video and its still are deleted. The record and its metadata stay." },
      );
    }
    out.push({
      id: "mv.regenerate",
      label: "Regenerate",
      input: { kind: "choice", label: "Part", options: MV_PARTS.map((p) => ({ value: p, label: p })), initial: { kind: "choice", choice: "image" } },
      ...(settled ? {} : { disabled: unready }),
    });
    if (j.metadata) {
      const m = j.metadata;
      out.push({
        id: "mv.edit-metadata",
        label: "Edit metadata",
        input: { kind: "metadata", initial: { kind: "metadata", title: m.title, description: m.description, tags: m.tags } },
        ...(j.state === "active" ? { disabled: "rendering now" } : {}),
      });
    }
    if (j.state === "done" && j.files.video) {
      out.push({ id: "mv.calendar", label: "Send to Calendar", input: { kind: "datetime", label: "Publish at" }, ...(j.slotId ? { disabled: "already in Calendar" } : {}) });
    }
    out.push({
      id: "mv.delete",
      label: "Delete",
      destructive: true,
      confirm: "The video record and its render files are deleted. The track stays.",
      ...(j.state === "active" ? { disabled: "rendering now" } : {}),
    });
    return out;
  };

  const makeVerb = (n: TakeNative | ClipNative): BoardVerb => {
    const why = mvRefusal(n);
    const live = !why ? liveJobOf(mvSourceOf(n)) : undefined;
    return { id: "mv.make", label: "Make video", ...(why ? { disabled: why } : live ? { disabled: "already in the video queue" } : {}) };
  };

  const cardVerbs = (id: string): BoardVerb[] => {
    const n = natives.get(id);
    if (!n) return [];
    if (n.kind === "mv") return mvVerbs(n.job);
    if (n.kind === "take") return n.item.placement.stage === "done" ? [makeVerb(n)] : [];
    if (n.kind === "proposal")
      return [
        { id: "suno.riff", label: "Riff 3 variations" },
        { id: "suno.discard", label: "Delete", destructive: true },
      ];
    if (n.kind === "clip")
      return [
        ...(n.clip.verdict === "keep" ? [makeVerb(n)] : []),
        n.clip.verdict === "keep" ? { id: "suno.undecide", label: "Back to triage" } : { id: "suno.keep", label: "Keep" },
        { id: "suno.drop", label: "Drop" },
        { id: "suno.delete", label: "Delete", destructive: true, confirm: "The record leaves the board. The song stays in your Suno library; a library import brings it back." },
      ];
    if (n.kind === "job" && n.job.state === "queued") return [{ id: "suno.cancel", label: "Cancel" }];
    return [];
  };

  /** The lane a cell verb writes: the axis the board is grouped by, and the
   *  cell's key under it. */
  const laneOfTarget = (t: VerbTarget): SunoLane | null => (t.lane === undefined ? null : { axis: t.axis, value: t.lane });

  const ok = (announce: string): VerbResult => ({ ok: true, announce });
  const no = (reason: string): VerbResult => ({ ok: false, reason });
  const laneName = (l: SunoLane) => (l.value === UNGROUPED_LANE ? "ungrouped" : l.value);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  /** A card verb's cards: the selection when it was asked inside one, else the
   *  card alone - each of the lead card's kind, so "Drop" on a clip never
   *  reaches a prompt that happens to be selected too. */
  const cardsOf = <K extends Native["kind"]>(target: VerbTarget, kind: K): Extract<Native, { kind: K }>[] => {
    const ids = target.itemIds?.length ? target.itemIds : target.itemId ? [target.itemId] : [];
    return ids.flatMap((id) => {
      const x = natives.get(id);
      return x && x.kind === kind ? [x as Extract<Native, { kind: K }>] : [];
    });
  };

  /** One write per video, stopping at the first refusal and saying how far it
   *  got - a selection of five where the third refused is two done. */
  const eachMv = async (list: MvNative[], write: (j: MvJob) => Promise<Result<{ job: MvJob } | { ok: true }>>, did: string): Promise<VerbResult> => {
    let done = 0;
    for (const x of list) {
      const r = await write(x.job);
      if (!r.ok) return no(done ? `${plural(done, "video", "videos")} ${did}; then: ${r.error}` : r.error);
      if ("job" in r.data) rememberMv([r.data.job]);
      done++;
    }
    return ok(`${named(list, "video", "videos")} ${did}`);
  };
  const named = (list: { item: PipelineItem }[], one: string, many: string) => (list.length === 1 ? `"${list[0].item.title}"` : plural(list.length, one, many));

  const runVerb = async (verbId: string, target: VerbTarget, input?: VerbInput): Promise<VerbResult> => {
    const n = target.itemId ? natives.get(target.itemId) : undefined;
    switch (verbId) {
      case "suno.queue-start":
      case "suno.queue-stop": {
        const running = verbId === "suno.queue-start";
        const r = await setSunoQueueRunning(running);
        if (!r.ok) return no(r.error);
        if (suno) suno = { ...suno, queue: r.data.queue };
        return ok(running ? "queue started" : "queue stopping; a create in flight finishes");
      }
      case "suno.clear-cell": {
        const list = cellSuno(target);
        const req = {
          proposalIds: list.flatMap((x) => (x.kind === "proposal" ? [x.proposal.id] : [])),
          jobIds: list.flatMap((x) => (x.kind === "job" ? [x.job.id] : [])),
          clipIds: list.flatMap((x) => (x.kind === "clip" ? [x.clip.id] : [])),
        };
        if (!req.proposalIds.length && !req.jobIds.length && !req.clipIds.length) return no("nothing here to clear");
        const r = await clearSunoRecords(req);
        if (!r.ok) return no(r.error);
        const { removed, cancelled, skipped } = r.data;
        const said = [removed ? `${removed} deleted` : "", cancelled ? `${cancelled} cancelled` : "", skipped ? `${skipped} skipped` : ""].filter(Boolean);
        return ok(said.join(", ") || "nothing changed");
      }
      case "suno.delete": {
        const clips = cardsOf(target, "clip");
        if (!clips.length) return no("delete is for a Suno clip");
        const r = await clearSunoRecords({ clipIds: clips.map((c) => c.clip.id) });
        if (!r.ok) return no(r.error);
        for (const c of clips) natives.delete(c.item.id);
        return ok(`${named(clips, "clip", "clips")} deleted`);
      }
      case "suno.write": {
        const lane = laneOfTarget(target);
        if (!lane) return no("a prompt is written into a cell");
        if (input?.kind !== "suno-fields" || !input.style.trim()) return no("a Suno prompt needs a style");
        const fields = {
          style: input.style,
          ...(input.title ? { title: input.title } : {}),
          ...(input.lyrics ? { lyrics: input.lyrics } : {}),
          ...(input.exclude ? { exclude: input.exclude } : {}),
        };
        const r = await createSunoProposal(fields, lane);
        if (!r.ok) return no(r.error);
        remember([], [r.data.proposal]);
        return ok(`"${titleOf(r.data.proposal.fields)}" written in ${laneName(lane)}`);
      }
      case "suno.draft": {
        const lane = laneOfTarget(target);
        if (!lane) return no("prompts are drafted into a cell");
        const count = input?.kind === "count" ? input.count : 4;
        const r = await proposeSuno(lane, count);
        if (!r.ok) return no(r.error);
        remember([], r.data.proposals);
        return ok(`${plural(r.data.proposals.length, "prompt", "prompts")} drafted in ${laneName(lane)}`);
      }
      case "suno.queue-cell": {
        const cands = cellCandidates(target);
        if (!cands.length) return no("no prompt in this cell");
        const proposalIds = cands.flatMap((c) => (c.kind === "proposal" ? [c.proposal.id] : []));
        const leaves = cands.flatMap((c) => (c.kind === "idea" ? [c] : []));
        let jobs = 0;
        if (proposalIds.length) {
          const r = await enqueueSuno({ proposalIds });
          if (!r.ok) return no(r.error);
          remember(r.data.jobs);
          jobs += r.data.jobs.length;
        }
        if (leaves.length) {
          // A leaf takes the row it draws in, so it stays in this cell's row.
          const byRow = new Map<string, IdeaNative[]>();
          for (const l of leaves) byRow.set(l.item.lane, [...(byRow.get(l.item.lane) ?? []), l]);
          for (const [row, ls] of byRow) {
            const r = await enqueueSuno({ huntNodeIds: ls.map(huntRef), lane: { axis: "group", value: row } });
            if (!r.ok) return no(jobs ? `${plural(jobs, "prompt", "prompts")} queued; the rest refused: ${r.error}` : r.error);
            remember(r.data.jobs);
            jobs += r.data.jobs.length;
          }
        }
        return ok(`${plural(jobs, "prompt", "prompts")} queued`);
      }
      case "suno.riff": {
        if (n?.kind !== "proposal") return no("riff a prompt that is still a candidate");
        const r = await proposeSuno(n.proposal.lane, 3, n.proposal.id);
        if (!r.ok) return no(r.error);
        remember([], r.data.proposals);
        return ok(`${plural(r.data.proposals.length, "riff", "riffs")} of "${n.item.title}"`);
      }
      case "suno.discard": {
        const props = cardsOf(target, "proposal");
        if (!props.length) return no("only a prompt that is still a candidate is deleted");
        if (props.length === 1) {
          const r = await deleteSunoProposal(props[0].proposal.id);
          if (!r.ok) return no(r.error);
        } else {
          const r = await clearSunoRecords({ proposalIds: props.map((x) => x.proposal.id) });
          if (!r.ok) return no(r.error);
        }
        for (const x of props) natives.delete(x.item.id);
        return ok(`${named(props, "prompt", "prompts")} deleted`);
      }
      case "suno.keep":
      case "suno.drop":
      case "suno.undecide": {
        const clips = cardsOf(target, "clip");
        if (!clips.length) return no("keep and drop are for a Suno clip");
        const verdict = verbId === "suno.keep" ? "keep" : verbId === "suno.drop" ? "drop" : null;
        for (const c of clips) {
          const r = await setSunoVerdict(c.clip.id, verdict);
          if (!r.ok) return no(r.error);
          remember([], [], [r.data.clip]);
        }
        return ok(`${named(clips, "clip", "clips")} ${verdict === "keep" ? "kept" : verdict === "drop" ? "dropped" : "back in triage"}`);
      }
      case "suno.import-library": {
        const r = await importSunoLibraryClips();
        if (!r.ok) return no(r.error);
        return ok(`Suno library: added ${r.data.added}, skipped ${r.data.skipped}`);
      }
      case "suno.cancel": {
        const jobs = cardsOf(target, "job");
        if (!jobs.length) return no("only a queued prompt is cancelled");
        if (jobs.length === 1) {
          const r = await cancelSunoJob(jobs[0].job.id);
          if (!r.ok) return no(r.error);
          remember([r.data.job]);
        } else {
          const r = await clearSunoRecords({ jobIds: jobs.map((x) => x.job.id) });
          if (!r.ok) return no(r.error);
        }
        return ok(`${named(jobs, "prompt", "prompts")} taken off the queue`);
      }
      case "mv.queue-start":
      case "mv.queue-stop": {
        const running = verbId === "mv.queue-start";
        const r = await setMvQueueRunning(running);
        if (!r.ok) return no(r.error);
        if (mv) mv = { ...mv, queue: r.data.queue };
        return ok(running ? "videos started" : "videos stopping; the step in flight finishes");
      }
      case "mv.import-folder": {
        const dir = input?.kind === "text" && input.text.trim() ? input.text.trim() : MV_IMPORT_DIR;
        const r = await importMvFolder({ dir });
        if (!r.ok) return no(r.error);
        return ok(`${r.data.added} imported, ${r.data.skipped} already here`);
      }
      case "mv.clear-cell": {
        const list = cellMv(target).filter((x) => x.job.state !== "active");
        if (!list.length) return no("nothing here to clear");
        let removed = 0;
        for (const x of list) {
          const r = await deleteMv(x.job.id);
          if (!r.ok) return no(removed ? `${removed} deleted; then: ${r.error}` : r.error);
          natives.delete(x.item.id);
          removed++;
        }
        return ok(`${removed} deleted`);
      }
      case "mv.make": {
        // The lead card's kind decides, as for every card verb: a selection of
        // takes and clips makes videos of the lead's kind only.
        if (n?.kind !== "take" && n?.kind !== "clip") return no("only a track becomes a video");
        const cards: (TakeNative | ClipNative)[] = n.kind === "take" ? cardsOf(target, "take") : cardsOf(target, "clip");
        const sources = cards.filter((c) => mvRefusal(c) === null).map(mvSourceOf);
        if (!sources.length) return no(mvRefusal(n) ?? "nothing here makes a video");
        const r = await enqueueMv({ sources });
        if (!r.ok) return no(r.error);
        rememberMv(r.data.jobs);
        const skipped = sources.length - r.data.jobs.length;
        return ok(`${plural(r.data.jobs.length, "video", "videos")} queued${skipped > 0 ? `, ${skipped} already in the queue` : ""}`);
      }
      case "mv.keep":
      case "mv.drop": {
        const list = cardsOf(target, "mv").filter((x) => x.job.state === "done" && x.job.verdict === null);
        if (!list.length) return no("keep and drop are for a finished video nobody has judged");
        const verdict = verbId === "mv.keep" ? ("keep" as const) : ("drop" as const);
        return eachMv(list, (j) => patchMv(j.id, { verdict }), verdict === "keep" ? "kept" : "dropped");
      }
      case "mv.regenerate": {
        const part = input?.kind === "choice" ? MV_PARTS.find((p) => p === input.choice) : undefined;
        if (!part) return no(`regenerate one part: ${MV_PARTS.join(", ")}`);
        const list = cardsOf(target, "mv").filter((x) => x.job.state === "done" || x.job.state === "failed");
        if (!list.length) return no("only a finished or failed video is regenerated");
        const note = input?.kind === "choice" ? input.note?.trim() : undefined;
        return eachMv(list, (j) => regenerateMv(j.id, { part, ...(note ? { note } : {}) }), `back in the queue: ${part}`);
      }
      case "mv.edit-metadata": {
        if (n?.kind !== "mv") return no("metadata belongs to a video");
        if (input?.kind !== "metadata" || !input.title.trim()) return no("a video needs a title");
        const r = await patchMv(n.job.id, { metadata: { title: input.title.trim(), description: input.description, tags: input.tags } });
        if (!r.ok) return no(r.error);
        rememberMv([r.data.job]);
        return ok(`"${n.item.title}" metadata saved`);
      }
      case "mv.calendar": {
        // One card: a publish time is a slot, and a selection does not share one.
        if (n?.kind !== "mv") return no("only a finished video goes to Calendar");
        if (input?.kind !== "datetime" || Number.isNaN(Date.parse(input.at))) return no("a publish date and time");
        const r = await sendMvToCalendar(n.job.id, { publishAt: input.at });
        if (!r.ok) return no(r.error);
        rememberMv([r.data.job]);
        return ok(`"${n.item.title}" in Calendar`);
      }
      case "mv.delete": {
        const list = cardsOf(target, "mv").filter((x) => x.job.state !== "active");
        if (!list.length) return no("a video rendering now is not deleted");
        const r = await eachMv(list, (j) => deleteMv(j.id), "deleted");
        if (r.ok) for (const x of list) natives.delete(x.item.id);
        return r;
      }
      default:
        return no(`no verb ${verbId} on audio`);
    }
  };

  // A stopped queue with work waiting changes only when somebody presses Start,
  // and that reloads; polling it would be a read every two seconds for nothing.
  // The video queue is read on the same rule.
  const pollMs = (): number =>
    suno?.jobs.some((j) => j.state === "active" || (j.state === "queued" && suno?.queue.running)) ||
    mv?.jobs.some((j) => j.state === "active" || (j.state === "queued" && mv?.queue.running))
      ? 2000
      : 0;

  /* ── load ───────────────────────────────────────────────────────────────── */

  const loadPipeline = async (): Promise<PipelineEntry[]> => {
    // Three reads that can fail the lane (a failure throws: unavailable or
    // error), and the Suno read, which can only degrade its stages. An empty
    // pool is the successful read of nothing and returns [].
    const [takesR, huntsR, groupsR, sunoR, mvR] = await Promise.all([listTakes(), listHunts(), getGroups(), getSuno(), getMv()]);
    const takes = must(takesR, "/api/sound/takes").takes;
    const hunts = must(huntsR, "/api/sound/hunts").hunts;
    groups = must(groupsR, "/api/sound/groups").groups;
    const degraded: NonNullable<PipelineLoadNotes["degraded"]> = [];
    if (sunoR.ok) suno = sunoR.data;
    else {
      suno = null;
      const reason = `the Suno queue could not be read: ${sunoR.error}`;
      for (const stage of ["proposed", "working", "gate"] as const) degraded.push({ stage, reason });
    }
    // The video queue degrades Settled alone: the finished tracks still draw.
    if (mvR.ok) mv = mvR.data;
    else {
      mv = null;
      degraded.push({ stage: "done", reason: `the music-video queue could not be read: ${mvR.error}` });
    }
    takeById = new Map(takes.map((t) => [t.id, t]));

    const next = new Map<string, Native>();
    const kept = takes.filter((t) => t.verdict === "kept");
    for (const s of stackVersions(kept)) {
      const n = takeItem(s.head, s.versions.length);
      next.set(n.item.id, n);
    }
    for (const t of takes) {
      if (t.verdict !== "unjudged") continue;
      const n = takeItem(t, 1);
      next.set(n.item.id, n);
    }

    const leafHasProposal = new Set((suno?.proposals ?? []).flatMap((p) => (p.origin === "hunt" && p.sourceId ? [p.sourceId] : [])));
    let stillOut = 0;
    for (const hunt of hunts) {
      for (const node of hunt.nodes) {
        const candidate = node.state === "idea" || node.state === "failed" || (node.state === "awaiting-return" && node.provider === "suno" && node.takeIds.length === 0);
        if (!candidate) {
          if (node.state === "rendering" || node.state === "awaiting-return") stillOut++;
          continue;
        }
        // drawn as its Suno proposal, job or clips instead
        if (leafHasProposal.has(node.id)) continue;
        const n = ideaItem(hunt, node);
        next.set(n.item.id, n);
      }
    }

    let dropped = 0;
    if (suno) {
      const live = new Map<string, SunoJob>();
      for (const j of suno.jobs) if (j.state === "queued" || j.state === "active") live.set(j.proposalId, j);
      const lastJob = new Map<string, SunoJob>();
      for (const j of suno.jobs) {
        const have = lastJob.get(j.proposalId);
        if (!have || j.enqueuedAt >= have.enqueuedAt) lastJob.set(j.proposalId, j);
      }
      for (const p of suno.proposals) {
        const last = lastJob.get(p.id);
        if (last && last.state !== "failed" && last.state !== "cancelled") continue;
        const n = proposalItem(p);
        next.set(n.item.id, n);
      }
      for (const j of suno.jobs) {
        if (j.state !== "queued" && j.state !== "active") continue;
        const n = jobItem(j, positionOf(j));
        next.set(n.item.id, n);
      }
      const laneOfJob = new Map(suno.jobs.map((j) => [j.id, j.lane]));
      for (const c of suno.clips) {
        if (c.verdict === "drop") {
          dropped++;
          continue;
        }
        const n = clipItem(c, c.jobId ? (laneOfJob.get(c.jobId) ?? null) : null);
        next.set(n.item.id, n);
      }
      if (!suno.driver.ok && suno.jobs.some((j) => j.state === "queued")) {
        degraded.push({ stage: "working", reason: `${suno.driver.reason} - run npm run suno:browser` });
      }
    }

    // After the takes and clips: a video's lane is read off its track.
    let cancelled = 0;
    if (mv) {
      for (const j of mv.jobs) {
        if (j.state === "cancelled") {
          cancelled++;
          continue;
        }
        const n = mvItem(j);
        next.set(n.item.id, n);
      }
      if (!mv.driver.ok && mv.jobs.some((j) => j.state === "queued")) {
        degraded.push({ stage: "done", reason: mv.driver.reason ?? "the still vendor cannot be reached" });
      }
    }

    natives.clear();
    for (const [k, v] of next) natives.set(k, v);
    const hidden: PipelineLoadNotes["hidden"] = [];
    if (stillOut > 0) hidden.push({ stage: "proposed", count: stillOut, why: "hunt leaves rendering or awaiting a Suno return" });
    if (dropped > 0) hidden.push({ stage: "gate", count: dropped, why: "Suno clips dropped" });
    if (cancelled > 0) hidden.push({ stage: "done", count: cancelled, why: "music-video jobs cancelled" });
    const switched: NonNullable<PipelineLoadNotes["switched"]> = [
      ...(suno ? [{ stage: "working" as const, on: suno.queue.running, ...(suno.queue.interrupted ? { interrupted: suno.queue.interrupted } : {}) }] : []),
      ...(mv ? [{ stage: "done" as const, on: mv.queue.running, label: "videos", ...(mv.queue.interrupted ? { interrupted: mv.queue.interrupted } : {}) }] : []),
    ];
    notes = { hidden, damaged: [], ...(degraded.length ? { degraded } : {}), ...(switched.length ? { switched } : {}) };
    return [...natives.values()].map(entryOf);
  };

  const loadEntries = async (): Promise<BoardEntry[]> => loadPipeline();

  return {
    id: "audio",
    label: "Audio",
    reasonAxes: [],
    native: { href: "/playground?m=arrange", label: "Sound lab" },
    exclusive: false,
    commitsOn: null,

    stages: ["proposed", "working", "gate", "done"],
    bands: { gate: GATE_BANDS, done: DONE_BANDS },
    groupAxes,
    lanes,

    placementOf(item) {
      const n = natives.get(item.id);
      if (!n) throw new Error(`audio: ${item.id} was not read by this source; loadPipeline() first`);
      return n.item.placement;
    },
    admits,
    move,
    loadPipeline,
    cellVerbs,
    cardVerbs,
    runVerb,
    pollMs,

    async count(): Promise<BoardCount> {
      return countEntries(await loadEntries());
    },
    loadEntries,
    load: () => itemsOf(loadEntries()),
    async decide(_itemId: string, _verdict: BoardVerdict): Promise<void> {
      throw new VerdictRefused(AUDIO_DECIDE_REFUSAL);
    },

    lastLoad: () => notes,
  };
}
