"use client";

// THE ADS RESEARCH STEP — "Idea": the brief, then round 1.
//
// The brief card on top; under it AD_IDEA_COUNT ideas, each from a different
// angle, dealt on the card deck. The creator picks one, and that pick is what
// marks the project researched (./pick.ts) and what the Script step's round 2
// executes.
//
// THE LAW FROM CandidatesDuel, restated for this deck: nothing here ranks the
// cards. No score, no star, no "best" — "model rankings of creative ideas have
// been measured near chance against expert humans" (registry
// ad-concept-ideation). Each card shows its angle, its idea, its hook and its
// risk at equal prominence; the gate verdicts are words, one gesture away.

import { useCallback, useState } from "react";

import { Loader2, Sparkles } from "lucide-react";

import DeckCard, { type DeckCardSpec } from "@/components/ui/deck/DeckCard";
import DeckStage from "@/components/ui/deck/DeckStage";
import { Button } from "@/components/ui/Primitives";
import { Ghost, StaleBadge } from "@/components/ui/signal";
import { getProject, type Project } from "@/lib/projects";
import { useJobs } from "@/lib/jobs";
import {
  EMPTY_BRIEF,
  digestBrief,
  isAdTemplate,
  type AdBrief,
  type AdIdea,
  type AdsIdeasData,
} from "@/lib/ads/types";

import { ADS_BRIEF, ADS_IDEAS } from "../../_shared/records/ads";
import { useRecord } from "../../_shared/records/useRecord";
import { useLoadFor } from "../../_shared/useLoadFor";
import { usePhaseReport } from "../../_shared/usePhaseReport";
import Notice from "../../_shared/ui/Notice";
import BriefCard from "./BriefCard";
import { ANGLE_TONE, CHIP, ConceptCardBody, DepthLine, PreflightNote, Receipt, RunFailed } from "./parts";
import { ideasStale, pickIdea, pickStamp } from "./pick";
import { missingFields, newest, pickedIdea, preflight, startIdeas, useConceptRun, type Preflight } from "./run";

function IdeaFront({ idea }: { idea: AdIdea }) {
  return (
    <>
      <p className="font-hanken text-content leading-snug text-slate-300">
        <span className="font-jetbrains mr-2 text-label tracking-[0.1em] text-white/45 uppercase">opens</span>
        {idea.hook}
      </p>
      {typeof idea.needsTurn === "boolean" && (
        <div className="flex flex-wrap gap-1.5">
          <span className={`${CHIP} ${idea.needsTurn ? "border-amber-400/30 bg-amber-400/[0.06] text-amber-200" : "border-white/12 bg-white/[0.04] text-white/60"}`}>
            {idea.needsTurn ? "needs its turn · no 15s cut" : "cuts down to 15s"}
          </span>
        </div>
      )}
    </>
  );
}

