// THE KIT. One import site for the Almanac world's working parts; see README.md.
//
// A local duplicate of anything exported here is a finding.
//
// 2026-10-15 (Phase 1 wave 3): the parts only v1's /kit specimen sheet rendered were deleted
// with it - 31 files, every export a zero-adopter in the census app/kit/census.json kept,
// re-measured over app/ components/ lib/ pipeline/ tests/ before deletion. What remains is
// what a v1 route still imports. The new design system is packages/ui (@gt/ui), at /kit.

import "./kit.css";
import "./kit-grow-g3.css";
import "./workbench.css";
import "./forms.css";

export { WorldRoot } from "./WorldRoot";
export { Sky } from "./Sky";
export { Bar } from "./Bar";
export { Crumbs } from "./Crumbs";
export type { Crumb } from "./Crumbs";

export { StatusGlyph } from "./StatusGlyph";
export type { StatusKind } from "./StatusGlyph";

export { ConfirmDialog } from "./ConfirmDialog";
export { Dropzone } from "./Dropzone";
// Extended, not forked: components/ui/Field.tsx reads the world and draws the kit skin (forms.css).
export { Field, TextInput, TextArea, NumberInput, Select, Segmented } from "@/components/ui/Field";
export { useToast, ToastTray } from "./Toast";
export type { ToastItem, ToastKind, PushToast } from "./Toast";

// Rows that are worked, and the shell's own controls (workbench.css).
export { Pager, useWindow } from "./Pager";
export type { Windowed } from "./Pager";
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

export { Transport, Waveform, Player, clock } from "./Player";
export type { WaveMark } from "./Player";

// The shared parts the kit extends rather than forks. They read the world from
// context (components/ui/world.tsx), so a surface under <WorldRoot> gets the
// Almanac skin from the same imports it always used.
export { Button } from "@/components/ui/Primitives";
export { Ghost, Hint, TabRail, Tally, StackBar } from "@/components/ui/signal";
export type { TabDef, StackSegment, KeyBinding } from "@/components/ui/signal";
