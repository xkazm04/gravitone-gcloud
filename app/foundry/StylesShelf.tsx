"use client";

// THE CATALOGUE — every style the forge can be pointed at, with the evidence
// the cull has accumulated for it.
//
// Redesigned 2026-08-28, when the catalogue crossed twenty-seven styles and
// the original everything-on-every-card grid stopped being a shelf and
// became a wall:
//
//   · ONE image per card — the style's best face: a render a human KEPT in
//     the forge's cull when there is one, else the extract run's transfer
//     (the recipe on a scene the sources never showed), else a replica, else
//     a source. Everything else — the full image set, tags, recipe, the
//     evidence — lives in a MODAL opened from the card.
//   · A FAMILY RAIL on the left — the frame is 1440px wide since the
//     type-scale change, so the rail sits beside the cards without narrowing
//     them. Families are DERIVED from observables (deriveFamily) when
//     the stored field is `unsorted` — eleven singleton commits proved the
//     raw field filters nothing.
//   · Cards render in PAGES of twelve behind an IntersectionObserver
//     sentinel, so a catalogue of hundreds costs what the viewport shows,
//     not what the disk holds.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Modal from "@/components/ui/Modal";
import { deriveFamily } from "@/lib/foundry/extract/vocabulary";
import type { Catalogue, Exemplar, LedgerRow, StyleDef } from "@/lib/foundry/types";

import { fetchCatalogue, fileUrl } from "./foundryClient";
import { pct } from "./parts";

const PAGE = 12;

/** A kept ledger row names every axis, so its file needs no lookup: kept
 *  candidates stay byte-identical on disk after a commit, at the path the
 *  forge wrote them to. (A deleted file 404s harmlessly if a run directory
 *  is cleaned by hand; the row remains the record.) */
function keptFileUrl(r: LedgerRow): string {
  return fileUrl(r.run, `scenes/${r.scene}/candidates/${r.style}--${r.mechanism}--s${r.seed}.png`);
}

const exemplarUrl = (x: Exemplar) => fileUrl(x.run, x.file, x.kind);

function familyOf(s: StyleDef): string {
  return s.family && s.family !== "unsorted" ? s.family : deriveFamily(s.observables ?? {});
}

/** The card's one image: kept forge work first (the style in use), then the
 *  transfer (the recipe on a new scene), then a replica, then a source. */
function heroOf(s: StyleDef, kept: LedgerRow[]): { url: string; what: string } | null {
  if (kept.length) return { url: keptFileUrl(kept[0]), what: "kept render" };
  for (const role of ["transfer", "replica", "source"] as const) {
    const x = s.exemplars?.find((e) => e.role === role);
    if (x) return { url: exemplarUrl(x), what: role };
  }
  return null;
}

export function StylesShelf() {
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [family, setFamily] = useState<string>("all");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<StyleDef | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCatalogue().then(setCat, (e) => setError(e instanceof Error ? e.message : "failed"));
  }, []);

  const families = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of cat?.styles ?? []) counts.set(familyOf(s), (counts.get(familyOf(s)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [cat]);

  const visible = useMemo(
    () => (cat?.styles ?? []).filter((s) => family === "all" || familyOf(s) === family),
    [cat, family],
  );

  const pick = useCallback((f: string) => {
    setFamily(f);
    setShown(PAGE);
  }, []);

  // The infinite scroll: one sentinel below the grid; entering the viewport
  // reveals the next page. No spinner theatre — the data is already local.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setShown((n) => n + PAGE),
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible.length]);

  if (error) return <p className="font-jetbrains text-content text-rose-200">{error}</p>;
  if (!cat) return <p className="font-jetbrains text-content text-white/60">loading…</p>;

  const ledgerFor = (s: StyleDef) => cat.ledger.filter((r) => r.style === s.id);

  return (
    // The frame is 1440px wide since the type-scale change; the rail fits
    // beside the cards without any breakout.
    <div>
      <div className="grid gap-6 lg:grid-cols-[190px_1fr]">
        <nav aria-label="Style families" className="lg:sticky lg:top-6 lg:self-start">
          <div className="font-jetbrains text-label tracking-[0.14em] text-white/60 uppercase">families</div>
          <ul className="mt-2 flex flex-row flex-wrap gap-1 lg:flex-col">
            {[["all", cat.styles.length] as [string, number], ...families].map(([f, n]) => (
              <li key={f}>
                <button
                  onClick={() => pick(f)}
                  aria-pressed={family === f}
                  className={`font-jetbrains w-full cursor-pointer rounded-lg border px-3 py-2 text-left text-label transition ${
                    family === f ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-white/70 hover:text-white/90"
                  }`}
                >
                  {f} <span className="text-white/55">· {n}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.slice(0, shown).map((s) => (
              <StyleCard key={s.id} style={s} kept={ledgerFor(s).filter((r) => r.verdict === "keep")} onOpen={() => setOpen(s)} />
            ))}
          </div>
          {visible.length === 0 && <p className="font-hanken text-content text-slate-400">No styles in this family yet.</p>}
          {shown < visible.length && (
            <div ref={sentinel} className="font-jetbrains py-8 text-center text-label text-white/55" aria-hidden>
              …
            </div>
          )}
        </div>
      </div>

      <StyleModal style={open} ledger={open ? ledgerFor(open) : []} onClose={() => setOpen(null)} />
    </div>
  );
}

/* ── The card: one image, a name, two chips ───────────────────────────────── */

function StyleCard({ style, kept, onOpen }: { style: StyleDef; kept: LedgerRow[]; onOpen: () => void }) {
  const hero = heroOf(style, kept);
  return (
    <button
      onClick={onOpen}
      aria-label={`Open ${style.name}`}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] text-left transition hover:border-cyan-300/40"
    >
      <div className="relative aspect-video bg-black/40">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam
          <img src={hero.url} alt={`${style.name} — ${hero.what}`} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
        ) : (
          <div className="font-jetbrains flex h-full items-center justify-center text-label text-white/55">no render yet</div>
        )}
        {hero && (
          <span className="font-jetbrains absolute top-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-label text-white/85">{hero.what}</span>
        )}
      </div>
      <div className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0">
          <h3 className="font-hanken truncate text-content text-white">{style.name}</h3>
          <p className="font-jetbrains mt-0.5 text-content text-white/60">
            {familyOf(style)} · {style.origin.kind}
            {kept.length ? ` · ${kept.length} kept` : ""}
          </p>
        </div>
        <span
          className={`font-jetbrains shrink-0 rounded-full border px-2 py-0.5 text-label tracking-[0.14em] uppercase ${
            style.status === "proven" ? "border-emerald-400/40 text-emerald-200" : "border-white/20 text-white/65"
          }`}
        >
          {style.status}
        </span>
      </div>
    </button>
  );
}

