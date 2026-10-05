"use client";

// THE CATALOGUE — every style the forge can be pointed at, with the evidence
// the cull has accumulated for it.
//
// Redesigned 2026-08-28, when the catalogue crossed twenty-seven styles and
// the original everything-on-every-card grid stopped being a shelf and
// became a wall:
//
//   · ONE image per card — the style's best face (./styleArt.ts heroOf): a
//     render a human KEPT in the forge's cull when there is one, else the
//     extract run's transfer, else a replica, else a source. Everything else —
//     the full image set, the recipe, the evidence — lives on a document
//     opened from the card, with ← and → walking the catalogue in the order the
//     cards are in.
//   · Families are DERIVED from observables when the stored field is
//     `unsorted` — eleven singleton commits proved the raw field filters
//     nothing.
//   · Cards render in PAGES behind IntersectionObserver sentinels, so a
//     catalogue of hundreds costs what the viewport shows.
//
// ONE SHELF PER FAMILY, scrolling sideways (round 3: the operator's pick of the
// three round-2 shelves; the dense grid and the Library-style gallery went
// with their directions). The paging went dead in that round — the shelves
// drew every card of every family, and only the other two layouts ever placed
// the sentinel — so it is two-axis now: families arrive a few shelves at a
// time down the page, and each shelf's cards a page at a time along it, each
// sentinel observed against the scroller it actually moves through.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Modal from "@/components/ui/Modal";
import { Tally } from "@/components/ui/signal";
import type { Catalogue, LedgerRow, StyleDef } from "@/lib/foundry/types";

import { fetchCatalogue } from "./foundryClient";
import { exemplarUrl, familyCounts, familyOf, heroOf, keptFileUrl, keptRows, ledgerFor } from "./styleArt";
import { Art, ErrorNote, Label, Loading, Rise, StatusChip, pct } from "./ui";
import { refusedKey } from "./keyGuard";

/** Cards per shelf page, and shelves per page down. */
const PAGE = 12;
const SHELVES = 4;

function statusKind(s: StyleDef) {
  return s.status === "proven" ? ("committed" as const) : ("ready" as const);
}

/** "proven", on its own dark glass so it reads over a white render and a
 *  black one alike. Proven is the news; candidate is every style's starting
 *  state, and stamping it on every card was noise — the card's accessible name
 *  carries both, and the document's footer says which. */
function ProvenStamp() {
  return <span className="font-jetbrains rounded-full border border-emerald-400/45 bg-black/60 px-2 py-0.5 text-label text-emerald-200 backdrop-blur-sm">proven</span>;
}

/** Reveal the next page while `el` is within `margin` of `root` (absent = the
 *  viewport). Re-armed whenever `key` changes, because an observer that has
 *  already fired on a sentinel that is STILL in view will not fire again —
 *  a page that did not push it out of range has to be followed by a fresh
 *  observation, or the paging stops one page short of a filled screen. */
function useSentinel(el: React.RefObject<HTMLElement | null>, onSeen: () => void, key: string, margin: string, root?: React.RefObject<HTMLElement | null>) {
  const seen = useRef(onSeen);
  useEffect(() => {
    seen.current = onSeen;
  });
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && seen.current(), { root: root?.current ?? null, rootMargin: margin });
    io.observe(node);
    return () => io.disconnect();
  }, [el, key, margin, root]);
}

export function StylesShelf() {
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [family, setFamily] = useState<string>("all");
  const [shelves, setShelves] = useState(SHELVES);
  const [open, setOpen] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCatalogue().then(setCat, (e) => setError(e instanceof Error ? e.message : "failed"));
  }, []);

  const families = useMemo(() => familyCounts(cat?.styles ?? []), [cat]);
  const groups = useMemo(() => families.filter(([f]) => family === "all" || f === family), [families, family]);

  const pick = useCallback((f: string) => {
    setFamily(f);
    setShelves(SHELVES);
  }, []);

  // Down the page: the next few shelves when the last one comes near. No
  // spinner theatre — the data is already local.
  useSentinel(sentinel, () => setShelves((n) => n + SHELVES), `${family}|${shelves}|${groups.length}`, "600px");

  // The document steps in the order the reader sees the cards in: family by
  // family, shelf by shelf.
  const walk = useMemo(() => groups.flatMap(([f]) => (cat?.styles ?? []).filter((s) => familyOf(s) === f)), [groups, cat]);
  const at = open ? walk.findIndex((s) => s.id === open) : -1;
  const step = useCallback(
    (d: 1 | -1) => {
      if (at < 0) return;
      const n = walk[at + d];
      if (n) setOpen(n.id);
    },
    [at, walk],
  );

  // ← and → walk the catalogue while a document is open.
  useEffect(() => {
    if (at < 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (refusedKey(e)) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, step]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!cat) return <Loading label="reading the catalogue" />;

  const openStyle = at >= 0 ? walk[at] : null;
  return (
    <div className="flex flex-col gap-8">
      <FamilyPills families={families} total={cat.styles.length} family={family} onPick={pick} />
      {groups.slice(0, shelves).map(([f, n]) => (
        <Shelf key={f} family={f} count={n} styles={walk.filter((s) => familyOf(s) === f)} cat={cat} onOpen={setOpen} />
      ))}
      {shelves < groups.length && <div ref={sentinel} className="h-16" aria-hidden />}
      <StyleSheet
        style={openStyle}
        ledger={openStyle ? ledgerFor(cat, openStyle) : []}
        onClose={() => setOpen(null)}
        onPrev={at > 0 ? () => step(-1) : undefined}
        onNext={at >= 0 && at < walk.length - 1 ? () => step(1) : undefined}
      />
    </div>
  );
}

