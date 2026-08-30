"use client";

// Measurement leaves. Script-owned: a band and a craft check are things only a
// render is scored against.

import type { CheckRow, CheckState } from "../types";

/** A measured value against a library band. Out-of-band is not an error — it is
 *  a thing the writer must defend, so it renders amber and keeps the number. */
export function BandMeter({
  label,
  value,
  band,
  unit = "",
  belowNote,
  aboveNote,
}: {
  label: string;
  value: number;
  band: [number, number];
  unit?: string;
  belowNote?: string;
  aboveNote?: string;
}) {
  const [lo, hi] = band;
  const span = Math.max(hi + 2, value + 1);
  const inBand = value >= lo && value <= hi;
  const note = value < lo ? belowNote : value > hi ? aboveNote : undefined;
  return (
    <div>
      <div className="font-jetbrains flex items-baseline justify-between text-label">
        <span className="text-white/45">{label}</span>
        <span className={inBand ? "text-cyan-200" : "text-amber-200"}>
          {value}
          {unit} <span className="text-white/30">/ band {lo}–{hi}</span>
        </span>
      </div>
      <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <span
          className="absolute inset-y-0 bg-white/10"
          style={{ left: `${(lo / span) * 100}%`, width: `${((hi - lo) / span) * 100}%` }}
        />
        <span
          className={`absolute inset-y-0 w-[3px] rounded-full ${inBand ? "bg-cyan-300" : "bg-amber-300"}`}
          style={{ left: `calc(${(value / span) * 100}% - 1.5px)` }}
        />
      </div>
      {note && <p className="font-jetbrains mt-1 text-content text-amber-200/80">{note}</p>}
    </div>
  );
}

/** `label` is the state in words, and it is not decoration: the glyph and the
 *  colour are the ONLY thing distinguishing a passed craft check from a failed
 *  one, so without it a reader who does not see colour is handed a list of
 *  sentences with no verdicts attached — and `declared`, the state this app
 *  invented precisely so a deviation could not hide, is the one that vanishes
 *  most completely (a bare "!"). */
const CHECK: Record<CheckState, { mark: string; cls: string; label: string }> = {
  pass: { mark: "✓", cls: "text-emerald-300", label: "pass" },
  declared: { mark: "!", cls: "text-amber-300", label: "declared deviation" },
  fail: { mark: "✕", cls: "text-rose-300", label: "fail" },
  unmeasured: { mark: "—", cls: "text-white/35", label: "not measured" },
};

export function CheckList({ rows }: { rows: CheckRow[] }) {
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const c = CHECK[r.state];
        return (
          <li key={r.label} className="flex gap-2.5 text-label leading-snug">
            <span aria-hidden className={`font-jetbrains mt-px w-3 shrink-0 text-center ${c.cls}`}>
              {c.mark}
            </span>
            <span className="sr-only">{c.label}: </span>
            <span>
              <span className="text-slate-300">{r.label}</span>{" "}
              <span className="text-white/40">— {r.detail}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
