"use client";

// THE FORGE'S RUNS — the strip along the top of the cull, the bar that sticks
// over the grid, and the run that has not happened yet.
//
//   RunStrip    one card per run, scrolling sideways: its best frame, its
//               name, its state, its live figure
//   RunBar      the selected run, sticky: where the reader is (run ›
//               candidate), its state, its facts, and the live progress
//
// Round 2 drew the runs three ways, one per prototype direction (a rail of
// mosaic cards, a Select, this strip); round 3 kept the operator's pick and
// deleted the other two with their direction.
//
// And `ForgeEmpty`: the state the operator photographed as "a dashed box and
// a command". Absence here is not a hole — it is the command, copyable, beside
// the shape a run will take once it exists: a card with its mosaic, a matrix of
// styles by mechanisms. Washed, not dashed, and silent to a screen reader
// except for what is actually true ("no forge runs yet").

import { Tally } from "@/components/ui/signal";
import type { Candidate, RunManifest, RunSummary } from "@/lib/foundry/types";

import { LIVE, STATUS_WORD, runKind, type PlantState } from "./parts";
import type { RunPreview } from "./plant";
import { Art, CommandCard, ErrorNote, FORGE_COMMAND, Glass, Label, ProgressRail, STATE_TONE, StatusChip } from "./ui";

/** "2026-10-05T09:12…" → "5 Oct, 09:12". Coarse on purpose: a run list is
 *  read by order, not by the minute. */
export function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

/** One run, on one line: the run's best frame, its name, its state, and —
 *  while the forge is on it — done/total. A strip that scrolls sideways has no
 *  height to spend on a mosaic. */
function StripCard({ r, preview, current, onSelect }: { r: RunSummary; preview?: RunPreview; current: boolean; onSelect: () => void }) {
  const kind = runKind(r.status);
  const live = LIVE.includes(r.status);
  return (
    <button
      type="button"
      aria-current={current ? "true" : undefined}
      onClick={onSelect}
      className={`flex w-[330px] shrink-0 cursor-pointer items-center gap-3 rounded-xl border p-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
        current ? "border-cyan-400/45 bg-cyan-400/[0.07] shadow-[0_0_0_1px_var(--gt-ring-cyan)]" : "border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
      }`}
    >
      <Art src={preview?.thumbs[0]} alt="" state={preview?.thumbs[0] ? "ready" : "blank"} className="aspect-video w-24 shrink-0" rounded="rounded-lg" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className={`font-hanken truncate text-content ${current ? "text-white" : "text-white/85"}`}>{r.id}</span>
        {live && r.progress.total > 0 && <ProgressRail done={r.progress.done} total={r.progress.total} tone={STATE_TONE[kind]} />}
        <span className="flex items-center justify-between gap-2">
          <StatusChip kind={kind} word={STATUS_WORD[r.status]} />
          <span className="font-jetbrains shrink-0 text-label text-white/45 tabular-nums">
            <span className={r.kept ? "text-emerald-200/90" : "text-white/75"}>{r.kept}</span>/{r.candidates}
          </span>
        </span>
      </span>
    </button>
  );
}

export function RunStrip({
  runs,
  previews,
  selected,
  onSelect,
  error,
  onRetry,
}: {
  runs: RunSummary[] | null;
  previews: Record<string, RunPreview>;
  selected: string | null;
  onSelect: (id: string) => void;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <nav aria-label="Forge runs" className="flex min-w-0 flex-col gap-3">
      {error && <RunsError error={error} onRetry={onRetry} />}
      <div className="scroll-x -mx-1 flex gap-3 px-1 pb-2">
        {runs?.map((r) => (
          <StripCard key={r.id} r={r} preview={previews[r.id]} current={r.id === selected} onSelect={() => onSelect(r.id)} />
        ))}
      </div>
    </nav>
  );
}

function RunsError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <ErrorNote
      action={
        <button type="button" onClick={onRetry} className="font-jetbrains shrink-0 cursor-pointer rounded-md border border-rose-300/30 px-2 py-0.5 text-label text-rose-100 hover:bg-rose-400/15">
          retry
        </button>
      }
    >
      {error}
    </ErrorNote>
  );
}

/** The run's facts as tallies — the strip that used to be a sentence of bold
 *  numbers. */
