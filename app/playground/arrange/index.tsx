"use client";

// ARRANGEMENT — the Sound lab's second module (round 4, platform-consolidation,
// WP3). The operator's words: "Works with kept tracks in drag and drop
// interface to move tracks on y-axis to group into genre groups, on x-axis to
// different pipeline stages (pending, (to) remaster, edit, finalized).
// Finalized audio tracks will be then labelled in library and agents will know
// which ones to select from."
//
// The shell (app/playground/PlaygroundView.tsx) mounts this under its tab with
// the kind; everything below that line is this directory:
//
//   model.ts       the board as data — stacks, rows, cells, moves, labels
//   useArrange.ts  the store, read and written optimistically with rollback
//   Board.tsx      the grid, the pointer drag, the keyboard path
//   Card.tsx       one version stack; the move map
//   RoundTrip.tsx  remaster / edit by hand in Suno's studio
//   LabelPrompt    the library label a finalize asks for
//
// Music and effects share all of it; they differ only where the takes do —
// rows are genres or sfx categories, an effect carries its loop flag and draws
// a shorter waveform.

import Link from "next/link";

import { Plus } from "lucide-react";

import { Ghost, Keycaps } from "@/components/ui/signal";
import { STAGES, type SoundKind } from "@/lib/sound/types";

import { Board, NewRow } from "./Board";
import { seedSuggestions, STAGE_WORD } from "./model";
import { MONO_CAPS as CAPS } from "./parts";
import { useArrange, type Arrange } from "./useArrange";

const KEYS = [
  { keys: ["←", "→", "↑", "↓"], does: "walk the cards" },
  { keys: ["⇧", "arrows"], does: "move the card one cell" },
  { keys: ["M"], does: "move to…" },
  { keys: ["Space"], does: "play / pause" },
  { keys: ["V"], does: "versions" },
  { keys: ["A"], does: "A/B head and previous version" },
  { keys: ["Esc"], does: "drop the drag" },
];

export default function ArrangeModule({ kind }: { kind: SoundKind }) {
  const a = useArrange(kind);

  return (
    <section data-module="arrange" data-kind={kind} aria-label="Arrangement" className="space-y-4">
      <p aria-live="polite" className="sr-only">
        {a.notice?.tone === "ok" ? a.notice.text : ""}
      </p>
      <p aria-live="assertive" className="sr-only">
        {a.notice?.tone === "error" ? a.notice.text : ""}
      </p>

      {!a.ready ? (
        <Ghost shape="card" count={2} label="Reading the kept takes" />
      ) : a.loadError ? (
        <div className="flex items-center gap-3 rounded-xl border border-rose-400/30 bg-rose-400/[0.06] px-4 py-3">
          <span className="font-hanken text-label text-rose-100">{a.loadError}</span>
          <button
            type="button"
            onClick={a.retry}
            className="ml-auto cursor-pointer rounded-full border border-rose-300/40 px-3 py-1 font-jetbrains text-label text-rose-100 hover:bg-rose-400/10"
          >
            retry
          </button>
        </div>
      ) : (
        <>
          <Toolbar a={a} kind={kind} />
          {a.stacks.length === 0 ? <EmptyBoard kind={kind} rows={a.rows.length} /> : <Board a={a} kind={kind} />}
        </>
      )}
    </section>
  );
}

function Toolbar({ a, kind }: { a: Arrange; kind: SoundKind }) {
  const sugg = seedSuggestions(a.stacks, a.declared, kind);
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-2">
      <NewRow a={a} />
      {sugg.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={kind === "sfx" ? "Rows from sfx categories" : "Rows from genres"}>
          <span className={`${CAPS} ml-2 text-white/35`}>{kind === "sfx" ? "categories" : "genres"}</span>
          {sugg.slice(0, 8).map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => void a.adoptSuggestion(s.name)}
              aria-label={`Create the row ${s.name} and file ${s.n} ungrouped card${s.n === 1 ? "" : "s"} into it`}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 font-hanken text-label text-white/70 transition hover:border-cyan-300/40 hover:bg-cyan-300/[0.06] hover:text-cyan-50"
            >
              <Plus className="h-3.5 w-3.5 text-white/40" aria-hidden />
              {s.name}
              <span className="font-jetbrains text-white/40">{s.n}</span>
            </button>
          ))}
        </div>
      )}
      <div className="ml-auto flex items-center gap-3">
        {a.notice && (
          <button
            type="button"
            onClick={a.dismiss}
            aria-label="Dismiss"
            className={`max-w-[44rem] cursor-pointer truncate rounded-full border px-3 py-1 font-jetbrains text-label transition ${
              a.notice.tone === "error"
                ? "border-rose-400/35 bg-rose-400/[0.07] text-rose-100 hover:bg-rose-400/15"
                : "border-emerald-400/25 bg-emerald-400/[0.05] text-emerald-100/90 hover:bg-emerald-400/10"
            }`}
          >
            {a.notice.text}
          </button>
        )}
        <Keycaps map={KEYS} label="Board keys" />
      </div>
    </div>
  );
}

/** No kept take of this kind yet: the board's shape, drawn faint, and the one
 *  place takes become kept. */
function EmptyBoard({ kind, rows }: { kind: SoundKind; rows: number }) {
  return (
    <div className="relative">
      <div aria-hidden className="grid grid-cols-[12.5rem_repeat(4,minmax(0,1fr))] gap-2 opacity-60">
        <span />
        {STAGES.map((s) => (
          <span key={s} className={`${CAPS} rounded-xl border border-white/6 px-3 py-2.5 text-white/30`}>
            {STAGE_WORD[s]}
          </span>
        ))}
        {Array.from({ length: Math.max(2, rows) }, (_, r) => (
          <div key={r} className="contents">
            <span className="m-2 h-6 w-28 rounded-full bg-white/[0.04]" />
            {STAGES.map((s, c) => (
              <span key={s} className="flex min-h-[8.5rem] flex-col gap-2 rounded-xl border border-white/[0.05] p-2">
                {(r + c) % 3 === 0 && <span className="h-20 rounded-lg border border-white/[0.05] bg-white/[0.02]" />}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/8 bg-[var(--gt-ink)]/80 px-8 py-6 backdrop-blur-xl">
          <p className="font-instrument text-2xl text-white/85">No kept {kind === "sfx" ? "effects" : "tracks"}</p>
          <Link
            href={`/playground?m=triage&kind=${kind}`}
            className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-4 py-1.5 font-jetbrains text-label text-cyan-100 transition hover:bg-cyan-300/20"
          >
            triage →
          </Link>
        </div>
      </div>
    </div>
  );
}
