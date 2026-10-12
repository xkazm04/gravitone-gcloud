"use client";

// THE /articles LEAVES — the status language, the stepper, and the four things
// the human gate shows in its order: the draft, the check report (failures
// first), the sources, the proposed patches.
//
// Projects/Library idiom (app/_projects/parts.tsx, app/calendar/ui.tsx): glass,
// hairlines at white/8, state in four tones — cyan working, amber needs a call,
// rose broke, emerald done. No colour literal: every hue here is a Tailwind
// alpha utility, the rendered form of components/ui/tokens.ts ACCENT. A state
// is never colour alone: every chip and node carries a glyph and its word.

import {
  AlertTriangle,
  Ban,
  Check,
  CircleDashed,
  ExternalLink,
  Gavel,
  Hourglass,
  PauseCircle,
  type LucideIcon,
} from "lucide-react";

import { CHIP_CLASS, Fold, TALLY_TONE, Tally, type TallyTone } from "@/components/ui/signal";
import { SURFACE } from "@/components/ui/tokens";
import type { CheckItem, CheckPassRecord, CheckReport, Claim, RegistryPatch, Source } from "@/lib/articles/types";

import { runFileUrl } from "./articlesClient";
import { checkOrder, fmtUsd, PHASE_LOOK, span, type NodeState, type RunPhase, type StepNode, type Tone } from "./runModel";

/* ── tone ─────────────────────────────────────────────────────────────── */

export const TONE_TEXT: Record<Tone, string> = {
  cyan: "text-cyan-200",
  amber: "text-amber-200",
  rose: "text-rose-200",
  emerald: "text-emerald-200",
  neutral: "text-white/60",
};

const PHASE_ICON: Record<RunPhase, LucideIcon | null> = {
  running: null,
  stalled: PauseCircle,
  failed: AlertTriangle,
  gate: Gavel,
  landing: null,
  landed: Check,
  rejected: Ban,
};

/** The run's state as a chip: glyph (or a live dot) and its word. */
export function PhaseChip({ phase, className = "" }: { phase: RunPhase; className?: string }) {
  const look = PHASE_LOOK[phase];
  const Icon = PHASE_ICON[phase];
  return (
    <span data-testid="article-phase" data-phase={phase} className={`${CHIP_CLASS} ${TALLY_TONE[look.tone]} uppercase ${className}`}>
      {Icon ? <Icon aria-hidden className="h-3.5 w-3.5" /> : <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />}
      {look.word}
    </span>
  );
}

/**
 * One of the gate's records — draft, critique, check, sources, patches — as a
 * card whose body opens on demand (Wave 5, docs/waves/README.md). The closed
 * header carries the record's STATE (`tally`, `marks`: counts, a verdict chip),
 * so the run reads at a glance and the record itself is one press down; the
 * caller opens it by default exactly when it holds the human's decision (a
 * failing check, an unanswered finding, a patch to pick). A closed section
 * mounts nothing: the draft's frame does not load and the sources table is not
 * built until somebody asks for them.
 *
 * `id` lands on the card, so the gate summary's links can jump to it.
 */
export function Section({
  id,
  title,
  tally,
  marks,
  defaultOpen = false,
  remember,
  children,
}: {
  id: string;
  title: string;
  tally?: { value: number; of?: number; tone?: TallyTone; label?: string };
  marks?: React.ReactNode;
  defaultOpen?: boolean;
  remember?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className={`${SURFACE} scroll-mt-4 rounded-2xl px-5`} data-testid={`article-section-${id}`}>
      <Fold
        title={title}
        level={2}
        defaultOpen={defaultOpen}
        {...(tally ? { tally } : {})}
        {...(marks ? { marks: <span className="flex flex-wrap items-center justify-end gap-2">{marks}</span> } : {})}
        {...(remember ? { remember } : {})}
        testId={`article-fold-${id}`}
        className="border-t-0!"
      >
        {children}
      </Fold>
    </div>
  );
}

/* ── the stepper ──────────────────────────────────────────────────────── */

const NODE_LOOK: Record<NodeState, { word: string; tone: Tone; Icon: LucideIcon | null }> = {
  pending: { word: "not started", tone: "neutral", Icon: CircleDashed },
  running: { word: "running", tone: "cyan", Icon: null },
  stalled: { word: "stalled", tone: "amber", Icon: PauseCircle },
  done: { word: "done", tone: "emerald", Icon: Check },
  failed: { word: "failed", tone: "rose", Icon: AlertTriangle },
  waiting: { word: "your call", tone: "amber", Icon: Hourglass },
  rejected: { word: "rejected", tone: "neutral", Icon: Ban },
};

