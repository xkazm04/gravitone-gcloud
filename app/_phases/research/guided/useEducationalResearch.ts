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

// ── THE SECOND PATH (2026-09-08) ───────────────────────────────────────────
//
// Step 1 could not research. Both ends of that seam existed —
// pipeline/RESEARCH-PROMPT.md and lib/text/router.ts — and nothing joined them,
// so a creator with their own idea typed a topic, pressed the button and
// received a notebook about Bitcoin. `run/live.ts` is the wire and
// /api/research is the route; this hook is where the two paths meet, and it
// keeps them APART rather than merging them:
//
//   · `ready`/`running` still mean the SIMULATED run, unchanged, because the
//     whole board downstream (`useScope`, the triage columns, the conclusions
//     deck) is built from the shipped fixture. A live notebook that flipped
//     `ready` would deal Bitcoin cards under a creator's own topic — the exact
//     defect the stand-in note exists to prevent, arriving through the fix.
//   · `live` is the real run, with its own state, its own record on disk and
//     its own receipt. It is never the default and never fires by itself.
//
// The two are shown side by side rather than one winning, because they are two
// different objects: a replay of somebody else's completed run, and a notebook
// reasoned about the creator's topic just now.

import { useCallback, useEffect, useState } from "react";

import { useJobs } from "@/lib/jobs";

import { saveStep, type ResearchNotebookStepData, type ResearchStepData } from "../../_shared/stepStore";
import { useLoadFor, useStepFor } from "../../_shared/useLoadFor";
import { adoptSaved, preflight, useLiveResearch, type Preflight } from "../run/live";
import { useResearchRun } from "../run/useResearchRun";

export function useEducationalResearch(projectId: string) {
  const run = useResearchRun(projectId);
  const live = useLiveResearch(projectId);
  const jobs = useJobs();
  const [topic, setTopic] = useState("");

  const ready = run.state.status === "done";
  const running = run.state.status === "running";
  const liveRunning = live.state.status === "running";

  /* ---------------------------------------------------------- load on mount */
  // A project's step content is its own. The seeded Bitcoin project ships with
  // the real notebook as its saved state, which is why opening it shows a
  // finished run rather than an empty field. `load` refuses mid-run, so coming
  // back to a step whose run is still going shows the run, not the saved result.
  // A FRESH PROJECT'S FIELD IS EMPTY. It used to hydrate as NOTEBOOK.topic —
  // "Why Bitcoin price does not rise" — for every project with no research
  // record, so the first thing a creator saw on their own project was another
  // project's subject, already in the box and already enabled to run (uat
  // 2026-09-05: five Characters). The seeded Bitcoin project still opens on
  // its topic, because stepStore#seededFor supplies it as `saved`.
  const topicHydrated = useStepFor<ResearchStepData>(projectId, "research", (saved) => {
    setTopic(saved?.topic ?? "");
    if (saved?.researched) run.load();
  });

  // THE LIVE NOTEBOOK'S OWN RECORD, under its own key. It is read separately
  // because it means something different from the record above: `research` says
  // "this project shows the replay", `research-notebook` says "an engine
  // reasoned this, for this topic, and here is what it cost". `adoptSaved`
  // refuses a cleared record and refuses to overwrite a run in flight — both
  // rules stated where the store is (run/live.ts).
  const liveHydrated = useStepFor<ResearchNotebookStepData>(projectId, "research-notebook", (saved) =>
    adoptSaved(projectId, saved),
  );

  /* ------------------------------------------------- what a real run costs */
  // Asked ONCE per page load, before any button is pressed, because the answer
  // is what makes the spend button honest: who would bill, and whether this app
  // can price them in advance. `undefined` is "not asked yet" and `null` is
  // "could not ask" — two states the surface says differently (live.ts's
  // `spendNote`), and neither of them is a guess.
  //
  // Through `useLoadFor` rather than a hand-rolled `let alive = true`: the key
  // is constant, so this is the primitive's simplest case, and the guard it owns
  // is the one that stops a slow probe landing on an unmounted step.
  const [pf, setPf] = useState<Preflight | null | undefined>(undefined);
  useLoadFor("research-preflight", () => preflight(), (p) => void setPf(p));

  const hydrated = topicHydrated && liveHydrated;

  /* ------------------------------------------------------------ persistence */
  useEffect(() => {
    if (!hydrated) return;
    // Nothing typed and nothing run is nothing to record — a project the
    // creator has not touched must not gain a research row on mount.
    if (!topic && !ready) return;
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
    const open = run.jobId;
    run.stop();
    if (open) jobs.cancel(open);
  };

  /* ------------------------------------------------------- the real run */

  /** Send the typed topic to the engine.
   *
   *  EXPLICIT, ALWAYS. Nothing calls this on mount, on hydration or as a
   *  fallback from the simulated path: a run that bills a vendor is started by
   *  a person who has read what it will cost, and the sentence saying so is
   *  drawn beside the control that calls this (`spendNote`, run/live.ts).
   *
   *  The job is the notification vehicle, exactly as it is for the simulated
   *  run — this is minutes of real work and the creator is entitled to leave. */
  const startLiveResearch = useCallback(() => {
    const t = topic.trim();
    if (!t) return;
    const j = jobs.start("research", projectId, t, { driven: true });
    if (!j) return;
    // Frozen at click time, deliberately, and for the reason the simulated
    // path's own comment gives: this closure has to survive leaving the step.
    const settle = jobs.settle;
    const started = live.start(t, j.id, (final) => {
      if (final.status === "done")
        settle(
          j.id,
          "done",
          `A notebook was reasoned for “${final.topic}”. Nothing in it was looked up — check its sources.`,
        );
      else if (final.status === "failed") settle(j.id, "failed", final.detail);
    });
    // A run was already live here. Don't leave a job nothing settles.
    if (!started) jobs.cancel(j.id);
  }, [projectId, topic, jobs, live]);

  /** Pull the request. `stopLive` aborts the fetch, fires NO ending, and hands
   *  back the job it was reporting to — this handler owns it from here, and
   *  `cancel` is the one job exit with no bell event, because you already know
   *  you stopped it. The id comes off the STORE rather than off this hook for
   *  the lifetime reason run/live.ts states beside `jobIds`. */
  const abortLiveResearch = useCallback(() => {
    const open = live.stop();
    if (open) jobs.cancel(open);
  }, [live, jobs]);

  // CLEAR IS NOT HERE, deliberately. `doClear` stays in ResearchStep and names
  // every store's reset itself (`run.reset()`, `resetFollowUps(`, `api.reset()`)
  // — tests/golden-path/step-clear-completeness.probe.spec.ts ratchets on those
  // literal calls in that file, so the one place a new session-lived record has
  // to be wired into Clear stays the one place the probe reads.

  return {
    run,
    topic,
    setTopic,
    hydrated,
    /** The SIMULATED path landed — the fixture notebook is on screen and the
     *  board downstream can be built. Deliberately blind to `live`: see the
     *  header. */
    ready,
    running,
    startResearch,
    abortResearch,
    /* the second path */
    live,
    liveRunning,
    /** The pre-flight: `undefined` not asked yet, `null` could not ask. */
    preflight: pf,
    startLiveResearch,
    abortLiveResearch,
  };
}

export type EducationalResearchApi = ReturnType<typeof useEducationalResearch>;
