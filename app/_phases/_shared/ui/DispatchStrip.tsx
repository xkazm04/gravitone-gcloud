"use client";

// THE PRE-FLIGHT STRIP — what the next turn sends, what it holds back, who
// serves it and about how long it takes here, beside the control that spends
// it (AIO-B session 2). Shared by the Script pad's Recalibrate and the Frames
// direction pass, so it lives here rather than in either step.
//
// Built from the signal vocabulary only. Every figure is the server's
// (POST /api/turns/preview, through lib/turns/usePreview.ts): the manifest is
// built by the same assembler that builds the prompt, so the strip cannot
// describe a payload other than the one a click would dispatch.
//
// Two states stop the run control, and both are drawn here because the
// control reads them from the same outcome (lib/turns/client.ts
// `dispatchBlock`): a refusal the route would answer (its sentence, verbatim),
// and no engine able to serve (every candidate's reason, verbatim). Before
// AIO-B the second one surfaced after the click, as a simulated candidate.

import { CHIP_CLASS, Provenance, StackBar, TALLY_TONE, Tally, type StackSegment, type StackTone } from "@/components/ui/signal";
import type { PreviewOutcome, TurnPreview } from "@/lib/turns/client";

/** One withheld (or forced-in) item the creator can put into the run. */
export interface DispatchToggle {
  id: string;
  label: string;
  /** Forced in by the creator. */
  on: boolean;
  /** Toggles of one group share a row; rows keep first-appearance order. */
  group?: string;
}

/** Toggles split into rows by `group`, in the order each group first appears. */
function rowsOf(toggles: DispatchToggle[]): DispatchToggle[][] {
  const rows = new Map<string, DispatchToggle[]>();
  for (const t of toggles) {
    const key = t.group ?? "";
    rows.set(key, [...(rows.get(key) ?? []), t]);
  }
  return [...rows.values()];
}

/** Block slug → tone. What the creator wrote reads cyan, the material it is
 *  measured against amber, the output it edits emerald; the app's own framing
 *  is neutral, and a "not sent" listing is hatched because it names material
 *  rather than carrying it. */
function toneOf(name: string): { tone: StackTone; hatched?: boolean } {
  if (name.endsWith("-not-sent")) return { tone: "neutral", hatched: true };
  if (name === "notes" || name === "scope") return { tone: "cyan" };
  if (name === "notebook" || name === "conclusions") return { tone: "amber" };
  if (name === "renders" || name === "script") return { tone: "emerald" };
  return { tone: "neutral" };
}

/** Thousands of characters, never rounding a non-empty block to zero. */
const k = (chars: number) => (chars > 0 ? Math.max(1, Math.round(chars / 1000)) : 0);

function duration(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

const usd = (n: number) => `$${n.toFixed(n >= 1 ? 2 : n >= 0.01 ? 3 : 4)}`;

/** The cost cell: a median when the ring has one, the basis when it has none,
 *  and nothing for a local seat that reports its own figure afterwards. */
function costOf(p: TurnPreview): string | undefined {
  if (p.estimate.p50CostUsd !== null) return `~${usd(p.estimate.p50CostUsd)}`;
  if (p.engine.costBasis === "unpriced") return "unpriced";
  return undefined;
}

export default function DispatchStrip({
  id,
  outcome,
  toggles = [],
  onToggle,
}: {
  /** The run control points `aria-describedby` here when the strip blocks it. */
  id: string;
  outcome: PreviewOutcome | null;
  toggles?: DispatchToggle[];
  onToggle?: (id: string, group?: string) => void;
}) {
  if (!outcome) return null;

  if (!outcome.ok) {
    // Only the route's own refusals are drawn. A preview that failed for any
    // other reason (access, network, a 5xx) is advisory and says nothing; the
    // run's route remains the authority.
    if (outcome.status !== 400 && outcome.status !== 413) return null;
    return (
      <p id={id} data-testid="dispatch-refusal" className="font-jetbrains text-content leading-snug text-rose-200/90">
        {outcome.detail}
      </p>
    );
  }

  const { manifest, engine, estimate } = outcome.preview;
  const renders = manifest.renders;
  const held = manifest.conclusions?.held.length ?? 0;
  const segments: StackSegment[] = manifest.blocks
    .filter((b) => b.chars > 0)
    .map((b) => ({ n: k(b.chars), label: b.name, ...toneOf(b.name) }));
  const near = manifest.totalChars > manifest.ceilingChars * 0.85;

  return (
    <div id={id} data-testid="dispatch-strip" className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {renders && (
          <Tally
            label="renders"
            value={renders.sent.length}
            of={renders.sent.length + renders.notSent.length}
            tone={renders.notSent.length ? "amber" : "neutral"}
          />
        )}
        {held > 0 && (
          <Tally label="held" value={held} of={held + (manifest.conclusions?.whole.length ?? 0)} tone="amber" />
        )}
        <Tally label="k chars" value={k(manifest.totalChars)} of={k(manifest.ceilingChars)} tone={near ? "amber" : "neutral"} />
        {engine.available ? (
          <Provenance
            vendor={engine.rung === "alternate" ? `${engine.provider} · fallback` : engine.provider}
            cost={costOf(outcome.preview)}
          />
        ) : (
          <span data-testid="dispatch-no-engine" className={`${CHIP_CLASS} ${TALLY_TONE.rose}`}>
            no engine
          </span>
        )}
        {engine.available && estimate.p50Ms !== null && (
          <span data-testid="dispatch-estimate" className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>
            <span aria-hidden className="uppercase opacity-80">
              p50
            </span>
            <span aria-hidden>
              {duration(estimate.p50Ms)} · n {estimate.n}
            </span>
            <span className="sr-only">
              median {duration(estimate.p50Ms)} over {estimate.n} runs
            </span>
          </span>
        )}
      </div>

      {segments.length > 0 && <StackBar segments={segments} label="prompt, thousands of characters" />}

      {rowsOf(toggles).map((row) => (
        <div key={row[0]!.group ?? ""} className="flex flex-wrap items-center gap-1.5">
          {row.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`dispatch-include-${t.id}`}
              aria-pressed={t.on}
              onClick={() => onToggle?.(t.id, t.group)}
              className={`${CHIP_CLASS} ${t.on ? TALLY_TONE.emerald : TALLY_TONE.neutral} transition hover:border-emerald-400/40`}
            >
              <span aria-hidden>{t.on ? "✓" : "+"}</span>
              {t.label}
            </button>
          ))}
        </div>
      ))}

      {!engine.available && engine.descent.length > 0 && (
        <ul data-testid="dispatch-descent" className="font-jetbrains space-y-0.5 text-label leading-snug text-rose-200/80">
          {engine.descent.map((d) => (
            <li key={d.provider}>
              {d.provider} · {d.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
