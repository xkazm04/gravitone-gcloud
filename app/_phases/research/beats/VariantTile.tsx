"use client";

// One candidate beat. The whole tile is the pick target, like the triage
// board's CardTile is the scope toggle — picking is the one thing you do to
// every tile here, so it gets the entire surface rather than a pill inside one.

import type { BeatVariant } from "./beats";

const RAISED_TONE: Record<string, string> = {
  scale: "border-cyan-400/25 bg-cyan-400/[0.06] text-cyan-200/90",
  threat: "border-rose-400/35 bg-rose-400/[0.08] text-rose-200",
  speed: "border-amber-400/30 bg-amber-400/[0.06] text-amber-200",
  intimacy: "border-violet-400/35 bg-violet-400/[0.08] text-violet-200",
  cost: "border-white/15 bg-white/[0.05] text-white/70",
};

const lift = (base: string, hover: string) =>
  `${base} ${hover} transition-colors duration-200 ease-linear`;

export default function VariantTile({
  variant,
  picked,
  onPick,
  readOnly = false,
}: {
  variant: BeatVariant;
  picked: boolean;
  onPick?: () => void;
  readOnly?: boolean;
}) {
  const b = variant.beat;
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={lift("font-jetbrains rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] tracking-[0.1em] text-white/45", "group-hover:text-white/75")}>
          {b.kind}
        </span>
        {b.connector && (
          <span className={lift("font-jetbrains text-[10px] tracking-[0.12em] text-white/30", "group-hover:text-white/55")}>
            {b.connector.toLowerCase()} ·
          </span>
        )}
        <span className={lift("font-jetbrains text-[10px] tracking-[0.12em] text-white/30", "group-hover:text-white/55")}>
          {b.at}
        </span>
        {b.raises?.map((r) => (
          <span
            key={r}
            className={`font-jetbrains rounded border px-1.5 py-0.5 text-[10px] tracking-[0.1em] ${RAISED_TONE[r]}`}
          >
            raises {r}
          </span>
        ))}
        {b.resetHolds?.map((h) => (
          <span key={h} className="font-jetbrains rounded border border-white/15 bg-white/[0.05] px-1.5 py-0.5 text-[10px] tracking-[0.1em] text-white/70">
            holds {h}
          </span>
        ))}
        {b.spends?.length ? (
          <span className="font-jetbrains rounded border border-amber-400/30 bg-amber-400/[0.06] px-1.5 py-0.5 text-[10px] tracking-[0.1em] text-amber-200">
            spends {b.spends.length}
          </span>
        ) : null}
      </div>

      <p className="font-instrument mt-2 text-[15px] leading-snug text-slate-100">{b.label}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-300 transition-colors duration-200 ease-linear group-hover:text-slate-100">
        {b.text}
      </p>
      <p className={lift("font-hanken mt-2 text-[12px] leading-relaxed text-white/40", "group-hover:text-white/70")}>
        {variant.rationale}
      </p>
      {variant.risk && (
        <p className="font-jetbrains mt-2 text-[11px] leading-relaxed text-amber-200/85">
          risk — {variant.risk}
        </p>
      )}
    </>
  );

  const frame = `group block w-full rounded-xl border p-3.5 text-left ${
    picked
      ? "border-cyan-400/45 bg-cyan-400/[0.07]"
      : "border-white/8 bg-white/[0.02]"
  }`;

  if (readOnly) {
    return (
      <div data-testid={`variant-${variant.id}`} className={frame}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid={`variant-${variant.id}`}
      aria-pressed={picked}
      onClick={onPick}
      className={`${frame} transition hover:border-white/25 focus-visible:outline-2 focus-visible:outline-offset-2`}
    >
      {body}
    </button>
  );
}
