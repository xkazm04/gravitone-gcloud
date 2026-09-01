"use client";

// The half of the notebook that IS the video: the tension it turns on, the
// mechanisms that explain it, the turns those mechanisms buy, and the strongest
// case against the whole thing.

import { ChainConnectorChip, ConnectorChip } from "../Chips";
import { NOTEBOOK } from "../notebook";
import { H, chainLink } from "./H";

export default function ArgumentSections() {
  const n = NOTEBOOK;
  return (
    <>
      <section className="space-y-2">
        <H id="tension">tension — the load-bearing field</H>
        <div className="grid gap-3 sm:grid-cols-2">
          <p className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-content leading-relaxed text-slate-300">
            <span className="font-jetbrains block text-label tracking-[0.14em] text-white/35 uppercase">expectation</span>
            {n.tension.expectation}
          </p>
          <p className="rounded-xl border border-violet-400/25 bg-violet-400/[0.05] p-3 text-content leading-relaxed text-slate-200">
            <span className="font-jetbrains block text-label tracking-[0.14em] text-violet-300/80 uppercase">reality</span>
            {n.tension.reality}
          </p>
        </div>
        <p className="text-content leading-relaxed text-slate-400">{n.tension.whyItIsATension}</p>
        <p className="font-jetbrains text-content text-emerald-300/80">strength: {n.tension.strength}</p>
      </section>

      <section className="space-y-3">
        <H id="mechanisms">mechanisms — the beat chain, pre-authored</H>
        {n.mechanisms.map((m) => (
          <div key={m.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
            <p className="text-content font-medium text-white">{m.name}</p>
            <p className="font-jetbrains text-content text-white/40">
              {m.id} · explains: {m.explains}
              {m.needsAnalogy ? " · needs an analogy" : ""}
            </p>
            {/* `steps` WINS WHERE BOTH ARE PRESENT — the rule types.ts states
                and nothing implemented. `chain: string[]` is the legacy form,
                with the connector inlined in the prose and parsed back out at
                render time by chainLink(); `steps: ChainStep[]` is the target
                and the only form that can carry per-step evidence. Until now
                this mapped `m.chain` unconditionally, so the typed form had no
                renderer at all and the documented precedence was a comment. */}
            <ol className="mt-2.5 space-y-1.5">
              {m.steps?.length
                ? m.steps.map((step, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-2 text-content leading-relaxed">
                      <ChainConnectorChip connector={step.connector} />
                      <span className="text-slate-300">{step.text}</span>
                      {step.evidence?.length ? (
                        <span className="font-jetbrains text-label text-white/30">
                          {step.evidence.join(", ")}
                        </span>
                      ) : (
                        /* The point of the typed form is that a step can be cut
                           out from underneath. One that cites nothing cannot be,
                           and says so rather than looking supported. */
                        <span className="font-jetbrains text-label text-amber-200/60">
                          no evidence on this step
                        </span>
                      )}
                    </li>
                  ))
                : m.chain.map((step, i) => {
                    const { connector, text } = chainLink(step);
                    return (
                      <li key={i} className="flex flex-wrap items-baseline gap-2 text-content leading-relaxed">
                        <ConnectorChip connector={connector} />
                        <span className="text-slate-300">{text}</span>
                      </li>
                    );
                  })}
            </ol>
            {m.note && <p className="mt-2 text-content text-cyan-200/80 italic">{m.note}</p>}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <H id="reversals">reversals — the turns, pre-computed</H>
        {n.reversals.map((r) => (
          <div key={r.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
            <p className="font-jetbrains text-content tracking-[0.14em] text-white/35 uppercase">
              {r.id} · obvious reading, stated generously
            </p>
            <p className="mt-1 text-content text-slate-300">“{r.obviousReading}”</p>
            <p className="mt-2 flex flex-wrap items-baseline gap-2 text-content text-white">
              <ConnectorChip connector="BUT" />
              {r.whyWrong}
            </p>
            <p className="mt-2 text-content text-white/55">escalation — {r.escalation}</p>
            <p className="font-jetbrains mt-2 text-content text-white/30">
              evidence: {r.evidence.join(", ")}
              {r.mechanismId ? ` · via ${r.mechanismId}` : " · no mechanism — argued from evidence alone"}
            </p>
            {r.note && <p className="mt-1.5 text-content text-cyan-200/80 italic">{r.note}</p>}
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <H id="steelman">steel-man — mandatory, not optional</H>
        <p className="text-content leading-relaxed text-slate-200">{n.steelMan.statement}</p>
        <p className="text-content leading-relaxed text-white/50">{n.steelMan.whyInclude}</p>
        <p className="font-jetbrains text-content text-white/30">evidence: {n.steelMan.evidence.join(", ")}</p>
      </section>

      {/* THE POSITIONS THIS MODAL USED TO SWALLOW. NotebookBody promises
          "Nothing here is summarised away: this is the artifact, and a notebook
          you cannot read in full is a notebook you cannot check" — and
          `counterPositions` was populated and drawn by nothing at all. The
          first entry here is the four-year-cycle reading, which types.ts calls
          the strongest counter in run 1 and notes "disproves the notebook's own
          tension: high". It was invisible.

          Beside the steel-man rather than inside it, because they are not the
          same object: `steelMan` is singular and is the best case against the
          verdict; this array holds the positions of identified holders, which
          may be several and may each need attributing. `string` is the legacy
          form the run-1 fixture carries — the typed CounterPosition form
          renders its holder. */}
      {n.counterPositions.length > 0 && (
        <section className="space-y-2">
          <H id="counters">counter-positions — held against the verdict</H>
          <ul className="space-y-2">
            {n.counterPositions.map((c, i) =>
              typeof c === "string" ? (
                <li key={`legacy-${i}`} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                  <p className="text-sm leading-relaxed text-slate-300">{c}</p>
                  {/* The legacy form names no holder and cites no fact, so it
                      cannot downgrade a tension. Saying so is the finding — see
                      CounterPosition in types.ts. */}
                  <p className="font-jetbrains mt-1.5 text-label text-white/30">
                    no holder named, no evidence cited — this position cannot bear on the tension
                    until it has both
                  </p>
                </li>
              ) : (
                <li key={`${c.holder}-${i}`} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                  <p className="font-jetbrains text-label tracking-[0.14em] text-white/35 uppercase">
                    {c.holder}
                    {c.locator ? ` · ${c.locator}` : ""}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">{c.position}</p>
                  {c.statementVerbatim && (
                    <p className="mt-1.5 border-l-2 border-white/10 pl-3 text-content leading-relaxed text-slate-300">
                      “{c.statementVerbatim}”
                    </p>
                  )}
                  {c.evidence.length > 0 && (
                    <p className="font-jetbrains mt-1.5 text-label text-white/30">
                      evidence: {c.evidence.join(", ")}
                    </p>
                  )}
                </li>
              ),
            )}
          </ul>
        </section>
      )}
    </>
  );
}
