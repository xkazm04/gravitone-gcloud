"use client";

// STEP 1 — Research. Two sections behind a switcher, because one page was
// getting long enough that the board pushed the run controls off-screen:
//
//   · TOPIC — the input, the run log, and the notebook reference.
//   · BOARD — locked until a notebook exists, then the triage board and the
//             follow-up queue, to the end of the page.
//
// The run itself is a BACKGROUND JOB (lib/jobs). Research is minutes of careful
// work; holding the screen for it would be the wrong trade, so the step starts a
// job and the bell reports back. Navigating away — even to another project —
// does not cancel it.
//
// The job is started DRIVEN, and `useResearchRun` is the clock that drives it.
// There used to be two: a 14-second mock timer inside lib/jobs and a run engine
// with the real 15-step trace that nothing ever called. The mock always landed
// first and always landed `done`, so choosing "finds no tension" produced the
// full Bitcoin notebook — the outcome picker offered three endings and delivered
// one. Now the engine steps the trace and the ending it lands on is what settles
// the job. One clock, and the control tells the truth.

//
// THE DISCIPLINE BRANCH (2026-08-27). Everything above describes the
// EDUCATIONAL surface, which is unchanged. A trailer has no notebook to run —
// its research is picking beats per part of the spine — and a free project has
// to say which of the two it wants. So the default export reads the project
// once and branches; `EducationalResearch` below is the surface that used to
// be the whole file, every testid intact.

import { useEffect, useState } from "react";

import Modal from "@/components/ui/Modal";
import { useJobs } from "@/lib/jobs";
import { getProject, type Discipline } from "@/lib/projects";

import NotebookBody from "../_shared/notebook/NotebookBody";
import EvidenceLog from "../_shared/notebook/EvidenceLog";
import { NOTEBOOK, NOTEBOOK_COUNTS } from "../_shared/notebook/notebook";
import { useResearchRun } from "./run/useResearchRun";
import { loadStep, saveStep } from "../_shared/stepStore";

import ResearchTriageBoard from "./ResearchTriageBoard";
import FollowUpQueue from "./_parts/FollowUpQueue";
import TopicPanel from "./_parts/TopicPanel";
import { ClearDialog, ConfirmScope } from "./_parts/ScopeGate";
import { useScope } from "./useScope";
import { resetFollowUps } from "./useFollowUps";
import BeatVariantBoard from "./beats/BeatVariantBoard";
import ModeChooser, { ModeSwitch } from "./beats/ModeChooser";
import { useBeatPicks } from "./beats/useBeatPicks";

type Tab = "topic" | "board";

export default function ResearchStep({ projectId }: { projectId: string }) {
  // The project record, read the way StudioView reads it (`getProject` in an
  // effect) — no second data layer. `null` = not yet read; `undefined` = read
  // and not there, which is drawn as its own sentence rather than as a board.
  const [read, setRead] = useState<{ id: string; discipline: Discipline | undefined } | null>(null);
  // Keyed to the id rather than reset in the effect, so a project switch shows
  // "opening" without a synchronous setState inside the effect.
  const discipline = read?.id === projectId ? read.discipline : null;

  useEffect(() => {
    let alive = true;
    void getProject(projectId).then((p) => {
      if (alive) setRead({ id: projectId, discipline: p ? (p.discipline ?? "educational") : undefined });
    });
    return () => { alive = false; };
  }, [projectId]);

  if (discipline === null)
    return <p className="font-jetbrains text-[12px] text-white/35">opening the project…</p>;
  if (discipline === undefined)
    return (
      <p className="font-jetbrains text-[12px] text-amber-200/85" data-testid="research-no-project">
        no project record for {projectId} — nothing to research against
      </p>
    );

  // THE BEATS HOOK LIVES BELOW THE BRANCH, not above it. It used to be called
  // here, unconditionally, before the discipline was even known — so every
  // EDUCATIONAL project (which is most of them, and the seeded Bitcoin one)
  // waited on a `research-beats` read for a record it will never have, in
  // series after `getProject`, and held the whole step behind "opening the
  // project…" for it. Two round trips to show a notebook that needs one.
  if (discipline === "educational") return <EducationalResearch projectId={projectId} />;
  return <BeatsResearch projectId={projectId} discipline={discipline} />;
}

/** The disciplines whose research is picking beats rather than finding facts.
 *  Owns the picks record, so nothing else pays to read it. */
function BeatsResearch({
  projectId,
  discipline,
}: {
  projectId: string;
  discipline: Exclude<Discipline, "educational">;
}) {
  const beats = useBeatPicks(projectId);

  // Held here as well as inside BeatVariantBoard, because the CHOOSER is the
  // surface that must not flash: a free project with a stored mode would show
  // "which kind of research is this?" for one frame before answering itself.
  if (!beats.hydrated)
    return <p className="font-jetbrains text-[12px] text-white/35">opening the project’s picks…</p>;

  if (discipline === "trailer") return <BeatVariantBoard api={beats} discipline="trailer" />;

  // free: the chooser until a mode is stored, then whichever board it named —
  // with the way back drawn above it, because the chooser itself is gone by
  // then and its answer used to be permanent.
  if (beats.mode === null) return <ModeChooser onChoose={beats.setMode} />;
  return (
    <div className="space-y-4">
      <ModeSwitch
        mode={beats.mode}
        onSwitch={beats.setMode}
        locked={
          beats.confirmed
            ? "reopen the composed spine first — composing it marked this project researched, and Script reads that"
            : undefined
        }
      />
      {beats.mode === "beats" ? (
        <BeatVariantBoard api={beats} discipline="free" />
      ) : (
        <EducationalResearch projectId={projectId} />
      )}
    </div>
  );
}

