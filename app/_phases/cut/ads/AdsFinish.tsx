"use client";

// THE ADS FINISH STEP — supers, the end-card, the aspects, the render.
//
// Owns ADS_FINISH. Until the creator edits anything, the record is not written:
// what is on screen is the SEED — the scenario's supers and end-card, the
// brief's CTA as a fallback, the template's native aspect (./finish.ts
// seedFinish) — and the first edit writes the seed with that edit applied.
// Writing the seed on open would freeze a scenario re-picked upstream out of it.
//
// Text is drawn by the render (lib/adRender.ts), never generated: a super is a
// line of the creator's text over a shot's span, the end-card a plate with the
// CTA, an optional line and an optional logo. The checks are ./finish.ts's rows
// in finishLine.ts's vocabulary; a failing blocking row disables Render.

import { useCallback, useMemo, useState } from "react";

import { Download, ImagePlus, Loader2, X } from "lucide-react";

import { CHIP_CLASS, Ghost, StaleBadge, TALLY_TONE, Tally, UpstreamBreak } from "@/components/ui/signal";
import { assetFromUpload, getAsset, getUploadBlobs, putUploads, readUploadPointer } from "@/lib/assets";
import { useElapsed, useJobs, type Job } from "@/lib/jobs";
import { getProject, templateOf, type Project } from "@/lib/projects";
import { useAuth } from "@/lib/useAuth";
import type { AdExportRef, AdsBriefData, AdsFinishData, AdsScenariosData, AdsShotsData } from "@/lib/ads/types";
import type { Aspect } from "@/lib/imaging/types";

import { ADS_BRIEF, ADS_FINISH, ADS_SCENARIOS, ADS_SHOTS } from "../../_shared/records/ads";
import { useRecord } from "../../_shared/records/useRecord";
import { useLoadFor } from "../../_shared/useLoadFor";
import { usePhaseReport } from "../../_shared/usePhaseReport";
import Notice from "../../_shared/ui/Notice";
import { ADS_SCORE, EMPTY_ADS_SCORE, type AdsScoreData } from "../../score/ads/record";
import type { Verdict } from "../finishLine";

import {
  AD_ASPECTS,
  AD_ASPECT_PX,
  adFinishChecks,
  adRenderRequest,
  cutRuntimeS,
  latestByAspect,
  seedFinish,
  shotRows,
  superFor,
  type AdFinishCheck,
  type AdRenderView,
} from "./finish";
import { adDownloadHref, useAdRenders } from "./useAdRenders";

const VERDICT: Record<Verdict, { word: string; cls: string }> = {
  pass: { word: "pass", cls: "border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-200" },
  fail: { word: "fail", cls: "border-rose-400/35 bg-rose-400/[0.08] text-rose-200" },
  unmeasured: { word: "—", cls: "border-dashed border-white/15 text-white/45" },
};

const FIELD =
  "font-jetbrains min-w-0 rounded-md border border-white/10 bg-transparent px-2 py-1 text-label text-white/85 focus:border-cyan-300/50";
const EYEBROW = "font-jetbrains text-label tracking-[0.14em] text-white/45 uppercase";
const s1 = (n: number) => `${Math.round(n * 10) / 10}s`;

/** A text field that holds its own draft and writes on blur / Enter — one
 *  record write per edit, not per keystroke. `key` it by the value it shows. */
function CommitInput({
  value,
  onCommit,
  label,
  placeholder,
  maxLength,
  className = "",
}: {
  value: string;
  onCommit: (v: string) => void;
  label: string;
  placeholder?: string;
  maxLength: number;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      aria-label={label}
      placeholder={placeholder}
      maxLength={maxLength}
      className={`${FIELD} ${className}`}
    />
  );
}

async function blobAsDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("the logo could not be read"));
    r.readAsDataURL(blob);
  });
}

/** The logo's bytes as the data URL the render takes, or null when gone. */
async function logoDataUrl(assetId: string): Promise<string | null> {
  const asset = await getAsset(assetId);
  const uploadId = asset ? readUploadPointer(asset.src) : null;
  if (!uploadId) return null;
  const blob = (await getUploadBlobs([uploadId])).get(uploadId);
  return blob ? blobAsDataUrl(blob) : null;
}

