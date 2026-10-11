// WHAT THE ENGINE HOLDS WHILE IT IS WORKING — the shapes that exist only between
// a pointer going down and an authority answering, and never leave this folder.
//
// They are not in ./types.ts, which is the canvas's PUBLIC contract: what a shell
// passes in, what a skin may draw, what `onStatus` reports. Everything here is
// the opposite — a drag in progress, a card in flight, a prompt waiting on an
// answer, the mutable view of the world the delegated handlers read. Mixing the
// two made the contract look four times its real size to anyone reading it to
// find out what they had to implement.

import type { MoveNeed, PipelineEntry, PipelineItem, PipelineSource } from "@/lib/board/pipeline";

import type { Layout } from "./geometry";
import type { GhostKind, GhostPhase } from "./Ghost";
import type { Verdicts } from "./moves";
import type { CanvasStatus, PipelineHandle, PipelineSkin, Verdict, WaveSample } from "./types";

export interface DragState {
  ids: string[];
  lead: string;
  verdicts: Verdicts;
  over: { lane: number; col: number } | null;
  verdict: Verdict | null;
  /** The pointer has not yet resolved to anything. */
  fresh: boolean;
}

export interface Flight {
  ids: string[];
  lead: string;
  phase: GhostPhase;
  kind: GhostKind;
}

export interface PromptState {
  ids: string[];
  laneKey: string;
  col: number;
  need: MoveNeed;
  prompt: string;
  cost?: Extract<Verdict, { kind: "needs" }>["cost"];
  title: string;
  verb: string;
  flight: boolean;
}

export interface Notice {
  ids: string[];
  text: string;
  retry?: () => void;
}

/** `stubbed` counts the moves the authority answered but did not act on, so a
 *  caller can tell "it moved" from "it would have". */
export type Outcome = { ok: true; stubbed: number } | { ok: false; reason: string; retryable: boolean; failed: string[] };

/** WHAT A DELEGATED HANDLER READS INSTEAD OF ITS OWN CLOSURE. Five fields, and
 *  the list is short on purpose: it held `selected`, `active`, `notice`, `names`
 *  and `calm` as well, and nothing ever read one of them — a handler that needs
 *  the selection has it from the render it was created in. Every field here is a
 *  field some handler reads AFTER the render that built it. */
export interface Live {
  layout: Layout;
  source: PipelineSource;
  apply(item: PipelineItem): void;
  onOpen?: (entry: PipelineEntry) => void;
  onWave?: (w: WaveSample) => void;
}

/* ── what a shell hands in ─────────────────────────────────────────────── */

// The props are here rather than in PipelineCanvas.tsx because two of them carry
// most of the contract's prose — `arm` is a paragraph about money and `choreoCap`
// is a paragraph about a measurement — and a reader opening the component to see
// what it DOES had to scroll past both of them first. ./index.ts is the door
// that explains them in use; this is their shape.

export interface PipelineCanvasProps {
  source: PipelineSource;
  /** Which of `source.groupAxes` draws the Y axis. Default: the first. */
  axisId?: string;
  /**
   * WHETHER A MOVE IS ALLOWED TO SPEND MONEY. Default `"stub"`, and the default
   * is the whole point: a dispatch costs the operator's own Claude seat at
   * $47-92 and 26-32 turns, so the arm fails to the side that spends nothing.
   *
   * A confirm dialog answers `{ live: true }` meaning "the operator pressed
   * yes"; that is INTENT, and it is not authority. This prop is the authority,
   * and it is clamped over every request in `submitMoves` (./useBoardMoves.ts) -
   * the one chokepoint every path reaches (a drag, the context menu, the move
   * map, the keyboard). Before it existed a dragged confirm set `live: true`
   * unconditionally and no prop could disarm it, so a shell showing STUB could
   * still have spent the seat. Found by WP4a, which could only work around it
   * from outside.
   */
  arm?: "stub" | "live";
  skin?: PipelineSkin;
  /** Re-load every this many ms. 0 = only on mount and on `apiRef.reload()`. */
  pollMs?: number;
  /** The Open verb: Enter, double-click, the menu. */
  onOpen?: (entry: PipelineEntry) => void;
  /** Counts, selection and whether the board is choreographing. */
  onStatus?: (s: CanvasStatus) => void;
  /** One call per mounting wave — the per-frame slice sizes. */
  onWave?: (w: WaveSample) => void;
  /** Visible cards above which the entrance stagger and layout glide switch
   *  off. Defaults to CHOREO_MAX_CARDS; the knob exists so the cap can be moved
   *  by a measurement (and so a measurement can move it). */
  choreoCap?: number;
  apiRef?: React.Ref<PipelineHandle>;
  className?: string;
}
