"use client";

// THE TERMS — the left column. Every word the ledger's takes were described
// with, per facet, with what happened to the takes that carried it: keep rate,
// count, mean score, a bar of proven / kept / unjudged / rejected, and the
// reject reason it most often earned. The team's hand sits on each row: ★
// prefer, ⊘ avoid, and the phrasing the term becomes in a prompt.
//
// Pressing a term's name filters the ledger to it (app.js#renderTerms).

import { useState } from "react";

import { sortTerms, type Hand, type TermEntry, type TermFacet, type TermSort } from "./book";

const TERM_SORTS: readonly [TermSort, string][] = [
  ["rate", "keep %"],
  ["n", "n"],
  ["name", "A–Z"],
];

function Bar({ e }: { e: TermEntry }) {
  const un = Math.max(0, e.n - e.kept - e.rejected);
  const w = (x: number) => `${(x / e.n) * 100}%`;
  return (
    <>
      <i className="seg-proven" style={{ width: w(e.proven) }} />
      <i className="seg-kept" style={{ width: w(e.kept - e.proven) }} />
      <i className="seg-unjudged" style={{ width: w(un) }} />
      <i className="seg-rejected" style={{ width: w(e.rejected) }} />
    </>
  );
}

/** The phrasing field. Local while typing, written on change (blur / Enter),
 *  as the entry's `change` listener did — a keystroke is not a decision. */
function Phrase({ e, onHand }: { e: TermEntry; onHand: (id: string, h: Hand) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? e.phrase;
  const commit = () => {
    if (draft !== null && draft.trim() !== e.phrase) onHand(e.id, { phrase: draft.trim() });
    setDraft(null);
  };
  return (
    <input
      className={`phrase${e.phrase ? " has" : ""}`}
      value={value}
      placeholder="as written"
      aria-label={`Prompt phrasing for ${e.term}`}
      onChange={(ev) => setDraft(ev.target.value)}
      onBlur={commit}
      onKeyDown={(ev) => {
        if (ev.key === "Enter") ev.currentTarget.blur();
        if (ev.key === "Escape") {
          setDraft(null);
          ev.currentTarget.blur();
        }
      }}
    />
  );
}

export default function Terms({
  sections,
  termSort,
  onTermSort,
  collapsed,
  onToggleSection,
  active,
  onPick,
  onHand,
}: {
  sections: { id: TermFacet; label: string; list: TermEntry[] }[];
  termSort: TermSort;
  onTermSort: (s: TermSort) => void;
  collapsed: ReadonlySet<string>;
  onToggleSection: (id: string) => void;
  active: { facet: TermFacet; term: string } | null;
  onPick: (facet: TermFacet, term: string) => void;
  onHand: (id: string, h: Hand) => void;
}) {
  return (
    <>
      <div className="colhead">
        <h2>Terms</h2>
        <span className="grow" />
        <div className="seg" role="group" aria-label="Sort terms">
          {TERM_SORTS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={termSort === k} onClick={() => onTermSort(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {sections.map((sec) => {
        const open = !collapsed.has(sec.id);
        const maxN = Math.max(1, ...sec.list.map((e) => e.n));
        const pref = sec.list.filter((e) => e.stance === "prefer").length;
        const avoid = sec.list.filter((e) => e.stance === "avoid").length;
        return (
          <section key={sec.id} className="terms__sec">
            <button
              type="button"
              className="terms__sechead"
              aria-expanded={open}
              onClick={() => onToggleSection(sec.id)}
            >
              <span className="caret" aria-hidden="true">
                ▾
              </span>
              <span className="caps">{sec.label}</span>
              <span className="grow" />
              {pref > 0 && (
                <span className="tally t-proven">
                  <b>{pref}</b>
                  <small aria-label="preferred">★</small>
                </span>
              )}
              {avoid > 0 && (
                <span className="tally t-rejected">
                  <b>{avoid}</b>
                  <small aria-label="avoided">⊘</small>
                </span>
              )}
              <span className="tally">
                <b>{sec.list.length}</b>
              </span>
            </button>
            {open &&
              sortTerms(sec.list, termSort).map((e) => {
                const on = active?.facet === e.facet && active.term === e.term;
                const kr = e.keepRate == null ? "—" : `${Math.round(e.keepRate * 100)}%`;
                return (
                  <div
                    key={e.id}
                    className={`term${on ? " is-on" : ""}${e.stance === "prefer" ? " is-prefer" : ""}${e.stance === "avoid" ? " is-avoid" : ""}`}
                  >
                    {e.sfx ? (
                      <>
                        <span />
                        <span />
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="stance s-prefer"
                          aria-pressed={e.stance === "prefer"}
                          aria-label={`Prefer ${e.term}`}
                          onClick={() =>
                            onHand(e.id, {
                              stance: e.stance === "prefer" ? null : "prefer",
                            })
                          }
                        >
                          ★
                        </button>
                        <button
                          type="button"
                          className="stance s-avoid"
                          aria-pressed={e.stance === "avoid"}
                          aria-label={`Avoid ${e.term}`}
                          onClick={() =>
                            onHand(e.id, {
                              stance: e.stance === "avoid" ? null : "avoid",
                            })
                          }
                        >
                          ⊘
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="term__name"
                      aria-pressed={on}
                      onClick={() => onPick(e.facet, e.term)}
                    >
                      {e.term}
                    </button>
                    <span className="term__nums">
                      <b>{kr}</b> · {e.n} · {e.avg == null ? "—" : e.avg.toFixed(1)}
                    </span>
                    <span
                      className="term__bar"
                      style={{ width: `${Math.max(12, (e.n / maxN) * 100)}%` }}
                      role="img"
                      aria-label={`${e.proven} proven, ${e.kept - e.proven} kept, ${e.rejected} rejected of ${e.n}`}
                    >
                      <Bar e={e} />
                    </span>
                    <span className="term__foot">
                      {!e.sfx && (
                        <>
                          <span className={`dim mono arrow${e.phrase ? " has" : ""}`} aria-hidden="true">
                            →
                          </span>
                          <Phrase e={e} onHand={onHand} />
                        </>
                      )}
                      {e.topReason && <span className="reason">{e.topReason[0]}</span>}
                    </span>
                  </div>
                );
              })}
          </section>
        );
      })}
    </>
  );
}
