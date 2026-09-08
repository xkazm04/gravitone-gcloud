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
//
// THE TWO FACES (2026-08-30). The educational surface branches once more: the
// guided card wizard (guided/GuidedResearch.tsx, on the deck engine) and the
// expert Topic/Board tabs are two faces over ONE run wiring and ONE scope
// record — the wiring lives in guided/useEducationalResearch.ts so neither
// face forks it, the face choice under phase key "research-mode", and the
// DEFAULT face is computed (guided only while the step holds no decisions),
// never stored. Switching discards nothing, in either direction.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Modal from "@/components/ui/Modal";
import { TabRail } from "@/components/ui/signal";
import { getProject, type Discipline } from "@/lib/projects";

import NotebookBody from "../_shared/notebook/NotebookBody";
import EvidenceLog from "../_shared/notebook/EvidenceLog";
import { NOTEBOOK, NOTEBOOK_COUNTS } from "../_shared/notebook/notebook";
import { saveStep, type GuidedModeStepData } from "../_shared/stepStore";
import { useStepFor } from "../_shared/useLoadFor";
import { usePhaseReport } from "../_shared/usePhaseReport";

import ResearchTriageBoard from "./ResearchTriageBoard";
import FollowUpQueue from "./_parts/FollowUpQueue";
import TopicPanel from "./_parts/TopicPanel";
import { ClearDialog, ConfirmScope } from "./_parts/ScopeGate";
import { useScope } from "./useScope";
import { resetFollowUps } from "./useFollowUps";
import BeatVariantBoard from "./beats/BeatVariantBoard";
import ModeChooser, { ModeSwitch } from "./beats/ModeChooser";
import { useBeatPicks } from "./beats/useBeatPicks";
import GuidedResearch, { FaceSwitch, type Face } from "./guided/GuidedResearch";
import { useEducationalResearch } from "./guided/useEducationalResearch";

type Tab = "topic" | "board";

/** The one panel both tabs govern — `aria-controls` on the tab, `role="tabpanel"`
 *  on the section that swaps under it. */
const PANEL_ID = "research-panel";

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
    return <p className="font-jetbrains text-label text-white/35">opening the project…</p>;
  if (discipline === undefined)
    return (
      <p className="font-jetbrains text-label text-amber-200/85" data-testid="research-no-project">
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

  // WHAT THIS SURFACE REPORTS TO THE SHELF (derive, never assert). A pick is
  // work; a composed spine is the creator's own checkpoint — the one act on
  // this step that reads as a sign-off, so it is the one that earns `done`.
  // Reopening it is `working` again. The facts mode reports from its own
  // surface below.
  usePhaseReport(
    projectId,
    "research",
    !beats.hydrated || beats.mode !== "beats"
      ? null
      : beats.confirmed
        ? "done"
        : Object.values(beats.picks).some(Boolean)
          ? "working"
          : null,
  );

  // Held here as well as inside BeatVariantBoard, because the CHOOSER is the
  // surface that must not flash: a free project with a stored mode would show
  // "which kind of research is this?" for one frame before answering itself.
  if (!beats.hydrated)
    return <p className="font-jetbrains text-label text-white/35">opening the project’s picks…</p>;

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
  // ONE instance of the run wiring and ONE scope record, owned ABOVE the face
  // branch — the guided wizard and the expert board are two faces on these
  // same objects, which is what makes a decision on either visible on the
  // other the moment you switch. The wiring itself moved verbatim to
  // guided/useEducationalResearch.ts so neither face forks it.
  const research = useEducationalResearch(projectId);
  const api = useScope(projectId);

  // WHAT THIS SURFACE REPORTS TO THE SHELF. A notebook exists → in progress;
  // the scope checkpoint is taken → locked (the checkpoint IS the creator's
  // sign-off on what travels); the board has moved since → needs a call.
  usePhaseReport(
    projectId,
    "research",
    !research.hydrated || !api.hydrated || !research.ready
      ? null
      : api.confirmed
        ? api.diverged.length > 0
          ? "review"
          : "done"
        : "working",
  );

  /* --------------------------------------------------------------- the face */
  // The stored choice, under its own phase key ("research-mode") — see
  // GuidedModeStepData for why the mode must never ride with the decisions.
  const [stored, setStored] = useState<Face | null>(null);
  const faceHydrated = useStepFor<GuidedModeStepData>(projectId, "research-mode", (d) =>
    setStored(d?.mode ?? null),
  );
  const switchFace = (mode: Face) => {
    setStored(mode);
    void saveStep<GuidedModeStepData>(projectId, "research-mode", { mode });
  };

  // Every record the face computation reads, before any face is drawn — the
  // wrong guess here flashes a whole surface. The DEFAULT face is computed,
  // never stored (GuidedModeStepData's contract): guided only while the step
  // holds no prior decisions — no notebook, no scope entry, no checkpoint.
  if (!faceHydrated || !research.hydrated || !api.hydrated)
    return <p className="font-jetbrains text-label text-white/35">opening the step…</p>;
  const decided =
    research.ready || Object.keys(api.scope).length > 0 || api.confirmed !== null;

  return (
    <EducationalFaces
      // Keyed so a project switch re-freezes the default for the new project.
      key={projectId}
      projectId={projectId}
      research={research}
      api={api}
      face={stored}
      defaultFace={decided ? "expert" : "guided"}
      onSwitchFace={switchFace}
    />
  );
}

