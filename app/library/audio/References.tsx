"use client";

// THE REFERENCES TAB — the three tracks the ledger was anchored to, each with
// what librosa and an FFT autocorrelation measured against the published
// tempo and key, the kind of error each made (a half-time read is not a 20%
// miss), and the retired cloud read struck through beside them. Below: a drop
// zone that measures a new reference in the browser (./analysis.ts) and offers
// the terms of the proven takes nearest its tempo.
//
// Ported from the contest entry's app.js#refsHTML.

import { Dropzone, clock } from "@/components/kit";

import { STAGES, type Analysis, type Stage } from "./analysis";
import type { KeyRelation, RefView } from "./book";

const relCls = (k: KeyRelation) => (k === "exact" ? "ok" : k === "relative" ? "mid" : "bad");

export interface Analyzed extends Analysis {
  terms: {
    genres: string[];
    moods: string[];
    instruments: string[];
    evidence: number;
  };
}

export default function References({
  refs,
  stages,
  analysis,
  onSeedRef,
  onOpenRef,
  onAnalyze,
  onSeedAnalysis,
}: {
  refs: RefView[];
  stages: { now: Stage; err?: string } | null;
  analysis: Analyzed | null;
  onSeedRef: (r: RefView) => void;
  onOpenRef: (id: string) => void;
  onAnalyze: (file: File) => void;
  onSeedAnalysis: (a: Analyzed) => void;
}) {
  const at = stages ? STAGES.indexOf(stages.now as (typeof STAGES)[number]) : -1;
  return (
    <>
      <section className="panel">
        {refs.map((r) => (
          <article key={r.ref.id} className="ref">
            <h4>
              {r.ref.artist} — {r.ref.title}
            </h4>
            <div className="meta" style={{ margin: "6px 0 0" }}>
              <span className="tally">
                <b>{r.children.length}</b>
                <small>takes</small>
              </span>
              <span className="tally t-kept">
                <b>{r.kept}</b>
                <small>kept</small>
              </span>
              <span className="tally t-rejected">
                <b>{r.rejected}</b>
                <small>rejected</small>
              </span>
            </div>
            <table className="mtab">
              <thead>
                <tr>
                  <th>method</th>
                  <th>tempo</th>
                  <th>
                    <span className="sr-only">tempo error</span>
                  </th>
                  <th>key</th>
                  <th>
                    <span className="sr-only">key relation</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.methods.map((m) => (
                  <tr key={m.id}>
                    <td className="mono">{m.label}</td>
                    <td className="mono">{m.tempo.toFixed(1)}</td>
                    <td>
                      <span className={`chip ${m.err.ok ? "ok" : "bad"}`}>{m.err.kind}</span>
                    </td>
                    <td>{m.key}</td>
                    <td>
                      <span className={`chip ${relCls(m.keyRel)}`}>{m.keyRel}</span>
                    </td>
                  </tr>
                ))}
                <tr className="truth">
                  <td className="mono">tunebat</td>
                  <td className="mono">{r.ref.truth.tempo_bpm.toFixed(0)}</td>
                  <td>
                    <span className="chip mid">truth</span>
                  </td>
                  <td>{r.ref.truth.key}</td>
                  <td />
                </tr>
                <tr className="retired">
                  <td className="mono x">cloud read</td>
                  <td className="mono x">{r.ref.retired.tempo_bpm}</td>
                  <td>
                    <span className="tag-retired">retired</span>
                  </td>
                  <td className="x">{r.ref.retired.key}</td>
                  <td />
                </tr>
                <tr className="retired">
                  <td colSpan={5} className="x" style={{ whiteSpace: "normal" }}>
                    {r.ref.retired.genres.slice(0, 3).join(" · ")}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="actions">
              <button type="button" className="btn btn--cyan" onClick={() => onSeedRef(r)}>
                Use as seed
              </button>
              <button type="button" className="btn" onClick={() => onOpenRef(r.ref.id)}>
                {r.children.length} takes in ledger
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className="panel" aria-label="Analyze a new reference">
        <h3>
          New reference
          <span className="grow" />
          <span className="dim plain">local · offline</span>
        </h3>
        <Dropzone
          accept="audio/*"
          constraints="mp3 · wav · flac · m4a · first 60 s after the intro · tempo · key · energy"
          label="Analyze a reference file"
          onFiles={(files) => {
            const f = files[0];
            if (f) onAnalyze(f);
          }}
        />
        {stages && (
          <div className="stages" role="status">
            {STAGES.map((s, i) => (
              <span key={s} className={stages.now === "done" || i < at ? "done" : i === at ? "now" : ""}>
                {s}
              </span>
            ))}
            {stages.err && <span className="bad">{stages.err}</span>}
          </div>
        )}
        {analysis && (
          <div className="ref">
            <h4>
              {analysis.name}
              <small>{clock(analysis.duration)}</small>
            </h4>
            <svg
              className="mini-wave"
              viewBox={`0 0 ${analysis.peaks.length} 36`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {analysis.peaks.map((p, i) => (
                <line key={i} x1={i + 0.5} x2={i + 0.5} y1={18 - p * 16} y2={18 + p * 16} />
              ))}
            </svg>
            <table className="mtab">
              <tbody>
                <tr>
                  <td className="caps">tempo</td>
                  <td className="mono">{analysis.tempo.toFixed(1)} BPM</td>
                  <td className="caps">key</td>
                  <td>
                    {analysis.key} <span className="dim mono">r {analysis.keyConfidence.toFixed(2)}</span>
                  </td>
                </tr>
                <tr>
                  <td className="caps">energy</td>
                  <td>{analysis.energy}</td>
                  <td className="caps">bright</td>
                  <td>
                    {analysis.brightness} <span className="dim mono">~{analysis.centroidHz} Hz</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="meta">
              <span className="caps">nearest proven terms</span>
              <span className="tally">
                <b>{analysis.terms.evidence}</b>
                <small>takes</small>
              </span>
            </div>
            <div className="tchips">
              {[...analysis.terms.genres, ...analysis.terms.moods, ...analysis.terms.instruments].map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
            </div>
            <div className="actions" style={{ marginTop: 10 }}>
              <span className="dim mono">{analysis.method}</span>
              <span className="grow" />
              <button type="button" className="btn btn--cyan" onClick={() => onSeedAnalysis(analysis)}>
                Use as seed
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
