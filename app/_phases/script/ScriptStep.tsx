"use client";

// STEP 2 · SCRIPT
//
// Four standalone tabs, because they answer four different questions and none of
// them is a variant of another:
//
//   · CANDIDATES — three renders, measured against the library's bands. WHICH.
//   · COVERAGE   — every card × every render. WHO USED WHAT, and for how long.
//   · SPEND BAR  — the same weights as one budget. HOW MUCH, and what moved.
//   · TRACKS     — running order per script. WHERE it lands. The bridge to
//                  Step 3 (Frames), not a weight surface.
//
// The step no longer runs research. It had a topic field, a run rack and a log
// left over from when this was Step 1, which meant two steps could each start a
// run and disagree about whether one had happened. Step 1 produces the notebook;
// this reads it. The evidence log moved to Step 1 with the rest of the evidence.
//
// Versions: notes stack against tracks and ONE recalibration answers all of them
// (useVersions.ts). Coverage and Spend can show the staged candidate; Tracks
// stays on the accepted baseline, because a running order cannot be read as two
// interleaved orders.
//
// CANDIDATES NO LONGER DOES. It used to map the static fixture whatever version
// was live, so the app spent minutes of Opus 5 rewriting the beats, stored them
// in `Version.beats`, and showed the creator the script those beats replaced —
// labelled "the baseline". A version that carries its own chain is now drawn as
// itself, diffed against the chain it was built on, and re-gated: `gateChains`
// runs over what is actually on screen rather than over `RENDERS`. The sticky
// pad comes with it, so the verdict and the accept button are one glance apart.

import { useEffect, useMemo, useState } from "react";

import Modal from "@/components/ui/Modal";
import { getProject, type Discipline } from "@/lib/projects";

import { CONCLUSIONS } from "../_shared/notebook/conclusions";
import { NOTEBOOK, NOTEBOOK_COUNTS } from "../_shared/notebook/notebook";
import { loadStep, type BeatPicksStepData } from "../_shared/stepStore";
import Notice from "../_shared/ui/Notice";
import { useScope } from "../research/useScope";

import { gateChains } from "./gate";
import type { Version } from "./versions";
import BeatList from "./_parts/BeatList";
import CandidatesDuel from "./candidates/CandidatesDuel";
import { useAdoption } from "./candidates/useAdoption";
import { useScriptFace } from "./candidates/useScriptFace";
import HypothesisColumn from "./_parts/HypothesisColumn";
import MatrixCoverage from "./_matrix/MatrixCoverage";
import MatrixSpend from "./_matrix/MatrixSpend";
import MatrixTracks from "./_matrix/MatrixTracks";
import VersionBar from "./_matrix/VersionBar";
import StickyNotebook from "./_notes/StickyNotebook";
import { RENDERS, RENDER_BY_ID } from "./renders";
import BaselineOnlyNote from "./_parts/BaselineOnlyNote";
import TrailerScript from "./trailer/TrailerScript";
import { useVersions } from "./useVersions";

type Tab = "candidates" | "coverage" | "spend" | "tracks";

/** The beats a version actually shows for one render. A version with no chain
 *  of its own (the simulated transform re-weights without rewriting) falls back
 *  to the fixture — which is the true answer, not a placeholder. */
const chainOf = (v: Version | null, renderId: string) =>
  v?.beats?.[renderId] ?? RENDER_BY_ID[renderId].beats;

/** Counted from the chain on screen, never read off the fixture — the fixture's
 *  `words` describes a script a recalibration may have replaced. */
const wordsIn = (beats: { text: string }[]) =>
  beats.map((b) => b.text).join(" ").split(/\s+/).filter(Boolean).length;

const TABS: { key: Tab; label: string; sub: string }[] = [
  { key: "candidates", label: "Candidates", sub: "three renders, measured" },
  { key: "coverage", label: "Coverage", sub: "who used what, and for how long" },
  { key: "spend", label: "Spend bar", sub: "the runtime as a budget" },
  { key: "tracks", label: "Tracks", sub: "running order — the bridge to Frames" },
];

/** WHICH HALF OF THE STEP THIS PROJECT GETS.
 *
 *  The project record and the beat-picks record are read the way ResearchStep
 *  reads them (`getProject` in an effect, keyed to the id) — no second data
 *  layer. A trailer project, or a free project that chose beats over facts,
 *  opens on the trailer half and nothing of the explainer path mounts: its
 *  hooks read a notebook this project does not have. `null` = not read yet. */
type Route =
  | { id: string; kind: "explainer" }
  | { id: string; kind: "trailer"; discipline: Discipline; title: string }
  | { id: string; kind: "missing" };

