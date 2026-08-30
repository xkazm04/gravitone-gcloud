"use client";

// THE EDUCATIONAL RUN WIRING, lifted out of ResearchStep so both faces share it.
//
// Step 1's educational surface now has two faces — the guided card wizard and
// the expert Topic/Board tabs — and both need the same things: the run engine,
// the topic record, the background-job round-trip and the clear. Duplicating
// that wiring per face would be two clocks again (the exact bug the run engine's
// header describes), so it lives here ONCE and `EducationalResearch` calls it
// at the branch point, above whichever face is mounted. The faces receive the
// SAME instance — a decision made in the wizard is on the expert board the
// moment you switch, because there is nothing else it could be on.
//
// Everything in here moved from ResearchStep.tsx verbatim, with one deliberate
// change: hydration goes through `useStepFor` (the honest read — a failed read
// leaves the surface un-hydrated instead of marking it ready to overwrite disk)
// rather than the older `loadStep` + boolean-flag shape, which is the pattern
// _shared/useLoadFor.ts exists to retire.

import { useEffect, useState } from "react";

import { useJobs } from "@/lib/jobs";

import { NOTEBOOK } from "../../_shared/notebook/notebook";
import { saveStep, type ResearchStepData } from "../../_shared/stepStore";
import { useStepFor } from "../../_shared/useLoadFor";
import { useResearchRun } from "../run/useResearchRun";

export function useEducationalResearch(projectId: string) {
  const run = useResearchRun(projectId);
  const jobs = useJobs();
  const [topic, setTopic] = useState("");

  const ready = run.state.status === "done";
  const running = run.state.status === "running";

  /* ---------------------------------------------------------- load on mount */
  // A project's step content is its own. The seeded Bitcoin project ships with
  // the real notebook as its saved state, which is why opening it shows a
  // finished run rather than an empty field. `load` refuses mid-run, so coming
  // back to a step whose run is still going shows the run, not the saved result.
  const hydrated = useStepFor<ResearchStepData>(projectId, "research", (saved) => {
    setTopic(saved?.topic ?? NOTEBOOK.topic);
    if (saved?.researched) run.load();
  });

  /* ------------------------------------------------------------ persistence */
  useEffect(() => {
    if (!hydrated) return;
    void saveStep(projectId, "research", { topic, researched: ready });
  }, [projectId, topic, ready, hydrated]);

  /* ------------------------------------------- the background job round-trip */
  // "Is it running" has one answer, and the engine owns it. The job is the
  // NOTIFICATION vehicle — it survives the step, it rings the bell — but it no
  // longer schedules anything, so it can no longer disagree with the trace.
  const startResearch = () => {
    // Parallel research is allowed on purpose — different topics are
    // independent, and a creator who wants three subjects investigated at once
    // should get three. Only follow-ups are serialised.
    const j = jobs.start("research", projectId, topic, { driven: true });
    if (!j) return;

    // Frozen at click time, and deliberately not read off state later: this
    // closure has to survive leaving the step. `jobs.settle` is stable and
    // `JobsProvider` is mounted above the router, so a run that lands while the
    // step is unmounted still closes its job.
    const settle = jobs.settle;
    const started = run.start(j.id, (final) => {
      if (final.status === "done") {
        settle(j.id, "done", "A notebook is ready for review.");
      } else if (final.status === "no-tension") {
        // A successful run, not a defect: RESEARCH-PROMPT § Phase 2 requires a
        // topic with no tension to stop and say so, and it did.
        settle(j.id, "done", "No tension in this topic — the run finished and says why. There is no notebook.");
      } else if (final.status === "failed") {
        settle(j.id, "failed", final.error);
      }
    });

    // A run was already live here. Don't leave a job open that nothing settles.
    if (!started) jobs.cancel(j.id);
  };

  /** Pull the process. The engine stops WITHOUT firing its ending — this handler
   *  owns the job from here, and `cancel` is the one job exit that fires no bell
   *  event, because you already know you stopped it.
   *
   *  The id comes off the RUN, not off this hook: the run survives leaving the
   *  step and component state does not (the lifetime argument in
   *  run/useResearchRun.ts, at length). Read before `stop`, which clears it. */
  const abortResearch = () => {
    const live = run.jobId;
    run.stop();
    if (live) jobs.cancel(live);
  };

  // CLEAR IS NOT HERE, deliberately. `doClear` stays in ResearchStep and names
  // every store's reset itself (`run.reset()`, `resetFollowUps(`, `api.reset()`)
  // — tests/golden-path/step-clear-completeness.probe.spec.ts ratchets on those
  // literal calls in that file, so the one place a new session-lived record has
  // to be wired into Clear stays the one place the probe reads.

  return { run, topic, setTopic, hydrated, ready, running, startResearch, abortResearch };
}

export type EducationalResearchApi = ReturnType<typeof useEducationalResearch>;
