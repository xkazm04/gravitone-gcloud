"use client";

// THE ADS SCORE STEP — one music bed under the whole ad, end-card included.
//
// An ad has no spotting session to propose cues from: the picked scenario IS
// the picture, start to finish, so there is exactly one cue and its span is the
// scenario's runtime plus the end-card hold. Everything after the brief is the
// standard Score machinery, reused rather than forked: the request goes through
// useCueTakes → /api/sound/generate (op "cue", plan derived server-side), and
// the takes, verdicts, section revisions and lab adoptions are CueTakes, drawn
// over this step's own record (./record.ts) instead of a spot in useSpots.
//
// Drawn, not narrated: the bed is a strip of the scenario's shots at their own
// widths with the end-card hatched at the end; the tempo is an empty box until a
// human types one (nothing upstream states a tempo — CueSpot.bpm's rule); the
// price sits on the render button before the click.

import { useCallback, useEffect, useMemo, useState } from "react";

import { Loader2, Music2 } from "lucide-react";

import { Ghost, Hint, StaleBadge, Tally, UpstreamBreak } from "@/components/ui/signal";
import { useAnnounce } from "@/lib/announcer";
import { ABSENCE_REASON, capabilities } from "@/lib/capabilities";
import { getProject, type Project } from "@/lib/projects";
import { costLabel, perSecondPrice } from "@/lib/musicClient";
import type { MusicQuote } from "@/lib/music/pricing";
import type { AdsBriefData, AdsFinishData, AdsScenariosData } from "@/lib/ads/types";

import { ADS_BRIEF, ADS_FINISH, ADS_SCENARIOS } from "../../_shared/records/ads";
import { useRecord } from "../../_shared/records/useRecord";
import { useLoadFor } from "../../_shared/useLoadFor";
import { usePhaseReport } from "../../_shared/usePhaseReport";
import Notice from "../../_shared/ui/Notice";
import CueTakes from "../CueTakes";
import { bindTake } from "../takes";
import { useCueTakes } from "../useCueTakes";

import { BPM_RANGE, DEFAULT_HOLD_S, adBedIntent, adBedRequest, bedRuntimeS, bedSpot, fromSpot } from "./bed";
import { ADS_SCORE, EMPTY_ADS_SCORE, type AdsScoreData } from "./record";

const HATCH = "repeating-linear-gradient(45deg, currentColor 0 2px, transparent 2px 6px)";
const s1 = (n: number) => `${Math.round(n * 10) / 10}s`;

