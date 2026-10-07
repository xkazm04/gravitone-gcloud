// AUDIO — a generated take moving through the sound pipeline, plus the prompts
// nothing has been spent on yet.
//
// Everything reads and writes through lib/sound/client.ts, because the sound
// store is filesystem-backed and server-only and a client component cannot
// import it. The server's `applyRules` (lib/sound/takes.ts) stays the single
// authority on what a take may become: `admits()` ANTICIPATES its rules so the
// refusal happens in the hand, and `move()` writes and lets the server answer.
// Nothing here re-implements one.
//
//   proposed  every hunt leaf still an idea (or failed, wearing its error),
//             every prompt the operator typed on the canvas
//   working   a generate request IN FLIGHT. POST /api/sound/generate is
//             synchronous (up to 240 s) and no audio job exists, so this is a
//             request the adapter itself holds, not a stored record: it
//             vanishes on success (the take is filed) or on failure (the card
//             returns to proposed wearing the vendor's sentence)
//   gate      takes waiting on a human. THREE bands the stub did not have a
//             name for, one it did: `triage` (verdict unjudged, no stage - the
//             take a render files), then kept takes by stage: `pending`,
//             `remaster`, `edit`
//   done      stage finalized
//
// WHAT IS NOT DRAWN, and why: a rejected take (leaving `kept` clears its
// stage: it is off the board by the server's own rule); a hunt leaf that is
// rendering in the hunt tab, awaiting a Suno return or already rendered (its
// takes are drawn instead). `lastLoad().hidden` counts the leaves.
//
// A FRESH TAKE LANDS IN TRIAGE, NOT PENDING. generateTake files `unjudged`
// (lib/sound/generate.ts createTake: verdict defaults to "unjudged"), and
// applyRules gives a stage only to a kept take. So the card that leaves
// `working` on success turns into a take with a DIFFERENT id, in gate/triage.
// Moving it on is refused here with the reason, because keeping is a judgement
// the Sound lab's Triage asks ratings for, and a drag must not invent one.

import { generateTake, getGroups, listHunts, listTakes, patchTake, takeFileUrl, type Result } from "@/lib/sound/client";
import type { GenerateRequest, Hunt, HuntNode, SoundGroups, SoundKind, SoundTake, Stage, TakePatch } from "@/lib/sound/types";
import { stackVersions, suggestLabel } from "@/app/playground/arrange/model";

import type { CanonStage, GroupAxis, LaneDef, MoveOffer, MoveRequest, MoveResult, PipelineEntry, PipelineItem, PipelineSource, StageBand } from "../pipeline";
import { lanesFromItems, UNGROUPED_LANE } from "../pipeline";
import type { BoardCount, BoardEntry } from "../source";
import { countEntries, itemId, itemsOf, SourceUnavailable, VerdictRefused } from "../source";
import type { BoardMedia, BoardVerdict } from "../types";
// Type-only, erased at build: importing a VALUE from ./articles would pull the
// articles adapter into the audio chunk and undo the registry's lazy load.
import type { PipelineLoadNotes, StubbedMove } from "./articles";

export const AUDIO_DECIDE_REFUSAL = "an audio take is judged in the Sound lab's Triage; the canvas moves stages";
export const AUDIO_LANE_ONLY_PROMPT = "a candidate has no row of its own until it is rendered";
export const AUDIO_UNJUDGED_REFUSAL = "judge it in Triage first: only a kept take has a stage";
export const AUDIO_FLIGHT_REFUSAL = "a render is in flight; wait for the vendor's answer";

const GATE_BANDS: StageBand[] = [
  { id: "triage", label: "triage" },
  { id: "pending", label: "pending" },
  { id: "remaster", label: "remaster" },
  { id: "edit", label: "edit" },
];

/** A prompt the operator typed on the canvas. Held by the adapter until it is
 *  rendered or discarded: nothing on the server stores a prompt that has not
 *  been spent on. A reload of the page drops it, and the card says so by being
 *  gone, not by lingering. */
export interface PromptDraft {
  id: string;
  kind: SoundKind;
  prompt: string;
  durationS: number;
  negative: string | null;
  loop: boolean | null;
  createdAt: string;
}

