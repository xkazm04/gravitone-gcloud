"use client";

// The finish line as a table: check · value · target · verdict, and what is in
// the way — StatReel's render gate (RenderGatePage.tsx) in this app's ink. The
// rows are computed by ../finishLine.ts; this only draws them, and a row whose
// owner is an upstream step links to it.

import { Fragment } from "react";

import { Hint, PipRow, type PipState } from "@/components/ui/signal";
import { absenceReason } from "@/lib/capabilities";
import { withAccess } from "@/lib/imagingClient";
import { useCapabilities } from "@/lib/useCapabilities";

import Notice from "../../_shared/ui/Notice";
import { useAnimaticExport } from "../useAnimaticExport";
import { useCutCtx } from "../useCut";
import type { Verdict } from "../finishLine";

const VERDICT: Record<Verdict, { word: string; cls: string }> = {
  pass: {
    word: "pass",
    cls: "border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-200",
  },
  fail: {
    word: "fail",
    cls: "border-rose-400/35 bg-rose-400/[0.08] text-rose-200",
  },
  unmeasured: { word: "—", cls: "border-dashed border-white/15 text-white/45" },
};

export function FinishLine({
  className = "",
  dense = false,
}: {
  className?: string;
  dense?: boolean;
}) {
  const { checks, openStep, projectId, cut, offsets, takeIds } = useCutCtx();
  const failing = checks.filter((c) => c.verdict === "fail").length;
  const animatic = useAnimaticExport({ projectId, cut, offsets, takeIds });
  // The export spawns ffmpeg in the server process: off where the posture
  // forbids it (lib/capabilities.ts localRender), shut while the answer is in
  // flight. NOT gated on the verdicts — an animatic with holes is the review
  // artifact, and the document carries the failing rows.
  const { caps, facts, known: capsKnown } = useCapabilities();
  return (
    <section
      className={`rounded-2xl border border-white/8 bg-white/[0.02] p-4 ${className}`}
      aria-label="Finish line"
    >
      <p className="font-jetbrains flex items-center justify-between text-label tracking-[0.14em] text-white/45 uppercase">
        <span>finish line</span>
        <span className={failing ? "text-rose-300/90" : "text-emerald-300/90"}>
          {failing ? `${failing} open` : "clear"}
        </span>
      </p>
      <table className="mt-3 w-full border-collapse text-left">
        <caption className="sr-only">
          Checks between this cut and a render
        </caption>
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
            <Fragment key={c.id}>
              <tr
                data-check={c.id}
                data-verdict={c.verdict}
                className="border-t border-white/6 align-top"
              >
                <th
                  scope="row"
                  className="font-jetbrains w-full py-2 pr-2 text-left text-label font-normal tracking-[0.1em] text-white/55 uppercase"
                >
                  {c.owner ? (
                    <button
                      type="button"
                      onClick={() => openStep(c.owner!)}
                      className="cursor-pointer text-left uppercase transition hover:text-white"
                      aria-label={`${c.label} — open ${c.owner}`}
                    >
                      {c.label}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
                <td className="font-jetbrains py-2 pr-2 text-right text-label whitespace-nowrap text-white tabular-nums">
                  {c.value}
                </td>
                <td className="font-jetbrains py-2 pr-2 text-right text-label whitespace-nowrap text-white/40 tabular-nums">
                  {c.target}
                </td>
                <td className="py-2 text-right">
                  <span
                    className={`font-jetbrains inline-block min-w-12 rounded border px-1.5 text-center text-label uppercase ${VERDICT[c.verdict].cls}`}
                  >
                    {VERDICT[c.verdict].word}
                    {c.verdict === "unmeasured" && (
                      <span className="sr-only">unmeasured</span>
                    )}
                  </span>
                </td>
              </tr>
              {/* What is in the way, on its own line under the row it blocks —
                full width, so it reads as a sentence and not a wrapped cell. */}
              {!dense && c.deny && (
                <tr>
                  <td
                    colSpan={4}
                    className="font-hanken pb-2 text-label text-white/45"
                  >
                    {c.deny}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {!dense && (
        <div className="mt-3 border-t border-white/6 pt-3" data-testid="animatic-export">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void animatic.run()}
              disabled={animatic.status === "exporting" || !caps.localRender}
              data-testid="animatic-export-run"
              className="font-jetbrains rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-label text-cyan-100 transition enabled:hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {animatic.status === "exporting" ? "exporting animatic…" : animatic.result ? "export again" : "export animatic"}
            </button>
            {capsKnown && !caps.localRender && (
              <Hint variant="lock" tone="amber" label="why export is off">
                {absenceReason("localRender", facts)}
              </Hint>
            )}
            {animatic.result && (
              <a
                href={withAccess(animatic.result.downloadUrl)}
                download
                data-testid="animatic-export-download"
                className="font-jetbrains text-label text-cyan-200 underline-offset-2 hover:underline"
              >
                download mp4
              </a>
            )}
          </div>
          {animatic.result && (
            <p className="font-jetbrains mt-2 text-label text-white/45" data-testid="animatic-export-summary">
              {animatic.result.sidecar.gaps.picture} picture and {animatic.result.sidecar.gaps.audio} audio gaps
              {failing ? `, ${failing} check${failing === 1 ? "" : "s"} open` : ""}
              {animatic.result.unreachable.length ? `, ${animatic.result.unreachable.length} unreachable` : ""}
            </p>
          )}
          {animatic.error && (
            <div className="mt-2">
              <Notice title="Animatic export failed">
                <p data-testid="animatic-export-error">{animatic.error}</p>
              </Notice>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** The stage bar's one instruction: the first open check, and the step that
 *  closes it. StatReel's ControlRoom carries a "next action" in the same
 *  place; here it is read off the finish line rather than authored. */
export function NextAction({ className = "" }: { className?: string }) {
  const { checks, openStep } = useCutCtx();
  const next = checks.find((c) => c.verdict === "fail");
  if (!next) return null;
  return (
    <button
      type="button"
      onClick={() => next.owner && openStep(next.owner)}
      disabled={!next.owner}
      data-testid="next-action"
      className={`font-jetbrains inline-flex min-w-0 items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-400/[0.06] px-2.5 py-1 text-label text-rose-100/90 transition enabled:hover:bg-rose-400/12 ${className}`}
    >
      <span className="uppercase opacity-60">next</span>
      <span className="truncate">{next.deny ?? next.label}</span>
      {next.owner && <span className="text-white/50">→ {next.owner}</span>}
    </button>
  );
}

const PIP: Record<Verdict, PipState> = { pass: "filled", fail: "rose", unmeasured: "hollow" };

/** THE FINISH LINE AT A GLANCE — one pip per check, in the table's order, for
 *  the stage bar. Below xl the table itself drops under the monitor, so
 *  without this the state of the cut is a scroll away from the transport. */
export function FinishPips({ className = "" }: { className?: string }) {
  const { checks } = useCutCtx();
  if (checks.length === 0) return null;
  const pass = checks.filter((c) => c.verdict === "pass").length;
  const fail = checks.filter((c) => c.verdict === "fail").length;
  return (
    <PipRow
      states={checks.map((c) => PIP[c.verdict])}
      label={`finish line: ${pass} of ${checks.length} pass${fail ? `, ${fail} open` : ""}`}
      className={className}
    />
  );
}