export default function ScriptStep({ projectId }: { projectId: string }) {
  const [route, setRoute] = useState<Route | null>(null);
  const current = route?.id === projectId ? route : null;

  useEffect(() => {
    let alive = true;
    void Promise.all([
      getProject(projectId),
      loadStep<BeatPicksStepData>(projectId, "research-beats"),
    ]).then(([p, picks]) => {
      if (!alive) return;
      if (!p) return setRoute({ id: projectId, kind: "missing" });
      const discipline = p.discipline ?? "educational";
      const trailer =
        discipline === "trailer" || (discipline === "free" && picks?.mode === "beats");
      setRoute(
        trailer
          ? { id: projectId, kind: "trailer", discipline, title: p.title }
          : { id: projectId, kind: "explainer" },
      );
    });
    return () => { alive = false; };
  }, [projectId]);

  if (current === null)
    return <p className="font-jetbrains text-label text-white/35">opening the project…</p>;
  if (current.kind === "missing")
    return (
      <p className="font-jetbrains text-label text-amber-200/85" data-testid="script-no-project">
        no project record for {projectId} — nothing to write against
      </p>
    );
  if (current.kind === "trailer")
    return <TrailerScript projectId={projectId} discipline={current.discipline} title={current.title} />;
  return <ExplainerScript projectId={projectId} />;
}

