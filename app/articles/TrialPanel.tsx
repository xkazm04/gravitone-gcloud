"use client";

// THE TRIAL PANEL on /articles/<runId>, before the critique: the measurement a trial post is
// written around, as `<run>/experiment/` holds it. The verdict and its rule's inputs (claim,
// alternative, metric, band, guards), each arm's n, mean, sd and guards, the controls, the
// measured exec log, and the contexts the subject governs in this repo. Every number is the
// record's own; nothing here recomputes a verdict.
//
// THREE STATES BESIDE THE RECORD, each drawn rather than told: a classic run at the gate is a
// "no trial" chip where the panel would be (its evidence is third-party); a trial run whose
// experiment/ holds no verdict.json names that file; a trial whose prereg or results are gone
// never reaches here, because getRunDetail refuses it by name (lib/articles/runReads.ts).
//
// Same idiom as ./CritiquePanel.tsx: SURFACE sections from ./parts, chips and counts from
// components/ui/signal, a glyph and a word beside every tone.

import { ArrowDown, ArrowUp, Equal, ExternalLink, FileX, ShieldCheck, Swords, X, type LucideIcon } from "lucide-react";

import { BandTrack, CHIP_CLASS, Fold, Hint, PipRow, TALLY_TONE, Tally, type PipState } from "@/components/ui/signal";
import type { ArticleRun, TrialDetail, TrialExecRecord, TrialVerdictKind } from "@/lib/articles/types";

import { Section } from "./parts";
import { TRIAL_VERDICT_LOOK, trialArmRows, trialDeltaTrack, trialNum, type Tone, type TrialArmRow } from "./runModel";

const VERDICT_ICON: Record<TrialVerdictKind, LucideIcon> = { upheld: ShieldCheck, challenged: Swords, null: Equal, void: X };

/** The experiment file whose absence leaves a trial run with no record to read. */
const VERDICT_FILE = "experiment/verdict.json";

/** The house chip, except that a long value (a subject address, a guard, a version) may break
 *  across lines: a nowrap chip wider than a 390 px column widens the whole panel past it. */
const WRAP_CHIP_CLASS = CHIP_CLASS.replace("whitespace-nowrap", "max-w-full whitespace-normal break-all");

function Chip({ tone, children, className = "", testId, wrap = false }: { tone: Tone; children: React.ReactNode; className?: string; testId?: string; wrap?: boolean }) {
  return (
    <span className={`${wrap ? WRAP_CHIP_CLASS : CHIP_CLASS} ${TALLY_TONE[tone]} ${className}`} data-testid={testId}>
      {children}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="font-jetbrains text-label tracking-[0.14em] text-white/40 uppercase">{children}</span>;
}

export function TrialVerdictChip({ verdict }: { verdict: TrialVerdictKind }) {
  const look = TRIAL_VERDICT_LOOK[verdict];
  const Icon = VERDICT_ICON[verdict];
  return (
    <Chip tone={look.tone} className="uppercase" testId="article-trial-verdict">
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {look.word}
    </Chip>
  );
}

export function TrialPanel({ run, trial, atGate }: { run: ArticleRun; trial?: TrialDetail; atGate: boolean }) {
  if (!run.trial) {
    if (!atGate) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 px-1" data-testid="article-trial-none">
        <Chip tone="neutral" className="uppercase">
          no trial
        </Chip>
        <Chip tone="neutral">third-party evidence</Chip>
      </div>
    );
  }
  if (!trial) {
    return (
      <Section id="trial" title="Trial" defaultOpen marks={<Chip tone="rose" className="uppercase">missing</Chip>}>
        <p role="alert" className="flex flex-wrap items-center gap-2 pb-1" data-testid="article-trial-missing">
          <FileX aria-hidden className="h-4 w-4 text-rose-300" />
          <span className="font-jetbrains text-label break-all text-rose-100">{VERDICT_FILE}</span>
          <Chip tone="rose">missing</Chip>
          <Chip tone="neutral">{run.trial.id}</Chip>
        </p>
      </Section>
    );
  }
  return (
    <Section
      id="trial"
      title="Trial"
      defaultOpen={atGate}
      marks={
        // Two marks: Fold's marks never wrap, and a third overflows a 390 px header.
        <>
          <TrialVerdictChip verdict={trial.verdict.verdict} />
          <Tally value={trial.prereg.n} label="n/arm" />
        </>
      }
    >
      <TrialRecordView trial={trial} />
    </Section>
  );
}

