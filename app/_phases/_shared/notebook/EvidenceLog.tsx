"use client";

// THE EVIDENCE LOG — the claim-level audit, as its own artifact.
//
// Distinct from <NotebookBody>, which is the whole document: the argument, the
// mechanisms, the turns they buy. This is the layer underneath — every claim
// dated, sourced and rated, plus the two things that decide whether a script may
// USE a claim: how long it stays true, and what the research could not settle.
//
// It moved here from the Script step, where it was reached through "open the
// evidence log". Research is where evidence is produced and checked, so this is
// where it belongs; Step 2 reads a scope, not a source list.
//
// Two artifacts rather than one modal with two titles: a reviewer asking "is
// this argument any good?" and a reviewer asking "can we actually say this?" are
// doing different jobs, and the second one should not have to scroll past four
// mechanisms to reach the fact table.

import { Tally } from "@/components/ui/signal";

import FactRow from "./FactRow";
import { NOTEBOOK, NOTEBOOK_COUNTS } from "./notebook";
import { CurrencyBody, SourcesBody } from "./sections/Shared";

export default function EvidenceLog() {
  const n = NOTEBOOK;
  const open = n.unknowns.filter((u) => !u.resolvedBy);
  const resolved = n.unknowns.filter((u) => u.resolvedBy);

  return (
    <div className="space-y-7">
      <section className="grid gap-2 sm:grid-cols-3">
        <Tile label="claims" value={`${NOTEBOOK_COUNTS.facts}`} note={`${NOTEBOOK_COUNTS.loadBearing} load-bearing`} />
        <Tile
          label="low confidence"
          value={`${NOTEBOOK_COUNTS.lowConfidence}`}
          note={
            NOTEBOOK_COUNTS.flagged === 0
              ? "none of them load-bearing"
              : `${NOTEBOOK_COUNTS.flagged} ALSO load-bearing`
          }
          tone={NOTEBOOK_COUNTS.flagged > 0 ? "bad" : undefined}
        />
        {/* No note: "then the numbers date" is what a half-life IS. */}
        <Tile label="half-life" value={n.currency.halfLife} tone="warn" />
      </section>

      <section className="space-y-2">
        <Head>constraints · {open.length}</Head>
        {open.map((u) => (
          <div key={u.id} data-testid={`evidence-constraint-${u.id}`} className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3">
            <p className="text-content text-slate-200">{u.what}</p>
            <p className="font-jetbrains mt-1.5 text-content text-amber-200/90">{u.impact}</p>
          </div>
        ))}
        {/* WHY A LIFTED CONSTRAINT IS KEPT rather than deleted: a script
            written under the old rule can then be spotted as over-hedged, and
            deleting one is what shifted every index in the constraint ledger
            and crashed the Script step. That was printed here as a paragraph
            explaining the design; it is a count and a tone now, and the
            resolved rows carry their own emerald styling. */}
        {resolved.length > 0 && (
          <p className="pt-1">
            <Tally value={resolved.length} label="lifted" tone="emerald" />
          </p>
        )}
      </section>

      <section className="space-y-2">
        <Head>claims · {NOTEBOOK_COUNTS.facts}</Head>
        <ul className="space-y-2">
          {n.facts.map((f) => (
            <FactRow key={f.id} f={f} />
          ))}
        </ul>
      </section>

      <section className="space-y-1.5">
        <Head>currency</Head>
        {/* No half-life here — the stat tile at the top of this page already
            gives it, and printing it twice is how a number starts disagreeing
            with itself. */}
        <CurrencyBody />
      </section>

      <section className="space-y-1.5">
        {/* "bibliography", never bare "sources": 11 is NOTEBOOK.sources, the
            hand-written document bibliography, while the 21 facts above cite 20
            DISTINCT source strings between them (`factSourceStrings`) that this
            list does not enumerate and that no code reconciles against it — see
            NOTEBOOK_COUNTS in notebook.ts. Same wording as the notebook's own
            heading and rail pill (SECTION_LABEL in sections/H.tsx). */}
        <Head>bibliography · {NOTEBOOK_COUNTS.sources}</Head>
        <SourcesBody />
        {/* The gap is READ, not retyped. The count beside it was already
            computed, and the sentence describing it was a literal about run 1
            ("this run did not reach primary on-chain data") — so any other
            notebook would have made the two halves of one sentence disagree.
            Same scar ResearchTriageBoard.tsx carries a comment about: its
            column count "said six against seven for as long as it was a
            literal". One gap is quoted because this is the summary line; the
            notebook's own gaps section lists them all. */}
        {NOTEBOOK_COUNTS.gaps > 0 && (
          <p className="font-jetbrains pt-1 text-content leading-relaxed text-amber-200/70">
            {NOTEBOOK_COUNTS.gaps} declared gap{NOTEBOOK_COUNTS.gaps === 1 ? "" : "s"} — {n.researchGaps[0]}
            {NOTEBOOK_COUNTS.gaps > 1 ? " See the notebook for the rest." : " See the notebook."}
          </p>
        )}
      </section>
    </div>
  );
}

function Head({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-jetbrains border-b border-white/8 pb-1.5 text-label tracking-[0.18em] text-cyan-300/80 uppercase">
      {children}
    </h3>
  );
}

function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "bad" | "warn";
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-3">
      <p className="font-jetbrains text-content tracking-[0.16em] text-white/35 uppercase">{label}</p>
      <p
        className={`font-instrument mt-0.5 text-2xl ${
          tone === "bad" ? "text-rose-300" : tone === "warn" ? "text-amber-200" : "text-white"
        }`}
      >
        {value}
      </p>
      {note && <p className="font-jetbrains mt-0.5 text-content text-white/40">{note}</p>}
    </div>
  );
}