/** One family's shelf. Its cards arrive a page at a time as the shelf is
 *  scrolled along: the sentinel sits at the shelf's far end and is observed
 *  against the shelf itself — against the viewport it would read as always in
 *  view (it is level with the cards) or never (it is off to the right). */
function Shelf({ family, count, styles, cat, onOpen }: { family: string; count: number; styles: StyleDef[]; cat: Catalogue; onOpen: (id: string) => void }) {
  const [shown, setShown] = useState(PAGE);
  const scroller = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useSentinel(end, () => setShown((n) => n + PAGE), `${shown}|${styles.length}`, "0px 900px 0px 0px", scroller);
  return (
    <section aria-label={`${family} styles`}>
      <div className="mb-3 flex items-baseline gap-3 px-1">
        <h2 className="font-instrument text-2xl text-white capitalize">{family}</h2>
        <span className="font-jetbrains text-label text-white/40 tabular-nums">{count}</span>
      </div>
      <div ref={scroller} className="scroll-x -mx-1 flex gap-4 px-1 pb-3">
        {styles.slice(0, shown).map((s, i) => (
          <Rise key={s.id} delay={Math.min(i, 10) * 0.025} className="w-[300px] shrink-0">
            <StyleCard style={s} kept={keptRows(cat, s)} onOpen={() => onOpen(s.id)} />
          </Rise>
        ))}
        {shown < styles.length && <div ref={end} className="w-px shrink-0" aria-hidden />}
      </div>
    </section>
  );
}

