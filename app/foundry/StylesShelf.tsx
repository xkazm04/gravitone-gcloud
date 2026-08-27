"use client";

// THE CATALOGUE — every style the forge can be pointed at, with the evidence
// the cull has accumulated for it. A style is `candidate` until a human kept
// its renders on more than one scene; the ledger rows behind each card are
// what a knowledge write-up cites.

import { useEffect, useState } from "react";

import type { Catalogue, LedgerRow, StyleDef } from "@/lib/foundry/types";

import { fetchCatalogue, fileUrl } from "./foundryClient";
import { pct } from "./parts";

/** A kept ledger row names every axis, so its file needs no lookup: kept
 *  candidates stay byte-identical on disk after a commit, at the path the
 *  forge wrote them to. (A deleted file 404s harmlessly if a run directory
 *  is cleaned by hand; the row remains the record.) */
function keptFileUrl(r: LedgerRow): string {
  return fileUrl(r.run, `scenes/${r.scene}/candidates/${r.style}--${r.mechanism}--s${r.seed}.png`);
}

export function StylesShelf() {
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCatalogue().then(setCat, (e) => setError(e instanceof Error ? e.message : "failed"));
  }, []);

  if (error) return <p className="font-jetbrains text-[12px] text-rose-200">{error}</p>;
  if (!cat) return <p className="font-jetbrains text-[12px] text-white/40">loading…</p>;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cat.styles.map((s) => (
        <StyleCard key={s.id} style={s} ledger={cat.ledger.filter((r) => r.style === s.id)} />
      ))}
    </div>
  );
}

function StyleCard({ style, ledger }: { style: StyleDef; ledger: Catalogue["ledger"] }) {
  const [zoom, setZoom] = useState<LedgerRow | null>(null);
  const kept = ledger.filter((r) => r.verdict === "keep");
  const keeps = kept.length;
  const craft = ledger.map((r) => r.craft).filter((x): x is number => typeof x === "number");
  const sty = ledger.map((r) => r.style_score).filter((x): x is number => typeof x === "number");
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-hanken text-[15px] text-white">{style.name}</h3>
          <p className="font-jetbrains text-[10px] text-white/45">
            {style.family} · {style.origin.kind}
            {style.origin.source ? ` from ${style.origin.source}` : ""}
          </p>
        </div>
        <span
          className={`font-jetbrains rounded-full border px-2 py-0.5 text-[9px] tracking-[0.14em] uppercase ${
            style.status === "proven" ? "border-emerald-400/40 text-emerald-200" : "border-white/15 text-white/50"
          }`}
        >
          {style.status}
        </span>
      </header>

      {/* An EXTRACTED style arrives with its own proof: the sources it was
          read from, the best replica the recipe produced, and the transfer
          onto a scene the sources never showed. Shown until the forge's
          ledger has kept work of its own to show instead. */}
      {kept.length === 0 && style.exemplars && style.exemplars.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {style.exemplars.map((x) => (
            <figure key={`${x.run}/${x.file}`} className="relative overflow-hidden rounded-md border border-white/10" title={`${x.role} · ${x.run}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam */}
              <img src={fileUrl(x.run, x.file, x.kind)} alt={`${style.name} ${x.role}`} loading="lazy" className="aspect-video w-full object-cover" />
              <figcaption
                className={`font-jetbrains absolute top-1 left-1 rounded px-1 py-0.5 text-[8px] font-semibold ${
                  x.role === "transfer" ? "bg-cyan-300/90 text-slate-950" : x.role === "replica" ? "bg-white/80 text-slate-950" : "bg-black/60 text-white/80"
                }`}
              >
                {x.role}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {/* The proof wall: every render a human KEPT in this style, straight
          from the committed runs. This is what makes the tab a library
          rather than a list of recipes — the style is its kept work. */}
      {kept.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {kept.map((r) => (
            <button
              key={`${r.run}/${r.scene}/${r.mechanism}/${r.seed}`}
              onClick={() => setZoom(zoom === r ? null : r)}
              title={`${r.scene} · ${r.mechanism} · ${r.run}`}
              className="cursor-zoom-in overflow-hidden rounded-md border border-white/10 transition hover:border-cyan-300/50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam */}
              <img src={keptFileUrl(r)} alt={`${style.name} on ${r.scene} (${r.mechanism})`} loading="lazy" className="aspect-video w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {zoom && (
        <figure className="overflow-hidden rounded-lg border border-cyan-300/40 bg-black/50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={keptFileUrl(zoom)} alt={`${style.name} on ${zoom.scene}`} className="w-full cursor-zoom-out" onClick={() => setZoom(null)} />
          <figcaption className="font-jetbrains px-3 py-1.5 text-[10px] text-white/50">
            {zoom.scene} · {zoom.mechanism} · {zoom.run}
          </figcaption>
        </figure>
      )}

      <div className="flex flex-wrap gap-1">
        {Object.entries(style.observables).map(([k, v]) => (
          <span key={k} className="font-jetbrains rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-white/60">
            {k.replace(/_/g, " ")}: <span className="text-white/85">{v}</span>
          </span>
        ))}
      </div>
      <p className="font-hanken text-[12px] leading-relaxed text-slate-400">{style.recipe}</p>
      <footer className="font-jetbrains mt-auto flex flex-wrap gap-3 border-t border-white/8 pt-3 text-[10px] text-white/50">
        <span>
          kept <span className="text-white/85">{keeps}</span> / {ledger.length} decided
        </span>
        <span>
          craft <span className="text-white/85">{pct(avg(craft))}</span>
        </span>
        <span>
          style <span className="text-white/85">{pct(avg(sty))}</span>
        </span>
        <span>
          scenes <span className="text-white/85">{new Set(style.evidence.filter((e) => e.verdict === "keep").map((e) => `${e.run}/${e.scene}`)).size}</span>
        </span>
      </footer>
    </article>
  );
}