function IdeaDepth({ idea }: { idea: AdIdea }) {
  return (
    <>
      <DepthLine k="twist">{idea.twist}</DepthLine>
      <DepthLine k="why it works">{idea.whyItWorks}</DepthLine>
      {idea.pictureClaim && <DepthLine k="picture claims">{idea.pictureClaim}</DepthLine>}
      {idea.gateNotes && idea.gateNotes.length > 0 && (
        <ul className="font-jetbrains space-y-1 text-label leading-snug text-white/60" aria-label="gate verdicts">
          {idea.gateNotes.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function AdsIdea({ projectId }: { projectId: string }) {
  const jobs = useJobs();

  const [project, setProject] = useState<Project | null>(null);
  const projectRead = useLoadFor(projectId, (id) => getProject(id), (p) => setProject(p ?? null));

  const [brief, setBrief] = useState<AdBrief>(EMPTY_BRIEF);
  const briefRec = useRecord(ADS_BRIEF, projectId, (d) => setBrief(d?.brief ?? EMPTY_BRIEF));

  const [saved, setSaved] = useState<AdsIdeasData | null>(null);
  const ideasRec = useRecord(ADS_IDEAS, projectId, (d) => setSaved(d ?? null));

  const [pf, setPf] = useState<Preflight | null | undefined>(undefined);
  useLoadFor("ideas", () => preflight("ideas"), (p) => setPf(p));

  const run = useConceptRun(projectId, "ideas");
  const ideas = newest(saved, run);
  const picked = pickedIdea(ideas);
  const digest = digestBrief(brief);
  const stale = ideasStale(ideas, digest);
  const missing = missingFields(brief);
  const running = run.status === "running";
  const hydrated = projectRead && briefRec.hydrated && ideasRec.hydrated;

  const briefTouched = Object.entries(brief).some(([, v]) => (Array.isArray(v) ? v.length > 0 : v.trim() !== ""));
  usePhaseReport(
    projectId,
    "research",
    !hydrated ? null : picked ? "done" : ideas?.options.length || briefTouched ? "working" : null,
  );

  const { patch: patchBrief } = briefRec;
  const commitBrief = useCallback(
    (b: AdBrief) => void patchBrief((cur) => ({ ...cur, brief: b, savedAt: Date.now() })),
    [patchBrief],
  );

  const template = project && isAdTemplate(project.template) ? project.template : null;

  const generate = () => {
    if (!template || !project || missing.length || running) return;
    commitBrief(brief);
    const j = jobs.start("ad-ideas", projectId, brief.product, { driven: true });
    if (!j) return;
    const settle = jobs.settle;
    const started = startIdeas(projectId, { brief, template, targetS: project.targetS }, (outcome, detail) =>
      settle(j.id, outcome, detail),
    );
    if (!started) jobs.cancel(j.id);
  };

  const onPick = (id: string | null) => {
    if (!id || !ideas) return;
    const at = pickStamp();
    // On screen first, then merged onto disk truth (./pick.ts).
    setSaved({ ...ideas, pickedId: id, savedAt: at });
    void pickIdea(projectId, id, at);
  };

  if (!hydrated) return <Ghost shape="card" count={2} label="reading the brief" />;
  if (!template)
    return (
      <Notice severity="error" title="not an ads template">
        <p>{project ? `${project.template} — ${projectId}` : `no project record for ${projectId}`}</p>
      </Notice>
    );

  const cards: DeckCardSpec[] = (ideas?.options ?? []).map((o) => ({
    id: o.id,
    density: "dense",
    eyebrow: o.angle,
    title: o.title,
    art: { kind: "gradient", tone: ANGLE_TONE[o.angle] ?? "" },
  }));
  const byId = new Map((ideas?.options ?? []).map((o) => [o.id, o]));
  const hasSet = cards.length > 0;

  return (
    <div className="space-y-6" data-testid="ads-idea">
      <BriefCard brief={brief} onChange={setBrief} onCommit={commitBrief} />

      <section className="space-y-4" aria-labelledby="ads-ideas-h">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="ads-ideas-h" className="font-instrument text-2xl text-slate-100">
            Ideas
          </h2>
          {stale && <StaleBadge words="brief changed" why="these ideas answer an earlier brief" />}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {missing.length > 0 ? (
              <span className="font-jetbrains text-label text-amber-200/85" data-testid="ideas-missing">
                needs {missing.join(" · ")}
              </span>
            ) : (
              !running && <PreflightNote pf={pf} />
            )}
            <Button
              data-testid="ideas-generate"
              disabled={missing.length > 0 || running || pf?.serving === null}
              onClick={generate}
              className="inline-flex items-center gap-2"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {running ? "generating" : hasSet ? "Regenerate" : "Generate ideas"}
            </Button>
          </div>
        </div>

        {run.status === "failed" && <RunFailed failure={run} />}

        {hasSet && (
          <div className="flex flex-wrap items-center gap-3">
            {ideas?.options[0]?.truth && (
              <p className="font-hanken text-content text-slate-300" data-testid="ideas-truth">
                <span className="font-jetbrains mr-2 text-label tracking-[0.1em] text-white/45 uppercase">truth</span>
                {ideas.options[0].truth}
              </p>
            )}
            <span className="ml-auto">
              <Receipt engine={ideas?.engine ?? null} />
            </span>
          </div>
        )}

        {hasSet ? (
          <DeckStage
            cards={cards}
            pickedId={ideas?.pickedId ?? null}
            onPick={onPick}
            noUnpick
            renderCard={({ spec, picked: isPicked, dealDelay }) => {
              const idea = byId.get(spec.id)!;
              return (
                <DeckCard spec={spec} picked={isPicked} onPick={onPick} dealDelay={dealDelay} noUnpick>
                  <ConceptCardBody
                    id={idea.id}
                    eyebrow={idea.angle}
                    title={idea.title}
                    front={<IdeaFront idea={idea} />}
                    risk={idea.risk}
                    picked={isPicked}
                    detail={<IdeaDepth idea={idea} />}
                  />
                </DeckCard>
              );
            }}
          />
        ) : (
          <Ghost shape="card" count={3} label={running ? "generating ideas" : "no ideas yet"} />
        )}
      </section>
    </div>
  );
}
