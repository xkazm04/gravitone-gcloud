"use client";

// SPEND BAR — the matrix as a budget. Read how much, and whose.
//
// A script's runtime is fixed, so every card is a line item competing for it.
// One stacked bar per card, three segments, all bars on one scale — dominance
// is legible at a glance, which is what makes this the tab for before/after: a
// recalibration shows up as segments growing and shrinking against each other,
// not as numbers you have to diff by eye.
//
// Every card gets a row, including the ones no render touched — they draw as an
// empty channel at 0s rather than being collapsed away, so "nothing spent here"
// is a row you can put a note on like any other.

import { useState } from "react";

import type { Card } from "../../_shared/notebook/cards";
import type { ScopeApi } from "../../research/useScope";
import { stateOf } from "../../research/scope";
import { NoteHandle } from "../_notes/NotesContext";
import { RENDER_BY_ID } from "../renders";
import { coverageIn, totalIn, usageIn, type Version } from "../versions";
import { DeltaTag, MatrixFootnotes, RENDERS, ScopePip, secs } from "./shared";

const SEG = ["bg-cyan-400/70", "bg-violet-400/70", "bg-emerald-400/70"];

export default function MatrixSpend({
  api,
  version,
  baseline,
  comparing,
}: {
  api: ScopeApi;
  version: Version;
  baseline: Version;
  comparing: boolean;
}) {
  const [sort, setSort] = useState<"spend" | "change">("spend");
  const ids = api.cards.map((c) => c.id);

  const peak = Math.max(1, ...ids.map((id) => Math.max(totalIn(version, id), totalIn(baseline, id))));
  const rows = [...api.cards].sort(
    (a, b) =>
      (sort === "change" && comparing
        ? Math.abs(totalIn(version, b.id) - totalIn(baseline, b.id)) -
          Math.abs(totalIn(version, a.id) - totalIn(baseline, a.id))
        : totalIn(version, b.id) - totalIn(version, a.id)) ||
      a.id.localeCompare(b.id),
  );

  return (
    <div data-testid="matrix-spend">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="font-hanken max-w-xl text-content text-slate-400">
          Every card as a share of the runtime it was given, on one scale. Cards no render used sit
          at zero rather than being hidden — an empty channel is still a decision.
        </p>
        {comparing && (
          <button
            data-testid="sort-change"
            aria-pressed={sort === "change"}
            onClick={() => setSort((s) => (s === "change" ? "spend" : "change"))}
            className={`font-jetbrains rounded-full border px-3 py-1 text-label tracking-[0.1em] transition ${
              sort === "change"
                ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                : "border-white/12 text-white/45 hover:text-white/75"
            }`}
          >
            {sort === "change" ? "sorted by what moved" : "sort by what moved"}
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-y border-white/8 py-2">
        {RENDERS.map((r, i) => {
          const c = coverageIn(version, r.id, ids);
          return (
            <span key={r.id} className="font-jetbrains flex items-center gap-1.5 text-label">
              <span className={`h-2 w-2 rounded-sm ${SEG[i]}`} aria-hidden />
              <span className="text-white/65">{r.engineLabel}</span>
              <span className={c.overrunS ? "text-amber-200" : "text-white/30"}>
                {secs(c.seconds)} of {secs(RENDER_BY_ID[r.id].durationS)}
                {c.overrunS ? ` — ${secs(c.overrunS)} over budget` : ` attributed`}
              </span>
            </span>
          );
        })}
      </div>

      <ul className="mt-2">
        {rows.map((c) => (
          <SpendRow
            key={c.id}
            card={c}
            api={api}
            peak={peak}
            version={version}
            baseline={baseline}
            comparing={comparing}
          />
        ))}
      </ul>

      <MatrixFootnotes cards={api.cards} version={version} scope={api.scope} />
    </div>
  );
}

function SpendRow({
  card,
  api,
  peak,
  version,
  baseline,
  comparing,
}: {
  card: Card;
  api: ScopeApi;
  peak: number;
  version: Version;
  baseline: Version;
  comparing: boolean;
}) {
  const descoped = stateOf(api.scope, card.id).descoped;
  const total = totalIn(version, card.id);
  const baseTotal = totalIn(baseline, card.id);
  const d = total - baseTotal;

  return (
    <li data-testid={`row-${card.id}`} className={`border-b border-white/[0.04] py-1 ${descoped ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-2">
        <ScopePip card={card} api={api} />
        <span className="flex w-[7.5rem] shrink-0 items-center gap-1.5">
          <NoteHandle cardId={card.id} />
          {comparing && <DeltaTag d={d} />}
        </span>

        <div className="relative flex h-3 min-w-0 flex-1 overflow-hidden rounded-sm bg-white/[0.04]">
          {/* the baseline width, as a ghost behind the live bar */}
          {comparing && baseTotal > 0 && (
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 border-r border-white/40"
              style={{ width: `${(baseTotal / peak) * 100}%` }}
            />
          )}
          {RENDERS.map((r, i) => {
            const u = usageIn(version, r.id, card.id);
            if (u.kind !== "spoken") return null;
            return (
              <span
                key={r.id}
                data-testid={`seg-${r.id}-${card.id}`}
                title={`${r.engineLabel} — ${secs(u.seconds)}${u.beats.length ? ` (beats ${u.beats.join(", ")})` : ""}`}
                className={`h-full ${SEG[i]} ${descoped ? "opacity-40" : ""}`}
                style={{ width: `${(u.seconds / peak) * 100}%` }}
              />
            );
          })}
        </div>

        <span
          className={`font-jetbrains w-10 shrink-0 text-right text-label ${total ? "text-white/60" : "text-white/25"}`}
        >
          {secs(total)}
        </span>
      </div>

      <p className="pr-2 pl-6 text-content leading-snug text-slate-300">{card.title}</p>
    </li>
  );
}
