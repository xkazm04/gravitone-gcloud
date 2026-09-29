// THE KIT. One import site for the Almanac world's working parts; see README.md.
//
// A local duplicate of anything exported here is a finding.

import "./kit.css";

export { WorldRoot } from "./WorldRoot";
export { Sky } from "./Sky";
export { Bar } from "./Bar";
export { Crumbs } from "./Crumbs";
export type { Crumb } from "./Crumbs";
export { PageHead, Tag } from "./PageHead";
export { Kicker } from "./Kicker";

export { StatusGlyph } from "./StatusGlyph";
export type { StatusKind } from "./StatusGlyph";
export { StatusPill } from "./StatusPill";
export { StatusStrip, Meridian } from "./StatusStrip";
export { Magnitude, gradeOf } from "./Magnitude";
export type { Grade } from "./Magnitude";
export { ScoreChip, FlagChip, pct } from "./ScoreChip";
export { Credit } from "./Credit";
export { Chip, Chips } from "./Chip";
export { Plate } from "./Plate";

export { Tile } from "./Tile";
export type { TileState } from "./Tile";
export { VerdictKeys } from "./VerdictKeys";
export type { VerdictValue } from "./VerdictKeys";
export { Scene, Matrix, RowHead } from "./Matrix";
export type { MatrixColumn, MatrixRow } from "./Matrix";
export { SideList, SideItem } from "./SideList";
export { Entry, VerdictMark, Column } from "./Entry";
export { Card, CardGrid } from "./Card";
export { Thumb } from "./Thumb";
export { Figures } from "./Figures";
export type { FigureItem } from "./Figures";
export { Report, OpenLink } from "./Report";
export { Duo } from "./Duo";
export type { DuoArm } from "./Duo";

export { Dock, Count, SaveState, KeyRow, LockNote, Final, DockAction } from "./Dock";
export type { SaveKind } from "./Dock";
export { ConfirmDialog } from "./ConfirmDialog";
export { Sheet } from "./Sheet";
export { Doc, DocLede, DocSection, Rule, DefList, Stats, DataTable, Verbatim, Prose } from "./Doc";

export { ErrorBox, Loading, Command } from "./Notice";
export { Dropzone } from "./Dropzone";
export { TextField, NumberField, CheckField, FieldRow, PanelBox } from "./Fields";

// The shared parts the kit extends rather than forks. They read the world from
// context (components/ui/world.tsx), so a surface under <WorldRoot> gets the
// Almanac skin from the same imports it always used.
export { Button } from "@/components/ui/Primitives";
export { Ghost, Hint, TabRail, Tally, StackBar } from "@/components/ui/signal";
export type { TabDef, StackSegment, KeyBinding } from "@/components/ui/signal";
