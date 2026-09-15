// THE SIGNAL VOCABULARY — the barrel.
//
// Eleven components that draw what ~170 places in this app currently write a
// sentence about. THE LAW they exist to serve is stated in ./README.md and it is
// one line long: delete every sentence whose subject is the app; keep every
// sentence whose subject is the work.
//
// Import from here, not from the files: one import site is what stops a second
// spelling appearing. These are siblings of components/ui/Primitives.tsx and
// components/ui/Field.tsx and are held to the same bar — keyboard reachable,
// screen-reader correct, no colour literal, nothing below `text-label`.

export { Hint, HintPopover, useHint, hintRootClass } from "./Hint";
export type { HintVariant, HintTone, HintDisclosure } from "./Hint";

export { Tally, CHIP_CLASS, TALLY_TONE } from "./Tally";
export type { TallyTone } from "./Tally";

export { PipRow } from "./PipRow";
export type { PipState } from "./PipRow";

export { StackBar } from "./StackBar";
export type { StackSegment, StackTone } from "./StackBar";

export { BandTrack } from "./BandTrack";
export type { BandTrackProps } from "./BandTrack";

export { Ghost } from "./Ghost";
export type { GhostShape } from "./Ghost";

export { UpstreamBreak } from "./UpstreamBreak";
export type { UpstreamBreakAction } from "./UpstreamBreak";

export { Keycaps } from "./Keycaps";
export type { KeyBinding } from "./Keycaps";

export { StaleBadge } from "./StaleBadge";

export { Provenance } from "./Provenance";
export type { ProvenanceFields } from "./Provenance";

export { TabRail } from "./TabRail";
export type { TabDef } from "./TabRail";
