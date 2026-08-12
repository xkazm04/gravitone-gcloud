"use client";

import { ConnectorChip } from "../../_shared/notebook/Chips";
import type { Beat } from "../types";

/** A render, read as beats. Every beat carries its connector to the previous
 *  one — the one law, made a UI invariant (short-form PATTERNS §12.4). */
export default function BeatList({ beats }: { beats: Beat[] }) {
  return (
    <ol className="space-y-3">
      {beats.map((b) => (
        <li key={b.at} className="grid grid-cols-[3.2rem_1fr] gap-3">
          <span className="font-jetbrains pt-0.5 text-[11px] text-white/30">{b.at}</span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <ConnectorChip connector={b.connector} />
              <span
                className={`font-jetbrains text-[11px] tracking-[0.1em] ${
                  b.kind === "turn"
                    ? "text-violet-200"
                    : b.kind === "steelman"
                      ? "text-emerald-300/90"
                      : b.kind === "close" || b.kind === "verdict"
                        ? "text-cyan-200"
                        : "text-white/45"
                }`}
              >
                {b.label}
              </span>
              {b.device && (
                <span className="font-jetbrains rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/35">
                  {b.device}
                </span>
              )}
            </p>
            <p className="font-hanken mt-1 text-[15px] leading-relaxed text-slate-300">{b.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
