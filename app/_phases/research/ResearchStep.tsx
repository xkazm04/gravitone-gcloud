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

import { useEffect, useState } from "react";

import Modal from "@/components/ui/Modal";
import { useJobs } from "@/lib/jobs";

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

type Tab = "topic" | "board";

export default function ResearchStep({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<Tab>("topic");
  const run = useResearchRun();
  const api = useScope(projectId);
  const jobs = useJobs();

  const [artifact, setArtifact] = useState<"notebook" | "evidence" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [topic, setTopic] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const ready = run.state.status === "done";

  /* ---------------------------------------------------------- load on mount */
  // A project's step content is its own. The seeded Bitcoin project ships with
  // the real notebook as its saved state, which is why opening it shows a
  // finished run rather than an empty field.
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
  const myJob = jobId ? jobs.jobs.find((j) => j.id === jobId) : undefined;
  const running = myJob?.status === "running";

  useEffect(() => {
    if (!myJob || myJob.status === "running") return;
    if (myJob.status === "done") run.load();
    else run.reset();
    setJobId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myJob?.status]);

  const startResearch = () => {
    // Parallel research is allowed on purpose — different topics are
    // independent, and a creator who wants three subjects investigated at once
    // should get three. Only follow-ups are serialised.
    const j = jobs.start("research", projectId, topic, {
      failAfter: run.outcome === "process-failed",
    });
    if (j) setJobId(j.id);
  };

  const doClear = () => {
    run.reset();
    api.reset();
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
          job={myJob}
          running={running}
          onStart={startResearch}
          onAbort={() => myJob && jobs.cancel(myJob.id)}
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
