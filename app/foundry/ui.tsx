"use client";

// THE FOUNDRY'S OWN LEAVES — the parts every /foundry surface draws with.
//
// These replace the kit (components/kit) on this route, and the reason is one
// the operator gave in a sentence: the page looked "like looking at wireframes"
// (2026-10-05). The kit is the Almanac print idiom — square corners, dashed
// edges for anything empty, flat 7%-white fields, caps labels everywhere —
// remapped onto Obsidian colours, and on this ground it reads as a blueprint of
// a page rather than the page. /projects and /library never used it, and they
// are the bar: glass panels off `SURFACE`, `rounded-2xl` outer and `rounded-xl`
// inner, white/8 hairlines that lift to white/15 on hover, cyan for what is
// selected, and the four state tones (emerald done, amber needs a call, rose
// broken, cyan working) spelled the way app/_projects/parts.tsx STATE_TONE and
// components/ui/signal TALLY_TONE already spell them.
//
// Foundry-local on purpose. Each of these has exactly one reader family (this
// route's four tabs); promoting one to components/ui is a decision for when a
// second route wants it, not a guess made now.
//
// No colour literal: every colour is a Tailwind palette utility or a --gt-* var.

// The door. Every symbol this file exported before the split is re-exported
// here by name, so `import { … } from "@/app/foundry/ui"` (and "./ui" inside
// app/foundry) resolves exactly as it did. The implementations live in the
// ui*.ts(x) files beside it.

export { gradeOf, pct, STATE_TONE, TONE_TEXT } from "./uiNumbers";
export type { Grade, Tone } from "./uiNumbers";
export { Dot, FlagPill, Label, ScoreMeters, ScorePill, StatusChip } from "./uiLabels";
export { VerdictButtons, VerdictStamp, verdictRing } from "./uiVerdicts";
export type { VerdictValue } from "./uiVerdicts";
export { Art } from "./uiArt";
export type { ArtState } from "./uiArt";
export { ErrorNote, Loading, ProgressRail, SaveNote } from "./uiProgress";
export type { SaveKind } from "./uiProgress";
export { Glass, Rise } from "./uiSurfaces";
export { BarCount, DecisionBar, LockNote, PrimaryAction } from "./uiDecisionBar";
export { CommitDialog, PlanFact, useCommitPlan } from "./uiCommitDialog";
export { CommandCard, FORGE_COMMAND } from "./uiCommandCard";
