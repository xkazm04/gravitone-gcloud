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
//   gate      `triage`: takes with no verdict and Suno clips with none; then
//             `pending` (kept takes and kept clips), `remaster`, `edit`
//   done      a take's stage finalized
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
// A FAILED SUNO READ IS A DEGRADED STAGE, NOT A FAILED LANE. The takes and hunts
// still draw; proposed, working and gate say the queue could not be read.

import {
  cancelSunoJob,
  createSunoProposal,
  deleteSunoProposal,
  enqueueSuno,
  getGroups,
  getSuno,
  listHunts,
  listTakes,
  patchTake,
  proposeSuno,
  setSunoVerdict,
  takeFileUrl,
  type Result,
} from "@/lib/sound/client";
import type { Hunt, HuntNode, SoundGroups, SoundKind, SoundTake, Stage, TakePatch } from "@/lib/sound/types";
import { SUNO_MODEL_LABEL, SUNO_PHASE_WORD, type SunoClip, type SunoJob, type SunoLane, type SunoProposal, type SunoSnapshot } from "@/lib/suno/types";
import { stackVersions, suggestLabel } from "@/app/playground/arrange/model";

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
export const AUDIO_CLIP_DONE_REFUSAL = "import the clip into the Sound lab first: a Suno clip is a link, not a file";
export const AUDIO_SUNO_LANE_REFUSAL = "a Suno prompt keeps the lane it was written in";
export const QUEUE_ROUTE = "POST /api/sound/suno/queue";

const GATE_BANDS: StageBand[] = [
  { id: "triage", label: "triage" },
  { id: "pending", label: "pending" },
  { id: "remaster", label: "remaster" },
  { id: "edit", label: "edit" },
];

type TakeNative = { kind: "take"; take: SoundTake; versions: number; item: PipelineItem };
type IdeaNative = { kind: "idea"; hunt: Hunt; node: HuntNode; item: PipelineItem };
type ProposalNative = { kind: "proposal"; proposal: SunoProposal; item: PipelineItem };
type JobNative = { kind: "job"; job: SunoJob; position: number | null; item: PipelineItem };
type ClipNative = { kind: "clip"; clip: SunoClip; lane: SunoLane | null; item: PipelineItem };
type SunoNative = ProposalNative | JobNative | ClipNative;
type Native = TakeNative | IdeaNative | SunoNative;

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
  return stage === "finalized" ? { stage: "done", band: null } : { stage: "gate", band: stage };
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

