// THE FURNITURE, as one door.
//
// This file was all of it — the registry, both axes and the cells, 366 lines of
// four things that share only the word "overlay". They are four files now, and
// this stays as the door so every existing `from "./Frame"` keeps working and
// the split is invisible to callers:
//
//   ./headRegistry  where an overlay sits, and the parts every head is built of
//   ./StageHeads    the X axis along the top
//   ./LaneHeads     the Y axis down the left
//   ./CellLayer     the cells, which are world content and scale

export { createHeadRegistry, Roll, type HeadRegistry } from "./headRegistry";
export { StageHeads } from "./StageHeads";
export { LaneHeads } from "./LaneHeads";
export { CellLayer, type DragPreview } from "./CellLayer";
