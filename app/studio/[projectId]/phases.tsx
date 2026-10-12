"use client";

// The six studio steps and the surface each one renders. Split out of the view
// so the stepper is a list of titles and the view is layout — and so the ORDER
// is stated once, in lib/projects' PHASES, which /projects reads too.
//
// Each surface is its own prototype-round winner: Triage board, Manuscript,
// Frames (in prototype), Spotting, Timeline — plus Motion, back as a step of its
// own since 2026-10-05 (lib/projects.ts says why): Frames authors the still,
// Motion reads it and directs what moves.

import dynamic from "next/dynamic";

import { pendingPanel } from "@/components/ui/Pending";
import { PHASES, PHASE_TITLE, type PhaseKey } from "@/lib/projects";

// ONE STEP ON SCREEN, ONE STEP IN THE BUNDLE.
//
// The studio shows exactly one step at a time, and the six used to be static
// imports here, so opening any project shipped all six surfaces — research's
// triage board, the script manuscript, frames, motion, score and cut — in one
// 564 KB route chunk before the first one could paint (measured 2026-10-08,
// `next build`, 1637 KB raw first-load JS for /studio/[projectId] against ~1000
// for every other gated route). Each is now its own chunk, fetched when its step
// is chosen. `import()` is memoised by the bundler, so `preload` is how the
// stepper starts the fetch on hover/focus, before the click, and a step visited
// once is never fetched again.
const LOAD = {
  research: () => import("../../_phases/research/ResearchStep"),
  script: () => import("../../_phases/script/ScriptStep"),
  frames: () => import("../../_phases/frames/FramesStep"),
  motion: () => import("../../_phases/motion/MotionStep"),
  score: () => import("../../_phases/score/ScoreSpotting"),
  cut: () => import("../../_phases/cut/CutTimeline"),
} satisfies Record<PhaseKey, () => Promise<unknown>>;


const ResearchStep = dynamic(LOAD.research, { loading: pendingPanel });
const ScriptStep = dynamic(LOAD.script, { loading: pendingPanel });
const FramesStep = dynamic(LOAD.frames, { loading: pendingPanel });
const MotionStep = dynamic(LOAD.motion, { loading: pendingPanel });
const ScoreSpotting = dynamic(LOAD.score, { loading: pendingPanel });
const CutTimeline = dynamic(LOAD.cut, { loading: pendingPanel });

const SURFACE: Record<PhaseKey, (projectId: string) => React.ReactNode> = {
  research: (projectId) => <ResearchStep projectId={projectId} />,
  script: (projectId) => <ScriptStep projectId={projectId} />,
  frames: (projectId) => <FramesStep projectId={projectId} />,
  // Motion reads the frames Step 3 saved for THIS project — the plates it
  // directs are that record's, never a fixture's.
  motion: (projectId) => <MotionStep projectId={projectId} />,
  // Score takes the project too, since 2026-09-08: it spots against the frames
  // Step 3 saved for THIS project rather than the Glass Harbor fixture, and a
  // step with no project has no picture to read.
  score: (projectId) => <ScoreSpotting projectId={projectId} />,
  cut: (projectId) => <CutTimeline projectId={projectId} />,
};

// NO ORDINAL ON THE STEP. `n: i + 1` was here for the rail's circled numerals,
// and the operator removed those on 2026-09-09 (Stepper.tsx says why). The
// order is the array's own, which is PHASES' order in lib/projects — a derived
// copy of it on every entry is a second spelling of the same fact, and the one
// that would still read `3` after a reorder if anybody stored it.
export const STEPS = PHASES.map((key) => ({
  key,
  title: PHASE_TITLE[key],
  render: SURFACE[key],
  /** Start fetching this step's chunk; safe to call any number of times. */
  preload: () => void LOAD[key]().catch(() => {}),
}));