export function makeAudioSource(opts: { now?: () => number } = {}): AudioPipelineSource {
  const now = opts.now ?? Date.now;
  const natives = new Map<string, Native>();
  /** Every proposal and job of the last read, drawn or not: a cancel returns
   *  the job's proposal, which was not on the board while it was queued. */
  let suno: SunoSnapshot | null = null;
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

  const clipItem = (c: SunoClip, lane: SunoLane | null): ClipNative => {
    const id = itemId("audio", `suno:clip:${c.id}`);
    const base = sunoBase(id, lane, { style: c.title || c.songId }, c.createdAt);
    const band = c.verdict === "keep" ? "pending" : "triage";
    // An audio entry with no `src` is a clip Suno has not exposed a stream for
    // yet: the skin draws no live play button for it.
    const audio: BoardMedia = c.audioUrl ? { kind: "audio", src: c.audioUrl } : { kind: "audio" };
    const item: PipelineItem = {
      ...base,
      title: c.title || c.songId,
      media: [audio, ...(c.imageUrl ? [{ kind: "image" as const, src: c.imageUrl }] : [])],
      machinePick: null,
      verdict: c.verdict === "keep" ? "approve" : null,
      note: null,
      placement: { stage: "gate", band, lane: base.lane },
      version: stamp(id, [c.verdict, c.audioUrl, c.title, c.durationS, base.lane].join("|")),
    };
    return { kind: "clip", clip: c, lane, item };
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
      case "clip":
        return [
          // The MODEL leads: it is the chip a clip card carries.
          { name: "model", value: SUNO_MODEL_LABEL[n.clip.model] },
          ...(n.clip.durationS !== null ? [{ name: "length", value: `${Math.round(n.clip.durationS)} s` }] : []),
          { name: "song", value: n.clip.songId },
        ];
    }
  };

  const hrefOf = (n: Native): string => {
    switch (n.kind) {
      case "take":
        return n.take.verdict !== "kept" ? "/playground?m=triage" : "/playground?m=arrange";
      case "idea":
        return "/playground?m=hunt";
      case "clip":
        return n.clip.url;
      default:
        return "https://suno.com/create";
    }
  };

  const entryOf = (n: Native): PipelineEntry => ({
    item: n.item,
    placement: n.item.placement,
    href: hrefOf(n),
    facts: factsOf(n),
    refuse: { approve: AUDIO_DECIDE_REFUSAL, reject: AUDIO_DECIDE_REFUSAL, clear: AUDIO_DECIDE_REFUSAL },
  });

  /* ── axes ───────────────────────────────────────────────────────────────── */

  const laneOfSuno = (n: SunoNative): SunoLane | null => (n.kind === "proposal" ? n.proposal.lane : n.kind === "job" ? n.job.lane : n.lane);

  /** A Suno item under an axis: the lane's value when it was written under
   *  THIS axis (so a right-click in lane X under "genre" draws in lane X), the
   *  axis's honest reading of a Suno item otherwise. */
  const sunoUnder = (n: SunoNative, axis: string, otherwise: string): string => {
    const lane = laneOfSuno(n);
    return lane && lane.axis === axis && lane.value ? lane.value : otherwise;
  };
  const isSuno = (n: Native | undefined): n is SunoNative => !!n && (n.kind === "proposal" || n.kind === "job" || n.kind === "clip");
  const originOfSuno = (n: SunoNative): string => {
    if (n.kind === "proposal") return n.proposal.origin;
    const pid = n.kind === "job" ? n.job.proposalId : suno?.jobs.find((j) => j.id === n.clip.jobId)?.proposalId;
    return suno?.proposals.find((p) => p.id === pid)?.origin ?? UNGROUPED_LANE;
  };

  // Only axes every card really carries. `group` is the row and may be null
  // (the ungrouped row). `terms.genre[0]` is empty on an import and on every
  // effect: those fall in the unwritten row. NOT offered: `projectId` (set only
  // on origin "score") and `measured.durationS` (only after a browser
  // analysis) - an axis that reads blank for most cards cannot tell
  // "ungrouped" from "unwritten".
  const groupAxes: GroupAxis[] = [
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
        return n.kind === "take" ? n.take.provider : n.node.provider;
      },
    },
    {
      id: "op",
      label: "op",
      of: (item) => {
        const n = natives.get(item.id);
        if (!n) return UNGROUPED_LANE;
        if (isSuno(n)) return sunoUnder(n, "op", "compose");
        return n.kind === "take" ? n.take.op : opOf(n.hunt.kind);
      },
    },
    {
      id: "origin",
      label: "origin",
      of: (item) => {
        const n = natives.get(item.id);
        if (!n) return UNGROUPED_LANE;
        if (isSuno(n)) return sunoUnder(n, "origin", originOfSuno(n));
        return n.kind === "take" ? n.take.origin : "hunt";
      },
    },
  ];

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

  const admits = (item: PipelineItem, to: CanonStage, band: string | null): MoveOffer => {
    const n = natives.get(item.id);
    if (!n) return refused("this card is not on the board any more");
    const here = n.item.placement;
    if (to === "gate" ? band === null || !GATE_BANDS.some((b) => b.id === band) : band !== null) {
      return refused(to === "gate" ? "the gate is drawn in bands; drop on one" : `${to} has no bands`);
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
        if (to === "done") return refused(AUDIO_CLIP_DONE_REFUSAL);
        if (to !== "gate") return refused("a rendered clip does not go back to being a prompt");
        return band === "triage" || band === "pending" ? { kind: "ok" } : refused("a Suno clip is kept or undecided; remaster and edit take an imported take");
      case "take": {
        const t = n.take;
        if (t.verdict !== "kept") return refused(AUDIO_UNJUDGED_REFUSAL);
        if (to === "proposed" || to === "working") return refused("a rendered take does not go back to being an idea");
        if (to === "done") {
          if (t.label?.trim()) return { kind: "ok" };
          return { kind: "needs", needs: "label", prompt: `Library label for "${t.title}", the name agents select it by. Suggested: ${suggestLabel(t, t.group)}` };
        }
        if (band === "triage") return refused("un-keeping a take is a verdict: do it in Triage");
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
    if (!suno) suno = { proposals: [], jobs: [], clips: [], driver: { ok: true } };
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

  const move = async (req: MoveRequest): Promise<MoveResult> => {
    const n = natives.get(req.itemId);
    if (!n) return failMove("this card is not on the board any more");
    const offer = admits(n.item, req.to, req.band);
    if (offer.kind === "refused") return failMove(offer.reason);
    const axis = req.axis;
    const sameCell = req.to === n.item.placement.stage && req.band === n.item.placement.band;
    const laneMoved = req.lane !== undefined && req.lane !== n.item.lane;

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

    if (n.kind === "proposal" || n.kind === "job" || n.kind === "clip") {
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
      const r = await setSunoVerdict(n.clip.id, req.band === "pending" ? "keep" : null);
      if (!r.ok) return failMove(r.error, r.status === 0);
      remember([], [], [r.data.clip]);
      return { ok: true, item: settle(clipItem(r.data.clip, n.lane)) };
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

  const cellVerbs = (target: VerbTarget): BoardVerb[] => {
    if (target.stage !== "proposed" || target.lane === undefined) return [];
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
    ];
  };

  const cardVerbs = (id: string): BoardVerb[] => {
    const n = natives.get(id);
    if (!n) return [];
    if (n.kind === "proposal")
      return [
        { id: "suno.riff", label: "Riff 3 variations" },
        { id: "suno.discard", label: "Discard" },
      ];
    if (n.kind === "clip")
      return [
        n.clip.verdict === "keep" ? { id: "suno.undecide", label: "Back to triage" } : { id: "suno.keep", label: "Keep" },
        { id: "suno.drop", label: "Drop" },
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

  const runVerb = async (verbId: string, target: VerbTarget, input?: VerbInput): Promise<VerbResult> => {
    const n = target.itemId ? natives.get(target.itemId) : undefined;
    switch (verbId) {
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
        if (n?.kind !== "proposal") return no("only a prompt that is still a candidate is discarded");
        const r = await deleteSunoProposal(n.proposal.id);
        if (!r.ok) return no(r.error);
        natives.delete(n.item.id);
        return ok(`"${n.item.title}" discarded`);
      }
      case "suno.keep":
      case "suno.drop":
      case "suno.undecide": {
        if (n?.kind !== "clip") return no("keep and drop are for a Suno clip");
        const verdict = verbId === "suno.keep" ? "keep" : verbId === "suno.drop" ? "drop" : null;
        const r = await setSunoVerdict(n.clip.id, verdict);
        if (!r.ok) return no(r.error);
        remember([], [], [r.data.clip]);
        return ok(`"${n.item.title}" ${verdict === "keep" ? "kept" : verdict === "drop" ? "dropped" : "back in triage"}`);
      }
      case "suno.cancel": {
        if (n?.kind !== "job") return no("only a queued prompt is cancelled");
        const r = await cancelSunoJob(n.job.id);
        if (!r.ok) return no(r.error);
        remember([r.data.job]);
        return ok(`"${n.item.title}" taken off the queue`);
      }
      default:
        return no(`no verb ${verbId} on audio`);
    }
  };

  const pollMs = (): number => (suno?.jobs.some((j) => j.state === "queued" || j.state === "active") ? 2000 : 0);

  /* ── load ───────────────────────────────────────────────────────────────── */

  const loadPipeline = async (): Promise<PipelineEntry[]> => {
    // Three reads that can fail the lane (a failure throws: unavailable or
    // error), and the Suno read, which can only degrade its stages. An empty
    // pool is the successful read of nothing and returns [].
    const [takesR, huntsR, groupsR, sunoR] = await Promise.all([listTakes(), listHunts(), getGroups(), getSuno()]);
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
        const n = clipItem(c, laneOfJob.get(c.jobId) ?? null);
        next.set(n.item.id, n);
      }
      if (!suno.driver.ok && suno.jobs.some((j) => j.state === "queued")) {
        degraded.push({ stage: "working", reason: `${suno.driver.reason} - run npm run suno:browser` });
      }
    }

    natives.clear();
    for (const [k, v] of next) natives.set(k, v);
    const hidden: PipelineLoadNotes["hidden"] = [];
    if (stillOut > 0) hidden.push({ stage: "proposed", count: stillOut, why: "hunt leaves rendering or awaiting a Suno return" });
    if (dropped > 0) hidden.push({ stage: "gate", count: dropped, why: "Suno clips dropped" });
    notes = { hidden, damaged: [], ...(degraded.length ? { degraded } : {}) };
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
    bands: { gate: GATE_BANDS },
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