function TrialRecordView({ trial }: { trial: TrialDetail }) {
  const { prereg: p, verdict: v, results: r } = trial;
  const rows = trialArmRows(trial);
  const unit = p.metric.unit;
  const Dir = p.metric.direction === "lower" ? ArrowDown : ArrowUp;
  return (
    <div className="space-y-6 pb-2" data-testid="article-trial" data-verdict={v.verdict}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label>claim</Label>
          <blockquote className="border-l-2 border-white/15 pl-3 text-content break-words text-white/85" data-testid="article-trial-claim">
            {p.claim}
          </blockquote>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone="cyan" wrap>
              {p.technique}
            </Chip>
            <Chip tone="neutral" wrap>
              {p.subject.bundle}/{p.subject.slug}
            </Chip>
            {trial.validity && (
              <Chip tone={trial.validity.state === "current" ? "emerald" : trial.validity.state === "stale" ? "amber" : "rose"}>validity {trial.validity.state}</Chip>
            )}
            <Chip tone="neutral" wrap>
              {p.environment}
            </Chip>
          </div>
          <p className="text-label break-words text-white/55">
            <Label>prior</Label> {p.prior}
          </p>
        </div>
        <div className="min-w-0 space-y-2">
          <Label>alternative</Label>
          <p className="text-content text-white/90" data-testid="article-trial-alternative">
            {p.alternative.name}
          </p>
          <p className="text-label text-white/60">{p.alternative.description}</p>
          <a
            href={p.alternative.source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="font-jetbrains inline-flex flex-wrap items-center gap-1.5 text-label break-all text-cyan-200/90 hover:text-cyan-100"
          >
            {p.alternative.source.title}
            <span className="text-white/45">{p.alternative.source.date}</span>
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="space-y-2">
        <Label>metric</Label>
        <div className="flex flex-wrap items-center gap-2" data-testid="article-trial-metric">
          <span className="text-content text-white/90">{p.metric.label}</span>
          <Chip tone="neutral">
            <Dir aria-hidden className="h-3.5 w-3.5" />
            {p.metric.direction}
            {unit ? ` · ${unit}` : ""}
          </Chip>
          <Chip tone="cyan">
            band ±{trialNum(v.band)}
            {p.minEffect.kind === "relative" ? ` · ${trialNum(p.minEffect.value * 100)}%` : ""}
          </Chip>
          {p.thresholds.map((t) => (
            <Chip key={t.metric} tone="neutral" wrap>
              {t.label} {t.op} {trialNum(t.value)}
            </Chip>
          ))}
        </div>
      </div>

      <ArmTable rows={rows} unit={unit} />

      <DeltaRail trial={trial} />

      <div className="space-y-2">
        <Label>controls</Label>
        <ul className="space-y-2" data-testid="article-trial-controls">
          {p.controls.map((c) => {
            const got = r.controls.find((x) => x.id === c.id);
            return (
              <li key={c.id} className="flex flex-wrap items-start gap-2">
                <Chip tone={!got ? "amber" : got.held ? "emerald" : "rose"} className="uppercase">
                  {!got ? "not reported" : got.held ? "held" : "broken"}
                </Chip>
                <span className="min-w-0 flex-1">
                  <span className="block text-content text-white/80">{c.statement}</span>
                  {got?.evidence && <span className="font-jetbrains block text-label break-words text-white/50">{got.evidence}</span>}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <Tally value={r.modelCalls} of={p.budget.modelCalls} label="model calls" />
          {r.notes?.trim() && <span className="text-label text-white/55">{r.notes}</span>}
        </div>
      </div>

      <ExecLog execs={trial.execs} />

      <div className="flex flex-wrap items-center gap-2" data-testid="article-trial-governs">
        <Label>governs here</Label>
        {trial.governsHere.length ? (
          trial.governsHere.map((g) => (
            <Chip key={g} tone="cyan">
              {g}
            </Chip>
          ))
        ) : (
          <Tally value={0} label="contexts" />
        )}
      </div>

      {trial.report !== undefined && (
        <Fold title="REPORT.md" level={3}>
          <pre className="font-jetbrains max-h-96 overflow-auto text-label leading-relaxed whitespace-pre-wrap text-white/70">{trial.report || "(empty)"}</pre>
        </Fold>
      )}
    </div>
  );
}

const pipOf = (cleared: boolean | null): PipState => (cleared === null ? "hollow" : cleared ? "filled" : "rose");

function ArmTable({ rows, unit }: { rows: TrialArmRow[]; unit: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left" data-testid="article-trial-arms">
        <thead>
          <tr className="font-jetbrains text-label tracking-[0.14em] text-white/40 uppercase">
            <th scope="col" className="py-2 pr-3 font-normal">arm · n</th>
            <th scope="col" className="py-2 pr-3 font-normal">
              mean · sd
              {unit && <span className="block break-all normal-case">{unit}</span>}
            </th>
            <th scope="col" className="py-2 font-normal">guards</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((a) => {
            const cleared = a.guards.filter((g) => g.cleared).length;
            return (
              <tr key={a.id} className="align-top" data-testid={`article-trial-arm-${a.id}`}>
                <th scope="row" className="py-2.5 pr-3 font-normal">
                  <span className="block text-content break-words text-white/90">{a.label}</span>
                  <span className="font-jetbrains block text-label text-white/45">{a.id}</span>
                  <Tally value={a.n} of={a.floor} label="n" tone={a.n >= a.floor ? "emerald" : "rose"} className="mt-1" />
                </th>
                <td className="font-jetbrains py-2.5 pr-3">
                  <span className={`block text-content ${a.ahead ? "text-white" : "text-white/70"}`} data-testid={`article-trial-mean-${a.id}`}>
                    {trialNum(a.mean)}
                  </span>
                  <span className="block text-label text-white/55">sd {trialNum(a.sd)}</span>
                </td>
                <td className="py-2.5">
                  <span className="flex flex-wrap items-center gap-2">
                    {a.guards.length > 0 && <PipRow states={a.guards.map((g) => pipOf(g.cleared))} label={`${cleared} of ${a.guards.length} guards cleared`} />}
                    <Chip tone={a.guardsCleared ? "emerald" : "rose"} className="uppercase" testId={`article-trial-cleared-${a.id}`}>
                      {a.guardsCleared ? "cleared" : "missed"}
                    </Chip>
                  </span>
                  {a.guards.map((g) => (
                    <span key={g.metric} className={`font-jetbrains mt-1 block text-label break-words ${g.cleared === false ? "text-rose-200" : "text-white/55"}`}>
                      {g.label} {g.value === undefined ? "not reported" : trialNum(g.value)}
                    </span>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DeltaRail({ trial }: { trial: TrialDetail }) {
  const { prereg: p, verdict: v } = trial;
  const track = trialDeltaTrack(v);
  const unit = p.metric.unit;
  const round = (x: number) => Number(trialNum(x));
  return (
    <div className="space-y-2" data-testid="article-trial-delta">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label>delta</Label>
        <span className="font-jetbrains text-content text-white/90">
          {v.delta > 0 ? "+" : ""}
          {trialNum(v.delta)}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <BandTrack value={round(track.value)} min={round(track.min)} max={round(track.max)} band={[round(track.band[0]), round(track.band[1])]} unit={unit ? ` ${unit}` : ""} label="delta" showBounds={false} />
      <div aria-hidden className="font-jetbrains flex justify-between gap-3 text-label text-white/45">
        <span>← {p.arms[0].label}</span>
        <span className="text-right">{p.arms[1].label} →</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="cyan">band ±{trialNum(v.band)}</Chip>
        {v.deltaCi95 && (
          <span className="inline-flex items-center gap-1">
            <Chip tone="neutral">
              95% CI [{trialNum(v.deltaCi95[0])}, {trialNum(v.deltaCi95[1])}]
            </Chip>
            <Hint label="about the interval">seeded bootstrap, 2,000 resamples; reported, never decisive</Hint>
          </span>
        )}
      </div>
      <p className="text-label text-white/60" data-testid="article-trial-reason">
        {v.reason}
      </p>
    </div>
  );
}

function execTone(e: TrialExecRecord): Tone {
  if (e.timedOut) return "amber";
  return e.exitCode === 0 ? "emerald" : "rose";
}

function ExecLog({ execs }: { execs: TrialExecRecord[] }) {
  const measured = execs.filter((e) => !e.pilot);
  const ok = measured.filter((e) => e.exitCode === 0 && !e.timedOut).length;
  const pips: PipState[] = measured.map((e) => (e.timedOut ? "amber" : e.exitCode === 0 ? "filled" : "rose"));
  return (
    <Fold
      title="Exec log"
      level={3}
      tally={{ value: measured.length, label: "measured" }}
      marks={measured.length ? <PipRow states={pips} label={`${ok} of ${measured.length} measured commands exited 0`} /> : undefined}
      remember="articles.run.trial.execs"
    >
      {execs.length === 0 ? (
        <Tally value={0} label="commands" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left" data-testid="article-trial-execs">
            <thead>
              <tr className="font-jetbrains text-label tracking-[0.14em] text-white/40 uppercase">
                <th scope="col" className="py-2 pr-3 font-normal">command</th>
                <th scope="col" className="py-2 pr-3 font-normal">took</th>
                <th scope="col" className="py-2 font-normal">exit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {execs.map((e, i) => (
                <tr key={i} className="align-top">
                  <td className="py-2 pr-3">
                    <code className="font-jetbrains block text-label break-all text-white/80">{e.cmd.join(" ")}</code>
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      <time dateTime={e.at} className="font-jetbrains text-label text-white/45">
                        {e.at.slice(0, 16).replace("T", " ")}
                      </time>
                      {e.pilot && (
                        <Chip tone="neutral" className="uppercase">
                          pilot
                        </Chip>
                      )}
                    </span>
                  </td>
                  <td className="font-jetbrains py-2 pr-3 text-label whitespace-nowrap text-white/60">{e.durationMs < 1000 ? `${e.durationMs} ms` : `${(e.durationMs / 1000).toFixed(1)} s`}</td>
                  <td className="py-2">
                    <Chip tone={execTone(e)}>{e.timedOut ? "timed out" : e.exitCode === null ? "killed" : `exit ${e.exitCode}`}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Fold>
  );
}
