"use client";

// The five studio steps and the surface each one renders. Split out of the view
// so the stepper is a list of titles and the view is layout — and so the ORDER
// is stated once, in lib/projects' PHASES, which /projects reads too.
//
// Each surface is its own prototype-round winner: Triage board, Manuscript,
// Frames (in prototype), Spotting, Timeline. Frames covers what the retired
// Motion step used to — the still and the clip made from it are one decision.

import { PHASES, PHASE_TITLE, type PhaseKey } from "@/lib/projects";

import ResearchStep from "../../_phases/research/ResearchStep";
import ScriptStep from "../../_phases/script/ScriptStep";
import FramesStep from "../../_phases/frames/FramesStep";
import ScoreSpotting from "../../_phases/score/ScoreSpotting";
import CutTimeline from "../../_phases/cut/CutTimeline";

// Each surface takes the project it belongs to. A step with no project is a
// step with nowhere to save, and the research step in particular loads its
// notebook, scope and follow-ups from that project's own record.
const SURFACE: Record<PhaseKey, (projectId: string) => React.ReactNode> = {
  research: (projectId) => <ResearchStep projectId={projectId} />,
  script: (projectId) => <ScriptStep projectId={projectId} />,
  frames: (projectId) => <FramesStep projectId={projectId} />,
  score: () => <ScoreSpotting />,
  cut: (projectId) => <CutTimeline projectId={projectId} />,
};

export const STEPS = PHASES.map((key, i) => ({
  key,
  n: i + 1,
  title: PHASE_TITLE[key],
  render: SURFACE[key],
}));