function FamilyPills({ families, total, family, onPick }: { families: [string, number][]; total: number; family: string; onPick: (f: string) => void }) {
  return (
    <div role="group" aria-label="Style families" className="flex flex-wrap items-center gap-1.5">
      {[["all", total] as [string, number], ...families].map(([f, n]) => {
        const on = family === f;
        return (
          <button
            key={f}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(f)}
            className={`font-jetbrains inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-label transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
              on ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100" : "border-white/10 text-white/55 hover:border-white/25 hover:text-white/85"
            }`}
          >
            {f}
            <span className={on ? "text-cyan-200/70" : "text-white/35"}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── The card: one image, a name, a status ────────────────────────────────── */

function StyleCard({ style, kept, onOpen }: { style: StyleDef; kept: LedgerRow[]; onOpen: () => void }) {
  const hero = heroOf(style, kept);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${style.name}, ${style.status}`}
      className="group block w-full cursor-pointer overflow-hidden rounded-xl border border-white/8 bg-white/[0.02] text-left transition hover:border-cyan-400/35 hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <Art src={hero?.url} alt={hero ? `${style.name} — ${hero.what}` : style.name} absentWord="no render yet" className="aspect-[4/3]" rounded="rounded-none">
        {hero && (
          <span className="font-jetbrains pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-label text-white/80 backdrop-blur-sm">{hero.what}</span>
        )}
        {style.status === "proven" && (
          <span className="absolute top-2 right-2">
            <ProvenStamp />
          </span>
        )}
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 transition group-hover:opacity-100" />
      </Art>
      <span className="flex flex-col gap-1.5 px-3 py-2.5">
        <span className="font-instrument truncate text-lg text-white/90 group-hover:text-white">{style.name}</span>
        <span className="font-jetbrains truncate text-label text-white/40">
          {familyOf(style)} · {style.origin.kind}
          {kept.length ? ` · ${kept.length} kept` : ""}
        </span>
      </span>
    </button>
  );
}

/* ── The document: everything the card no longer shows ────────────────────── */

function StyleSheet({
  style,
  ledger,
  onClose,
  onPrev,
  onNext,
}: {
  style: StyleDef | null;
  ledger: LedgerRow[];
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const kept = ledger.filter((r) => r.verdict === "keep");
  const craft = ledger.map((r) => r.craft).filter((x): x is number => typeof x === "number");
  const sty = ledger.map((r) => r.style_score).filter((x): x is number => typeof x === "number");
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const images: { id: string; src: string; caption: string }[] = [];
  if (style) {
    for (const r of kept) images.push({ id: `${r.run}/${r.scene}/${r.mechanism}/${r.seed}`, src: keptFileUrl(r), caption: `kept · ${r.scene} · ${r.mechanism}` });
    for (const x of style.exemplars ?? []) images.push({ id: `${x.run}/${x.file}`, src: exemplarUrl(x), caption: `${x.role} · ${x.run}` });
  }
  const scenes = style ? new Set(style.evidence.filter((e) => e.verdict === "keep").map((e) => `${e.run}/${e.scene}`)).size : 0;

  const nav = (d: -1 | 1) => {
    const fn = d === -1 ? onPrev : onNext;
    const Icon = d === -1 ? ChevronLeft : ChevronRight;
    return (
      <button
        type="button"
        disabled={!fn}
        onClick={fn}
        aria-label={d === -1 ? "Previous style" : "Next style"}
        className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-white/12 text-white/70 transition hover:border-white/30 hover:text-white disabled:cursor-default disabled:opacity-30"
      >
        <Icon aria-hidden className="h-4 w-4" />
      </button>
    );
  };

  return (
    <Modal
      open={style !== null}
      onClose={onClose}
      title={style?.name ?? ""}
      eyebrow={style ? <Label>{`${familyOf(style)} · ${style.origin.kind}${style.origin.source ? ` from ${style.origin.source}` : ""}`}</Label> : undefined}
      className="max-w-[min(1280px,94vw)]"
      footer={
        <div className="flex items-center gap-2">
          {nav(-1)}
          {nav(1)}
          {style && <StatusChip className="ml-auto" kind={statusKind(style)} word={`${style.status} · kept on ${scenes} scene${scenes === 1 ? "" : "s"}`} />}
        </div>
      }
    >
      {style && (
        <div className="flex flex-col gap-7">
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {images.map((im) => (
                <figure key={im.id} className="flex flex-col gap-1.5">
                  <Art src={im.src} alt={`${style.name} — ${im.caption}`} className="aspect-video" />
                  <figcaption className="font-jetbrains truncate px-0.5 text-label text-white/40">{im.caption}</figcaption>
                </figure>
              ))}
            </div>
          )}
          <section>
            <Label as="h3" className="mb-2">
              Recipe
            </Label>
            <p className="font-hanken border-l-2 border-cyan-300/40 pl-4 text-content leading-relaxed text-white/85">{style.recipe}</p>
          </section>
          <div className="grid gap-7 md:grid-cols-2">
            <section>
              <Label as="h3" className="mb-2">
                Observables
              </Label>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                {Object.entries(style.observables).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-jetbrains text-label text-white/45">{k.replace(/_/g, " ")}</dt>
                    <dd className="font-hanken text-label text-white/85">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section>
              <Label as="h3" className="mb-2">
                Negative
              </Label>
              <p className="font-hanken text-content leading-relaxed text-white/70">{style.negative}</p>
            </section>
          </div>
          <section>
            <Label as="h3" className="mb-3">
              Evidence
            </Label>
            <div className="mb-4 flex flex-wrap gap-1.5">
              <Tally label="kept" value={kept.length} of={ledger.length} tone={kept.length ? "emerald" : "neutral"} />
              <Tally label="scenes" value={scenes} />
              <span className="font-jetbrains rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-label text-white/60">craft {pct(avg(craft))}</span>
              <span className="font-jetbrains rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-label text-white/60">style {pct(avg(sty))}</span>
            </div>
            {ledger.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-white/8">
                <table className="w-full text-left">
                  <thead className="bg-white/[0.03]">
                    <tr>
                      {["run", "scene", "mechanism", "seed", "verdict", "craft", "style"].map((h) => (
                        <th key={h} scope="col" className="font-jetbrains px-3 py-2 text-label font-normal tracking-[0.12em] text-white/40 uppercase">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((r, i) => (
                      <tr key={`${r.run}-${r.scene}-${r.mechanism}-${r.seed}-${i}`} className="border-t border-white/[0.05]">
                        <td className="font-jetbrains px-3 py-1.5 text-label text-white/70">{r.run}</td>
                        <td className="font-jetbrains px-3 py-1.5 text-label text-white/70">{r.scene}</td>
                        <td className="font-jetbrains px-3 py-1.5 text-label text-white/70">{r.mechanism}</td>
                        <td className="font-jetbrains px-3 py-1.5 text-label text-white/45">{r.seed}</td>
                        <td className="px-3 py-1.5">
                          <span className={`font-jetbrains text-label ${r.verdict === "keep" ? "text-emerald-200" : "text-rose-200/80"}`}>{r.verdict === "keep" ? "kept" : "rejected"}</span>
                        </td>
                        <td className="font-jetbrains px-3 py-1.5 text-label text-white/70 tabular-nums">{pct(r.craft)}</td>
                        <td className="font-jetbrains px-3 py-1.5 text-label text-white/70 tabular-nums">{pct(r.style_score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
