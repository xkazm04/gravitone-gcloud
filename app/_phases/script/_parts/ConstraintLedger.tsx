"use client";

// One render, scored against the limits the research declared.

import { ledgerFor, type EffectiveState } from "../constraints";

const MARK: Record<EffectiveState, { glyph: string; cls: string }> = {
  "at-risk": { glyph: "!", cls: "text-amber-300" },
  honoured: { glyph: "✓", cls: "text-emerald-300" },
  superseded: { glyph: "~", cls: "text-cyan-300" },
  "not-applicable": { glyph: "—", cls: "text-white/25" },
};

export default function ConstraintLedger({ renderId }: { renderId: string }) {
  const { rows, dangling, atRisk, superseded } = ledgerFor(renderId);

  return (
    <div className="mt-3 border-t border-white/8 pt-3" data-testid={`ledger-${renderId}`}>
      <p className="font-jetbrains flex items-baseline justify-between text-[11px] tracking-[0.14em] uppercase">
        <span className="text-white/35">constraint ledger</span>
        <span className={atRisk ? "text-amber-200" : superseded ? "text-cyan-200" : "text-emerald-300"}>
          {atRisk ? `${atRisk} at risk` : superseded ? `${superseded} superseded` : "clean"}
        </span>
      </p>

      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => {
          const m = MARK[r.effective];
          return (
            <li key={r.unknownId} className="text-[12px] leading-snug">
              <span className={`font-jetbrains mr-1.5 text-[10px] tracking-[0.1em] ${m.cls}`}>
                {m.glyph}
              </span>
              <span className="text-white/45">{r.unknown.impact}</span>
              <span className="block pl-4 text-white/35">{r.how}</span>
              {r.effective === "superseded" && (
                <span className="block pl-4 text-cyan-200/70">
                  this limit has since been lifted — the render is more cautious than the notebook now
                  requires
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* A row whose unknown no longer exists means this render was scored
          against a rule that has vanished. Saying so beats rendering three rows
          where the ledger has four and calling it clean. */}
      {dangling.length > 0 && (
        <p
          data-testid="ledger-dangling"
          className="font-jetbrains mt-2 text-[11px] leading-snug text-rose-300"
        >
          {dangling.length} ledger row{dangling.length === 1 ? "" : "s"} name an unknown the notebook no
          longer has ({dangling.join(", ")}) — this score is incomplete
        </p>
      )}
    </div>
  );
}