/* ── The modal: everything the card no longer shows ───────────────────────── */

function StyleModal({ style, ledger, onClose }: { style: StyleDef | null; ledger: LedgerRow[]; onClose: () => void }) {
  const kept = ledger.filter((r) => r.verdict === "keep");
  const craft = ledger.map((r) => r.craft).filter((x): x is number => typeof x === "number");
  const sty = ledger.map((r) => r.style_score).filter((x): x is number => typeof x === "number");
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const images: { url: string; caption: string }[] = [];
  if (style) {
    for (const r of kept) images.push({ url: keptFileUrl(r), caption: `kept · ${r.scene} · ${r.mechanism}` });
    for (const x of style.exemplars ?? []) images.push({ url: exemplarUrl(x), caption: `${x.role} · ${x.run}` });
  }

  return (
    <Modal
      open={style !== null}
      onClose={onClose}
      eyebrow={style ? `${familyOf(style)} · ${style.origin.kind}${style.origin.source ? ` from ${style.origin.source}` : ""}` : undefined}
      title={style?.name ?? ""}
      subtitle={
        style ? (
          <span className="font-jetbrains text-label text-white/60">
            {style.status === "proven" ? "proven — a human kept it on more than one scene" : "candidate — awaiting kept work on a second scene"}
          </span>
        ) : undefined
      }
      className="max-w-5xl"
    >
      {style && (
        <div className="flex flex-col gap-5">
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {images.map((im) => (
                <figure key={im.url} className="overflow-hidden rounded-lg border border-white/10 bg-black/40">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam */}
                  <img src={im.url} alt={`${style.name} — ${im.caption}`} loading="lazy" className="aspect-video w-full object-cover" />
                  <figcaption className="font-jetbrains truncate px-2 py-1 text-label text-white/60">{im.caption}</figcaption>
                </figure>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {Object.entries(style.observables).map(([k, v]) => (
              <span key={k} className="font-jetbrains rounded border border-white/15 px-2 py-1 text-label text-white/70">
                {k.replace(/_/g, " ")}: <span className="text-white/90">{v}</span>
              </span>
            ))}
          </div>

          <div>
            <div className="font-jetbrains text-label tracking-[0.14em] text-white/60 uppercase">recipe</div>
            <p className="font-hanken mt-1 text-content leading-relaxed text-slate-300">{style.recipe}</p>
          </div>
          <div>
            <div className="font-jetbrains text-label tracking-[0.14em] text-white/60 uppercase">negative</div>
            <p className="font-jetbrains mt-1 text-content leading-relaxed text-white/70">{style.negative}</p>
          </div>

          <footer className="font-jetbrains flex flex-wrap gap-4 border-t border-white/10 pt-3 text-label text-white/65">
            <span>
              kept <span className="text-white/90">{kept.length}</span> / {ledger.length} decided
            </span>
            <span>
              craft <span className="text-white/90">{pct(avg(craft))}</span>
            </span>
            <span>
              style <span className="text-white/90">{pct(avg(sty))}</span>
            </span>
            <span>
              scenes <span className="text-white/90">{new Set(style.evidence.filter((e) => e.verdict === "keep").map((e) => `${e.run}/${e.scene}`)).size}</span>
            </span>
          </footer>
        </div>
      )}
    </Modal>
  );
}
