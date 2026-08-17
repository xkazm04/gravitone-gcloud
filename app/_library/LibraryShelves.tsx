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
import { Search } from "lucide-react";

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
          <p className="font-jetbrains mb-2 text-[11px] tracking-[0.14em] text-white/40 uppercase">kind</p>
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
          <p className="font-jetbrains mb-2 text-[11px] tracking-[0.14em] text-white/40 uppercase">collections</p>
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
            placeholder="Search titles, captions, tags — captions make everything findable"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pr-4 pl-10 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/40"
          />
        </label>

        {shown.length === 0 ? (
          <p className="mt-10 text-sm text-slate-400">
            Nothing on the shelves matches — this is a filter over a library that exists, not an
            empty library.
          </p>
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
                    <p className="font-jetbrains flex items-center gap-2 text-[11px] text-white/40">
                      <KindGlyph kind={a.kind} className="h-3 w-3" />
                      {a.kind}
                      {a.durationS != null && <span>· {fmtDur(a.durationS)}</span>}
                    </p>
                    <p className="truncate text-sm font-medium text-white">{a.title}</p>
                    {a.captionStatus === "written" ? (
                      <p className="line-clamp-2 text-[13px] leading-snug text-slate-400">{a.caption}</p>
                    ) : a.captionStatus === "pending" ? (
                      <p className="text-[13px] text-cyan-300/80">caption in flight…</p>
                    ) : (
                      <p className="text-[13px] text-amber-300/90">caption failed — retryable</p>
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
        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition ${
          active ? "bg-cyan-400/10 text-cyan-200" : "text-slate-400 hover:bg-white/5 hover:text-white"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate">{label}</span>
        </span>
        <span className="font-jetbrains text-[11px] text-white/35">{count}</span>
      </button>
    </li>
  );
}