/** Below the hydration gate, so the computed default can be FROZEN at mount:
 *  a live derivation would flip `researched` the moment the wizard's own run
 *  landed and yank the creator to the expert board mid-wizard. Mount state is
 *  the freeze, and the `key` above is the per-project reset. */
function EducationalFaces({
  projectId,
  research,
  api,
  face,
  defaultFace,
  onSwitchFace,
}: {
  projectId: string;
  research: ReturnType<typeof useEducationalResearch>;
  api: ReturnType<typeof useScope>;
  face: Face | null;
  defaultFace: Face;
  onSwitchFace: (mode: Face) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("topic");
  const [artifact, setArtifact] = useState<"notebook" | "evidence" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  // The frozen default — what this step looked like when it was opened.
  const [fallback] = useState<Face>(defaultFace);
  const shown = face ?? fallback;

  const { run, topic, setTopic, ready, running, startResearch, abortResearch } = research;

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
      {shown === "guided" ? (
        <GuidedResearch
          research={research}
          api={api}
          onOpenNotebook={() => setArtifact("notebook")}
          onOpenEvidence={() => setArtifact("evidence")}
          onClear={() => setConfirmClear(true)}
          onSwitchFace={onSwitchFace}
          // The wizard's last stage hands the creator to Step 2 — it used to
          // open the expert board, so a first-timer who had confirmed the
          // scope was shown more controls instead of the script (uat
          // 2026-09-05, KW-L1-4). The rail click this stands in for parks the
          // project there (StudioView reads ?step= changes after open).
          onFinish={() => router.push(`/studio/${projectId}?step=script`)}
        />
      ) : (
        <>
          {/* THE TAB'S SUB-LINE IS GONE, and the state it was reaching for
              rides on the tab instead — <TabRail>'s argument, one directory
              over. "input, log & notebook" described the panel below; "locked
              until a notebook exists" described a lock the Lock glyph and the
              disabled state already draw, and the tab's own DESCRIPTION now
              carries the reason for anyone who cannot see either.

              These two buttons were hand-rolled for one reason — they carry
              `data-testid="tab-topic"/"tab-board"`, which four harness scripts
              and a live spec click, and `TabDef` had no testid to give them.
              It has one now (`testId`), so the row is the shared primitive.

              THE ONE SEMANTIC THAT MOVED: the lock. It was a real `disabled`
              attribute, which takes the tab OUT of the tab order and puts the
              reason behind a mouse. <TabRail> marks it `aria-disabled`, so the
              tab stays reachable and its Hint readable. Every driver survives
              that: Playwright folds `aria-disabled` into enabled-ness for
              `role="tab"` (kAriaDisabledRoles), and uat/driver/lib.mjs already
              tests both spellings. The live spec's assertion says so out
              loud — tests/live/golden-path.live.spec.ts, "the board is
              unlocked". */}
          <div className="flex flex-wrap items-center gap-3 border-b border-white/8 pb-3">
            <TabRail
              className="grow border-b-0 pb-0"
              label="research views"
              active={tab}
              onSelect={setTab}
              tabs={[
                { id: "topic", label: "Topic", testId: "tab-topic", panelId: PANEL_ID },
                {
                  id: "board",
                  label: "Triage board",
                  testId: "tab-board",
                  // Only while it can be opened: `aria-controls` pointing at a
                  // panel this tab cannot reach is a promise it does not keep.
                  ...(ready ? { panelId: PANEL_ID } : {}),
                  disabled: !ready,
                  disabledReason: "locked until a notebook exists",
                  tally: {
                    value: ready ? api.summary.kept : 0,
                    of: ready ? api.summary.total : undefined,
                    label: "kept",
                    tone: ready ? "cyan" : "neutral",
                  },
                },
              ]}
            />
            <FaceSwitch face="expert" onSwitch={onSwitchFace} />
          </div>

          <div id={PANEL_ID} role="tabpanel" className="space-y-5">
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
          </div>
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
          <p className="font-jetbrains text-content tracking-[0.18em] text-cyan-300/80 uppercase">
            notebook.json
          </p>
        }
        footer={
          <p className="font-jetbrains text-content text-white/35">
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
