"use client";

// COVERAGE — read across. Who used this piece of research, and for how long?
//
// The tab for challenging the weight of each part of the script. Every card is
// here whether a render used it or not: a row of zeros is the loudest thing on
// the grid, because "nobody spent a second on this" is the finding you came for.
//
// Layout: two rows per card. The first carries the clickable track id, the three
// render cells and the total; the second carries the FULL title, unwrapped and
// untruncated. Titles were being cut mid-sentence to hold a single-line grid,
// which traded the one thing you are judging for the shape of the table.

import { useState } from "react";

import type { Card } from "../../_shared/notebook/cards";
import type { ScopeApi } from "../../research/useScope";
import { NoteHandle } from "../_notes/NotesContext";
import { UNTAGGED_DIMENSION_ID, columnsFor } from "../../_shared/notebook/dimensions";
import { coverageIn, totalIn, usageIn, type Version } from "../versions";
import { DeltaTag, MatrixFootnotes, RENDERS, ScopePip, TONE, deltaOf, outWord, secs, stillSpoken } from "./shared";

export default function MatrixCoverage({
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
  const [only, setOnly] = useState(false);
  const ids = api.cards.map((c) => c.id);

  /** Same test the triage board runs, off the same cards, for the same reason:
   *  a card with no dimension had no section to sit under here either, so it
   *  vanished from the coverage grid entirely — and a card that renders nowhere
   *  cannot show a row of zeros, which is the one thing this tab is for. The
   *  column appears only when it is occupied; a fully tagged notebook sees no
   *  change at all. */
  const hasUntagged = api.cards.some((c) => c.dimension === UNTAGGED_DIMENSION_ID);
  const columns = columnsFor({ hasUntagged });

  return (
    <div data-testid="matrix-coverage">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="font-hanken max-w-xl text-content text-slate-400">
          Every card, every render. Read across a row to see who used it and for how long; a row of
          zeros is research no script spent a second on.
        </p>
        <button
          aria-pressed={only}
          onClick={() => setOnly((v) => !v)}
          className={`font-jetbrains rounded-full border px-3 py-1 text-label tracking-[0.1em] transition ${
            only ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-white/12 text-white/45 hover:text-white/75"
          }`}
        >
          {only ? "showing used only" : "hide the zero rows"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-[1.4rem_1fr_repeat(3,4.75rem)_3.25rem] items-end gap-x-2 border-b border-white/12 pb-1.5">
        <span />
        <span className="font-jetbrains text-label tracking-[0.16em] text-white/35 uppercase">research</span>
        {RENDERS.map((r) => {
          const c = coverageIn(version, r.id, ids);
          return (
            <span key={r.id} className="text-right">
              <span className="font-jetbrains block truncate text-label tracking-[0.1em] text-white/60 uppercase">
                {r.engineLabel.split(" ")[0]}
              </span>
              <span className={`font-jetbrains block text-label ${c.overrunS ? "text-amber-200" : "text-white/30"}`}>
                {c.spoken} used{c.overrunS ? ` · +${c.overrunS}s over` : ""}
              </span>
            </span>
          );
        })}
        <span className="font-jetbrains text-right text-label tracking-[0.1em] text-white/35 uppercase">all</span>
      </div>

      {columns.map((d) => {
        const rows = api.cards
          .filter((c) => c.dimension === d.id)
          .filter((c) => !only || totalIn(version, c.id) > 0);
        if (!rows.length) return null;
        const orphan = d.id === UNTAGGED_DIMENSION_ID;
        return (
          <section key={d.id} data-testid={`coverage-dim-${d.id}`}>
            <h4
              className={`font-jetbrains mt-3 border-b pb-1 text-label tracking-[0.16em] uppercase ${
                orphan
                  ? "border-amber-400/25 text-amber-200"
                  : `border-white/8 ${d.id === "conclusions" ? "text-cyan-300" : "text-white/70"}`
              }`}
            >
              {d.label}
            </h4>
            {orphan && (
              <p className="font-jetbrains mt-1 text-content leading-relaxed text-amber-200/70">
                no dimension — tag {rows.length === 1 ? "it" : "them"} in
                dimensions.ts::CARD_DIMENSION. The triage board says the same thing.
              </p>
            )}
            <ul>
              {rows.map((c) => (
                <Row key={c.id} card={c} api={api} version={version} baseline={baseline} comparing={comparing} />
              ))}
            </ul>
          </section>
        );
      })}

      <MatrixFootnotes cards={api.cards} version={version} scope={api.scope} />
    </div>
  );
}

function Row({
  card,
  api,
  version,
  baseline,
  comparing,
}: {
  card: Card;
  api: ScopeApi;
  version: Version;
  baseline: Version;
  comparing: boolean;
}) {
  // "descoped" tints the row: it is a decision. "not-taken" does not: it is the
  // default state of every conclusion, and a tint on arrival is an alarm nobody
  // reads (scope.ts::scopeSummary says the same about the count).
  const out = outWord(card, api.scope);
  const conflict = stillSpoken(version, card, api.scope);
  const total = totalIn(version, card.id);
  const baseTotal = totalIn(baseline, card.id);
  const moved = comparing && total !== baseTotal;

  return (
    <li
      data-testid={`row-${card.id}`}
      data-scope={out}
      className={`border-b border-white/[0.04] py-1 ${out === "descoped" ? "bg-amber-400/[0.03]" : ""} ${
        moved ? "bg-cyan-400/[0.04]" : ""
      }`}
    >
      <div className="grid grid-cols-[1.4rem_1fr_repeat(3,4.75rem)_3.25rem] items-center gap-x-2">
        <ScopePip card={card} api={api} />
        <span className="flex items-center gap-1.5">
          <NoteHandle cardId={card.id} />
          {moved && <DeltaTag d={total - baseTotal} />}
          {conflict.length > 0 && (
            // THE MARKER. Scope says out; a render says spoken. Named on the row
            // so it cannot be read as ordinary seconds.
            <span
              data-testid={`conflict-${card.id}`}
              className="font-jetbrains rounded border border-rose-400/40 bg-rose-400/[0.08] px-1.5 py-0.5 text-label text-rose-200"
            >
              {out === "descoped" ? "cut" : "not taken"} · still spoken{" "}
              {conflict.map((c) => `${secs(c.seconds)} by ${c.label}`).join(", ")}
            </span>
          )}
        </span>
        {RENDERS.map((r) => {
          const u = usageIn(version, r.id, card.id);
          const t = TONE[u.kind];
          const dl = comparing ? deltaOf(baseline, version, r.id, card.id) : null;
          const clash = u.kind === "spoken" && out !== "in";
          return (
            <span
              key={r.id}
              data-testid={`cell-${r.id}-${card.id}`}
              data-usage={u.kind}
              data-conflict={clash ? "true" : undefined}
              title={
                clash
                  ? `${out === "descoped" ? "cut" : "not taken"} on the board, still spoken here for ${secs(u.seconds)} — beats ${u.beats.join(", ")}`
                  : u.kind === "cut"
                    ? u.why
                    : u.kind === "spoken"
                      ? `beats ${u.beats.join(", ")}`
                      : "no render used this"
              }
              className={`font-jetbrains rounded border px-1 py-0.5 text-center text-label ${t.cell} ${t.text} ${
                dl ? "ring-1 ring-cyan-400/40" : ""
              } ${clash ? "ring-1 ring-rose-400/60 text-rose-200" : ""}`}
            >
              {u.kind === "spoken" ? secs(u.seconds) : t.mark}
            </span>
          );
        })}
        <span className={`font-jetbrains text-right text-label ${total ? "text-white/60" : "text-white/25"}`}>
          {secs(total)}
        </span>
      </div>

      {/* The title, in full, on its own line. */}
      <p className="pr-2 pl-6 text-content leading-snug text-slate-300">{card.title}</p>
    </li>
  );
}
