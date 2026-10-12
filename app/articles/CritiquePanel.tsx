"use client";

// THE CRITIQUE PANEL on /articles/<runId> (scope amendment 1): who reviewed the
// draft and with what outcome, what each found, what the writer did with every
// finding, and what it decided per round.
//
// ABSENCE STAYS ABSENCE. A reviewer that could not run is listed with its
// outcome and its error, never dropped; a finding the writer has not answered
// yet says "unanswered" in amber; a reviewer with no receipt is "reviewing"
// only while a live driver is on the round, else "not run". Cost is shown only
// where the CLI reported one (codex and agy never do).
//
// Projects/Library idiom, the same as ./parts.tsx: SURFACE glass, chips from
// components/ui/signal, tones as Tailwind alpha utilities, a glyph and a word
// beside every tone.

import { AlertTriangle, Ban, Check, CircleDashed, ExternalLink, Hourglass, PauseCircle, PenLine, Search, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { CHIP_CLASS, Fold, TALLY_TONE, Tally } from "@/components/ui/signal";
import type { ArticleCritique, CritiqueDetail, CritiqueRoundDetail } from "@/lib/articles/types";

import {
  DISPOSITION_TONE,
  fmtUsd,
  findingGroups,
  latestRound,
  REVIEWER_LOOK,
  reviewerRows,
  roundTimeline,
  SEVERITY_TONE,
  VERDICT_TONE,
  type ReviewerRow,
  type ReviewerState,
} from "./runModel";
import { TONE_TEXT } from "./parts";

const STATE_ICON: Record<ReviewerState, LucideIcon | null> = {
  completed: Check,
  unavailable: Ban,
  "seat-limit": PauseCircle,
  "timed-out": Hourglass,
  errored: AlertTriangle,
  reviewing: null,
  "not-run": CircleDashed,
};

function Chip({ tone, children, className = "" }: { tone: keyof typeof TALLY_TONE; children: React.ReactNode; className?: string }) {
  return <span className={`${CHIP_CLASS} ${TALLY_TONE[tone]} uppercase ${className}`}>{children}</span>;
}

function StateChip({ state }: { state: ReviewerState }) {
  const look = REVIEWER_LOOK[state];
  const Icon = STATE_ICON[state];
  return (
    <Chip tone={look.tone}>
      {Icon ? <Icon aria-hidden className="h-3.5 w-3.5" /> : <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />}
      {look.word}
    </Chip>
  );
}

/* ── the reviewers ────────────────────────────────────────────────────── */

function ReviewerItem({ row }: { row: ReviewerRow }) {
  const s = row.spec;
  return (
    <li className="flex flex-col gap-2 py-3 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-x-3 md:gap-y-1" data-testid={`critique-reviewer-${s.id}`} data-state={row.state}>
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-jetbrains text-label tracking-[0.12em] text-white/90 uppercase">{s.id}</span>
          <span className="font-jetbrains text-label text-white/50">
            {s.engine} · {s.model} · {s.effort}
          </span>
        </p>
        {row.error && (
          <p className={`font-jetbrains text-label break-words ${TONE_TEXT[REVIEWER_LOOK[row.state].tone]}`} data-testid={`critique-reviewer-error-${s.id}`}>
            {row.error}
          </p>
        )}
        {row.wrote && (
          <p className="font-jetbrains text-label break-words text-amber-200/85">wrote in its read-only workspace: {row.wrote.join(", ")}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-start gap-1.5 md:justify-end">
        <StateChip state={row.state} />
        {row.verdict && <Chip tone={VERDICT_TONE[row.verdict]}>{row.verdict}</Chip>}
        {row.counts && (
          <>
            <Tally value={row.counts.blocker} label="blocker" tone={row.counts.blocker ? "rose" : "neutral"} />
            <Tally value={row.counts.major} label="major" tone={row.counts.major ? "amber" : "neutral"} />
            <Tally value={row.counts.minor} label="minor" />
          </>
        )}
        {row.attempts === 2 && <Chip tone="neutral">2 attempts</Chip>}
        {row.costUsd !== undefined && <span className="font-jetbrains text-label text-white/55">{fmtUsd(row.costUsd)}</span>}
      </div>
    </li>
  );
}

/* ── the rounds ───────────────────────────────────────────────────────── */

/** What an undecided round is doing: reviewing while a driver is on it,
 *  waiting for the writer once closed, else stopped — at the quorum when every
 *  reviewer has an outcome and too few completed. */
function openWord(l: ReturnType<typeof roundTimeline>[number], detail: CritiqueDetail, live: boolean, receipts: number): string {
  if (l.closed) return live ? "awaiting the writer" : "the writer has not answered";
  if (live) return "reviewing";
  return receipts === l.of && l.completed < detail.minCompleted ? "quorum not reached" : "stopped";
}

function Timeline({ detail, current, onPick, live }: { detail: CritiqueDetail; current: number; onPick: (n: number) => void; live: boolean }) {
  const lines = roundTimeline(detail);
  return (
    <ol className="space-y-2" aria-label="critique rounds" data-testid="critique-timeline">
      {lines.map((l) => (
        <li key={l.round} data-round={l.round} className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={current === l.round}
            onClick={() => onPick(l.round)}
            className={`${CHIP_CLASS} ${current === l.round ? TALLY_TONE.cyan : TALLY_TONE.neutral} uppercase hover:brightness-125`}
          >
            round {l.round}
          </button>
          <Tally value={l.completed} of={l.of} label="reviewed" tone={l.completed >= detail.minCompleted ? "emerald" : "rose"} />
          <Tally value={l.findings} label="findings" />
          {l.decision ? (
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <Chip tone={l.decision.decision === "keep" ? "emerald" : "cyan"}>
                {l.decision.decision === "research" ? <Search aria-hidden className="h-3.5 w-3.5" /> : l.decision.decision === "rewrite" ? <PenLine aria-hidden className="h-3.5 w-3.5" /> : <Check aria-hidden className="h-3.5 w-3.5" />}
                {l.decision.decision}
              </Chip>
              <span className="text-label text-white/65">{l.decision.rationale}</span>
            </span>
          ) : (
            <span className="font-jetbrains text-label text-white/45" data-testid="critique-round-open">
              {openWord(l, detail, live && l.round === lines.length, detail.rounds.find((r) => r.round === l.round)?.receipts.length ?? 0)}
            </span>
          )}
          {l.revised && <Chip tone="cyan">revised{l.revised.research ? " after research" : ""}</Chip>}
        </li>
      ))}
    </ol>
  );
}

function Findings({ round }: { round: CritiqueRoundDetail }) {
  const groups = findingGroups(round);
  if (!groups.length) {
    return <p className="font-jetbrains text-label text-white/50">{round.reviews.length ? "no findings this round" : "no review has arrived for this round"}</p>;
  }
  // One fold per lens. Its header carries what the gate weighs — blockers, and
  // findings the writer has not answered — and it opens by itself when either
  // is there; a lens holding only answered minors is the record, one press down.
  return (
    <div data-testid="critique-findings">
      {groups.map((g) => {
        const blockers = g.rows.filter((x) => x.finding.severity === "blocker").length;
        const open = g.rows.filter((x) => !x.disposition).length;
        return (
          <div key={g.kind} data-kind={g.kind}>
            <Fold
              title={g.kind}
              level={4}
              tally={{ value: g.rows.length, label: "findings" }}
              marks={
                blockers || open ? (
                  <>
                    {blockers > 0 && <Tally value={blockers} label="blocker" tone="rose" />}
                    {open > 0 && <Tally value={open} label="unanswered" tone="amber" />}
                  </>
                ) : undefined
              }
              defaultOpen={blockers > 0 || open > 0}
              testId={`critique-kind-${g.kind}`}
            >
              <ul aria-label={`${g.kind} findings`} className="divide-y divide-white/[0.06] rounded-xl border border-white/8">
                {g.rows.map(({ reviewer, finding: f, disposition: d }) => {
                  const dTone = DISPOSITION_TONE[d?.disposition ?? "unanswered"];
                  return (
                    <li key={`${reviewer}-${f.id}`} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]" data-testid={`critique-finding-${reviewer}-${f.id}`} data-disposition={d?.disposition ?? "unanswered"}>
                      <div className="min-w-0 space-y-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <Chip tone={SEVERITY_TONE[f.severity]}>{f.severity}</Chip>
                          <span className="font-jetbrains text-label text-white/55">
                            {reviewer} · {f.id} · {f.location}
                          </span>
                        </p>
                        <p className="text-content text-white/85">{f.claim}</p>
                        <p className="text-label text-white/60">→ {f.suggestion}</p>
                        {f.evidence.length > 0 && (
                          <p className="flex flex-wrap gap-x-3 gap-y-1">
                            {f.evidence.map((u) => (
                              <a key={u} href={u} target="_blank" rel="noreferrer noopener" className="font-jetbrains inline-flex items-center gap-1 text-label break-all text-cyan-200/80 hover:text-cyan-100">
                                {u}
                                <ExternalLink aria-hidden className="h-3 w-3 shrink-0" />
                              </a>
                            ))}
                          </p>
                        )}
                      </div>
                      <div className="min-w-0 space-y-1 md:border-l md:border-white/8 md:pl-3">
                        <Chip tone={dTone}>{d?.disposition ?? "unanswered"}</Chip>
                        {d ? (
                          <>
                            <p className="text-label text-white/75">{d.reason}</p>
                            {d.action && <p className="text-label text-emerald-200/80">{d.action}</p>}
                          </>
                        ) : (
                          <p className="text-label text-amber-200/80">the writer has not answered this round yet</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Fold>
          </div>
        );
      })}
    </div>
  );
}

/* ── the panel ────────────────────────────────────────────────────────── */

export function CritiqueView({ detail, summary, live }: { detail: CritiqueDetail; summary?: ArticleCritique; live: boolean }) {
  const last = latestRound(detail);
  const [picked, setPicked] = useState<number | null>(null);
  const current = picked !== null && detail.rounds.some((r) => r.round === picked) ? picked : last;
  const round = detail.rounds.find((r) => r.round === current);
  const rows = reviewerRows(detail, current, live && current === last);
  const completed = rows.filter((r) => r.state === "completed").length;
  // reviewing is not trouble; anything else that did not complete is
  const trouble = rows.filter((r) => r.state !== "completed" && r.state !== "reviewing").length;
  return (
    <div className="space-y-5" data-testid="critique-panel" data-round={current}>
      {detail.rounds.length > 0 && <Timeline detail={detail} current={current} onPick={setPicked} live={live} />}
      {/* The panel's outcomes are the first read of the round; who said what,
          with which model, is the record. A reviewer that could not run opens
          the list by itself: its error is the work, and absence stays absence. */}
      <Fold
        key={current}
        title={`reviewers · round ${current}`}
        level={4}
        tally={{ value: completed, of: rows.length, label: "completed", tone: completed >= detail.minCompleted ? "emerald" : "rose" }}
        marks={trouble > 0 ? <Tally value={trouble} label="not completed" tone="amber" /> : undefined}
        defaultOpen={trouble > 0 || rows.some((r) => r.wrote)}
        testId="critique-reviewers-fold"
      >
        <ul className="divide-y divide-white/[0.06]" data-testid="critique-reviewers">
          {rows.map((r) => (
            <ReviewerItem key={r.spec.id} row={r} />
          ))}
        </ul>
      </Fold>
      {round && <Findings key={current} round={round} />}
      {summary && (
        <p className="font-jetbrains text-label text-white/50" data-testid="critique-summary">
          across {summary.rounds} round{summary.rounds === 1 ? "" : "s"} the writer answered {summary.findings.total} finding{summary.findings.total === 1 ? "" : "s"}: {summary.findings.accepted} accepted · {summary.findings.rejected} rejected · {summary.findings.deferred} deferred
          {summary.decision ? ` · decision ${summary.decision}` : " · no decision yet"}
        </p>
      )}
    </div>
  );
}
