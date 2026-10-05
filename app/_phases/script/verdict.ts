// SCRIPT'S VERDICT — pure, over the records the step's three halves write and
// the Research records they open on. The rules are the mounted reporters'
// (ScriptStep.tsx's explainer and music-video halves, trailer/TrailerScript.tsx),
// lifted, with the routing ScriptStep applies (trailer, or free in beats mode,
// is the trailer half). See ../_shared/stepContract.ts.
//
// Two places this deliberately disagrees with the mounted word, both named in
// the probe's parity table:
//   · the music-video half asserts `done` the moment it mounts; here it is
//     `review` — nothing to write, and the lock is a sign-off;
//   · a trailer project with a confirmed spine and no saved cut reads `working`
//     only because opening the step composes the cut. Here nothing is authored
//     until a cut is on disk.

import type { BeatPicksStepData, ResearchStepData, ScriptAdoptionStepData, TrailerCutStepData } from "../_shared/stepStore";
import type { ResolvedInput, StepModule, StepVerdict } from "../_shared/stepContract";
import { spineKey } from "../research/verdict";

import { RENDER_BY_ID } from "./renders";
import type { ScriptVersionsData } from "./records";

const nothing = (basis: string, reasons: StepVerdict["reasons"] = []): StepVerdict => ({ state: null, reasons, basis });

function trailerVerdict(cut: TrailerCutStepData | undefined, beats: BeatPicksStepData | undefined): StepVerdict {
  const board = beats?.confirmed && Object.keys(beats.confirmed).length > 0 ? beats.confirmed : null;
  if (!cut?.cut)
    return nothing(
      "script:trailer:none",
      board ? [{ code: "spine-confirmed", text: "spine confirmed, no cut composed yet" }] : [],
    );
  const composed = cut.spine ?? null;
  if (board && composed && spineKey(board) !== spineKey(composed))
    return {
      state: "review",
      reasons: [{ code: "spine-moved", text: "spine moved since this cut was composed" }],
      basis: `script:trailer:${spineKey(composed)}|board:${spineKey(board)}`,
    };
  return {
    state: "working",
    reasons: [{ code: "cut-composed", text: composed ? "cut composed" : "cut composed, spine unstamped" }],
    basis: `script:trailer:${composed ? spineKey(composed) : "?"}`,
  };
}

function explainerVerdict(adoption: ScriptAdoptionStepData | undefined, versions: ScriptVersionsData | undefined): StepVerdict {
  const adopted = adoption?.renderId ? RENDER_BY_ID[adoption.renderId] : undefined;
  const accepted = versions?.accepted?.length ?? 0;
  const reasons: StepVerdict["reasons"] = [];
  if (adopted) reasons.push({ code: "candidate-adopted", text: `adopted: ${adopted.title}`, ref: adopted.id });
  if (accepted > 1) reasons.push({ code: "versions-accepted", text: `${accepted} versions accepted` });
  const basis = `script:explainer:${adopted?.id ?? "-"}:v${accepted}`;
  return reasons.length > 0 ? { state: "working", reasons, basis } : nothing(basis);
}

function verdict({ discipline, records }: ResolvedInput): StepVerdict {
  const research = records["research"] as ResearchStepData | undefined;
  const beats = records["research-beats"] as BeatPicksStepData | undefined;
  if (discipline === "music-video")
    return research?.researched
      ? { state: "review", reasons: [{ code: "nothing-to-write", text: "nothing to write here" }], basis: "script:mv" }
      : nothing("script:mv:unresearched", [{ code: "research-open", text: "research not marked" }]);
  if (discipline === "trailer" || (discipline === "free" && beats?.mode === "beats"))
    return trailerVerdict(records["script-trailer"] as TrailerCutStepData | undefined, beats);
  return explainerVerdict(
    records["script-adopted"] as ScriptAdoptionStepData | undefined,
    records["script-versions"] as ScriptVersionsData | undefined,
  );
}

export const SCRIPT_STEP: StepModule = {
  key: "script",
  reads: ["research"],
  records: ["research", "research-beats", "script-adopted", "script-versions", "script-trailer"],
  appliesTo: () => true,
  verdict,
};
