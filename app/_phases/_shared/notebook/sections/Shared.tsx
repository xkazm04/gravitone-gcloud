"use client";

// The two blocks BOTH notebook artifacts draw.
//
// <NotebookBody> (the argument) and <EvidenceLog> (the claim-level audit) are
// deliberately two artifacts — "a reviewer asking 'is this argument any good?'
// and a reviewer asking 'can we actually say this?' are doing different jobs".
// That justifies both SHOWING currency and sources. It never justified two
// copies of the markup, which is what there was: the same five fields off the
// same NOTEBOOK, in two files, differing only in heading and in whether the
// half-life was inlined.
//
// The heading stays with each host, because that is the part that legitimately
// differs — Apparatus needs the anchor <H> the section rail jumps to, the
// evidence log uses its own <Head>. What lives here is the body.

import { NOTEBOOK } from "../notebook";

/** How long the notebook stays true.
 *
 *  `withHalfLife` because the two hosts say it in different places and must not
 *  say it twice: the evidence log already gives half-life a stat tile at the top
 *  of the page, so inlining it here would print the same value a second time
 *  four sections later. The notebook body has no tile, so it inlines. */
export function CurrencyBody({ withHalfLife = false }: { withHalfLife?: boolean }) {
  const c = NOTEBOOK.currency;
  return (
    <>
      <p className="text-sm leading-relaxed text-slate-300">
        {withHalfLife && (
          <>
            half-life <span className="text-amber-200">{c.halfLife}</span> —{" "}
          </>
        )}
        {c.why}
      </p>
      <p className="font-jetbrains text-label text-white/40">
        expires first: {c.expiresFirst.join(", ")} · durable: {c.durable.join(", ")}
      </p>
      <p className="text-content text-cyan-200/80">{c.advice}</p>
    </>
  );
}

/** The document-level bibliography (NOTEBOOK.sources), in the order the
 *  notebook lists them — NOT every source a fact cites. That is a separate,
 *  larger, unrelated population (`Fact.source` across facts.ts, distinct
 *  strings counted as `NOTEBOOK_COUNTS.factSourceStrings`); both hosts of this
 *  body now name their heading "bibliography" rather than bare "sources" so
 *  the two are not conflated. See the comment on NOTEBOOK_COUNTS in
 *  notebook.ts for the measurement and why no reconciliation is built. */
export function SourcesBody() {
  return (
    <ul className="space-y-1">
      {NOTEBOOK.sources.map((s) => (
        <li key={s} className="font-jetbrains text-label leading-relaxed text-white/45">
          {s}
        </li>
      ))}
    </ul>
  );
}
