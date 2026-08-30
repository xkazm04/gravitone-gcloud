"use client";

// The withholding budget, as the project-level object it is.
//
// Five named assets of the WORK × {spend, imply, hold}, and a recorded trade
// for every spend. It cannot live on a beat — it binds to the campaign, and the
// checker reads it beside the cut (`checkWithholding`). A spend with no trade
// is drawn as the defect word it is; the panel never refuses the flip, because
// "a spend with no recorded reason is a drift that has already happened" and a
// drift you can record is one you can find.

import { Segmented } from "@/components/ui/Field";

import type { Allowance, WithholdingBudget } from "./types";

const ALLOWANCES: ReadonlyArray<{ id: Allowance; label: string }> = [
  { id: "spend", label: "spend" },
  { id: "imply", label: "imply" },
  { id: "hold", label: "hold" },
];

export default function WithholdingPanel({
  budget,
  onAllowance,
}: {
  budget: WithholdingBudget;
  onAllowance: (assetId: string, allowance: Allowance, trade?: string) => void;
}) {
  const untraded = budget.assets.filter((a) => a.allowance === "spend" && !a.trade).length;

  return (
    <section data-testid="withholding-panel" className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <p className="font-jetbrains flex items-baseline justify-between text-label tracking-[0.14em] uppercase">
        <span className="text-white/35">withholding budget · {budget.campaignId}</span>
        <span className={untraded ? "text-amber-200" : "text-white/45"}>
          {budget.assets.filter((a) => a.allowance === "spend").length} spent · {untraded} without a trade
        </span>
      </p>

      <ul className="mt-3 space-y-3">
        {budget.assets.map((a) => {
          const spendNoTrade = a.allowance === "spend" && !a.trade;
          return (
            <li key={a.id} data-testid={`asset-${a.id}`} className="border-t border-white/8 pt-3 first:border-t-0 first:pt-0">
              <p className="font-jetbrains text-label tracking-[0.14em] text-white/35 uppercase">{a.kind}</p>
              <p className="font-hanken mt-0.5 text-[14px] leading-snug text-slate-200">{a.name}</p>
              <Segmented<Allowance>
                label="allowance"
                value={a.allowance}
                options={ALLOWANCES}
                onChange={(next) => onAllowance(a.id, next, a.trade)}
                className="mt-2"
              />
              {a.allowance === "spend" && (
                <div className="mt-2">
                  <label className="font-jetbrains text-label tracking-[0.14em] text-white/35 uppercase" htmlFor={`trade-${a.id}`}>
                    trade
                    <span
                      data-testid={`trade-state-${a.id}`}
                      className={`ml-2 normal-case tracking-normal ${spendNoTrade ? "text-amber-200" : "text-emerald-300/80"}`}
                    >
                      {spendNoTrade ? "spend without a recorded trade" : "recorded"}
                    </span>
                  </label>
                  <input
                    id={`trade-${a.id}`}
                    data-testid={`trade-${a.id}`}
                    defaultValue={a.trade ?? ""}
                    onBlur={(e) => onAllowance(a.id, "spend", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onAllowance(a.id, "spend", e.currentTarget.value)}
                    placeholder="what this spend buys, and what it costs the work"
                    className="font-hanken mt-1 w-full rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1 text-label text-slate-200 placeholder:text-white/25"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
