"use client";

// THE TERMS (v1 app/library/audio/Terms.tsx, the Recipe Book's left column): every word the
// ledger's takes were described with, per facet, with what happened to the takes that carried it
// - keep rate, how many were judged, the kept/rejected rail, the defect it most often earned -
// and the team's hand on each: ★ prefer, ⊘ avoid, and the phrasing the term becomes in a prompt.
//
// Kept from v1: the phrase is local while typed and written on commit (a keystroke is not a
// decision); a category of effects carries no hand (it is not a word that goes into a prompt).
// Changed: pressing a term ADDS it to the composer's seed (v1 filtered the take ledger with it;
// that ledger is the Library's list now, and its filter is the Library's own facet). The commit
// is a form submit and a blur, not a key handler: Enter in a one-field form submits it.
import { useState } from "react";

import { CapsHeading } from "../heading/CapsHeading.tsx";
import { Seg } from "../seg/Seg.tsx";
import { StackBar } from "../stackbar/StackBar.tsx";
import { sortTerms, type Hand, type Term, type TermFacet, type TermSort } from "./recipe.ts";
import s from "./Composer.module.css";

export const TERM_SECTIONS: readonly { readonly facet: TermFacet; readonly label: string }[] = [
  { facet: "genre", label: "genre" },
  { facet: "mood", label: "mood" },
  { facet: "instrument", label: "instrument" },
  { facet: "sfxCategory", label: "effect" },
];

const SORTS = [
  { value: "rate", label: "keep %" },
  { value: "n", label: "n" },
  { value: "name", label: "a–z" },
] as const satisfies readonly { readonly value: TermSort; readonly label: string }[];

function Phrase({ t, onHand }: { readonly t: Term; readonly onHand: (id: string, h: Hand) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (): void => {
    if (draft !== null && draft.trim() !== t.phrase) onHand(t.id, { stance: t.stance, phrase: draft.trim() });
    setDraft(null);
  };
  return (
    <form
      className={s.phraseForm}
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <input className={s.phrase} value={draft ?? t.phrase} placeholder="as written" aria-label={`prompt phrasing for ${t.term}`} onChange={(e) => setDraft(e.currentTarget.value)} onBlur={commit} />
    </form>
  );
}

function Row({ t, onPick, onHand }: { readonly t: Term; readonly onPick: (t: Term) => void; readonly onHand: (id: string, h: Hand) => void }) {
  const rate = t.keepRate === null ? "—" : `${Math.round(t.keepRate * 100)}%`;
  const hand = t.facet !== "sfxCategory";
  return (
    <li className={s.term} data-stance={t.stance ?? "none"}>
      {hand ? (
        <button type="button" className={s.termName} onClick={() => onPick(t)} aria-label={`add ${t.term} to the seed`}>
          {t.stance === "prefer" && <span aria-hidden="true">★ </span>}
          {t.stance === "avoid" && <span aria-hidden="true">⊘ </span>}
          {t.term}
        </button>
      ) : (
        // An effect category is no seed word (a seed carries genre, mood, instrument): the
        // press was drawn and did nothing (AudioLane's onPick has no list for it).
        <span className={s.termName}>{t.term}</span>
      )}
      <span className={s.termRate}>{rate}</span>
      <span className={s.termN}>{t.n}</span>
      <span className={s.termBar}>
        <StackBar kept={t.kept} rejected={t.rejected} undecided={0} label={t.term} />
      </span>
      {hand && (
        <div className={s.handRow}>
          <span className={s.hand}>
            <button type="button" className={s.stance} aria-pressed={t.stance === "prefer"} aria-label={`prefer ${t.term}`} onClick={() => onHand(t.id, { stance: t.stance === "prefer" ? null : "prefer", phrase: t.phrase })}>
              ★
            </button>
            <button type="button" className={s.stance} aria-pressed={t.stance === "avoid"} aria-label={`avoid ${t.term}`} onClick={() => onHand(t.id, { stance: t.stance === "avoid" ? null : "avoid", phrase: t.phrase })}>
              ⊘
            </button>
          </span>
          <Phrase t={t} onHand={onHand} />
        </div>
      )}
      {t.topDefect !== null && <span className={s.defect}>{t.topDefect}</span>}
    </li>
  );
}

export type TermRailProps = {
  readonly terms: readonly Term[];
  readonly onPick: (t: Term) => void;
  readonly onHand: (id: string, h: Hand) => void;
};

export function TermRail({ terms, onPick, onHand }: TermRailProps) {
  const [sort, setSort] = useState<TermSort>("rate");
  return (
    <div className={s.rail}>
      <Seg label="sort terms" options={SORTS} value={sort} onChange={setSort} />
      {TERM_SECTIONS.map(({ facet, label }) => {
        const list = sortTerms(
          terms.filter((t) => t.facet === facet),
          sort,
        );
        if (list.length === 0) return null;
        return (
          <section key={facet} className={s.section} aria-label={`${label} terms`}>
            <CapsHeading text={label} tally={{ value: list.length }} />
            <ul className={s.terms}>
              {list.map((t) => (
                <Row key={t.id} t={t} onPick={onPick} onHand={onHand} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