const NODE_RING: Record<Tone, string> = {
  cyan: "border-cyan-300/50 text-cyan-200",
  amber: "border-amber-300/60 text-amber-200",
  rose: "border-rose-400/60 text-rose-200",
  emerald: "border-emerald-300/45 text-emerald-200",
  neutral: "border-white/15 text-white/40",
};

export function Stepper({ nodes }: { nodes: StepNode[] }) {
  return (
    <ol className="grid grid-cols-6 gap-2" aria-label="steps" data-testid="article-stepper">
      {nodes.map((n, i) => {
        const look = NODE_LOOK[n.state];
        const took = span(n.startedAt, n.endedAt);
        return (
          <li key={n.id} data-step={n.id} data-state={n.state} className="relative min-w-0">
            {i > 0 && <span aria-hidden className={`absolute top-4 right-[calc(50%+20px)] left-[calc(-50%+20px)] h-px ${n.state === "pending" ? "bg-white/10" : "bg-cyan-300/35"}`} />}
            <div className="flex flex-col items-center gap-1.5 text-center">
              <span aria-hidden className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full border bg-[var(--gt-ink)] ${NODE_RING[look.tone]}`}>
                {look.Icon ? <look.Icon className="h-4 w-4" /> : <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyan-300" />}
              </span>
              <span className="font-jetbrains text-label tracking-[0.14em] text-white/80 uppercase">{n.id}</span>
              <span className={`text-label ${TONE_TEXT[look.tone]}`}>{look.word}</span>
              {(took || n.costUsd !== undefined) && (
                <span className="font-jetbrains text-label text-white/45">
                  {[took, n.costUsd !== undefined ? fmtUsd(n.costUsd) : null].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ── the draft ────────────────────────────────────────────────────────── */

/**
 * The post as the reader will get it, in a SANDBOXED frame: the agent read the
 * open web to write it, so the frame runs no script, opens nothing, and the
 * route serves it under a CSP that loads nothing off the network.
 */
export function DraftFrame({ runId, post, title }: { runId: string; post: string; title: string }) {
  const src = runFileUrl(runId, post);
  return (
    <div className="space-y-2">
      <iframe
        src={src}
        title={`draft: ${title}`}
        sandbox=""
        referrerPolicy="no-referrer"
        className="h-[78vh] w-full rounded-xl border border-white/10 bg-white"
        data-testid="article-draft"
      />
      <a href={src} target="_blank" rel="noreferrer" className="font-jetbrains inline-flex items-center gap-1.5 text-label text-cyan-200/80 hover:text-cyan-100">
        {post}
        <ExternalLink aria-hidden className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

/* ── the check report ─────────────────────────────────────────────────── */

const CHECK_LOOK: Record<CheckItem["status"], { word: string; tone: Tone; Icon: LucideIcon }> = {
  fail: { word: "fail", tone: "rose", Icon: AlertTriangle },
  // Amber, not grey: not measured is a state the human must see, never a pass
  // (app/_phases/script/_parts/GatePanel.tsx holds the same rule).
  "not-measured": { word: "not measured", tone: "amber", Icon: CircleDashed },
  pass: { word: "pass", tone: "emerald", Icon: Check },
};

function CheckRow({ it }: { it: CheckItem }) {
  const look = CHECK_LOOK[it.status];
  return (
    <li data-status={it.status} className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 py-2.5">
      <span className={`${CHIP_CLASS} ${TALLY_TONE[look.tone]} uppercase`}>
        <look.Icon aria-hidden className="h-3.5 w-3.5" />
        {look.word}
      </span>
      <div className="min-w-0">
        <p className="text-content text-white/85">
          <span className="font-jetbrains mr-2 text-label tracking-[0.12em] text-white/40 uppercase">{it.dimension}</span>
          {it.label}
        </p>
        {it.detail && it.detail.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {it.detail.map((d, i) => (
              <li key={i} className="font-jetbrains text-label break-words text-white/55">
                {d}
              </li>
            ))}
          </ul>
        )}
      </div>
      {(it.value !== undefined || it.expected) && (
        <span className="font-jetbrains text-right text-label whitespace-nowrap text-white/60">
          {it.value !== undefined && <span className="text-white/85">{String(it.value)}</span>}
          {it.expected && <span className="ml-1.5 text-white/40">{it.expected}</span>}
        </span>
      )}
    </li>
  );
}

/** One line per check the engine ran between writer turns: what failed and whether the writer
 *  fixed it (lib/articles/engine.ts checkLoop). */
function passLine(p: CheckPassRecord): string {
  const where = p.label === "draft" ? "after the draft" : `after revision ${p.label.replace("round-", "")}`;
  if (!p.failed.length) return `${where}, pass ${p.pass}: clean`;
  const ids = p.failed.map((f) => f.id).join(", ");
  if (p.fixError) return `${where}, pass ${p.pass}: ${ids} failed; the fix turn failed (${p.fixError})`;
  return `${where}, pass ${p.pass}: ${ids} failed${p.fixed ? "; sent back to the writer" : "; left as it is (fix bound reached)"}`;
}

export function CheckView({ report, runId, passes }: { report: CheckReport; runId: string; passes?: CheckPassRecord[] }) {
  // The counts ride on the section's closed header (RunView), not twice.
  const items = checkOrder(report);
  const passed = items.filter((it) => it.status === "pass");
  // LAYERED: what failed and what nobody measured are the human's call, so they
  // are the section's first read, each detail verbatim. The passes and the
  // loop's history (what the writer was sent back to fix) are the record, one
  // press down.
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-white/[0.06]" data-testid="article-check-items">
        {items.filter((it) => it.status === "fail").map((it) => <CheckRow key={it.id} it={it} />)}
        {report.notMeasured.map((dim) => {
          const look = CHECK_LOOK["not-measured"];
          return (
            <li key={`dim-${dim}`} data-status="not-measured" className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 py-2.5">
              <span className={`${CHIP_CLASS} ${TALLY_TONE[look.tone]} uppercase`}>
                <look.Icon aria-hidden className="h-3.5 w-3.5" />
                {look.word}
              </span>
              <p className="text-content text-white/85">
                <span className="font-jetbrains mr-2 text-label tracking-[0.12em] text-white/40 uppercase">{dim}</span>
                your judgement
              </p>
            </li>
          );
        })}
        {items.filter((it) => it.status === "not-measured").map((it) => <CheckRow key={it.id} it={it} />)}
      </ul>
      {passed.length > 0 && (
        <Fold title="passed" tally={{ value: passed.length, tone: "emerald" }} level={3}>
          <ul className="divide-y divide-white/[0.06]" data-testid="article-check-passed">
            {passed.map((it) => <CheckRow key={it.id} it={it} />)}
          </ul>
        </Fold>
      )}
      {passes && passes.length > 0 && (
        <Fold
          title="check loop"
          tally={{ value: passes.length, label: "passes" }}
          marks={passes.some((p) => p.fixError) ? <Tally value={passes.filter((p) => p.fixError).length} label="fix failed" tone="rose" /> : undefined}
          level={3}
        >
          <ul className="space-y-0.5" data-testid="article-check-passes">
            {passes.map((p) => (
              <li key={`${p.label}-${p.pass}`} className="font-jetbrains text-label break-words text-white/55">
                {passLine(p)}
              </li>
            ))}
          </ul>
        </Fold>
      )}
      {report.screenshots.length > 0 && (
        <div className="flex flex-wrap gap-3" data-testid="article-check-shots">
          {report.screenshots.map((s) => (
            <a key={s} href={runFileUrl(runId, s)} target="_blank" rel="noreferrer" className="group block w-44">
              {/* eslint-disable-next-line @next/next/no-img-element -- a run file through the article file seam */}
              <img src={runFileUrl(runId, s)} alt={s} loading="lazy" decoding="async" className="h-28 w-44 rounded-lg border border-white/10 object-cover object-top" />
              <span className="font-jetbrains mt-1 block truncate text-label text-white/50 group-hover:text-white/80">{s.split("/").pop()}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── the sources ──────────────────────────────────────────────────────── */

export function SourcesTable({ sources, claims }: { sources: Source[]; claims: Claim[] }) {
  const carried = new Map<number, number>();
  for (const c of claims) carried.set(c.source, (carried.get(c.source) ?? 0) + 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left" data-testid="article-sources">
        <thead>
          <tr className="font-jetbrains text-label tracking-[0.14em] text-white/40 uppercase">
            <th scope="col" className="py-2 pr-3 font-normal">n</th>
            <th scope="col" className="py-2 pr-3 font-normal">source</th>
            <th scope="col" className="py-2 pr-3 font-normal">date</th>
            <th scope="col" className="py-2 pr-3 font-normal">kind</th>
            <th scope="col" className="py-2 pr-3 font-normal">took</th>
            <th scope="col" className="py-2 font-normal">claims</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {sources.map((s) => (
            <tr key={s.n} className="align-top">
              <td className="font-jetbrains py-2.5 pr-3 text-label text-white/55">[{s.n}]</td>
              <td className="py-2.5 pr-3">
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-content text-white/90 hover:text-cyan-100">
                  {s.title}
                </a>
                <span className="block text-label text-white/45">{s.publisher}</span>
              </td>
              <td className="font-jetbrains py-2.5 pr-3 text-label whitespace-nowrap text-white/60">{s.date}</td>
              <td className="py-2.5 pr-3">
                <span className="flex flex-wrap gap-1">
                  {s.primary && <span className={`${CHIP_CLASS} ${TALLY_TONE.cyan} uppercase`}>primary</span>}
                  {s.counter && <span className={`${CHIP_CLASS} ${TALLY_TONE.amber} uppercase`}>counter</span>}
                </span>
              </td>
              <td className="py-2.5 pr-3 text-label text-white/65">{s.took}</td>
              <td className="font-jetbrains py-2.5 text-label text-white/55">{carried.get(s.n) ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── the patches ──────────────────────────────────────────────────────── */

const LINE_CLASS = (l: string) =>
  l.startsWith("+++") || l.startsWith("---")
    ? "text-white/45"
    : l.startsWith("+")
      ? "bg-emerald-400/[0.08] text-emerald-100"
      : l.startsWith("-")
        ? "bg-rose-400/[0.08] text-rose-100"
        : l.startsWith("@@")
          ? "text-cyan-200/70"
          : "text-white/60";

export function Diff({ diff }: { diff: string }) {
  if (!diff.trim()) return <p className="font-jetbrains text-label text-amber-200/80">no diff on disk</p>;
  return (
    <pre className="font-jetbrains max-h-96 overflow-auto rounded-lg border border-white/8 bg-black/30 py-2 text-label leading-relaxed">
      {diff.replace(/\n$/, "").split("\n").map((l, i) => (
        <span key={i} className={`block px-3 whitespace-pre-wrap ${LINE_CLASS(l)}`}>
          {l || " "}
        </span>
      ))}
    </pre>
  );
}

/** One proposed registry patch. `pick` is present only at the gate; once the
 *  human has acted, `verdict` says what became of it. */
export function PatchCard({
  patch,
  pick,
  verdict,
}: {
  patch: RegistryPatch & { diff: string };
  pick?: { checked: boolean; onChange: (v: boolean) => void; disabled: boolean };
  verdict?: "approved" | "declined";
}) {
  const box = `patch-${patch.id}`;
  return (
    <article className="rounded-xl border border-white/8 bg-white/[0.02] p-4" data-testid={`article-patch-${patch.id}`}>
      <header className="flex flex-wrap items-center gap-2">
        {pick && (
          <input
            id={box}
            type="checkbox"
            checked={pick.checked}
            disabled={pick.disabled}
            onChange={(e) => pick.onChange(e.target.checked)}
            className="h-4 w-4 accent-cyan-300"
            data-testid={`article-patch-pick-${patch.id}`}
          />
        )}
        <label htmlFor={pick ? box : undefined} className="font-jetbrains text-label tracking-[0.12em] text-white/85 uppercase">
          {patch.id}
        </label>
        <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral} uppercase`}>{patch.kind}</span>
        <span className="font-jetbrains min-w-0 truncate text-label text-white/70">{patch.target}</span>
        <span className="font-jetbrains text-label text-white/45">{patch.sources.map((n) => `[${n}]`).join(" ")}</span>
        {verdict && (
          <span className={`${CHIP_CLASS} ${verdict === "approved" ? TALLY_TONE.emerald : TALLY_TONE.neutral} ml-auto uppercase`}>{verdict}</span>
        )}
      </header>
      <p className="mt-2 text-content text-white/80">{patch.rationale}</p>
      <div className="mt-3">
        <Diff diff={patch.diff} />
      </div>
    </article>
  );
}

/** Proposals the engine refused before they reached the gate: outside
 *  knowledge/ or recipes/, unsourced, or identical to what is there. Each row
 *  carries the engine's own reason verbatim, which is why the header needs no
 *  gloss. */
export function RefusedPatches({ refused }: { refused: { reason: string; target: string | null; id: string | null }[] }) {
  return (
    <div data-testid="article-refused-patches">
      <Fold title="refused" tally={{ value: refused.length, tone: "amber" }} level={3}>
        <ul className="space-y-1">
          {refused.map((r, i) => (
            <li key={i} className="font-jetbrains text-label text-white/60">
              {[r.id, r.target].filter(Boolean).join(" · ") || "unnamed"} — <span className="text-amber-200/85">{r.reason}</span>
            </li>
          ))}
        </ul>
      </Fold>
    </div>
  );
}