function Checks({ checks, projectId }: { checks: AdFinishCheck[]; projectId: string }) {
  const failing = checks.filter((c) => c.verdict === "fail").length;
  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4" aria-label="Finish line">
      <p className={`${EYEBROW} flex items-center justify-between`}>
        <span>finish line</span>
        <span className={failing ? "text-rose-300/90" : "text-emerald-300/90"}>{failing ? `${failing} open` : "clear"}</span>
      </p>
      <table className="mt-3 w-full border-collapse text-left">
        <caption className="sr-only">Checks between this ad and a render</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Check</th>
            <th scope="col">Value</th>
            <th scope="col">Target</th>
            <th scope="col">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.id} data-check={c.id} data-verdict={c.verdict} className="border-t border-white/6 align-top">
              <th scope="row" className="font-jetbrains w-full py-2 pr-2 text-left text-label font-normal tracking-[0.1em] text-white/55 uppercase">
                {c.owner ? (
                  <a href={`/studio/${projectId}?step=${c.owner}`} className="transition hover:text-white" aria-label={`${c.label} — open ${c.owner}`}>
                    {c.label}
                  </a>
                ) : (
                  c.label
                )}
                {c.deny && <span className="font-hanken block normal-case tracking-normal text-white/45">{c.deny}</span>}
              </th>
              <td className="font-jetbrains py-2 pr-2 text-right text-label whitespace-nowrap text-white tabular-nums">{c.value}</td>
              <td className="font-jetbrains py-2 pr-2 text-right text-label whitespace-nowrap text-white/40 tabular-nums">{c.target}</td>
              <td className="py-2 text-right">
                <span className={`font-jetbrains inline-block min-w-12 rounded border px-1.5 text-center text-label uppercase ${VERDICT[c.verdict].cls}`}>
                  {VERDICT[c.verdict].word}
                  {c.verdict === "unmeasured" && <span className="sr-only">unmeasured</span>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Elapsed({ job }: { job: Job }) {
  const clock = useElapsed(job);
  return <span className="font-jetbrains text-label text-cyan-200/70 tabular-nums">{clock}</span>;
}

function ExportState({ view, job }: { view: AdRenderView | "gone" | undefined; job: Job | undefined }) {
  if (view === undefined) return <Ghost shape="row" label="reading the render" className="w-40" />;
  if (view === "gone") return <StaleBadge words="gone" glyph="history" why="Not in this machine's ad exports." />;
  if (view.status === "queued" || view.status === "rendering")
    return (
      <span className="inline-flex items-center gap-1.5" role="status">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-200/70" aria-hidden />
        <span className="font-jetbrains text-label text-cyan-100/80">{view.status}</span>
        {job && <Elapsed job={job} />}
      </span>
    );
  if (view.status === "failed")
    return (
      <span role="alert" className="font-jetbrains text-label text-rose-200/85">
        {view.error ?? "failed"}
      </span>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {typeof view.durationS === "number" && <Tally label="seconds" value={Math.round(view.durationS * 10) / 10} tone="emerald" />}
      {view.loudness && <Tally label="LUFS" value={view.loudness.integratedLufs} tone="neutral" />}
      <a
        href={adDownloadHref(view.exportId)}
        download={`ad-${view.aspect.replace(":", "x")}-${view.exportId}.mp4`}
        data-testid={`ads-download-${view.aspect}`}
        className={`${CHIP_CLASS} ${TALLY_TONE.cyan} gap-1 hover:text-white`}
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        mp4
      </a>
    </span>
  );
}

export default function AdsFinish({ projectId }: { projectId: string }) {
  const jobs = useJobs();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [brief, setBrief] = useState<AdsBriefData | null>(null);
  const [scenarios, setScenarios] = useState<AdsScenariosData | null>(null);
  const [shots, setShots] = useState<AdsShotsData | null>(null);
  const [score, setScore] = useState<AdsScoreData>(EMPTY_ADS_SCORE);
  const [stored, setStored] = useState<AdsFinishData | null>(null);
  const [logoTrouble, setLogoTrouble] = useState<string | null>(null);

  const projectRead = useLoadFor(projectId, (id) => getProject(id), (p) => setProject(p ?? null));
  const briefRead = useRecord(ADS_BRIEF, projectId, (d) => setBrief(d ?? null));
  const scenariosRead = useRecord(ADS_SCENARIOS, projectId, (d) => setScenarios(d ?? null));
  const shotsRead = useRecord(ADS_SHOTS, projectId, (d) => setShots(d ?? null));
  const scoreRead = useRecord(ADS_SCORE, projectId, (d) => setScore(d ?? EMPTY_ADS_SCORE));
  const finishRead = useRecord(ADS_FINISH, projectId, (d) => setStored(d ?? null));
  const { patch } = finishRead;

  const scenario = useMemo(
    () => scenarios?.options.find((o) => o.id === scenarios.pickedId) ?? null,
    [scenarios],
  );
  const seed = useMemo(
    () => (scenario ? seedFinish(scenario, brief?.brief ?? null, project?.template ?? null) : null),
    [scenario, brief, project],
  );
  const finish = stored ?? seed;

  /** One edit: applied on screen, merged onto disk truth (or onto the seed when
   *  nothing is stored yet). */
  const update = useCallback(
    (fn: (f: AdsFinishData) => AdsFinishData) => {
      if (!seed) return;
      setStored((f) => fn(f ?? seed));
      void patch((cur) => ({ ...fn(cur ?? seed), savedAt: Date.now() }));
    },
    [patch, seed],
  );

  const onExport = useCallback(
    (ref: AdExportRef) => update((f) => ({ ...f, exports: [...f.exports, ref] })),
    [update],
  );
  const latest = useMemo(() => latestByAspect(finish?.exports ?? []), [finish?.exports]);
  const renders = useAdRenders(projectId, [...latest.values()], jobs, onExport);

  const rows = useMemo(() => (scenario ? shotRows(scenario, shots) : []), [scenario, shots]);
  const doneViews = [...latest.values()]
    .map((e) => renders.views[e.exportId])
    .filter((v): v is AdRenderView => v !== undefined && v !== "gone" && v.status === "done")
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));

  usePhaseReport(projectId, "cut", doneViews.length ? "done" : stored?.exports.length ? "working" : null);

  const hydrated =
    projectRead && briefRead.hydrated && scenariosRead.hydrated && shotsRead.hydrated && scoreRead.hydrated && finishRead.hydrated;
  if (!hydrated) return <Ghost shape="card" label="reading the ad" />;

  if (!scenario || !finish)
    return (
      <UpstreamBreak
        blockedAt="script"
        current="cut"
        done={["research"]}
        action={{ label: "Pick a scenario", href: `/studio/${projectId}?step=script` }}
      />
    );

  if (!rows.some((r) => r.clipId))
    return (
      <UpstreamBreak
        blockedAt="frames"
        current="cut"
        done={["research", "script"]}
        action={{ label: "Adopt clips", href: `/studio/${projectId}?step=frames` }}
      />
    );

  const range = project ? templateOf(project.template).range : null;
  const musicTakeId = score.activeTakeId;
  const checks = adFinishChecks({ rows, finish, range, musicTakeId, rendered: doneViews[0] ?? null });
  const blocked = checks.some((c) => c.blocks && c.verdict === "fail");
  const runtime = cutRuntimeS(rows, finish.endCard.holdS);

  async function renderAspect(aspect: Aspect) {
    if (!finish) return;
    let logo: string | null = null;
    if (finish.endCard.logoAssetId) {
      logo = await logoDataUrl(finish.endCard.logoAssetId).catch(() => null);
      if (!logo) {
        setLogoTrouble("The logo's bytes are gone from this browser's storage — upload it again.");
        return;
      }
    }
    const req = adRenderRequest({ projectId, aspect, rows, finish, logo, musicTakeId });
    if (req) await renders.start(req);
  }

  async function uploadLogo(file: File) {
    setLogoTrouble(null);
    if (!user?.uid) return setLogoTrouble("Sign in to keep a logo.");
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setLogoTrouble(`${file.name}: PNG or JPEG only.`);
    if (file.size > 2 * 1024 * 1024) return setLogoTrouble(`${file.name}: larger than 2 MB.`);
    const pair = assetFromUpload(user.uid, file, ["ads", "logo"], "image");
    try {
      await putUploads([pair]);
    } catch (e) {
      return setLogoTrouble(e instanceof Error ? e.message : String(e));
    }
    update((f) => ({ ...f, endCard: { ...f.endCard, logoAssetId: pair.asset.id } }));
  }

  const runningFor = (aspect: Aspect) =>
    jobs.runningFor(projectId, "ad-render").find((j) => j.label.endsWith(`· ${aspect}`));

  return (
    <div data-testid="ads-finish" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_25rem]">
      <div className="min-w-0 space-y-4">
        {/* SHOTS — the adopted clip, the trim, the super. */}
        <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4" aria-label="shots">
          <div className="flex flex-wrap items-center gap-2">
            <span className={EYEBROW}>shots</span>
            <Tally label="seconds" value={Math.round(runtime * 10) / 10} tone="cyan" />
          </div>
          <ol className="mt-3 space-y-2">
            {rows.map((r) => {
              const sup = superFor(finish, r.spec);
              return (
                <li key={r.spec.id} data-testid={`ads-shot-${r.index + 1}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/8 px-2.5 py-1.5">
                  <span className="font-jetbrains w-6 text-label text-white/45">{r.index + 1}</span>
                  {r.clipId ? (
                    <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>
                      {r.clip?.model ?? "clip"} · {s1(r.trimS ?? r.spec.durationS)}
                      {r.clip && r.clip.durationS > (r.trimS ?? 0) + 0.05 && <span className="text-white/40"> / {s1(r.clip.durationS)}</span>}
                    </span>
                  ) : (
                    <span className={`${CHIP_CLASS} ${TALLY_TONE.rose}`}>no clip</span>
                  )}
                  <CommitInput
                    key={`${r.spec.id}:${sup ?? ""}`}
                    value={sup ?? ""}
                    onCommit={(v) => update((f) => ({ ...f, supers: { ...f.supers, [r.spec.id]: v.trim() ? v.trim() : null } }))}
                    label={`super for shot ${r.index + 1}`}
                    placeholder="no super"
                    maxLength={120}
                    className="flex-1"
                  />
                </li>
              );
            })}
          </ol>
        </section>

        {/* END-CARD */}
        <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4" aria-label="end-card">
          <span className={EYEBROW}>end-card</span>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <CommitInput
              key={`cta:${finish.endCard.cta}`}
              value={finish.endCard.cta}
              onCommit={(v) => update((f) => ({ ...f, endCard: { ...f.endCard, cta: v.trim() } }))}
              label="call to action"
              placeholder="call to action"
              maxLength={80}
            />
            <CommitInput
              key={`line:${finish.endCard.line ?? ""}`}
              value={finish.endCard.line ?? ""}
              onCommit={(v) => update((f) => ({ ...f, endCard: { ...f.endCard, line: v.trim() ? v.trim() : null } }))}
              label="line above the call to action"
              placeholder="no line"
              maxLength={140}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="font-jetbrains inline-flex items-center gap-1.5 text-label text-white/55">
              <input
                type="number"
                min={0.5}
                max={10}
                step={0.5}
                value={finish.endCard.holdS}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0.5 && n <= 10) update((f) => ({ ...f, endCard: { ...f.endCard, holdS: n } }));
                }}
                aria-label="end-card hold, seconds"
                className={`${FIELD} w-16 text-right tabular-nums`}
              />
              s hold
            </label>
            {finish.endCard.logoAssetId ? (
              <span className={`${CHIP_CLASS} ${TALLY_TONE.emerald} gap-1`}>
                logo
                <button
                  type="button"
                  onClick={() => update((f) => ({ ...f, endCard: { ...f.endCard, logoAssetId: null } }))}
                  aria-label="remove the logo"
                  className="hover:text-white"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            ) : (
              <label className={`${CHIP_CLASS} ${TALLY_TONE.neutral} cursor-pointer gap-1 hover:text-white/90`}>
                <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                logo
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  aria-label="upload a logo, PNG or JPEG"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void uploadLogo(file);
                  }}
                />
              </label>
            )}
          </div>
          {logoTrouble && <p className="font-jetbrains mt-2 text-label text-amber-200/85">{logoTrouble}</p>}
        </section>

        {/* ASPECTS — one render each. */}
        <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4" aria-label="exports">
          <span className={EYEBROW}>exports</span>
          <ul className="mt-3 space-y-2">
            {AD_ASPECTS.map((aspect) => {
              const on = finish.aspects.includes(aspect);
              const ref = latest.get(aspect);
              const view = ref ? renders.views[ref.exportId] : undefined;
              const inFlight = renders.starting === aspect || (view !== undefined && view !== "gone" && (view.status === "queued" || view.status === "rendering"));
              return (
                <li key={aspect} className="flex flex-wrap items-center gap-2" data-testid={`ads-aspect-${aspect}`}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      update((f) => ({ ...f, aspects: on ? f.aspects.filter((a) => a !== aspect) : [...f.aspects, aspect] }))
                    }
                    className={`font-jetbrains w-44 rounded-lg border px-2.5 py-1 text-left text-label whitespace-nowrap transition ${on ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100" : "border-white/12 text-white/50 hover:bg-white/5"}`}
                  >
                    {aspect} <span className="text-white/40">{AD_ASPECT_PX[aspect]}</span>
                  </button>
                  {on && (
                    <button
                      type="button"
                      onClick={() => void renderAspect(aspect)}
                      disabled={blocked || inFlight || renders.starting !== null}
                      data-testid={`ads-render-${aspect}`}
                      className="font-jetbrains rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-label text-cyan-100 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {ref ? "render again" : "render"}
                    </button>
                  )}
                  {ref && <ExportState view={view} job={runningFor(aspect)} />}
                </li>
              );
            })}
          </ul>
          {renders.refusal && (
            <div className="mt-3">
              <Notice severity="warning" title={`${renders.refusal.aspect} · ${renders.refusal.code}`}>
                <p data-testid="ads-render-refusal">{renders.refusal.message}</p>
              </Notice>
            </div>
          )}
        </section>
      </div>

      <div className="space-y-4">
        <Checks checks={checks} projectId={projectId} />
      </div>
    </div>
  );
}
