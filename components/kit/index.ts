// THE KIT. One import site for the Almanac world's working parts; see README.md.
//
// A local duplicate of anything exported here is a finding.

import "./kit.css";
import "./kit-grow-g3.css";
import "./workbench.css";
import "./forms.css";

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
// Extended, not forked: components/ui/Field.tsx reads the world and draws the kit skin (forms.css).
export { Field, TextInput, TextArea, NumberInput, Select, Segmented } from "@/components/ui/Field";
export { Callout } from "./Callout";
export { useToast, ToastTray } from "./Toast";
export type { ToastItem, ToastKind, PushToast } from "./Toast";

// Rows that are worked, and the shell's own controls (workbench.css).
export { Table } from "./Table";
export type { TableColumn, TableSort, SortDir } from "./Table";
export { Pager, useWindow } from "./Pager";
export type { Windowed } from "./Pager";
export { Steps, STUDIO_STEPS } from "./Steps";
export type { StepDef, StepState } from "./Steps";
export { useRoving } from "./useRoving";
export type { Roving, RovingItemProps, RovingOptions } from "./useRoving";
// The account controls read the world and wear the Almanac skin in <Bar right>.
export { default as NotificationBell } from "@/components/ui/NotificationBell";
export { default as UserMenu } from "@/components/ui/UserMenu";

// The deck in the world: the shared deck (components/ui/deck) reads useWorld and draws
// the Almanac skin, the way Modal does. Extended, not forked.
export { default as Deck } from "@/components/ui/deck/Deck";
export { default as DeckStage } from "@/components/ui/deck/DeckStage";
export { default as DeckCard } from "@/components/ui/deck/DeckCard";
export { default as StageRail } from "@/components/ui/deck/StageRail";
export type { DeckStageDef } from "@/components/ui/deck/Deck";
export type { DeckCardSpec, DeckArt } from "@/components/ui/deck/DeckCard";
export type { RailStage } from "@/components/ui/deck/StageRail";

export { ContextMenu } from "./ContextMenu";
export type { MenuItem } from "./ContextMenu";
export { FolderTree } from "./FolderTree";
export type { FolderNode } from "./FolderTree";
export { LayerList } from "./LayerList";
export type { Layer } from "./LayerList";
export { Transport, Waveform, Player, clock } from "./Player";
export type { WaveMark } from "./Player";
export { Timeline } from "./Timeline";
export type { TimelineClip, TimelineTrack, TimelineCue, ClipState } from "./Timeline";

// The shared parts the kit extends rather than forks. They read the world from
// context (components/ui/world.tsx), so a surface under <WorldRoot> gets the
// Almanac skin from the same imports it always used.
export { Button } from "@/components/ui/Primitives";
export { Ghost, Hint, TabRail, Tally, StackBar } from "@/components/ui/signal";
export type { TabDef, StackSegment, KeyBinding } from "@/components/ui/signal";
