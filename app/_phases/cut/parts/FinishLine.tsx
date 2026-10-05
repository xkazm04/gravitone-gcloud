"use client";

// The finish line as a table: check · value · target · verdict, and what is in
// the way — StatReel's render gate (RenderGatePage.tsx) in this app's ink. The
// rows are computed by ../finishLine.ts; this only draws them, and a row whose
// owner is an upstream step links to it.

import { Fragment } from "react";

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
  const { checks, openStep } = useCutCtx();
  const failing = checks.filter((c) => c.verdict === "fail").length;
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
