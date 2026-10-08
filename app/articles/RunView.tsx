"use client";

// /articles/<runId> — one run: where it is (the stepper), what stopped it or
// what it became (the banner), and the human gate in its fixed order: the
// draft, the check report (failures first), the sources, the proposed patches,
// then Approve and Reject. Approval is per post and per patch.
//
// LAYERED (Wave 5): the first read is the run's state — header, stepper, the
// banner, and at the gate a summary of what the decision rests on (check
// failures, overruled blockers, unanswered findings, patches picked), each a
// link to its record. The records are sections that open on demand, the ones
// holding the human's call open by themselves at the gate; the draft, every
// finding and every check detail stay verbatim inside them.
//
// ABSENCE IS DRAWN AS ABSENCE. A section renders when the run directory holds
// its file and not before: no sources table before research has finished, no
// frame before the draft exists. A run that is still working says which step it
// is on; it does not draw placeholders of the things it has not made.

import Link from "next/link";
import { ArrowLeft, ExternalLink, FileWarning, Gavel, GitPullRequest, RotateCw } from "lucide-react";
import { useState } from "react";

import { Field, TextArea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Primitives";
import { CHIP_CLASS, Fold, Provenance, TALLY_TONE, Tally, type TallyTone } from "@/components/ui/signal";
import { SURFACE } from "@/components/ui/tokens";
import { NOTE_MAX_CHARS, STEP_NAMES, type ArticleRun } from "@/lib/articles/types";

import { approveRun, rejectRun, resumeRun, runFileUrl, type RunDetail } from "./articlesClient";
import { CritiqueView } from "./CritiquePanel";
import { CheckView, DraftFrame, PatchCard, PhaseChip, RefusedPatches, Section, SourcesTable, Stepper } from "./parts";
import { costOf, fmtUsd, gateFigures, nodesOf, phaseOf, resumeVerb, topicLine, type GateFigures, type RunPhase } from "./runModel";
import { useArticleRun } from "./useArticles";

const MEDIUM_FILES = ["story.html", "tags.txt", "README.md"];

export default function RunView({ runId }: { runId: string }) {
  const { state, live, reload, adopt } = useArticleRun(runId);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  if (!state) {
    return (
      <main className="space-y-4 pt-1 pb-28" aria-busy="true" data-testid="article-loading">
        <span className="sr-only">loading run</span>
        <div className={`${SURFACE} h-28 animate-pulse rounded-2xl`} />
        <div className={`${SURFACE} h-20 animate-pulse rounded-2xl`} />
      </main>
    );
  }
  if (!state.load.ok) {
    return (
      <main className="space-y-4 pt-1 pb-28">
        <BackLink />
        <div role="alert" className={`${SURFACE} flex flex-wrap items-center gap-3 rounded-2xl p-5`} data-testid="article-load-error">
          <FileWarning aria-hidden className="h-5 w-5 text-rose-300" />
          <p className="font-jetbrains min-w-0 flex-1 text-label break-words text-rose-100">{state.load.error}</p>
          {state.load.status !== 404 && (
            <Button variant="ghost" size="sm" onClick={reload}>
              <RotateCw aria-hidden className="mr-1.5 inline h-3.5 w-3.5" />
              Retry
            </Button>
          )}
        </div>
      </main>
    );
  }

  const d = state.load.data;
  const run = d.run;
  const phase = phaseOf(run, live);
  const atGate = phase === "gate";
  const approvedPatches = new Set(run.approval?.patches ?? []);
  const title = d.meta?.title ?? topicLine(run).text;
  const gate = gateFigures(d);

  return (
    <main tabIndex={-1} className="space-y-5 pt-1 pb-28" data-testid="article-run" data-status={run.status}>
      <BackLink />
      <Header run={run} detail={d} phase={phase} title={title} />
      <div className={`${SURFACE} rounded-2xl px-5 py-4`}>
        <Stepper nodes={nodesOf(run, live)} />
      </div>
      <Banner run={run} detail={d} phase={phase} onRun={adopt} />

      {atGate && <GateSummary detail={d} gate={gate} picked={picked.size} />}

      {/* Each record below is a section that opens on demand. At the gate the
          ones that hold the human's call open by themselves (the key remounts
          them when a live run arrives there); before and after it the page is
          the run's state, and every record is one press away. */}
      {d.outline !== undefined && (
        <Section id="outline" title="Outline" remember="articles.run.outline">
          <pre className="font-jetbrains max-h-[60vh] overflow-auto pb-1 text-label leading-relaxed whitespace-pre-wrap text-white/75" data-testid="article-outline">
            {d.outline || "(empty)"}
          </pre>
        </Section>
      )}

      {d.post && (
        <Section
          key={`draft-${atGate}`}
          id="draft"
          title="Draft"
          defaultOpen={atGate}
          marks={d.meta?.tags.length ? <span className="font-jetbrains text-label text-white/45">{d.meta.tags.join(" · ")}</span> : undefined}
        >
          <DraftFrame runId={run.id} post={d.post} title={title} />
        </Section>
      )}

      {d.critique && (
        <Section
          key={`critique-${atGate}`}
          id="critique"
          title="Critique"
          defaultOpen={atGate && (gate.blockers > 0 || gate.unanswered > 0)}
          marks={
            run.critique ? (
              <>
                <Tally value={run.critique.reviewers.filter((x) => x.outcome === "completed").length} of={d.critique.reviewers.length} label="reviewed" tone="emerald" />
                <Tally value={run.critique.findings.total} label="answered" />
                {run.critique.decision && <span className={`${CHIP_CLASS} ${run.critique.decision === "keep" ? TALLY_TONE.emerald : TALLY_TONE.cyan} uppercase`}>{run.critique.decision}</span>}
              </>
            ) : undefined
          }
        >
          <CritiqueView detail={d.critique} {...(run.critique ? { summary: run.critique } : {})} live={live && run.status === "critiquing"} />
        </Section>
      )}

      {d.check && (
        <Section
          key={`check-${atGate}`}
          id="check"
          title="Check"
          defaultOpen={atGate && (gate.fail > 0 || gate.notMeasured > 0)}
          marks={
            <>
              {gate.fail > 0 && <Tally value={gate.fail} label="fail" tone="rose" />}
              {gate.notMeasured > 0 && <Tally value={gate.notMeasured} label="not measured" tone="amber" />}
              <Tally value={gate.pass} label="pass" tone="emerald" />
            </>
          }
        >
          <CheckView report={d.check} runId={run.id} passes={d.checkPasses} />
        </Section>
      )}

      {d.sources.length > 0 && (
        <Section
          id="sources"
          title="Sources"
          remember="articles.run.sources"
          marks={
            <>
              <Tally value={d.sources.length} label="sources" />
              <Tally value={d.sources.filter((s) => s.primary).length} label="primary" tone="cyan" />
              <Tally value={d.sources.filter((s) => s.counter).length} label="counter" tone="amber" />
              <Tally value={d.claims.length} label="claims" />
            </>
          }
        >
          <SourcesTable sources={d.sources} claims={d.claims} />
        </Section>
      )}

      {(d.patches.length > 0 || (d.refused?.length ?? 0) > 0) && (
        <Section
          key={`patches-${atGate}`}
          id="patches"
          title="Registry patches"
          defaultOpen={atGate && d.patches.length > 0}
          marks={
            atGate ? (
              <Tally value={picked.size} of={d.patches.length} label="approve" tone={picked.size ? "cyan" : "neutral"} />
            ) : run.approval ? (
              <Tally value={approvedPatches.size} of={d.patches.length} label="approved" tone="emerald" />
            ) : (
              <Tally value={d.patches.length} label="proposed" />
            )
          }
        >
          <div className="space-y-3">
            {d.patches.map((p) => (
              <PatchCard
                key={p.id}
                patch={p}
                {...(atGate
                  ? {
                      pick: {
                        checked: picked.has(p.id),
                        disabled: false,
                        onChange: (on: boolean) =>
                          setPicked((cur) => {
                            const next = new Set(cur);
                            if (on) next.add(p.id);
                            else next.delete(p.id);
                            return next;
                          }),
                      },
                    }
                  : run.approval
                    ? { verdict: approvedPatches.has(p.id) ? ("approved" as const) : ("declined" as const) }
                    : {})}
              />
            ))}
            {d.refused && d.refused.length > 0 && <RefusedPatches refused={d.refused} />}
          </div>
        </Section>
      )}

      {atGate && <GatePanel run={run} patchCount={d.patches.length} picked={picked} onRun={adopt} />}
    </main>
  );
}

function BackLink() {
  return (
    <Link href="/articles" className="font-jetbrains inline-flex items-center gap-1.5 text-label text-white/55 hover:text-white">
      <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
      Articles
    </Link>
  );
}

/* ── the header ───────────────────────────────────────────────────────── */

function Header({ run, detail, phase, title }: { run: ArticleRun; detail: RunDetail; phase: RunPhase; title: string }) {
  const topic = topicLine(run);
  const cost = costOf(run);
  const std = run.standard;
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <PhaseChip phase={phase} />
        {topic.address && <span className={`${CHIP_CLASS} ${TALLY_TONE.cyan}`}>{topic.address}</span>}
        <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>effort {run.effort}</span>
      </div>
      <h1 className="font-instrument text-4xl leading-tight text-white" data-testid="article-title">
        {title}
      </h1>
      {detail.meta?.subtitle && <p className="text-content text-white/70">{detail.meta.subtitle}</p>}
      {detail.meta && topic.text !== title && <p className="text-label text-white/50">{topic.text}</p>}
      {run.topic.angle && <p className="text-content text-white/60 italic">{run.topic.angle}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Provenance model={run.model} run={run.id} cost={cost.usd === null ? "unpriced" : `${fmtUsd(cost.usd)}${cost.unpriced ? ` + ${cost.unpriced} unpriced` : ""}`} />
        <span className={`${CHIP_CLASS} ${std.version ? TALLY_TONE.neutral : TALLY_TONE.amber}`} title={std.bundleHash}>
          {std.recipe}
          {std.version ? `@${std.version}` : " unresolved"}
          {std.bundleHash ? ` · ${std.bundle} ${std.bundleHash.replace(/^sha256:/, "").slice(0, 8)}` : ""}
        </span>
      </div>
    </header>
  );
}

/* ── the banner: what stopped the run, or what it became ─────────────── */

function Banner({ run, detail, phase, onRun }: { run: ArticleRun; detail: RunDetail; phase: RunPhase; onRun: (r: ArticleRun) => void }) {
  if (phase === "gate") return null;
  if (phase === "running") {
    const step = run.steps.find((s) => s.status === "running");
    return (
      <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-cyan-300/25 bg-cyan-400/[0.05] px-5 py-3.5" data-testid="article-banner" data-phase={phase}>
        <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
        <span className="font-jetbrains text-label tracking-[0.14em] text-cyan-100 uppercase">{step ? step.name : run.status}</span>
        <Tally value={run.steps.filter((s) => s.status === "done").length} of={STEP_NAMES.length} label="steps" tone="cyan" />
        {detail.sources.length > 0 && <Tally value={detail.sources.length} label="sources" tone="cyan" />}
      </div>
    );
  }
  if (phase === "stalled" || phase === "failed") {
    const failedStep = run.steps.find((s) => s.status === "failed");
    const receipt = failedStep && failedStep.name !== "check" && failedStep.name !== "critique" ? detail.agent[failedStep.name] : undefined;
    const rose = phase === "failed";
    return (
      <div
        role={rose ? "alert" : "status"}
        className={`space-y-3 rounded-2xl border px-5 py-4 ${rose ? "border-rose-400/35 bg-rose-400/[0.06]" : "border-amber-300/35 bg-amber-400/[0.06]"}`}
        data-testid="article-banner"
        data-phase={phase}
      >
        <div className="flex flex-wrap items-start gap-3">
          <p className={`font-jetbrains min-w-0 flex-1 text-label break-words ${rose ? "text-rose-100" : "text-amber-100"}`} data-testid="article-error">
            {rose ? (run.error ?? "failed") : `${run.status} · no live driver`}
          </p>
          <ResumeButton run={run} onRun={onRun} />
        </div>
        {receipt && (
          <p className="font-jetbrains text-label text-white/60" data-testid="article-receipt">
            {[receipt.turn, receipt.outcome, receipt.turns !== undefined ? `${receipt.turns} turns` : null, receipt.costUsd !== undefined ? fmtUsd(receipt.costUsd) : null].filter(Boolean).join(" · ")}
            {receipt.errors.length > 0 && <span className="block text-rose-200/80">{receipt.errors.join("; ")}</span>}
          </p>
        )}
        {run.landing && <LandingFacts run={run} />}
        {detail.landingLog !== undefined && <LandingLog log={detail.landingLog} />}
      </div>
    );
  }
  if (phase === "landing") {
    return (
      <div role="status" className="space-y-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/[0.05] px-5 py-3.5" data-testid="article-banner" data-phase={phase}>
        <span className="font-jetbrains flex items-center gap-2 text-label tracking-[0.14em] text-cyan-100 uppercase">
          <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
          landing
        </span>
        {run.landing ? <LandingFacts run={run} /> : <ApprovalLine run={run} />}
      </div>
    );
  }
  if (phase === "landed") {
    const l = run.landing;
    return (
      <div role="status" className="space-y-3 rounded-2xl border border-emerald-300/30 bg-emerald-400/[0.05] px-5 py-4" data-testid="article-banner" data-phase={phase}>
        {l?.prUrl ? (
          <a href={l.prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-content text-emerald-100 hover:text-white" data-testid="article-pr">
            <GitPullRequest aria-hidden className="h-4 w-4" />
            {l.prUrl}
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          </a>
        ) : (
          <p className="font-jetbrains text-label text-amber-200">landed with no PR url recorded</p>
        )}
        {l && <LandingFacts run={run} />}
        {l?.medium && (
          <div className="flex flex-wrap items-center gap-2" data-testid="article-medium">
            <span className="font-jetbrains text-label text-white/55">
              {run.id}/{l.medium}/
            </span>
            {MEDIUM_FILES.map((f) => (
              <a key={f} href={runFileUrl(run.id, `${l.medium}/${f}`)} target="_blank" rel="noreferrer" className={`${CHIP_CLASS} ${TALLY_TONE.emerald} hover:brightness-125`}>
                {f}
              </a>
            ))}
          </div>
        )}
        <ApprovalLine run={run} />
      </div>
    );
  }
  // rejected
  return (
    <div role="status" className="space-y-1.5 rounded-2xl border border-white/12 bg-white/[0.03] px-5 py-4" data-testid="article-banner" data-phase={phase}>
      <p className="text-content whitespace-pre-wrap text-white/85" data-testid="article-rejection">
        {run.rejection?.note ?? "rejected with no note recorded"}
      </p>
      {run.rejection?.at && (
        <time dateTime={run.rejection.at} className="font-jetbrains text-label text-white/45">
          {run.rejection.at}
        </time>
      )}
    </div>
  );
}

function ApprovalLine({ run }: { run: ArticleRun }) {
  if (!run.approval) return null;
  return (
    <p className="font-jetbrains text-label text-white/55">
      approved {run.approval.at} · patches {run.approval.patches.length ? run.approval.patches.join(", ") : "none"}
    </p>
  );
}

function LandingFacts({ run }: { run: ArticleRun }) {
  const l = run.landing!;
  return (
    <div className="space-y-2">
      <p className="font-jetbrains text-label break-all text-white/70">
        {[l.branch, l.commit?.slice(0, 10), l.worktree ? `worktree ${l.worktree}` : null].filter(Boolean).join(" · ")}
      </p>
      {l.gates.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="registry gates" data-testid="article-gates">
          {l.gates.map((g, i) => (
            <li key={i} className={`${CHIP_CLASS} ${g.ok ? TALLY_TONE.emerald : TALLY_TONE.rose}`}>
              {g.lane} {g.mode} {g.ok ? "ok" : "red"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LandingLog({ log }: { log: string }) {
  return (
    <Fold title="landing.log" level={3}>
      <pre className="font-jetbrains max-h-72 overflow-auto text-label whitespace-pre-wrap text-white/65">{log || "(empty)"}</pre>
    </Fold>
  );
}

function ResumeButton({ run, onRun }: { run: ArticleRun; onRun: (r: ArticleRun) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        data-testid="article-resume"
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await resumeRun(run.id);
          setBusy(false);
          if (r.ok) onRun(r.data.run);
          else setError(r.error);
        }}
      >
        <RotateCw aria-hidden className="mr-1.5 inline h-3.5 w-3.5" />
        {resumeVerb(run)}
      </Button>
      {error && <span className="font-jetbrains max-w-md text-right text-label break-words text-rose-200">{error}</span>}
    </span>
  );
}

/* ── the gate, at a glance ────────────────────────────────────────────── */

/** What the decision rests on, as counts that jump to their record: what the
 *  check failed or could not measure, which blockers the writer overruled,
 *  what is still unanswered, how many patches are picked. */
function GateSummary({ detail, gate, picked }: { detail: RunDetail; gate: GateFigures; picked: number }) {
  const marks: { href: string; key: string; value: number; of?: number; label: string; tone: TallyTone }[] = [];
  if (detail.check) {
    if (gate.fail) marks.push({ href: "#check", key: "fail", value: gate.fail, label: "check fail", tone: "rose" });
    if (gate.notMeasured) marks.push({ href: "#check", key: "nm", value: gate.notMeasured, label: "not measured", tone: "amber" });
    if (!gate.fail && !gate.notMeasured) marks.push({ href: "#check", key: "pass", value: gate.pass, label: "check pass", tone: "emerald" });
  }
  if (detail.critique) {
    if (gate.blockers) marks.push({ href: "#critique", key: "blk", value: gate.blockers, label: "open blocker", tone: "rose" });
    if (gate.unanswered) marks.push({ href: "#critique", key: "ua", value: gate.unanswered, label: "unanswered", tone: "amber" });
  }
  if (detail.patches.length) marks.push({ href: "#patches", key: "pt", value: picked, of: detail.patches.length, label: "patches", tone: picked ? "cyan" : "neutral" });
  return (
    <nav aria-label="gate summary" className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-400/[0.05] px-5 py-3" data-testid="article-gate-summary">
      {marks.map((m) => (
        <a key={m.key} href={m.href} className="rounded-full hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300/70">
          <Tally value={m.value} {...(m.of !== undefined ? { of: m.of } : {})} label={m.label} tone={m.tone} />
        </a>
      ))}
      <a
        href="#gate"
        className="font-jetbrains ml-auto inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 px-3 py-1 text-label text-amber-100 transition hover:bg-amber-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300/70"
      >
        <Gavel aria-hidden className="h-3.5 w-3.5" />
        decide
      </a>
    </nav>
  );
}

/* ── the gate ─────────────────────────────────────────────────────────── */

function GatePanel({ run, patchCount, picked, onRun }: { run: ArticleRun; patchCount: number; picked: ReadonlySet<string>; onRun: (r: ArticleRun) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    setBusy("approve");
    setError(null);
    const r = await approveRun(run.id, [...picked].sort());
    setBusy(null);
    setConfirming(false);
    if (r.ok) onRun(r.data.run);
    else setError(r.error);
  };
  const reject = async () => {
    if (!note.trim()) return;
    setBusy("reject");
    setError(null);
    const r = await rejectRun(run.id, note.trim());
    setBusy(null);
    if (r.ok) onRun(r.data.run);
    else setError(r.error);
  };

  return (
    <section aria-labelledby="gate" className={`${SURFACE} space-y-5 rounded-2xl border-amber-300/25 p-5`} data-testid="article-gate">
      <h2 id="gate" className="font-jetbrains text-label tracking-[0.18em] text-amber-200/90 uppercase">
        Gate
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        {!confirming ? (
          <Button variant="keep" disabled={busy !== null} onClick={() => setConfirming(true)} data-testid="article-approve">
            Approve post{patchCount ? ` + ${picked.size} of ${patchCount} patches` : ""}
          </Button>
        ) : (
          <>
            {/* A destructive confirm states its consequence: this reaches
                another repository and other people. */}
            <span className="text-content text-amber-100">Pushes a branch to ai-registry and opens a PR.</span>
            <Button disabled={busy !== null} onClick={approve} data-testid="article-approve-confirm">
              {busy === "approve" ? "Approving…" : "Confirm"}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Field label="Rejection note" htmlFor="article-reject-note">
            <TextArea id="article-reject-note" rows={2} value={note} maxLength={NOTE_MAX_CHARS} onChange={(e) => setNote(e.target.value)} data-testid="article-reject-note" />
          </Field>
        </div>
        <Button variant="danger" disabled={busy !== null || !note.trim()} onClick={reject} data-testid="article-reject">
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="font-jetbrains text-label break-words text-rose-200" data-testid="article-gate-error">
          {error}
        </p>
      )}
    </section>
  );
}
