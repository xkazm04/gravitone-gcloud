"use client";

// THE ADS SCRIPT STEP — "Scenario": round 2.
//
// The idea picked in round 1, then AD_SCENARIO_COUNT timed shot lists that
// execute it, dealt on the card deck. Each card's front is its logline and its
// seconds, drawn (a strip of shots at their own widths, the end card hatched);
// its depth is the shot list itself — image, motion, super — verbatim, because
// those lines ARE the next two steps' prompts. The creator picks one; Frames
// generates from it.
//
// CandidatesDuel's law holds here as on the idea deck: nothing ranks the cards.
// A scenario whose shots run off the project's target says so in seconds on
// its own front — shown, never absorbed (timed-shot-list rule 5).

import { useState } from "react";

import { Loader2, Sparkles } from "lucide-react";

import DeckCard, { type DeckCardSpec } from "@/components/ui/deck/DeckCard";
import DeckStage from "@/components/ui/deck/DeckStage";
import { Button } from "@/components/ui/Primitives";
import { Ghost, StackBar, StaleBadge, UpstreamBreak } from "@/components/ui/signal";
import { getProject, type Project } from "@/lib/projects";
import { useJobs } from "@/lib/jobs";
import {
  AD_END_CARD_HOLD_S,
  isAdTemplate,
  scenarioRuntimeS,
  type AdIdea,
  type AdScenario,
  type AdsBriefData,
  type AdsIdeasData,
  type AdsScenariosData,
} from "@/lib/ads/types";

import { ADS_BRIEF, ADS_IDEAS, ADS_SCENARIOS } from "../../_shared/records/ads";
import { useRecord } from "../../_shared/records/useRecord";
import { useLoadFor } from "../../_shared/useLoadFor";
import { usePhaseReport } from "../../_shared/usePhaseReport";
import Notice from "../../_shared/ui/Notice";
import { ANGLE_TONE, ConceptCardBody, DepthLine, PreflightNote, Receipt, RunFailed } from "../../research/ads/parts";
import { pickScenario, pickStamp, scenariosStale } from "../../research/ads/pick";
import {
  missingFields,
  newest,
  pickedIdea,
  preflight,
  startScenarios,
  useConceptRun,
  type Preflight,
} from "../../research/ads/run";

const s1 = (n: number) => `${Math.round(n * 10) / 10}s`;

function ScenarioFront({ scenario, targetS }: { scenario: AdScenario; targetS: number }) {
  const total = Math.round((scenarioRuntimeS(scenario) + AD_END_CARD_HOLD_S) * 10) / 10;
  const off = Math.round((total - targetS) * 10) / 10;
  return (
    <>
      <p className="font-hanken text-content leading-snug text-slate-300">{scenario.logline}</p>
      <StackBar
        showCounts={false}
        label={`${scenario.title} — shot seconds`}
        segments={[
          ...scenario.shots.map((s, i) => ({
            n: s.durationS,
            tone: i % 2 === 0 ? ("cyan" as const) : ("neutral" as const),
            label: `shot ${i + 1} · ${s1(s.durationS)}`,
          })),
          { n: AD_END_CARD_HOLD_S, tone: "neutral" as const, label: `end card · ${s1(AD_END_CARD_HOLD_S)}`, hatched: true },
        ]}
      />
      <p
        data-testid={`scenario-runtime-${scenario.id}`}
        className={`font-jetbrains text-label ${off === 0 ? "text-white/55" : "text-amber-200/85"}`}
      >
        {s1(total)}
        {off !== 0 && ` · ${off > 0 ? "+" : ""}${s1(off)} vs ${s1(targetS)}`}
      </p>
    </>
  );
}

function ScenarioDepth({ scenario }: { scenario: AdScenario }) {
  return (
    <>
      <ol className="space-y-3" aria-label="shot list">
        {scenario.shots.map((s, i) => (
          <li key={s.id} className="space-y-1">
            <p className="font-jetbrains text-label tracking-[0.1em] text-cyan-200/80 uppercase">
              shot {i + 1} · {s1(s.durationS)}
            </p>
            <DepthLine k="image">{s.image}</DepthLine>
            <DepthLine k="motion">{s.motion}</DepthLine>
            {s.super && <DepthLine k="super">{s.super}</DepthLine>}
          </li>
        ))}
      </ol>
      <DepthLine k="music">{scenario.musicMood}</DepthLine>
      <DepthLine k="end card">
        {scenario.endCard.line ? `${scenario.endCard.line} · ` : ""}
        {scenario.endCard.cta}
      </DepthLine>
    </>
  );
}

/** The idea this round executes, as one line of work. */
function IdeaLine({ idea }: { idea: AdIdea }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" data-testid="scenario-idea">
      <span className="font-jetbrains text-label tracking-[0.16em] text-white/50 uppercase">{idea.angle}</span>
      <span className="font-hanken text-lg font-semibold text-slate-100">{idea.title}</span>
      <span className="font-hanken text-content text-slate-400">{idea.hook}</span>
    </div>
  );
}

