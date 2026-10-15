// A resource named with its kind's mark (projects.css `.lane-chip`): a square for the boxes on
// the operator's own hardware, a rounded square for the text seat, a circle for a paid cloud
// vendor, a diamond for the Weir. The mark's colour is the kind, never the lane: the
// prototype keyed it per lane class (`.l-gpu-local` ...), so a lane nobody listed drew grey.
// Here the row's kind comes from LANE_SPECS, which is total over @gt/domain's lanes.
import type { ResourceLane } from "@gt/domain/lane";

import { cx } from "../cx.ts";
import { CALENDAR_ROW, LANE_SPECS, WEIR_ROW, type RowKind } from "./lanes.ts";
import s from "./LaneChip.module.css";

export type LaneChipId = ResourceLane | "weir" | "calendar";

export function laneKind(id: LaneChipId): RowKind {
  return id === "weir" || id === "calendar" ? id : LANE_SPECS[id].kind;
}

export function laneLabel(id: LaneChipId): string {
  return id === "weir" ? WEIR_ROW.label : id === "calendar" ? CALENDAR_ROW.label : LANE_SPECS[id].label;
}

export function LaneChip({ lane }: { readonly lane: LaneChipId }) {
  return <span className={cx(s.chip, s[laneKind(lane)])}>{laneLabel(lane)}</span>;
}