export function RunFacts({ run }: { run: RunManifest }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tally label="scenes" value={run.scenes.length} />
      <Tally label="styles" value={run.plan.styles.length} />
      <Tally label="mechanisms" value={run.plan.mechanisms.length} />
      <Tally label="candidates" value={run.candidates.length} />
      {run.committed && (
        <>
          <Tally label="kept" value={run.committed.kept} tone="emerald" />
          <Tally label="deleted" value={run.committed.deleted} tone="rose" />
        </>
      )}
    </div>
  );
}

/**
 * The selected run, as a bar that sticks over its grid.
 *
 * WHERE THE READER IS, which the page lost in round 2. The kit page passed
 * StudioFrame a crumb trail (Door › Foundry › Cull › run › candidate); the
 * Obsidian frame draws no crumbs at all, so the trail went with the kit and a
 * reader three screens into a sheet had nothing on screen naming the run, let
 * alone the tile the keys were on. The trail is here now, on the one surface
 * that is still in view while the grid scrolls: the run, and the candidate the
 * cull's keys will act on (`focused`, which arrows move — the same id K/X/U and
 * Enter read in ./CullGrid.tsx).
 *
 * THE LIVE FIGURE, which round 2 dropped twice (`showFigure={false}` on the
 * strip, `progress={false}` here). A forge run is hours of GPU; done/total is
 * the one number that says whether to wait or come back tomorrow.
 *
 * Opaque enough to read over pictures — `--gt-ink` at 80% under the blur — and
 * no taller when stuck than when not: nothing in it changes on scroll.
 */
export function RunBar({ run, focused }: { run: RunManifest; focused: Candidate | null }) {
  const kind = runKind(run.status);
  const live = LIVE.includes(run.status);
  const last = run.log[run.log.length - 1]?.msg;
  const at = focused ? `${run.styles[focused.style]?.name ?? focused.style} · ${focused.mechanism} · seed ${focused.seed}` : null;
  return (
    <div className="sticky top-2 z-30 rounded-2xl border border-white/10 gt-float bg-[var(--gt-ink)]/80 px-4 py-3 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <nav aria-label="Location" className="min-w-0">
          <ol className="flex min-w-0 items-baseline gap-2.5">
            <li className="shrink-0">
              <Label>cull</Label>
            </li>
            <li aria-hidden className="text-white/25">
              ›
            </li>
            <li aria-current={at ? undefined : "location"} className="min-w-0 shrink-0">
              <h2 className="font-instrument truncate text-2xl text-white">{run.id}</h2>
            </li>
            {at && (
              <>
                <li aria-hidden className="text-white/25">
                  ›
                </li>
                <li aria-current="location" className="font-hanken min-w-0 truncate text-content text-cyan-100">
                  {at}
                </li>
              </>
            )}
          </ol>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip kind={kind} word={STATUS_WORD[run.status]} />
          <span className="font-jetbrains text-label text-white/35">{when(run.created)}</span>
          <RunFacts run={run} />
        </div>
      </div>
      {live && (
        <div className="mt-2.5 grid items-center gap-x-5 gap-y-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <ProgressRail done={run.progress.done} total={run.progress.total} tone={STATE_TONE[kind]} />
          {last && <span className="font-jetbrains truncate text-label text-white/45">{last}</span>}
        </div>
      )}
      {run.error && (
        <div className="mt-2.5">
          <ErrorNote>{run.error}</ErrorNote>
        </div>
      )}
    </div>
  );
}

/* ── No runs yet ──────────────────────────────────────────────────────────── */

