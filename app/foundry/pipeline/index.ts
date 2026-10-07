// THE PIPELINE CANVAS — what the tab shell mounts.
//
//   import { PipelineCanvas } from "./pipeline";
//
//   <div className="h-[calc(100vh-…)]">                 // the canvas fills its parent
//     <PipelineCanvas
//       source={source}              // a PipelineSource (lib/board/pipeline.ts), STABLE identity
//       axisId={axisId}              // one of source.groupAxes[].id; default: the first
//       skin={skin}                  // optional: { face(entry), stageLabel }
//       pollMs={0}                   // re-load interval; 0 = mount + apiRef.reload()
//       onOpen={(entry) => …}        // the Open verb (Enter, double-click, menu)
//       onStatus={(s) => …}          // CanvasStatus: counts, selection, choreography
//       onWave={(w) => …}            // mounting waves (diagnostic)
//       apiRef={ref}                 // PipelineHandle: reload, fit, zoomBy, reveal, camera
//     />
//   </div>
//
// WHAT THE SHELL DRAWS, FROM STATE (the canvas draws no sentence about itself):
//   · `status.choreo` — `{ on, reason: "cap" | "reduced-motion" | null, visible, cap }`.
//     Above CHOREO_MAX_CARDS visible cards the entrance stagger and the layout
//     glide are OFF; draw `<Tally value={visible} of={cap} tone="amber" />` when
//     `reason === "cap"`.
//   · `status.counts`, `status.total`, `status.selected`, `status.loading/error`.
//   · The axis chooser: the canvas takes `axisId`; the shell owns the control.
//
// THE CONTRACT WITH A SOURCE: `loadPipeline()` and `move()` are the canvas's only
// doors, `admits()` is called once per candidate column when a drag starts (and
// once when the move map opens), never per pointer move. Keep `version` honest:
// a card re-renders only when its id or version changes.
//
// SKINS: `face(entry)` draws inside the card shell (CARD_W x CARD_H, reserve the
// right 40px for the actions button) and must be a stable reference.

export { PipelineCanvas } from "./PipelineCanvas";
export type { PipelineCanvasProps } from "./PipelineCanvas";

export { usePipelineData, reconcile } from "./usePipelineData";
export type { PipelineData } from "./usePipelineData";

export type { CanvasStatus, ChoreoReason, ChoreoState, PipelineHandle, PipelineSkin, Verdict, WaveSample } from "./types";

export { CARD_H, CARD_W, PITCH, buildLayout, cullRect, countRect, resolveCell, walk, stepCell } from "./geometry";
export type { Camera, Column, Dir, Lane, Layout, Rect, Slot } from "./geometry";

export { pipelineKeyAction } from "./keymap";
export type { PipelineAction } from "./keymap";

export { buildVerdicts, costLine, requestFor } from "./moves";
export type { Verdicts } from "./moves";

export { STAGE_TONE } from "./tone";
