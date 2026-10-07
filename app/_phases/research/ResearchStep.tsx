"use client";

// STEP 1 — Research.
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
// expert board are two faces over ONE run wiring and ONE scope record — the
// wiring lives in guided/useEducationalResearch.ts so neither face forks it,
// the face choice under phase key "research-mode", and the DEFAULT face is
// computed (guided only while the step holds no decisions), never stored.
// Switching discards nothing, in either direction.
//
// THE EXPERT FACE IS TRIAGE ONLY (2026-09-08). It used to be a Topic/Board tab
// pair, and the Topic tab was a second complete run surface — field, run button,
// spend control, trace, artifact pills — beside the guided face's own. Two ways
// to start one run, on one step, is the repetition that makes a page hard to
// orient in, and the tab strip existed only to hold them apart. Operator's
// ruling: you run research in the guided flow, and the expert face is where you
// work the cards. So `TopicPanel` is deleted, the tab strip with it, and the
// expert face renders the board directly — with the notebook's artifacts and the
// way back to the wizard in its own header, because losing the tabs must not
// lose the exits that were riding on them.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BookOpenCheck } from "lucide-react";

import Modal from "@/components/ui/Modal";
import { getProject, type Discipline } from "@/lib/projects";

import NotebookBody from "../_shared/notebook/NotebookBody";
import EvidenceLog from "../_shared/notebook/EvidenceLog";
import { countsOf, type NotebookCounts } from "../_shared/notebook/counts";
import { saveStep, type GuidedModeStepData } from "../_shared/stepStore";
import { useStepFor } from "../_shared/useLoadFor";
import { usePhaseReport } from "../_shared/usePhaseReport";

import ResearchTriageBoard from "./ResearchTriageBoard";
import FollowUpQueue from "./_parts/FollowUpQueue";
import { ClearDialog, ConfirmScope } from "./_parts/ScopeGate";
import { useScope } from "./useScope";
import { resetFollowUps } from "./useFollowUps";
import BeatVariantBoard from "./beats/BeatVariantBoard";
import ModeChooser, { ModeSwitch } from "./beats/ModeChooser";
import { useBeatPicks } from "./beats/useBeatPicks";
import GuidedResearch, { FaceSwitch, type Face } from "./guided/GuidedResearch";
import { ArtifactPills } from "./guided/RunStage";
import { useEducationalResearch } from "./guided/useEducationalResearch";
import AdsIdea from "./ads/AdsIdea";
import MusicVideoResearch from "./MusicVideoResearch";

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
  // THE MUSIC-VIDEO DISCIPLINE (WP2, 2026-10-04). No notebook and no beat
  // board — the research IS the attached track, so it gets its own branch
  // rather than being squeezed into BeatsResearch's picks shape, which has
  // nothing a music video would ever pick. See MusicVideoResearch.tsx /
  // useMusicVideoSource.ts for the record this writes and the gate it marks.
  if (discipline === "music-video") return <MusicVideoResearch projectId={projectId} />;
  // THE ADS DISCIPLINE — a brief and two rounds of options (ideas, then
  // scenarios), not a beat board. Routed before BeatsResearch, whose default
  // would otherwise hand an ad the trailer fixture.
  if (discipline === "ads") return <AdsIdea projectId={projectId} />;
  return <BeatsResearch projectId={projectId} discipline={discipline} />;
}

/** The disciplines whose research is picking beats rather than finding facts.
 *  Owns the picks record, so nothing else pays to read it. */