export default function AdsScore({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [brief, setBrief] = useState<AdsBriefData | null>(null);
  const [scenarios, setScenarios] = useState<AdsScenariosData | null>(null);
  const [finish, setFinish] = useState<AdsFinishData | null>(null);
  const [rec, setRec] = useState<AdsScoreData>(EMPTY_ADS_SCORE);

  const projectRead = useLoadFor(projectId, (id) => getProject(id), (p) => setProject(p ?? null));
  const briefRead = useRecord(ADS_BRIEF, projectId, (d) => setBrief(d ?? null));
  const scenariosRead = useRecord(ADS_SCENARIOS, projectId, (d) => setScenarios(d ?? null));
  const finishRead = useRecord(ADS_FINISH, projectId, (d) => setFinish(d ?? null));
  const scoreRead = useRecord(ADS_SCORE, projectId, (d) => setRec(d ?? EMPTY_ADS_SCORE));
  const { patch } = scoreRead;

  /** One delta, applied to what is on screen and merged onto disk truth. */
  const update = useCallback(
    (fn: (r: AdsScoreData) => AdsScoreData) => {
      setRec((r) => fn(r));
      void patch((cur) => ({ ...fn(cur ?? EMPTY_ADS_SCORE), savedAt: Date.now() }));
    },
    [patch],
  );

  const caps = capabilities();
  const store = useCueTakes(caps.musicSectionEdit);

  const [price, setPrice] = useState<MusicQuote | "unknown" | null>(null);
  useEffect(() => {
    let live = true;
    perSecondPrice()
      .then((q) => live && setPrice(q))
      .catch(() => live && setPrice("unknown"));
    return () => {
      live = false;
    };
  }, []);

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [bpmDraft, setBpmDraft] = useState<string | null>(null);
  // Failures reach a screen reader through the one announcer (lib/announcer.tsx),
  // keyed per event so a repeated error is announced again.
  const announce = useAnnounce();
  const [failures, setFailures] = useState(0);

  const scenario = useMemo(
    () => scenarios?.options.find((o) => o.id === scenarios.pickedId) ?? null,
    [scenarios],
  );
  const holdS = finish?.endCard.holdS ?? DEFAULT_HOLD_S;

  const reported = !scenario ? null : rec.activeTakeId ? "done" : rec.takeIds.length || rec.bpm !== null ? "working" : null;
  usePhaseReport(projectId, "score", reported);

  if (!projectRead || !briefRead.hydrated || !scenariosRead.hydrated || !finishRead.hydrated || !scoreRead.hydrated)
    return <Ghost shape="card" label="reading the ad" />;

  if (!scenario)
    return (
      <UpstreamBreak
        blockedAt="script"
        current="score"
        done={["research"]}
        action={{ label: "Pick a scenario", href: `/studio/${projectId}?step=script` }}
      />
    );

  if (!caps.musicSectionEdit)
    return (
      <Notice severity="warning" title="no sound store here">
        <p>{ABSENCE_REASON.musicSectionEdit}</p>
      </Notice>
    );

  const runtimeS = bedRuntimeS(scenario, holdS);
  const spot = bedSpot(rec, scenario);
  const stale = rec.scenarioId !== null && rec.scenarioId !== scenario.id && rec.takeIds.length > 0;
  const request = adBedRequest({
    scenario,
    brief: brief?.brief ?? null,
    projectTitle: project?.title ?? "",
    projectId,
    holdS,
    bpm: rec.bpm,
  });
  const estimate = costLabel(price, Math.round(runtimeS));

  async function render() {
    if (!request || busy || !scenario) return;
    setBusy(true);
    setFailure(null);
    const r = await store.generate(`ad-bed-${projectId}`, request);
    setBusy(false);
    if (!r.ok) {
      setFailure(r.error);
      setFailures((n) => n + 1);
      announce({ key: `ads-bed-render:${failures + 1}`, text: r.error });
      return;
    }
    const scenarioId = scenario.id;
    update((cur) => ({ ...fromSpot(cur, bindTake(bedSpot(cur, scenario), r.take.id)), scenarioId }));
  }

  function commitBpm(raw: string) {
    setBpmDraft(null);
    const n = raw.trim() === "" ? null : Math.round(Number(raw));
    if (n !== null && (!Number.isFinite(n) || n < BPM_RANGE[0] || n > BPM_RANGE[1])) return;
    update((cur) => ({ ...cur, bpm: n }));
  }

  const bpmShown = bpmDraft ?? (rec.bpm === null ? "" : String(rec.bpm));

  return (
    <section data-testid="ads-score" className="space-y-4" aria-label="music bed">
      <div className="flex flex-wrap items-center gap-2">
        <Tally label="seconds" value={Math.round(runtimeS * 10) / 10} tone="cyan" />
        <Tally label="shots" value={scenario.shots.length} tone="neutral" />
        {stale && <StaleBadge words="other scenario" why="These takes were scored against a scenario no longer picked." />}
      </div>

      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Music2 className="h-4 w-4 self-center text-cyan-300/80" aria-hidden />
          <h3 className="font-jetbrains text-content text-white/85">{scenario.title}</h3>
          <span className="text-content text-white/60">{adBedIntent(scenario, brief?.brief ?? null)}</span>
        </div>

        {/* The bed's span: each shot at its own width, the end-card hatched. */}
        <div
          className="mt-3 flex h-8 overflow-hidden rounded-md border border-white/10"
          role="img"
          aria-label={`${scenario.shots.length} shots, ${s1(runtimeS - holdS)}, then the end-card for ${s1(holdS)}`}
        >
          {scenario.shots.map((shot, i) => (
            <div
              key={shot.id}
              style={{ width: `${(shot.durationS / runtimeS) * 100}%` }}
              className="font-jetbrains flex items-center truncate border-r border-white/10 bg-cyan-400/[0.07] px-1.5 text-label text-cyan-100/70"
            >
              {i + 1} · {s1(shot.durationS)}
            </div>
          ))}
          <div
            style={{ width: `${(holdS / runtimeS) * 100}%` }}
            className="relative flex items-center truncate px-1.5 text-label text-amber-200/70"
          >
            <span aria-hidden className="absolute inset-0 opacity-25" style={{ backgroundImage: HATCH }} />
            <span className="font-jetbrains relative truncate">{scenario.endCard.cta}</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="font-jetbrains inline-flex items-center gap-1.5 text-label text-white/55">
            <input
              type="number"
              inputMode="numeric"
              min={BPM_RANGE[0]}
              max={BPM_RANGE[1]}
              value={bpmShown}
              onChange={(e) => setBpmDraft(e.target.value)}
              onBlur={(e) => commitBpm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commitBpm((e.target as HTMLInputElement).value)}
              aria-label="tempo, beats per minute"
              data-testid="ads-score-bpm"
              className="w-16 rounded-md border border-white/15 bg-transparent px-2 py-1 text-right text-label text-white/85 tabular-nums focus:border-cyan-300/50"
            />
            bpm
          </label>
          {rec.bpm === null && <Hint tone="amber">no tempo upstream — the bed waits for one</Hint>}

          <button
            type="button"
            onClick={() => void render()}
            disabled={!request || busy || !caps.musicGenerate}
            data-testid="ads-score-render"
            className="font-jetbrains inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-label text-cyan-100 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {rec.takeIds.length ? "render another" : "render"} · {estimate.text}
          </button>
          {estimate.title && <Hint>{estimate.title}</Hint>}
        </div>
        {!caps.musicGenerate && (
          <p className="mt-2 text-content leading-snug text-amber-200/80">{ABSENCE_REASON.musicGenerate}</p>
        )}

        {failure && (
          <p className="font-jetbrains mt-2 text-content leading-snug text-rose-200/85">
            {failure}
          </p>
        )}

        <CueTakes
          projectId={projectId}
          spot={spot}
          store={store}
          sectionEdit={caps.musicSectionEdit}
          onSpot={(fn) => update((cur) => fromSpot(cur, fn(bedSpot(cur, scenario))))}
        />
      </div>
    </section>
  );
}
