"use client";

// TRACKS — three scripts side by side, in the order they play.
//
// NOT a weight surface. Coverage and the Spend bar are where you argue about how
// much of the script a piece of research deserves; this one answers WHERE it
// lands, which is the question Step 3 (Frames) starts from — a shot list is
// built against running order, not against totals. Keep that in mind before
// adding anything here: this tab is the bridge to the visual side.
//
// Baseline only, always. A recalibration re-weights the research; expressing
// that as two interleaved running orders would be unreadable, so a staged
// candidate is announced here and shown in the two weight tabs instead.
//
// Metaphor: three edit tracks running down the page. The other two variants sort
// research by identity or by size; this one sorts it by TIME, so each column is
// the script's actual running order and a card's position tells you where in the
// video it lands. The question it answers is the one the other two cannot:
// "what does this script spend its first minute on?"
//
// Space strategy: never draw an empty cell. A 36×3 grid is mostly absence; here
// each column contains only what that render used — 13, 12 and 5 items — and
// everything nobody used drops into one shared gutter at the bottom. That is the
// same information in about a third of the vertical space, and the columns are
// short enough to sit side by side without scrolling.
//
// Scope: descoping in one column marks the card in ALL of them, which is the
// point — the scope is one decision about the research, not three about scripts.

import { useState } from "react";

import type { Card } from "../../_shared/notebook/cards";
import type { ScopeApi } from "../../research/useScope";
import { stateOf } from "../../research/scope";
import { coverageIn, usageIn, type Version } from "../versions";
import { NoteHandle } from "../_notes/NotesContext";
import { MatrixFootnotes, RENDERS, ScopePip, secs } from "./shared";

const toS = (m: string) => { const [a, b] = m.split(":").map(Number); return a * 60 + b; };

export default function MatrixTracks({ api, version }: { api: ScopeApi; version: Version }) {
  const [focus, setFocus] = useState<string | null>(null);
    const ids = api.cards.map((c) => c.id);

  const unused = api.cards.filter((c) => RENDERS.every((r) => usageIn(version, r.id, c.id).kind === "unused"));

  return (
    <div data-testid="matrix-tracks">
      <p className="font-hanken max-w-2xl text-sm text-slate-400">
        Each script as its own track, in running order. A card’s position is where in the video it
        lands; its height is how long it holds. Hover a card to light it up wherever else it appears.
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {RENDERS.map((r) => {
          const cov = coverageIn(version, r.id, ids);
          // Running order: first beat that states the card.
          const used = api.cards
            .map((c) => ({ card: c, u: usageIn(version, r.id, c.id) }))
            .filter((x) => x.u.kind === "spoken")
            .sort((a, b) => toS(a.u.beats[0]) - toS(b.u.beats[0]) || a.card.id.localeCompare(b.card.id));
          const cut = api.cards.filter((c) => usageIn(version, r.id, c.id).kind === "cut");

          return (
            <section
              key={r.id}
              data-testid={`track-${r.id}`}
              className="rounded-2xl border border-white/8 bg-white/[0.015] p-3"
            >
              <header className="border-b border-white/8 pb-2">
                <p className="font-jetbrains text-[11px] tracking-[0.14em] text-white/70 uppercase">
                  {r.engineLabel}
                </p>
                <p className="font-jetbrains mt-0.5 text-[10px] text-white/35">
                  {secs(r.durationS)} · {cov.spoken} cards · {secs(cov.unattributedS)} unattributed
                </p>
              </header>

              <ol className="mt-2 space-y-1">
                {used.map(({ card, u }) => {
                  const lit = focus === card.id;
                  const descoped = stateOf(api.scope, card.id).descoped;
                  return (
                    <li
                      key={card.id}
                      data-testid={`track-${r.id}-${card.id}`}
                      onMouseEnter={() => setFocus(card.id)}
                      onMouseLeave={() => setFocus(null)}
                      className={`flex items-start gap-1.5 rounded border px-1.5 py-1 transition ${
                        descoped
                          ? "border-amber-400/50 bg-amber-400/[0.04]"
                          : lit
                            ? "border-cyan-400/50 bg-cyan-400/[0.10]"
                            : "border-white/8 bg-white/[0.02]"
                      }`}
                    >
                      <ScopePip card={card} api={api} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-1.5">
                          <NoteHandle cardId={card.id} />
                          <span className="font-jetbrains shrink-0 text-[10px] text-cyan-200/80">
                            {u.beats[0]} · {secs(u.seconds)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] leading-snug text-slate-300" title={card.title}>
                          {card.title}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>

              {cut.length > 0 && (
                <div className="mt-2 border-t border-white/8 pt-2">
                  {cut.map((c) => (
                    <p key={c.id} className="font-jetbrains text-[10px] leading-snug text-rose-200/80">
                      cut {c.id} — {usageIn(version, r.id, c.id).why}
                    </p>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {unused.length > 0 && (
        <section className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.03] p-3">
          <h4 className="font-jetbrains text-[11px] tracking-[0.16em] text-amber-200/90 uppercase">
            in no track · {unused.length} of {api.cards.length}
          </h4>
          <p className="font-jetbrains mt-1 text-[10px] text-white/35">
            Researched, scoped, and never spoken. One gutter instead of {unused.length * 3} empty cells.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {unused.map((c) => (
              <UnusedChip key={c.id} card={c} api={api} />
            ))}
          </ul>
        </section>
      )}

      <MatrixFootnotes cards={api.cards} version={version} />
    </div>
  );
}

function UnusedChip({ card, api }: { card: Card; api: ScopeApi }) {
  const descoped = stateOf(api.scope, card.id).descoped;
  return (
    <li data-testid={`gutter-${card.id}`} className="flex items-center gap-1.5">
      <ScopePip card={card} api={api} />
      <span
        title={card.title}
        className={`font-jetbrains max-w-[14rem] truncate rounded border px-1.5 py-0.5 text-[10px] ${
          descoped
            ? "border-amber-400/50 text-amber-200/80"
            : card.kind === "conclusion"
              ? "border-cyan-400/25 text-cyan-200/70"
              : "border-white/10 text-white/45"
        }`}
      >
        {card.id}
      </span>
    </li>
  );
}
