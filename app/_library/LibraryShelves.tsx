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

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookmarkPlus, Music2, Search, SearchX } from "lucide-react";

import { Pager, useWindow } from "@/components/kit";
import { CHIP_CLASS, Ghost, Provenance, TALLY_TONE, Tally } from "@/components/ui/signal";
import { useAnnounce } from "@/lib/announcer";
import { listAssets } from "@/lib/assets";
import { useAuth } from "@/lib/useAuth";

import { keepable, keepPlate, keptIndex, plateDigest } from "./keepPlate";
import { useProjectOutputs } from "./useProjectOutputs";
import type { Output, OutputKind, OutputStep, SourceRead } from "./projectOutputs";

const KINDS: OutputKind[] = ["image", "audio"];
const STEPS: OutputStep[] = ["frames", "score"];

const usd = (n: number | undefined) => (n === undefined ? undefined : `$${n.toFixed(2)}`);

// A page of cards. A plate is a data: URL of ~400 KB (frames/useFrames.ts), so
// every card drawn is an image decoded; a project with alternatives per shot
// reaches dozens. The first page is three full rows at the widest grid.
const PAGE = 12;

/** What a source has to say when it could not be read in full, in its own words. */
const troubleOf = (s: SourceRead): { text: string; refused: boolean } | null => {
  if (s.state === "unavailable") return { text: s.reason, refused: false };
  if (s.state === "refused") return { text: `${s.refused}: ${s.reason}`, refused: true };
  if (s.state === "loaded" && s.note) return { text: s.note, refused: false };
  return null;
};

export default function LibraryShelves({ projectId }: { projectId: string }) {
  const read = useProjectOutputs(projectId, true);
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [kept, setKept] = useState<ReadonlyMap<string, string>>(new Map());
  const refreshKept = useCallback(async () => {
    if (uid) setKept(keptIndex(await listAssets(uid)));
  }, [uid]);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    void listAssets(uid).then((rows) => live && setKept(keptIndex(rows)));
    return () => {
      live = false;
    };
  }, [uid]);
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
  // `key`: a different filter or query is a different list, back to page one.
  const page = useWindow(shown, { size: PAGE, key: `${kind ?? ""}|${q.trim().toLowerCase()}` });
  const byKind = useMemo(() => {
    const n: Record<OutputKind, number> = { image: 0, audio: 0 };
    for (const o of shelf) n[o.kind]++;
    return n;
  }, [shelf]);

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
                count={byKind[k]}
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
          <>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {page.visible.map((o) => (
                <li key={o.id}>
                  <OutputCard output={o} uid={uid} projectId={projectId} kept={kept.get(o.id)} onKept={refreshKept} />
                </li>
              ))}
            </ul>
            {page.total > PAGE && (
              <Pager
                shown={page.shown}
                total={page.total}
                onMore={page.more}
                onAll={page.all}
                step={PAGE}
                noun="outputs"
                auto
              />
            )}
          </>
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

function OutputCard({
  output: o,
  uid,
  projectId,
  kept,
  onKept,
}: {
  output: Output;
  uid: string | null;
  projectId: string;
  kept: string | undefined;
  onKept: () => Promise<void>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
      {o.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a plate is a data: URL or a public path, not an optimisable asset
        <img src={o.src} alt={o.title} loading="lazy" decoding="async" className="h-32 w-full object-cover" />
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
          {keepable(o) && uid && (
            <KeepControl output={o} uid={uid} projectId={projectId} kept={kept} onKept={onKept} />
          )}
        </div>
      </div>
    </div>
  );
}

/** The keep control, and the mark that replaces it once THIS plate's bytes are
 *  on the shelf. A regenerated plate has other bytes, so the mark goes and the
 *  control comes back. A refusal is the store's own message, beside the card. */
function KeepControl({
  output: o,
  uid,
  projectId,
  kept,
  onKept,
}: {
  output: Output;
  uid: string;
  projectId: string;
  kept: string | undefined;
  onKept: () => Promise<void>;
}) {
  const announce = useAnnounce();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keyed by the src it was read for, so a regenerated plate never wears the
  // previous plate's digest while its own is being read.
  const [read, setRead] = useState<{ src: string; digest: string } | null>(null);

  useEffect(() => {
    if (!kept || !o.src) return;
    let live = true;
    const src = o.src;
    plateDigest(src).then((digest) => live && setRead({ src, digest }), () => {});
    return () => {
      live = false;
    };
  }, [kept, o.src]);

  if (kept && read?.src === o.src && read?.digest === kept) return <Tally label="kept" value={1} tone="emerald" />;
  return (
    <>
      <button
        type="button"
        disabled={busy}
        aria-label={`Keep plate ${o.title}`}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await keepPlate(uid, projectId, o);
            await onKept();
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
            announce({ key: `keep-failed-${o.id}-${Date.now()}`, text: `Could not keep ${o.title}: ${msg}` });
          } finally {
            setBusy(false);
          }
        }}
        className="cursor-pointer rounded border border-white/15 p-1 text-white/60 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-40"
      >
        <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
      </button>
      {error && (
        <p className="w-full text-label text-rose-300">
          {error}
        </p>
      )}
    </>
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
