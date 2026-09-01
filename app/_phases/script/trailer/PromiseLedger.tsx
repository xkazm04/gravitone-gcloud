"use client";

// The promise ledger: every promise the cut's beats declare, and who pays it.
//
// "Make the payer a required field … surfaced as incomplete rather than
// accepted" — promise-ledger.md § Decision rules, and the same technique two
// lines earlier: "A system that blocks on it will block on correct work; report
// the rows and let a human read them." So an empty payer is a WORD on the row,
// never a disabled button anywhere else.

import { useState } from "react";

import type { TrailerBeat, TrailerCut } from "./types";

export default function PromiseLedger({
  cut,
  onPayer,
  onAdd,
}: {
  cut: TrailerCut;
  onPayer: (beatId: string, promiseId: string, payer: string) => void;
  onAdd: (beatId: string, sentence: string) => void;
}) {
  const [beatId, setBeatId] = useState<string>(cut.beats[0]?.id ?? "");
  const [sentence, setSentence] = useState("");

  const rows = cut.beats.flatMap((b) => (b.promises ?? []).map((p) => ({ beat: b, p })));
  const incomplete = rows.filter((r) => !r.p.payer).length;

  const add = () => {
    if (!beatId || !sentence.trim()) return;
    onAdd(beatId, sentence);
    setSentence("");
  };

  return (
    <section data-testid="promise-ledger" className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <p className="font-jetbrains flex items-baseline justify-between text-label tracking-[0.14em] uppercase">
        <span className="text-white/35">promise ledger</span>
        <span className={incomplete ? "text-amber-200" : "text-white/45"}>
          {rows.length} promised · {incomplete} incomplete
        </span>
      </p>

      {rows.length === 0 ? (
        <p className="font-jetbrains mt-3 text-label text-white/40">
          no promise declared on any beat — the ledger is empty, which is not the same as the cut promising nothing
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map(({ beat, p }) => (
            <li key={p.id} data-testid={`promise-${p.id}`} className="text-label leading-snug">
              <p className="font-hanken text-[14px] text-slate-200">{p.sentence}</p>
              <p className="font-jetbrains mt-0.5 text-label tracking-[0.1em] text-white/30">
                by {p.source} · on “{beat.label}” @{beat.at}
                {p.grade && <span className="ml-2 text-white/45">graded {p.grade}</span>}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <label className="font-jetbrains text-label tracking-[0.14em] text-white/35 uppercase" htmlFor={`payer-${p.id}`}>
                  payer
                </label>
                <input
                  id={`payer-${p.id}`}
                  data-testid={`payer-${p.id}`}
                  defaultValue={p.payer ?? ""}
                  onBlur={(e) => onPayer(beat.id, p.id, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onPayer(beat.id, p.id, e.currentTarget.value)}
                  placeholder="the moment in the work that pays this"
                  className="font-hanken min-w-0 flex-1 rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1 text-label text-slate-200 placeholder:text-white/25"
                />
                <span
                  data-testid={`payer-state-${p.id}`}
                  className={`font-jetbrains shrink-0 text-label tracking-[0.1em] ${p.payer ? "text-emerald-300/80" : "text-amber-200"}`}
                >
                  {p.payer ? "named" : "incomplete"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-white/8 pt-3">
        <p className="font-jetbrains text-label tracking-[0.14em] text-white/35 uppercase">add a promise</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <select
            aria-label="beat that makes the promise"
            data-testid="promise-add-beat"
            value={beatId}
            onChange={(e) => setBeatId(e.target.value)}
            className="font-jetbrains rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1 text-label text-white/75"
          >
            {cut.beats.map((b: TrailerBeat) => (
              <option key={b.id} value={b.id}>
                {b.at} · {b.label}
              </option>
            ))}
          </select>
          <input
            data-testid="promise-add-sentence"
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="what a stranger now believes about the work…"
            className="font-hanken min-w-0 flex-1 rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1 text-label text-slate-200 placeholder:text-white/25"
          />
          <button
            type="button"
            onClick={add}
            disabled={!sentence.trim() || !beatId}
            className="font-jetbrains rounded-lg border border-amber-400/35 px-2 py-1 text-label text-amber-100/80 transition hover:bg-amber-400/10 disabled:opacity-30"
          >
            add
          </button>
        </div>
      </div>
    </section>
  );
}