/** A wash block — the shape of a picture that does not exist yet. */
export function Wash({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block rounded-lg border border-white/10 bg-white/[0.02] ${className}`} style={{ backgroundImage: "linear-gradient(135deg, var(--gt-wash), transparent 75%)" }} />;
}

export function ForgeEmpty() {
  return (
    <Glass className="overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="flex flex-col justify-center gap-5 p-8">
          <Label>forge</Label>
          <h2 className="font-instrument text-4xl leading-tight text-white">No forge runs yet</h2>
          <CommandCard lines={FORGE_COMMAND} label="forge a run" className="max-w-[520px]" />
          <div className="flex flex-wrap gap-1.5" aria-hidden>
            <span className="font-jetbrains rounded-full border border-white/10 px-2.5 py-0.5 text-label text-white/45">local GPU</span>
            <span className="font-jetbrains rounded-full border border-white/10 px-2.5 py-0.5 text-label text-white/45">foundry-out/runs</span>
          </div>
        </div>
        {/* What a run will be, drawn and not described: one card on the rail,
            and its matrix — a source frame, styles down, mechanisms across. */}
        <div aria-hidden className="relative border-t border-white/6 bg-black/20 p-8 lg:border-t-0 lg:border-l">
          <div className="grid grid-cols-[170px_minmax(0,1fr)] gap-6">
            <div className="flex flex-col gap-2.5 self-start rounded-xl border border-cyan-400/25 bg-cyan-400/[0.04] p-2.5">
              <span className="grid grid-cols-3 gap-1">
                <Wash className="aspect-video" />
                <Wash className="aspect-video" />
                <Wash className="aspect-video" />
              </span>
              <span className="h-2.5 w-4/5 rounded-full bg-white/12" />
              <span className="h-2 w-1/2 rounded-full bg-white/[0.07]" />
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyan-300/60" />
                <span className="h-2 w-2/5 rounded-full bg-cyan-300/20" />
              </span>
              <span className="h-1.5 w-full rounded-full bg-white/[0.06]">
                <span className="block h-1.5 w-2/5 rounded-full bg-cyan-300/45" />
              </span>
            </div>
            <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.7fr)] gap-5">
              <div className="flex flex-col gap-2.5">
                <Wash className="aspect-video" />
                <span className="h-2.5 w-1/2 rounded-full bg-white/12" />
                <span className="h-2 w-4/5 rounded-full bg-white/[0.07]" />
                <span className="flex flex-wrap gap-1">
                  <span className="h-4 w-12 rounded-full border border-white/10" />
                  <span className="h-4 w-16 rounded-full border border-white/10" />
                  <span className="h-4 w-10 rounded-full border border-white/10" />
                </span>
              </div>
              <div className="grid grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                <span />
                <span className="font-jetbrains text-label text-cyan-200/55">text</span>
                <span className="font-jetbrains text-label text-cyan-200/55">ref-early</span>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="contents">
                    <span className="flex flex-col gap-1">
                      <span className="h-2 w-full rounded-full bg-white/12" />
                      <span className="h-1.5 w-2/3 rounded-full bg-white/[0.07]" />
                    </span>
                    <Wash className="aspect-video" />
                    <Wash className="aspect-video" />
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="sr-only">No forge runs yet.</p>
    </Glass>
  );
}

/* ── The compact rail the Extract and Dojo tabs share ─────────────────────── */

/** One row of a side rail: state, name, a line of figures. Shared by the
 *  two tabs whose summaries carry no file to show (Extract, Dojo), so a run
 *  card without a picture. */
export function RailItem({
  kind,
  word,
  title,
  meta,
  current,
  onSelect,
  progress,
  icon,
}: {
  kind?: PlantState;
  word?: string;
  title: string;
  meta?: React.ReactNode;
  current: boolean;
  onSelect: () => void;
  progress?: { done: number; total: number };
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={current ? "true" : undefined}
      onClick={onSelect}
      className={`flex w-full min-w-0 cursor-pointer flex-col gap-2 rounded-xl border px-3.5 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
        current ? "border-cyan-400/45 bg-cyan-400/[0.07] shadow-[0_0_0_1px_var(--gt-ring-cyan)]" : "border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className={`font-hanken min-w-0 truncate text-content ${current ? "text-white" : "text-white/85"}`}>{title}</span>
      </span>
      {kind && word && (
        <span>
          <StatusChip kind={kind} word={word} />
        </span>
      )}
      {progress && progress.total > 0 && <ProgressRail done={progress.done} total={progress.total} />}
      {meta && <span className="font-jetbrains text-label text-white/45">{meta}</span>}
    </button>
  );
}

export function RailFrame({ label, count, children, error, onRetry }: { label: string; count?: number; children: React.ReactNode; error?: string | null; onRetry?: () => void }) {
  return (
    <nav aria-label={label} className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-baseline justify-between px-1">
        <Label as="h2">{label}</Label>
        {count !== undefined && <span className="font-jetbrains text-label text-white/35 tabular-nums">{count}</span>}
      </div>
      {error && onRetry && <RunsError error={error} onRetry={onRetry} />}
      {children}
    </nav>
  );
}