function EducationalResearch({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<Tab>("topic");
  const run = useResearchRun(projectId);
  const api = useScope(projectId);
  const jobs = useJobs();

  const [artifact, setArtifact] = useState<"notebook" | "evidence" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [topic, setTopic] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const ready = run.state.status === "done";

  /* ---------------------------------------------------------- load on mount */
  // A project's step content is its own. The seeded Bitcoin project ships with
  // the real notebook as its saved state, which is why opening it shows a
  // finished run rather than an empty field. `load` refuses mid-run, so coming
  // back to a step whose run is still going shows the run, not the saved result.
  useEffect(() => {
    let alive = true;
    void loadStep(projectId, "research").then((saved) => {
      if (!alive) return;
      setTopic(saved?.topic ?? NOTEBOOK.topic);
      if (saved?.researched) run.load();
      setHydrated(true);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  /* ------------------------------------------------------------ persistence */
  useEffect(() => {
    if (!hydrated) return;
    void saveStep(projectId, "research", { topic, researched: ready });
  }, [projectId, topic, ready, hydrated]);

  /* ------------------------------------------- the background job round-trip */
  // "Is it running" has one answer, and the engine owns it. The job is the
  // NOTIFICATION vehicle — it survives the step, it rings the bell — but it no
  // longer schedules anything, so it can no longer disagree with the trace.
  const running = run.state.status === "running";

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
   *  The id comes off the RUN, not off this component. It used to be local
   *  state, which is a shorter lifetime than the thing it identifies: the run
   *  survives leaving the step and the id did not, so aborting after coming
   *  back stopped the engine and cancelled nothing, stranding the job as
   *  `running` in the bell until a reload called it interrupted. Read before
   *  `stop`, which clears it. */
  const abortResearch = () => {
    const live = run.jobId;
    run.stop();
    if (live) jobs.cancel(live);
  };

  // Everything the ClearDialog says is discarded, discarded. The follow-up
  // record is the third document this step owns — it lives above React so that
  // navigation cannot lose it (useFollowUps.ts), which also means nothing here
  // ended it, and a returned deepen from the cleared run came back under the
  // next run's board.
  const doClear = () => {
    run.reset();
    api.reset();
    resetFollowUps(projectId);
    setConfirmClear(false);
    setTab("topic");
  };

  return (
    <div className="space-y-5">
      <div className="font-jetbrains flex flex-wrap gap-2 text-[12px]">
        {([
          { key: "topic", label: "Topic", sub: "input, log & notebook" },
          { key: "board", label: "Triage board", sub: ready ? "scope the material" : "locked until a notebook exists" },
        ] as const).map((t) => {
          const locked = t.key === "board" && !ready;
          return (
            <button
              key={t.key}
              data-testid={`tab-${t.key}`}
              onClick={() => !locked && setTab(t.key)}
              disabled={locked}
              className={`rounded-xl border px-3.5 py-2 text-left transition ${
                tab === t.key
                  ? "border-cyan-400/40 bg-cyan-400/[0.07]"
                  : locked
                    ? "cursor-not-allowed border-white/6 bg-white/[0.01] opacity-45"
                    : "border-white/8 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <span className="block text-white/85">{t.label}</span>
              <span className="mt-0.5 block text-[10px] text-white/35">{t.sub}</span>
            </button>
          );
        })}
      </div>

      {tab === "topic" ? (
        <TopicPanel
          run={run}
          topic={topic}
          setTopic={setTopic}
          running={running}
          onStart={startResearch}
          onAbort={abortResearch}
          onClear={() => setConfirmClear(true)}
          onOpenNotebook={() => setArtifact("notebook")}
          onOpenEvidence={() => setArtifact("evidence")}
          onGoToBoard={() => setTab("board")}
        />
      ) : (
        <>
          <ResearchTriageBoard api={api} />
          <FollowUpQueue api={api} projectId={projectId} />
          <ConfirmScope api={api} />
        </>
      )}

      <ClearDialog open={confirmClear} onClose={() => setConfirmClear(false)} onConfirm={doClear} />

      <Modal
        open={artifact === "notebook"}
        onClose={() => setArtifact(null)}
        title="notebook · why-bitcoin-price-does-not-rise"
        footer={`${NOTEBOOK_COUNTS.facts} facts · ${NOTEBOOK_COUNTS.mechanisms} mechanisms · ${NOTEBOOK_COUNTS.reversals} reversals · researched ${NOTEBOOK.researched}`}
      >
        <NotebookBody />
      </Modal>

      <Modal
        open={artifact === "evidence"}
        onClose={() => setArtifact(null)}
        title="Evidence log"
        eyebrow={
          <p className="font-jetbrains text-[11px] tracking-[0.18em] text-cyan-300/80 uppercase">
            notebook.json · every claim dated, sourced and rated
          </p>
        }
        subtitle="Nothing the script says may go beyond what this log supports."
        footer={
          <p className="font-jetbrains text-[11px] text-white/35">
            {NOTEBOOK_COUNTS.flagged === 0
              ? "no claim is both load-bearing and low-confidence"
              : `${NOTEBOOK_COUNTS.flagged} claim(s) load-bearing at low confidence — flagged, not quietly used`}
          </p>
        }
      >
        <EvidenceLog />
      </Modal>

    </div>
  );
}