type TakeNative = { kind: "take"; take: SoundTake; versions: number; item: PipelineItem };
type IdeaNative = { kind: "idea"; hunt: Hunt; node: HuntNode; item: PipelineItem };
type DraftNative = { kind: "draft"; draft: PromptDraft; item: PipelineItem };
type FlightNative = { kind: "flight"; from: IdeaNative | DraftNative; startedAt: string; item: PipelineItem };
type Native = TakeNative | IdeaNative | DraftNative | FlightNative;

export type AudioPipelineSource = PipelineSource & {
  lastLoad(): PipelineLoadNotes;
  /** Put a typed prompt in `proposed`. Nothing is spent. */
  propose(input: { kind: SoundKind; prompt: string; durationS: number; negative?: string | null; loop?: boolean | null }): PipelineItem;
  /** Take a typed prompt back off the canvas. A hunt leaf is not discarded here. */
  discard(itemId: string): boolean;
};

/** Where a read of the sound store failed, as the Board's two failure states:
 *  a source that could not be reached (SourceUnavailable) and one that answered
 *  and failed (Error). Empty is neither: it is a successful read of nothing. */
function must<T>(r: Result<T>, route: string): T {
  if (r.ok) return r.data;
  if (r.status === 0 || r.status === 401 || r.status === 403) throw new SourceUnavailable(r.error);
  if (r.status === 404 && r.error === "HTTP 404") throw new SourceUnavailable(`${route} is not built here`);
  throw new Error(r.error);
}

/** The dry path's answer (see StubbedMove in ./articles). Duplicated, not imported: see above. */
const stubbedMove = (item: PipelineItem, wouldCall: string): MoveResult => {
  const r: StubbedMove = { ok: true, item, stub: true, wouldCall };
  return r;
};

const opOf = (kind: SoundKind) => (kind === "sfx" ? ("sfx" as const) : ("compose" as const));

function takeSite(t: SoundTake): { stage: CanonStage; band: string | null } {
  if (t.verdict !== "kept") return { stage: "gate", band: "triage" };
  const stage: Stage = t.stage ?? "pending";
  return stage === "finalized" ? { stage: "done", band: null } : { stage: "gate", band: stage };
}

