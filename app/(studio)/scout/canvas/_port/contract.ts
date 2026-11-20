// THE SCOUT CANVAS'S PORT AS THE SCREEN HOLDS IT - client-safe (types only). The server builds ONE CanvasView (the
// decision graph, the publishing channels with their episodes, the pictures, the operator's notes, the reels' audio
// and their slots) and every write answers in the action core's envelope (app/_server/actionCore.ts) with what the
// screen needs to redraw. docs/scout-canvas-port.md is the plan; the tables the screen draws by are ../_canvas/tables.ts.

import type { ScoutGraph } from "@gt/domain/scoutGraph";
import type { Channel, Episode } from "@gt/domain/channel";

import type { ActionResult } from "../../../../_server/actionCore.ts";
import type { AnchorKind, Decision, Stance, Verdict } from "../_canvas/tables.ts";

/** A publishing channel and its episodes, as the channel store holds them. */
export type CanvasChannel = { readonly channel: Channel & { readonly look?: string }; readonly episodes: readonly Episode[] };

/** A picture or a film of a node, as a browser URL (the scout file door). */
export type CanvasFile = {
  readonly type: "image" | "video";
  readonly src: string;
  /** Its file name (panel-1.png, strip.mp4). */
  readonly from: string;
  /** A film's audio stream, when known: every reel the GPU renders is silent. */
  readonly audio?: boolean;
};

/** What the screen can show of a node. `cells`: the Board's items for it while its packet is open. */
export type CanvasMedia = {
  readonly files: readonly CanvasFile[];
  readonly cells?: readonly string[];
};

/** A note for the next scouting, pinned where the operator pinned it. */
export type ScoutNote = {
  readonly id: string;
  readonly kind: AnchorKind;
  /** The anchor's key: a basin, `<basin>/<province>`, a channel id, a river key, `<river>@<stage>`, a node id. */
  readonly key: string;
  /** The anchor's name as it read when pinned. */
  readonly name: string;
  readonly text: string;
  readonly stance: Stance;
  /** ISO time. */
  readonly at: string;
};

/** The next round's goal: words and per-channel targets (episodes to make). */
export type RoundGoal = { readonly text: string; readonly targets: readonly { readonly channel: string; readonly n: number }[] };

/** A reel's road to the calendar (tables.ts CHAIN): steps done, its brief, its decision. */
export type ReelAudio = {
  readonly step: number;
  readonly brief?: { readonly vo: readonly string[]; readonly hits: readonly string[]; readonly dur: number };
  readonly decision?: Decision;
  readonly channel?: string;
};

/** A release slot a reel holds (the calendar's slot, keyed back to the node). `day` counts from `CanvasView.today`. */
export type CanvasSlot = {
  readonly id: string;
  readonly node: string;
  readonly channel: string;
  readonly day: number;
  readonly time: string;
  readonly state: "scheduled" | "publishing" | "published" | "missed" | "failed" | "cancelled";
  readonly title: string;
};

/** Which writes the side behind the screen can do; a false one draws its control with the side's sentence. */
export type CanvasCaps = {
  readonly verdicts: boolean;
  readonly notes: boolean;
  readonly steer: boolean;
  /** The reel → production → calendar chain (docs/scout-canvas-port.md Phase 4). */
  readonly audio: boolean;
  readonly dispatch: boolean;
};

export type CanvasView = {
  readonly graph: ScoutGraph;
  readonly channels: readonly CanvasChannel[];
  /** By graph node id. */
  readonly media: Readonly<Record<string, CanvasMedia>>;
  readonly notes: readonly ScoutNote[];
  readonly goal: RoundGoal;
  /** By graph node id (reels and reel cuts only). */
  readonly audio: Readonly<Record<string, ReelAudio>>;
  readonly slots: readonly CanvasSlot[];
  /** The calendar's day zero (YYYY-MM-DD, the server's today). */
  readonly today: string;
  /** The advisory split the steer holds (percent per audience), absent when none is set. */
  readonly split?: Readonly<Record<string, number>>;
  readonly caps: CanvasCaps;
  /** Why a capability is off, in the side's own words, by capability. */
  readonly refusals: Readonly<Partial<Record<keyof CanvasCaps, string>>>;
};

/** One verdict on one node; the server finds its packet and its cells. */
export type VerdictInput = { readonly node: string; readonly verdict: Verdict | null; readonly reasons: readonly string[]; readonly note?: string };

/** What a commit did, per packet. */
export type CommitDone = { readonly packets: readonly { readonly packet: string; readonly kept: number; readonly rejected: number }[] };

export type CanvasPort = {
  /** Verdicts, grouped by packet on the server (the Board's patch, one packet per call). */
  readonly verdicts: (input: { readonly changes: readonly VerdictInput[] }) => Promise<ActionResult<{ readonly packets: readonly string[] }>>;
  /** The Board's undo on one packet: the last change goes. */
  readonly undo: (input: { readonly packet: string }) => Promise<ActionResult<{ readonly packet: string }>>;
  /** Preview then commit each packet, undecided cells left for a remainder packet. */
  readonly commit: (input: { readonly packets: readonly string[] }) => Promise<ActionResult<CommitDone>>;
  readonly note: (input: { readonly kind: AnchorKind; readonly key: string; readonly name: string; readonly text: string; readonly stance: Stance }) => Promise<ActionResult<{ readonly notes: readonly ScoutNote[] }>>;
  readonly unnote: (input: { readonly id: string }) => Promise<ActionResult<{ readonly notes: readonly ScoutNote[] }>>;
  readonly goal: (input: RoundGoal) => Promise<ActionResult<{ readonly goal: RoundGoal }>>;
  readonly pause: (input: { readonly ref: string; readonly paused: boolean }) => Promise<ActionResult<{ readonly paused: readonly string[] }>>;
  readonly split: (input: { readonly audience: Readonly<Record<string, number>> }) => Promise<ActionResult<{ readonly split: Readonly<Record<string, number>> }>>;
  /**
   * One step of the reels' road (tables.ts CHAIN) on each named reel: `brief` drafts, `decide` records the choice,
   * `run` generates and lays the cut (and slots it when `toCalendar`), `schedule` slots a laid cut, `move` / `cancel` /
   * `publish` act on a slot. Answers with the reels' audio and the slots as they now stand.
   */
  readonly audio: (input: AudioInput) => Promise<ActionResult<AudioState>>;
};

export type AudioInput =
  | { readonly verb: "brief"; readonly nodes: readonly string[] }
  | { readonly verb: "decide"; readonly node: string; readonly decision: Decision }
  | { readonly verb: "run"; readonly nodes: readonly string[]; readonly toCalendar: boolean; readonly cadence: number }
  | { readonly verb: "schedule"; readonly nodes: readonly string[]; readonly cadence: number }
  | { readonly verb: "move"; readonly slot: string; readonly by: number }
  | { readonly verb: "cancel"; readonly slot: string }
  | { readonly verb: "publish"; readonly slot: string };

export type AudioState = { readonly audio: Readonly<Record<string, ReelAudio>>; readonly slots: readonly CanvasSlot[] };
