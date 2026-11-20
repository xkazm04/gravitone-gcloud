import "server-only";

// The CanvasPort as the route receives it: the Server Actions, gathered on the server and handed to the client island
// as a prop (a reference per action crosses, never the module) - /scout's own shape (../../_port/wire.ts).
import type { CanvasPort } from "./contract.ts";

import { canvasAudioAction, canvasCommitAction, canvasGoalAction, canvasNoteAction, canvasPauseAction, canvasSplitAction, canvasUndoAction, canvasUnnoteAction, canvasVerdictsAction } from "./actions.ts";

export const CANVAS_PORT: CanvasPort = {
  verdicts: canvasVerdictsAction,
  undo: canvasUndoAction,
  commit: canvasCommitAction,
  note: canvasNoteAction,
  unnote: canvasUnnoteAction,
  goal: canvasGoalAction,
  pause: canvasPauseAction,
  split: canvasSplitAction,
  audio: canvasAudioAction,
};
