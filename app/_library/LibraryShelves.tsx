"use client";

// SHELVES — round 1's winner, consolidated as the LIBRARY view. An archive
// room: every asset sits on a shelf, filterable by kind, collection and
// search over the captions the library wrote.
//
// THE COMMISSION DOCK IS GONE, and its absence is the honest state. It was a
// fixed bar across the bottom holding an input with no `value` and no
// `onChange` beside a button with no `onClick` — you could type in it and press
// it and nothing anywhere would happen. It drew the product's most ambitious
// promise ("commission the studio") at the exact size and prominence of a
// working feature, which is the one thing a surface here may not do: it may not
// draw what the product cannot do. Rebuilding it as something that works is a
// real piece of work and belongs to whoever does that work; until then the
// shelves are what this screen is, and they are honest.

import { useMemo, useState } from "react";
import { RotateCw, Search, SearchX } from "lucide-react";

import { ASSETS, COLLECTIONS } from "../_studio/assets";
import type { AssetKind } from "../_studio/types";
import { AssetDrawer } from "../_studio/AssetDrawer";
import { KindGlyph, MockPreview, fmtDur } from "../_studio/assetParts";

const KINDS: AssetKind[] = ["image", "audio", "video", "script"];

export default function LibraryShelves() {
  const [kind, setKind] = useState<AssetKind | null>(null);
  const [collection, setCollection] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ASSETS.filter(
      (a) =>
        (!kind || a.kind === kind) &&
        (!collection || a.collection === collection) &&
        (!needle ||
          a.title.toLowerCase().includes(needle) ||
          (a.caption ?? "").toLowerCase().includes(needle) ||
          a.tags.some((t) => t.toLowerCase().includes(needle))),
    );
  }, [kind, collection, q]);

  const selectedAsset = selected ? ASSETS.find((a) => a.id === selected) : null;

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
            <RailRow label="everything" count={ASSETS.length} active={kind === null} onClick={() => setKind(null)} />
            {KINDS.map((k) => (
              <RailRow
                key={k}
                label={k}
                icon={<KindGlyph kind={k} className="h-3.5 w-3.5 text-white/45" />}
                count={ASSETS.filter((a) => a.kind === k).length}
                active={kind === k}
                onClick={() => setKind(kind === k ? null : k)}
              />
            ))}
          </ul>
        </div>
        <div>
          <p className="font-jetbrains mb-2 text-content tracking-[0.14em] text-white/40 uppercase">collections</p>
          <ul className="space-y-1">
            {COLLECTIONS.map((c) => (
              <RailRow
                key={c.name}
                label={c.name.replace("Glass Harbor / ", "GH · ")}
                count={c.count}
                active={collection === c.name}
                onClick={() => setCollection(collection === c.name ? null : c.name)}
              />
            ))}
          </ul>
        </div>
      </aside>

      {/* ——— the shelves ——— */}
      <section>
        <label className="relative block">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search titles, captions and tags"
            placeholder="Search"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pr-4 pl-10 text-label text-white placeholder:text-white/30 focus:border-cyan-400/40"
          />
        </label>

        {shown.length === 0 ? (
          // A FILTER MISS, NOT AN EMPTY LIBRARY — and the way to say that is to
          // hand back the control that undoes it. The sentence used to argue the
          // distinction ("this is a filter over a library that exists"); the
          // rail beside it already shows the counts, and a clear button is the
          // reader's actual next move.
          <div className="mt-10 flex flex-col items-center gap-4">
            <SearchX className="h-8 w-8 text-white/25" aria-hidden />
            <p className="text-content text-slate-400">Nothing matches</p>
            {(kind || collection || q.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setKind(null);
                  setCollection(null);
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
            {shown.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => setSelected(a.id)}
                  className="group w-full overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] text-left transition hover:border-cyan-400/30"
                >
                  <MockPreview asset={a} className="h-32" />
                  <div className="space-y-1.5 p-3.5">
                    <p className="font-jetbrains flex items-center gap-2 text-content text-white/40">
                      <KindGlyph kind={a.kind} className="h-3 w-3" />
                      {a.kind}
                      {a.durationS != null && <span>· {fmtDur(a.durationS)}</span>}
                    </p>
                    <p className="truncate text-content font-medium text-white">{a.title}</p>
                    {/* THE CAPTION'S STATE, WHERE THE CAPTION WOULD BE. A
                        pulsing rule is a caption on its way; an amber one with
                        a retry glyph is a caption that did not arrive. Both
                        used to be sentences occupying the line the caption is
                        for — the app narrating its own queue. */}
                    {a.captionStatus === "written" ? (
                      <p className="line-clamp-2 text-content leading-snug text-slate-400">{a.caption}</p>
                    ) : a.captionStatus === "pending" ? (
                      <span
                        role="img"
                        aria-label="Caption still being written"
                        className="block h-0.5 w-2/3 animate-pulse rounded bg-cyan-300/70"
                      />
                    ) : (
                      <span
                        className="flex items-center gap-1.5 text-content text-amber-300/90"
                        role="img"
                        aria-label="Caption failed — can be retried"
                      >
                        <RotateCw className="h-3.5 w-3.5" aria-hidden />
                        <span aria-hidden className="h-0.5 w-1/2 rounded bg-amber-300/60" />
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedAsset && (
        <AssetDrawer asset={selectedAsset} onClose={() => setSelected(null)} onSelect={setSelected} />
      )}
    </div>
  );
}

function RailRow({
  label,
  count,
  active,
  onClick,
  icon,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-label transition ${
          active ? "bg-cyan-400/10 text-cyan-200" : "text-slate-400 hover:bg-white/5 hover:text-white"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate">{label}</span>
        </span>
        <span className="font-jetbrains text-label text-white/35">{count}</span>
      </button>
    </li>
  );
}