function BeatsResearch({
  projectId,
  discipline,
}: {
  projectId: string;
  discipline: Exclude<Discipline, "educational" | "music-video" | "ads">;
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
  // Dealt from the project's ACTIVE notebook — the creator's own when one is
  // saved, else the replay (research-scope-board-A stage 3).
  const api = useScope(projectId, research.source);

  // WHAT THIS SURFACE REPORTS TO THE SHELF. A notebook exists → in progress;
  // the scope checkpoint is taken → locked (the checkpoint IS the creator's
  // sign-off on what travels); the board has moved since → needs a call.
  //
  // Still gated on the REPLAY landing (`ready`), not on `dealt`: the pure
  // verdict this report is held level with (verdict.ts, step-verdicts probe)
  // reads `research.researched`, which only the replay writes. A project with
  // only its own notebook reports nothing here until that verdict reads
  // `research-notebook` too.
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
    research.dealt || Object.keys(api.scope).length > 0 || api.confirmed !== null;

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
  const [artifact, setArtifact] = useState<"notebook" | "evidence" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  // The frozen default — what this step looked like when it was opened.
  const [fallback] = useState<Face>(defaultFace);
  const shown = face ?? fallback;

  const { run, ready, live } = research;
  // WHAT THE MODALS, THE PILLS AND THE CLEAR DIALOG DRAW IS WHAT THE BOARD DEALS:
  // the creator's own notebook when one is saved, else the replay.
  const dealtSource = research.source;
  const counts = countsOf(dealtSource.notebook);

  // Everything the ClearDialog says is discarded, discarded. The follow-up
  // record is the third document this step owns — it lives above React so that
  // navigation cannot lose it (useFollowUps.ts), which also means nothing here
  // ended it, and a returned deepen from the cleared run came back under the
  // next run's board.
  //
  // `live.reset()` is the FOURTH, added with the real-run path (run/live.ts). It
  // is the one that also reaches DISK — the reasoned notebook has its own step
  // record — because a cleared step that leaves a notebook in the store
  // re-adopts it on the next mount and the creator's clear silently undoes
  // itself. That same write is what takes the creator's notebook off the board:
  // useActiveNotebook hears it issued and falls back to the replay in the same
  // tick. tests/golden-path/step-clear-completeness.probe.spec.ts walks this
  // function's body for each store's reset by name.
  //
  // WHERE A CLEAR LANDS YOU. It used to be `setTab("topic")` — back to the run
  // controls, which is the only sensible place to be with no notebook. The tabs
  // are gone and the expert face is the board, so clearing there would leave the
  // creator staring at the empty shape of the thing they just discarded. The
  // guided face is where a run is started now, so that is where a cleared step
  // goes. On the guided face this is a no-op it already agrees with: the wizard
  // re-deals from stage 1 once `dealt` is false.
  const doClear = () => {
    run.reset();
    live.reset();
    api.reset();
    resetFollowUps(projectId);
    setConfirmClear(false);
    onSwitchFace("guided");
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
        <ExpertBoard
          api={api}
          projectId={projectId}
          counts={counts}
          dealt={research.dealt}
          onOpenNotebook={() => setArtifact("notebook")}
          onOpenEvidence={() => setArtifact("evidence")}
          onClear={() => setConfirmClear(true)}
          onSwitchFace={onSwitchFace}
        />
      )}

      <ClearDialog open={confirmClear} onClose={() => setConfirmClear(false)} onConfirm={doClear} source={dealtSource} />

      <Modal
        open={artifact === "notebook"}
        onClose={() => setArtifact(null)}
        title={`notebook · ${dealtSource.notebook.id}`}
        footer={`${counts.facts} facts · ${counts.mechanisms} mechanisms · ${counts.reversals} reversals · researched ${dealtSource.notebook.researched}`}
      >
        <NotebookBody source={dealtSource} />
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
            {counts.flagged === 0
              ? "no claim is both load-bearing and low-confidence"
              : `${counts.flagged} claim(s) load-bearing at low confidence — flagged, not quietly used`}
          </p>
        }
      >
        <EvidenceLog source={dealtSource} />
      </Modal>

    </div>
  );
}

/** THE EXPERT FACE — the triage board, and nothing that is not triage.
 *
 *  What the tab strip used to hold, and where each piece went:
 *   · the run (field, button, spend control, trace) → the guided face owns it.
 *     There is one run wiring and it is reached from one place.
 *   · the notebook and evidence-log pills, and Clear → this header. They are
 *     what you do to a notebook you already have, which is what this face is
 *     for. Same component and same testids as the wizard's own row.
 *   · the way to the other face → this header's own FaceSwitch, which is where
 *     it already was (TabRail's `trailing` slot).
 *
 *  NOBODY IS STRANDED WITH NO NOTEBOOK. The board's cards come from the run, so
 *  with none the board is empty — and an empty board on the face that cannot
 *  start one is a dead end. So the empty state is not a description of the
 *  board; it is the way out of it, and the switch is the button in it. */
function ExpertBoard({
  api,
  projectId,
  counts,
  dealt,
  onOpenNotebook,
  onOpenEvidence,
  onClear,
  onSwitchFace,
}: {
  api: ReturnType<typeof useScope>;
  projectId: string;
  /** The counts of the dealt notebook, which the artifact pills open. */
  counts: NotebookCounts;
  /** There are cards: the replay landed, or the creator's own notebook is the
   *  active source. */
  dealt: boolean;
  onOpenNotebook: () => void;
  onOpenEvidence: () => void;
  onClear: () => void;
  onSwitchFace: (f: Face) => void;
}) {
  return (
    <div className="space-y-5">
      {/* NO EYEBROW OF ITS OWN. The board underneath brings one ("triage
          board", ResearchTriageBoard's header) and two stacked eyebrows is the
          repetition this wave is removing. The row is the exits only. */}
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {dealt && (
          <ArtifactPills
            counts={counts}
            onOpenNotebook={onOpenNotebook}
            onOpenEvidence={onOpenEvidence}
            onClear={onClear}
          />
        )}
        <FaceSwitch face="expert" onSwitch={onSwitchFace} />
      </div>

      {dealt ? (
        <>
          <ResearchTriageBoard api={api} />
          <FollowUpQueue api={api} projectId={projectId} />
          <ConfirmScope api={api} />
        </>
      ) : (
        <section
          data-testid="expert-board-empty"
          className="rounded-2xl border border-white/8 bg-white/[0.015] p-6"
        >
          <div className="flex flex-wrap items-center gap-3">
            <BookOpenCheck className="h-5 w-5 shrink-0 text-cyan-300/70" aria-hidden />
            <p className="font-jetbrains text-content text-white/55">
              the board is dealt from a notebook — this project has none yet
            </p>
          </div>
          {/* THE ACTION, not a sentence about where the action is. The grey
              FaceSwitch above is navigation and reads as navigation; this is
              the one thing there is to do here, so it is drawn as the primary
              it is. Both go to the same face, which is the honest answer to
              "where do I start research" now that this one cannot. */}
          <button
            type="button"
            data-testid="expert-board-start"
            onClick={() => onSwitchFace("guided")}
            className="font-jetbrains mt-4 rounded-full border border-cyan-400/35 bg-cyan-400/[0.07] px-3.5 py-1.5 text-label text-cyan-200 transition hover:bg-cyan-400/15 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            start the research →
          </button>
        </section>
      )}
    </div>
  );
}