export default function AdsScenario({ projectId }: { projectId: string }) {
  const jobs = useJobs();

  const [project, setProject] = useState<Project | null>(null);
  const projectRead = useLoadFor(projectId, (id) => getProject(id), (p) => setProject(p ?? null));
  const [brief, setBrief] = useState<AdsBriefData | null>(null);
  const briefRec = useRecord(ADS_BRIEF, projectId, (d) => setBrief(d ?? null));
  const [ideas, setIdeas] = useState<AdsIdeasData | null>(null);
  const ideasRec = useRecord(ADS_IDEAS, projectId, (d) => setIdeas(d ?? null));
  const [saved, setSaved] = useState<AdsScenariosData | null>(null);
  const scenariosRec = useRecord(ADS_SCENARIOS, projectId, (d) => setSaved(d ?? null));

  const [pf, setPf] = useState<Preflight | null | undefined>(undefined);
  useLoadFor("scenarios", () => preflight("scenarios"), (p) => setPf(p));

  const run = useConceptRun(projectId, "scenarios");
  const scenarios = newest(saved, run);
  const idea = pickedIdea(ideas);
  const stale = scenariosStale(scenarios, idea?.id ?? null);
  const picked = scenarios?.options.find((o) => o.id === scenarios.pickedId) ?? null;
  const running = run.status === "running";
  const hydrated = projectRead && briefRec.hydrated && ideasRec.hydrated && scenariosRec.hydrated;

  usePhaseReport(
    projectId,
    "script",
    !hydrated || !idea ? null : picked && !stale ? "done" : scenarios?.options.length ? "working" : null,
  );

  if (!hydrated) return <Ghost shape="card" count={2} label="reading the idea" />;

  const template = project && isAdTemplate(project.template) ? project.template : null;
  if (!template || !project)
    return (
      <Notice severity="error" title="not an ads template">
        <p>{project ? `${project.template} — ${projectId}` : `no project record for ${projectId}`}</p>
      </Notice>
    );

  if (!idea)
    return (
      <UpstreamBreak
        blockedAt="research"
        current="script"
        done={[]}
        action={{ label: "Pick an idea", href: `/studio/${projectId}?step=research` }}
      />
    );

  const b = brief?.brief ?? null;
  const missing = b ? missingFields(b) : ["product", "proposition", "cta"];

  const generate = () => {
    if (!b || missing.length || running) return;
    const j = jobs.start("ad-scenarios", projectId, idea.title, { driven: true });
    if (!j) return;
    const settle = jobs.settle;
    const started = startScenarios(projectId, { brief: b, template, targetS: project.targetS, idea }, (outcome, detail) =>
      settle(j.id, outcome, detail),
    );
    if (!started) jobs.cancel(j.id);
  };

  const onPick = (id: string | null) => {
    if (!id || !scenarios) return;
    const at = pickStamp();
    setSaved({ ...scenarios, pickedId: id, savedAt: at });
    void pickScenario(projectId, id, at);
  };

  const options = scenarios?.options ?? [];
  const cards: DeckCardSpec[] = options.map((o) => ({
    id: o.id,
    density: "dense",
    eyebrow: `${o.shots.length} shots`,
    title: o.title,
    art: { kind: "gradient", tone: ANGLE_TONE[idea.angle] ?? "" },
  }));
  const byId = new Map(options.map((o) => [o.id, o]));

  return (
    <div className="space-y-6" data-testid="ads-scenario">
      <IdeaLine idea={idea} />

      <section className="space-y-4" aria-labelledby="ads-scenarios-h">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="ads-scenarios-h" className="font-instrument text-2xl text-slate-100">
            Scenarios
          </h2>
          {stale && <StaleBadge words="idea changed" why="these scenarios execute an earlier pick" />}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {missing.length > 0 ? (
              <span className="font-jetbrains text-label text-amber-200/85">brief needs {missing.join(" · ")}</span>
            ) : (
              !running && <PreflightNote pf={pf} />
            )}
            <Button
              data-testid="scenarios-generate"
              disabled={missing.length > 0 || running || pf?.serving === null}
              onClick={generate}
              className="inline-flex items-center gap-2"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {running ? "generating" : options.length ? "Regenerate" : "Generate scenarios"}
            </Button>
          </div>
        </div>

        {run.status === "failed" && <RunFailed failure={run} />}

        {options.length > 0 && (
          <div className="flex justify-end">
            <Receipt engine={scenarios?.engine ?? null} />
          </div>
        )}

        {options.length > 0 ? (
          <DeckStage
            cards={cards}
            pickedId={scenarios?.pickedId ?? null}
            onPick={onPick}
            noUnpick
            renderCard={({ spec, picked: isPicked, dealDelay }) => {
              const sc = byId.get(spec.id)!;
              return (
                <DeckCard spec={spec} picked={isPicked} onPick={onPick} dealDelay={dealDelay} noUnpick>
                  <ConceptCardBody
                    id={sc.id}
                    eyebrow={`${sc.shots.length} shots`}
                    title={sc.title}
                    front={<ScenarioFront scenario={sc} targetS={project.targetS} />}
                    picked={isPicked}
                    detail={<ScenarioDepth scenario={sc} />}
                  />
                </DeckCard>
              );
            }}
          />
        ) : (
          <Ghost shape="card" count={3} label={running ? "generating scenarios" : "no scenarios yet"} />
        )}
      </section>
    </div>
  );
}
