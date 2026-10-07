"use client";

// SHELVES — the LIBRARY view of ONE project's outputs: the plates its frames
// hold and the takes its cues use, read from its own records
// (./projectOutputs.ts). Every output sits on a shelf, filterable by kind and
// searchable by title.
//
// THE FIXTURE IS GONE. The shelf used to be Glass Harbor's thirty mock assets
// for every project, with a collection rail and previews no record held. A
// project with nothing made yet now shows the outline of a shelf, and a source
// that cannot be read says so in the engine's own words beside the others.
//
// THE COMMISSION DOCK IS GONE too, and its absence is the honest state: it was
// an input with no `value` beside a button with no `onClick`, drawn at the size
// of the product's most ambitious promise. A surface here may not draw what the
// product cannot do.

import { useMemo, useState } from "react";
import { Music2, Search, SearchX } from "lucide-react";

import { CHIP_CLASS, Ghost, Provenance, TALLY_TONE } from "@/components/ui/signal";

import { useProjectOutputs } from "./useProjectOutputs";
import type { Output, OutputKind, OutputStep, SourceRead } from "./projectOutputs";

const KINDS: OutputKind[] = ["image", "audio"];
const STEPS: OutputStep[] = ["frames", "score"];

const usd = (n: number | undefined) => (n === undefined ? undefined : `$${n.toFixed(2)}`);

/** What a source has to say when it could not be read in full, in its own words. */
const troubleOf = (s: SourceRead): { text: string; refused: boolean } | null => {
  if (s.state === "unavailable") return { text: s.reason, refused: false };
  if (s.state === "refused") return { text: `${s.refused}: ${s.reason}`, refused: true };
  if (s.state === "loaded" && s.note) return { text: s.note, refused: false };
  return null;
};

export default function LibraryShelves({ projectId }: { projectId: string }) {
  const read = useProjectOutputs(projectId, true);
  const [kind, setKind] = useState<OutputKind | null>(null);
  const [q, setQ] = useState("");

  const shelf = useMemo(() => (read?.outputs ?? []).filter((o) => o.state !== "missing"), [read]);
  const missing = useMemo(() => (read?.outputs ?? []).filter((o) => o.state === "missing"), [read]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return shelf.filter((o) => (!kind || o.kind === kind) && (!needle || o.title.toLowerCase().includes(needle)));
  }, [shelf, kind, q]);

  const troubles = read
    ? STEPS.flatMap((step) => {
        const t = troubleOf(read.sources[step]);
        return t ? [{ step, ...t }] : [];
      })
    : [];
  const nothing = !read || (shelf.length === 0 && missing.length === 0);

  return (
    // pb-8, not pb-28: the deep bottom padding existed to clear the fixed
    // commission dock, and a gap held open for something that is no longer
    // there reads as a rendering fault.
    <div className="mt-8 grid gap-6 pb-8 lg:grid-cols-[210px_1fr]">
      {/* ——— the rail: what's on the shelves ——— */}
      <aside className="space-y-6">
        <div>
          <p className="font-jetbrains mb-2 text-content tracking-[0.14em] text-white/40 uppercase">kind</p>
          <ul className="space-y-1">
            <RailRow label="everything" count={shelf.length} active={kind === null} onClick={() => setKind(null)} />
            {KINDS.map((k) => (
              <RailRow
                key={k}
                label={k}
                count={shelf.filter((o) => o.kind === k).length}
                active={kind === k}
                onClick={() => setKind(kind === k ? null : k)}
              />
            ))}
          </ul>
        </div>
      </aside>

      {/* ——— the shelves ——— */}
      <section>
        {troubles.length > 0 && (
          <ul className="mb-4 flex flex-wrap gap-2" aria-label="Sources that could not be read">
            {troubles.map((t) => (
              <li key={t.step} className={`${CHIP_CLASS} ${t.refused ? TALLY_TONE.rose : TALLY_TONE.amber}`}>
                <span className="uppercase opacity-80">{t.step}</span>
                <span>{t.text}</span>
              </li>
            ))}
          </ul>
        )}

        <label className="relative block">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search titles"
            placeholder="Search"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pr-4 pl-10 text-label text-white placeholder:text-white/30 focus:border-cyan-400/40"
          />
        </label>

        {nothing ? (
          <Ghost shape="card" count={3} label={read ? "No outputs yet" : "Reading outputs"} className="mt-5" />
        ) : shown.length === 0 && shelf.length > 0 ? (
          // A FILTER MISS, NOT AN EMPTY SHELF — and the way to say that is to
          // hand back the control that undoes it.
          <div className="mt-10 flex flex-col items-center gap-4">
            <SearchX className="h-8 w-8 text-white/25" aria-hidden />
            <p className="text-content text-slate-400">Nothing matches</p>
            {(kind || q.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setKind(null);
                  setQ("");
                }}
                className="font-jetbrains cursor-pointer rounded-full border border-white/15 px-3.5 py-1.5 text-label text-white/70 transition hover:border-cyan-400/40 hover:text-cyan-200"
              >
                clear filters
              </button>
            )}
          </div>
        ) : (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((o) => (
              <li key={o.id}>
                <OutputCard output={o} />
              </li>
            ))}
          </ul>
        )}

        {missing.length > 0 && (
          <ul className="mt-6 flex flex-wrap gap-2" aria-label="Missing">
            {missing.map((o) => (
              <li key={o.id} className={`${CHIP_CLASS} ${TALLY_TONE.amber}`}>
                <span>{o.title}</span>
                <span className="opacity-80">{o.code}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OutputCard({ output: o }: { output: Output }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
      {o.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a plate is a data: URL or a public path, not an optimisable asset
        <img src={o.src} alt={o.title} className="h-32 w-full object-cover" />
      ) : (
        <div className="flex h-32 flex-col items-center justify-center gap-3 bg-white/[0.02] px-3">
          <Music2 className="h-6 w-6 text-white/30" aria-hidden />
          <audio controls preload="none" src={o.src} aria-label={o.title} className="w-full" />
        </div>
      )}
      <div className="space-y-2 p-3.5">
        <p className="truncate text-content font-medium text-white">{o.title}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`${CHIP_CLASS} ${o.state === "in-cut" ? TALLY_TONE.cyan : TALLY_TONE.neutral}`}>{o.state}</span>
          <Provenance
            model={o.provenance.model}
            run={o.provenance.run}
            step={o.provenance.step}
            cost={usd(o.provenance.costUsd)}
          />
        </div>
      </div>
    </div>
  );
}

function RailRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-label transition ${
          active ? "bg-cyan-400/10 text-cyan-200" : "text-slate-400 hover:bg-white/5 hover:text-white"
        }`}
      >
        <span className="truncate">{label}</span>
        <span className="font-jetbrains text-label text-white/35">{count}</span>
      </button>
    </li>
  );
}
