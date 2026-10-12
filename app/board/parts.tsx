"use client";

// The pieces the sheet and the loupe draw the same way: an item's art, its
// verdict control, its reject reasons, the sealed machine pick, a source's
// state, the per-run commit line, the read-only rejected stamp, the toasts. A
// surface that needs a different SHAPE of one of these is a finding against
// this file, not a licence for a second spelling.
//
// Drawn in the app's own idiom (app/_projects/parts.tsx, app/library/parts.tsx):
// glass, `rounded-xl` nested in `rounded-2xl`, white/8 hairlines, cyan for
// where you are, emerald / rose / amber for kept / cut / waiting. Round 1 drew
// these through the kit's Almanac parts remapped to Obsidian colours — square
// corners, dashed edges, flat fields — and on this ground they read as
// wireframes (.vault/Spark/briefs/platform-consolidation/10-r2-ui-pass.md).

// Re-exports only: each piece lives in its own file under app/board/ (partsMedia,
// partsTextPlate, partsVerdict, partsVerdictSide, partsCommit, partsSource,
// partsEmpty, partsRejected, partsChrome). Importers keep this path.
export { Media, Picture, Art, Confidence } from "./partsMedia";
export { TextPlate } from "./partsTextPlate";
export { VerdictDot, VerdictBar } from "./partsVerdict";
export { ReasonChips, MachinePick, FactGrid, NativeLink } from "./partsVerdictSide";
export { CommitLine } from "./partsCommit";
export { toneOf, TONE_DOT, pendingWord, SourceAbsence } from "./partsSource";
export type { SourceTone } from "./partsSource";
export { EmptyShape } from "./partsEmpty";
export { RejectedStamp } from "./partsRejected";
export { BOARD_KEYS, BoardKeymap, BoardToasts } from "./partsChrome";
