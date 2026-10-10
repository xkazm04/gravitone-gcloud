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
import type { Verdict, WaveSample } from "./types";

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

export interface Live {
  layout: Layout;
  source: PipelineSource;
  selected: ReadonlySet<string>;
  active: string | null;
  notice: Notice | null;
  apply(item: PipelineItem): void;
  names: Partial<Record<string, string>>;
  calm: boolean;
  onOpen?: (entry: PipelineEntry) => void;
  onWave?: (w: WaveSample) => void;
}