/** The explainer half, exactly as it was — every tab and testid intact. */
function ExplainerScript({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<Tab>("candidates");
  const [showing, setShowing] = useState<"baseline" | "candidate">("candidate");
  const [researched, setResearched] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // ADOPTION IS A RECORD NOW, not a useState. It used to be per-mount local
  // state that persisted nothing — "adopt this one" was forgotten on reload and
  // never reached the Frames step, which hardcoded RENDERS[0] (frames.ts:300
  // documented the missing record). Both faces of the Candidates tab read and
  // write THIS hook, so the duel and the expert columns cannot disagree about
  // what was adopted; Frames resolves the same record through
  // candidates/adoption.ts.
  const adoption = useAdoption(projectId);

  // The same scope record the triage board writes, and the project's own note
  // and version history.
  const scope = useScope(projectId);
  const versions = useVersions(projectId, { cards: scope.cards, scope: scope.scope });

  // Guided duel or expert columns — the stored choice, else a computed default
  // (guided only while nothing has been decided on this step; the inputs are
  // the decisions themselves, see useScriptFace for why not record-existence).
  const face = useScriptFace(projectId, {
    hasVersionWork: versions.accepted.length > 0 || versions.notes.length > 0,
    hasAdoption: adoption.everWritten,
    // The default latches once BOTH inputs describe what is on disk — before
    // that, "no decisions" is merely "not read yet".
    settled: versions.hydrated && adoption.hydrated,
  });

  useEffect(() => {
    let alive = true;
    void loadStep(projectId, "research").then((saved) => {
      if (alive) setResearched(!!saved?.researched);
    });
    return () => { alive = false; };
  }, [projectId]);

  // WHICH SCRIPT THE CANDIDATES TAB IS ABOUT: the staged candidate if there is
  // one, otherwise the accepted version of record — and the chain it replaced,
  // so the two can be read against each other rather than one at a time.
  const reading: Version | null =
    versions.candidate ?? (versions.baseline.basedOn ? versions.baseline : null);
  const replaced: Version | null = versions.candidate
    ? versions.baseline
    : versions.accepted[versions.accepted.length - 2] ?? null;

  const chains = useMemo(
    () => Object.fromEntries(RENDERS.map((r) => [r.id, chainOf(reading, r.id)])),
    [reading],
  );
  // The gate, re-run over what is on screen. `runGate` had exactly one caller
  // before this and it read a fixture, which is why an accepted recalibration
  // used to inherit a verdict about the script it replaced.
  //
  // Computed ONCE and threaded — to the note under the chains and, through
  // StickyNotebook, to the accept button on every tab. A verdict that lives
  // three tabs from the button is a verdict nobody reads before deciding, and a
  // second `gateChains` call beside the button would be a second answer waiting
  // to disagree with this one. When a candidate is staged `reading` IS that
  // candidate, so this is the verdict on the chain about to be accepted.
  const gate = useMemo(() => gateChains(chains, { conclusions: CONCLUSIONS }), [chains]);

  if (researched === null)
    return <p className="font-jetbrains text-content text-white/35">opening the project’s research…</p>;

  if (!researched)
    return (
      <Notice severity="info" title="no notebook for this project yet">
        <p>
          The Script step writes against research, it does not produce it. Run Step 1 — or load the
          saved Bitcoin run there — and three candidate scripts appear here.
        </p>
      </Notice>
    );

  const weighing = tab === "coverage" || tab === "spend";
  const comparing = weighing && !!versions.candidate && showing === "candidate";
  const shown = comparing ? versions.candidate! : versions.baseline;
  // Adoption and face are in the gate for the same reason scope is: rendering
  // the duel before its record lands would show "nothing adopted" over a
  // decision that is on disk, and the face default reads the adoption record.
  const ready = scope.hydrated && versions.hydrated && adoption.hydrated && face.hydrated;

  return (
    <div>
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
        <div className="min-w-0 grow">
          <p className="font-jetbrains text-content tracking-[0.14em] text-white/35 uppercase">written against</p>
          <p className="font-jetbrains mt-1 text-content text-white/60">
            {NOTEBOOK_COUNTS.facts} claims · {NOTEBOOK_COUNTS.loadBearing} load-bearing ·{" "}
            {NOTEBOOK_COUNTS.mechanisms} mechanisms · {NOTEBOOK_COUNTS.reversals} reversals ·{" "}
            <span className="text-amber-200">half-life {NOTEBOOK.currency.halfLife}</span>
          </p>
          <p className="mt-1.5 text-content leading-relaxed text-slate-400">
            tension strength — {NOTEBOOK.tension.strength}
          </p>
        </div>
        <p className="font-jetbrains shrink-0 text-content leading-snug text-white/30">
          the notebook and the evidence log
          <br />
          live in step 1
        </p>
      </section>

      {/* `aria-pressed` rather than a tablist: which of the four views you are in
          was carried by a cyan border and a tinted background and nothing else,
          so it did not exist for a reader without colour. Toggle-button state is
          the honest promise here — a `role="tab"` set would also promise arrow-key
          navigation and a roving tabindex, which these buttons do not implement. */}
      <div className="font-jetbrains mt-4 flex flex-wrap gap-2 text-label">
        {TABS.map((t) => (
          <button
            key={t.key}
            data-testid={`view-${t.key}`}
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl border px-3.5 py-2 text-left transition ${
              tab === t.key
                ? "border-cyan-400/40 bg-cyan-400/[0.07]"
                : "border-white/8 bg-white/[0.02] hover:border-white/20"
            }`}
          >
            <span className="block text-white/85">{t.label}</span>
            <span className="mt-0.5 block text-label text-white/35">{t.sub}</span>
          </button>
        ))}
      </div>

      {!ready ? (
        <p className="font-jetbrains mt-4 text-content text-white/35">loading this project’s scope…</p>
      ) : (
        <div className="mt-4">
          {weighing && (
            <div className="mb-3">
              <VersionBar api={versions} showing={showing} setShowing={setShowing} />
            </div>
          )}

          {/* ONE PAD ACROSS ALL FOUR TABS.
              It used to be mounted inside each tab's own branch, so switching
              tab unmounted the provider and took its state with it: the composer
              you had open on a track closed, and a pad you had collapsed sprang
              back open — every time you crossed from Coverage to the Spend bar
              to check what a note did. The pad is a fixed corner surface that
              belongs to the STEP, not to whichever grid happens to be under it,
              so it is mounted once and the tabs swap inside it. */}
          <StickyNotebook api={versions} gate={gate}>
            <>
              {tab === "candidates" && (
                <>
                  <BaselineOnlyNote
                    api={versions}
                    what="The beat chains below are the baseline."
                    showing={reading}
                    gate={reading ? gate : undefined}
                  />
                  {/* THE FACE SWITCH — one control, both directions, discards
                      nothing. It writes only the mode record; the chains, the
                      gate, the adoption and the beats modal are shared by both
                      faces, so switching is a change of lens, never of state. */}
                  <div className="mb-3 flex justify-end">
                    <button
                      type="button"
                      data-testid="script-face-switch"
                      onClick={() => face.set(face.face === "guided" ? "expert" : "guided")}
                      className="font-jetbrains rounded-full border border-white/12 px-3 py-1 text-label text-white/50 transition hover:border-cyan-400/40 hover:text-cyan-200"
                    >
                      {face.face === "guided" ? "full controls" : "guided"}
                    </button>
                  </div>
                  {face.face === "guided" ? (
                    <CandidatesDuel
                      renders={RENDERS}
                      chains={chains}
                      chainLabel={reading?.beats ? reading.label : undefined}
                      gate={gate}
                      adoptedId={adoption.adoptedId}
                      onAdopt={adoption.adopt}
                      onReadBeats={setExpanded}
                    />
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-3">
                      {RENDERS.map((r) => (
                        <HypothesisColumn
                          key={r.id}
                          render={r}
                          beats={chains[r.id]}
                          chainLabel={reading?.beats ? reading.label : undefined}
                          adopted={adoption.adoptedId === r.id}
                          onAdopt={() =>
                            adoption.adopt(adoption.adoptedId === r.id ? null : r.id)
                          }
                          expanded={expanded === r.id}
                          onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              {tab === "coverage" && (
                <MatrixCoverage api={scope} version={shown} baseline={versions.baseline} comparing={comparing} />
              )}

              {tab === "spend" && (
                <MatrixSpend api={scope} version={shown} baseline={versions.baseline} comparing={comparing} />
              )}

              {tab === "tracks" && (
                <>
                  <BaselineOnlyNote api={versions} what="Running order is shown for the baseline." />
                  <MatrixTracks api={scope} version={versions.baseline} />
                </>
              )}
            </>
          </StickyNotebook>
        </div>
      )}

      <Modal
        open={!!expanded}
        onClose={() => setExpanded(null)}
        title={
          expanded
            ? `${RENDER_BY_ID[expanded].engineLabel} · ${reading?.beats ? `${reading.label}'s chain` : "full beat chain"}`
            : ""
        }
        footer={expanded ? `${chains[expanded].length} beats · ${wordsIn(chains[expanded])} words` : ""}
      >
        {expanded && (
          <BeatList
            beats={chains[expanded]}
            against={reading?.beats ? chainOf(replaced, expanded) : undefined}
          />
        )}
      </Modal>
    </div>
  );
}
