import "server-only";

// THE SEAM: which side /scout/canvas reads its view from and writes through. The studio's one switch
// (GRAVITONE_PRODUCE_SIDE=fixture moves the whole studio into its fixture universe at once); the page and the actions
// reach a side only through `serverCanvas()`. The server side speaks the domain's Result; ./actions.ts turns it into
// the wire envelope.

import type { Result } from "@gt/domain/errors";

import type { AudioInput, AudioState, CanvasView, CommitDone, RoundGoal, ScoutNote, VerdictInput } from "./contract.ts";
import type { AnchorKind, Stance } from "../_canvas/tables.ts";
import { fixtureCanvas } from "./fixture.ts";
import { realCanvas } from "./real.ts";

export const SIDE: "fixture" | "real" = process.env["GRAVITONE_PRODUCE_SIDE"] === "fixture" ? "fixture" : "real";

export type NoteDraft = { readonly kind: AnchorKind; readonly key: string; readonly name: string; readonly text: string; readonly stance: Stance };

/** `by` is who acts: the principal's uid, or `operator` for the shared secret. */
export type ServerCanvas = {
  readonly view: () => Promise<Result<CanvasView>>;
  readonly verdicts: (changes: readonly VerdictInput[], by: string | undefined) => Promise<Result<{ readonly packets: readonly string[] }>>;
  readonly undo: (packet: string, by: string | undefined) => Promise<Result<{ readonly packet: string }>>;
  readonly commit: (packets: readonly string[], by: string | undefined) => Promise<Result<CommitDone>>;
  readonly note: (draft: NoteDraft, by: string) => Promise<Result<{ readonly notes: readonly ScoutNote[] }>>;
  readonly unnote: (id: string) => Promise<Result<{ readonly notes: readonly ScoutNote[] }>>;
  readonly goal: (goal: RoundGoal) => Promise<Result<{ readonly goal: RoundGoal }>>;
  readonly pause: (group: string, paused: boolean, by: string) => Promise<Result<{ readonly paused: readonly string[] }>>;
  readonly split: (audience: Readonly<Record<string, number>>, by: string) => Promise<Result<{ readonly split: Readonly<Record<string, number>> }>>;
  readonly audio: (input: AudioInput) => Promise<Result<AudioState>>;
};

export function serverCanvas(): ServerCanvas {
  return SIDE === "fixture" ? fixtureCanvas : realCanvas;
}