export function makeAudioSource(opts: { now?: () => number } = {}): AudioPipelineSource {
  const now = opts.now ?? Date.now;
  const natives = new Map<string, Native>();
  const drafts = new Map<string, PromptDraft>();
  const flights = new Map<string, FlightNative>();
  /** A lane a candidate was dropped on: interface-local until the render, then
   *  written as the take's group. */
  const laneOverride = new Map<string, string>();
  /** The vendor's sentence from a render that failed, kept on the card. */
  const failures = new Map<string, string>();
  const versions = new Map<string, { sig: string; v: number }>();
  let groups: SoundGroups = { music: [], sfx: [] };
  let notes: PipelineLoadNotes = { hidden: [], damaged: [] };
  let seq = 0;

  const stamp = (id: string, sig: string): number => {
    const have = versions.get(id);
    if (have && have.sig === sig) return have.v;
    const v = (have?.v ?? 0) + 1;
    versions.set(id, { sig, v });
    return v;
  };

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
      // A failed leaf wears the vendor's sentence the server stored; a render the
      // canvas started wears the one it just heard.
      note: failures.get(id) ?? (node.state === "failed" ? node.error : null),
      createdAt: hunt.createdAt,
      lane,
      placement: { stage: "proposed", band: null, lane },
      version: stamp(id, [node.state, node.error, node.label, node.prompt, lane, failures.get(id)].join("|")),
    };
    return { kind: "idea", hunt, node, item };
  };

  const draftItem = (d: PromptDraft): DraftNative => {
    const id = itemId("audio", `prompt:${d.id}`);
    const lane = laneOverride.get(id) ?? UNGROUPED_LANE;
    const item: PipelineItem = {
      id,
      source: "audio",
      title: d.prompt.length > 60 ? `${d.prompt.slice(0, 57)}...` : d.prompt,
      projectId: null,
      group: lane === UNGROUPED_LANE ? null : lane,
      media: [{ kind: "text", text: d.prompt }],
      machinePick: null,
      verdict: null,
      reasons: [],
      note: failures.get(id) ?? null,
      createdAt: d.createdAt,
      lane,
      placement: { stage: "proposed", band: null, lane },
      version: stamp(id, [d.prompt, d.durationS, lane, failures.get(id)].join("|")),
    };
    return { kind: "draft", draft: d, item };
  };

  const flightOf = (from: IdeaNative | DraftNative, startedAt: string): FlightNative => {
    const id = from.item.id;
    const item: PipelineItem = {
      ...from.item,
      note: null,
      placement: { stage: "working", band: null, lane: from.item.lane },
      version: stamp(id, `flight|${startedAt}`),
    };
    return { kind: "flight", from, startedAt, item };
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
          { name: "length", value: `${n.node.durationS} s` },
        ];
      case "draft":
        return [
          { name: "kind", value: n.draft.kind },
          { name: "length", value: `${n.draft.durationS} s` },
        ];
      case "flight":
        return factsOf(n.from);
    }
  };

  const entryOf = (n: Native): PipelineEntry => ({
    item: n.item,
    placement: n.item.placement,
    href: n.kind === "idea" || (n.kind === "flight" && n.from.kind === "idea") ? "/playground?m=hunt" : n.kind === "take" && n.take.verdict !== "kept" ? "/playground?m=triage" : "/playground?m=arrange",
    facts: factsOf(n),
    refuse: { approve: AUDIO_DECIDE_REFUSAL, reject: AUDIO_DECIDE_REFUSAL, clear: AUDIO_DECIDE_REFUSAL },
  });

  /* ── axes ───────────────────────────────────────────────────────────────── */

  const takeOf = (item: PipelineItem): SoundTake | null => {
    const n = natives.get(item.id);
    return n?.kind === "take" ? n.take : null;
  };
  const providerOf = (n: Native | undefined): string => {
    if (!n) return UNGROUPED_LANE;
    switch (n.kind) {
      case "take":
        return n.take.provider;
      case "idea":
        return n.node.provider;
      case "draft":
        return "elevenlabs";
      case "flight":
        return providerOf(n.from);
    }
  };
  const kindOf = (n: Native): SoundKind => (n.kind === "take" ? n.take.kind : n.kind === "idea" ? n.hunt.kind : n.kind === "draft" ? n.draft.kind : kindOf(n.from));

  // Only axes every take (or candidate) really carries. `group` is the row and
  // may be null (the ungrouped row). `terms.genre[0]` is empty on an import and
  // on every effect: those fall in the unwritten row. NOT offered: `projectId`
  // (set only on origin "score") and `measured.durationS` (only after a browser
  // analysis) - an axis that reads blank for most cards cannot tell "ungrouped"
  // from "unwritten".
  const groupAxes: GroupAxis[] = [
    { id: "group", label: "row", of: (item) => item.lane },
    { id: "genre", label: "genre", of: (item) => takeOf(item)?.terms.genre[0] ?? UNGROUPED_LANE },
    { id: "provider", label: "provider", of: (item) => providerOf(natives.get(item.id)) },
    {
      id: "op",
      label: "op",
      of: (item) => {
        const n = natives.get(item.id);
        return n ? (n.kind === "take" ? n.take.op : opOf(kindOf(n))) : UNGROUPED_LANE;
      },
    },
    {
      id: "origin",
      label: "origin",
      of: (item) => {
        const n = natives.get(item.id);
        if (!n) return UNGROUPED_LANE;
        if (n.kind === "take") return n.take.origin;
        return (n.kind === "idea" || (n.kind === "flight" && n.from.kind === "idea")) ? "hunt" : "lab";
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
    if (n.kind === "flight") return refused(AUDIO_FLIGHT_REFUSAL);
    const here = n.item.placement;
    if (to === "gate" ? band === null || !GATE_BANDS.some((b) => b.id === band) : band !== null) {
      return refused(to === "gate" ? "the gate is drawn in bands; drop on one" : `${to} has no bands`);
    }
    const same = to === here.stage && band === here.band;

    if (n.kind === "idea" || n.kind === "draft") {
      if (same) return { kind: "ok" };
      if (to !== "working") return refused("nothing has been rendered yet: there is no take to judge or finalize");
      if (n.kind === "idea" && n.node.provider !== "elevenlabs") {
        return refused(n.node.provider === "suno" ? "Suno is a manual round trip: render it in Suno and file the return in the lab" : "Local is not installed");
      }
      const seconds = n.kind === "idea" ? n.node.durationS : n.draft.durationS;
      return {
        kind: "needs",
        needs: "confirm",
        prompt: `Render ${seconds} s of ${kindOf(n)} with elevenlabs.`,
        cost: { seconds, note: "the ceiling is seconds of audio per rolling window, refused with HTTP 402 before the vendor is called; no dollar figure is measured" },
      };
    }

    const t = n.take;
    if (same) return { kind: "ok" };
    if (t.verdict !== "kept") return refused(AUDIO_UNJUDGED_REFUSAL);
    if (to === "proposed" || to === "working") return refused("a rendered take does not go back to being an idea");
    if (to === "done") {
      if (t.label?.trim()) return { kind: "ok" };
      return { kind: "needs", needs: "label", prompt: `Library label for "${t.title}", the name agents select it by. Suggested: ${suggestLabel(t, t.group)}` };
    }
    if (band === "triage") return refused("un-keeping a take is a verdict: do it in Triage");
    return { kind: "ok" };
  };

  /* ── moves ──────────────────────────────────────────────────────────────── */

  const failMove = (reason: string, retryable = false): MoveResult => ({ ok: false, reason, retryable });

  const settle = (n: Native): PipelineItem => {
    natives.set(n.item.id, n);
    return n.item;
  };

  const requestOf = (n: IdeaNative | DraftNative): GenerateRequest => {
    if (n.kind === "idea") {
      const { hunt, node } = n;
      return {
        kind: hunt.kind,
        provider: "elevenlabs",
        op: opOf(hunt.kind),
        prompt: node.prompt,
        negative: node.negative,
        durationS: node.durationS,
        loop: node.loop,
        promptInfluence: null,
        technique: node.technique,
        terms: node.terms,
        tempoBpm: node.tempoBpm,
        key: node.key,
        origin: "hunt",
        sourceTakeId: null,
        editModes: null,
        plan: null,
        huntId: hunt.id,
        nodeId: node.id,
        title: node.label,
      };
    }
    const d = n.draft;
    return {
      kind: d.kind,
      provider: "elevenlabs",
      op: opOf(d.kind),
      prompt: d.prompt,
      negative: d.negative,
      durationS: d.durationS,
      loop: d.kind === "sfx" ? d.loop : null,
      promptInfluence: null,
      technique: [],
      terms: { genre: [], mood: [], instrument: [], sfxCategory: null },
      tempoBpm: null,
      key: null,
      origin: "lab",
      sourceTakeId: null,
      editModes: null,
      plan: null,
      huntId: null,
      nodeId: null,
      title: null,
    };
  };

  const render = async (n: IdeaNative | DraftNative, lane: string | null): Promise<MoveResult> => {
    const id = n.item.id;
    if (flights.has(id)) return failMove("this card is already rendering");
    failures.delete(id);
    const flight = flightOf(n, new Date(now()).toISOString());
    flights.set(id, flight);
    natives.set(id, flight);
    let r: Result<{ take: SoundTake }>;
    try {
      r = await generateTake(requestOf(n));
    } finally {
      flights.delete(id);
    }
    if (!r.ok) {
      // The card goes back where it came from, wearing the vendor's sentence.
      failures.set(id, r.error);
      const back = n.kind === "idea" ? ideaItem(n.hunt, n.node) : draftItem(n.draft);
      natives.set(id, back);
      return failMove(r.error, r.status === 0);
    }
    natives.delete(id);
    drafts.delete(id.slice("audio:prompt:".length));
    laneOverride.delete(id);
    let take = r.data.take;
    if (lane !== null && lane !== UNGROUPED_LANE) {
      const g = await patchTake(take.id, { group: lane });
      if (g.ok) take = g.data.take;
    }
    return { ok: true, item: settle(takeItem(take, 1)) };
  };

  const move = async (req: MoveRequest): Promise<MoveResult> => {
    const n = natives.get(req.itemId);
    if (!n) return failMove("this card is not on the board any more");
    const offer = admits(n.item, req.to, req.band);
    if (offer.kind === "refused") return failMove(offer.reason);
    if (n.kind === "flight") return failMove(AUDIO_FLIGHT_REFUSAL);
    const axis = (req as MoveRequest & { axis?: string }).axis;
    if (req.lane !== undefined && axis !== undefined && axis !== "group") return failMove(`only the row axis is written; ${axis} is read off the take`);
    const sameCell = req.to === n.item.placement.stage && req.band === n.item.placement.band;

    if (n.kind === "idea" || n.kind === "draft") {
      if (sameCell) {
        if (req.lane === undefined || req.lane === n.item.lane) return { ok: true, item: n.item };
        laneOverride.set(n.item.id, req.lane);
        return { ok: true, item: settle(n.kind === "idea" ? ideaItem(n.hunt, n.node) : draftItem(n.draft)) };
      }
      if (offer.kind === "needs" && req.live !== true) return stubbedMove(n.item, "POST /api/sound/generate");
      return render(n, req.lane ?? (laneOverride.get(n.item.id) ?? null));
    }

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

  /* ── load ───────────────────────────────────────────────────────────────── */

  const loadPipeline = async (): Promise<PipelineEntry[]> => {
    // Three reads, any of which can fail, and none of which is allowed to turn
    // into an empty column: a failure throws (unavailable or error). An empty
    // pool is the successful read of nothing and returns [] - until a hunt is
    // drafted it is empty, and that is a state the surface can offer a draft for.
    const [takesR, huntsR, groupsR] = await Promise.all([listTakes(), listHunts(), getGroups()]);
    const takes = must(takesR, "/api/sound/takes").takes;
    const hunts = must(huntsR, "/api/sound/hunts").hunts;
    groups = must(groupsR, "/api/sound/groups").groups;

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
    let stillOut = 0;
    for (const hunt of hunts) {
      for (const node of hunt.nodes) {
        if (node.state === "idea" || node.state === "failed") {
          const n = ideaItem(hunt, node);
          if (!flights.has(n.item.id)) next.set(n.item.id, n);
        } else if (node.state === "rendering" || node.state === "awaiting-return") stillOut++;
      }
    }
    for (const d of drafts.values()) {
      const n = draftItem(d);
      if (!flights.has(n.item.id)) next.set(n.item.id, n);
    }
    for (const f of flights.values()) next.set(f.item.id, f);

    natives.clear();
    for (const [k, v] of next) natives.set(k, v);
    notes = {
      hidden: stillOut > 0 ? [{ stage: "proposed", count: stillOut, why: "hunt leaves rendering or awaiting a Suno return" }] : [],
      damaged: [],
    };
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

    async count(): Promise<BoardCount> {
      return countEntries(await loadEntries());
    },
    loadEntries,
    load: () => itemsOf(loadEntries()),
    async decide(_itemId: string, _verdict: BoardVerdict): Promise<void> {
      throw new VerdictRefused(AUDIO_DECIDE_REFUSAL);
    },

    lastLoad: () => notes,
    propose(input) {
      const prompt = input.prompt.trim();
      if (!prompt) throw new Error("a prompt needs words");
      const d: PromptDraft = {
        id: `${now().toString(36)}-${++seq}`,
        kind: input.kind,
        prompt,
        durationS: input.durationS,
        negative: input.negative?.trim() || null,
        loop: input.loop ?? null,
        createdAt: new Date(now()).toISOString(),
      };
      drafts.set(d.id, d);
      return settle(draftItem(d));
    },
    discard(id) {
      const key = id.startsWith("audio:prompt:") ? id.slice("audio:prompt:".length) : null;
      if (!key || !drafts.has(key) || flights.has(id)) return false;
      drafts.delete(key);
      natives.delete(id);
      laneOverride.delete(id);
      failures.delete(id);
      return true;
    },
  };
}
