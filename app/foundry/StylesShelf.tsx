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
//     evidence — lives on a DOCUMENT sheet opened from the card, with ← and →
//     walking the catalogue in the order the cards are in.
//   · A FAMILY RAIL on the left. Families are DERIVED from observables
//     (deriveFamily) when the stored field is `unsorted` — eleven singleton
//     commits proved the raw field filters nothing.
//   · Cards render in PAGES of twelve behind an IntersectionObserver
//     sentinel, so a catalogue of hundreds costs what the viewport shows,
//     not what the disk holds.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Card,
  CardGrid,
  DataTable,
  DefList,
  Doc,
  DocLede,
  DocSection,
  ErrorBox,
  Figures,
  Ghost,
  Kicker,
  Loading,
  Prose,
  Rule,
  Sheet,
  SideItem,
  SideList,
  Stats,
  StatusGlyph,
  pct,
} from "@/components/kit";
import { deriveFamily } from "@/lib/foundry/extract/vocabulary";
import type { Catalogue, Exemplar, LedgerRow, StyleDef } from "@/lib/foundry/types";

import { fetchCatalogue, fileUrl } from "./foundryClient";

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
  const [open, setOpen] = useState<string | null>(null);
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

  const at = open ? visible.findIndex((s) => s.id === open) : -1;
  const step = useCallback(
    (d: 1 | -1) => {
      if (at < 0) return;
      const n = visible[at + d];
      if (n) setOpen(n.id);
    },
    [at, visible],
  );

  // ← and → walk the catalogue while a document is open.
  useEffect(() => {
    if (at < 0) return;
    const onKey = (e: KeyboardEvent) => {
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

  if (error)
    return (
      <div className="pt-6">
        <ErrorBox>{error}</ErrorBox>
      </div>
    );
  if (!cat)
    return (
      <div className="pt-6">
        <Loading />
      </div>
    );

  const ledgerFor = (s: StyleDef) => cat.ledger.filter((r) => r.style === s.id);
  const openStyle = at >= 0 ? visible[at] : null;

  return (
    <div className="k-two">
      <SideList label="Style families" heading="Families">
        {[["all", cat.styles.length] as [string, number], ...families].map(([f, n]) => (
          <SideItem key={f} title={f} count={n} pressed={family === f} onSelect={() => pick(f)} />
        ))}
      </SideList>

      <div>
        {visible.length === 0 ? (
          <Ghost shape="card" count={2} label="no styles in this family yet" />
        ) : (
          <CardGrid>
            {visible.slice(0, shown).map((s) => (
              <StyleCard key={s.id} style={s} kept={ledgerFor(s).filter((r) => r.verdict === "keep")} onOpen={() => setOpen(s.id)} />
            ))}
          </CardGrid>
        )}
        {shown < visible.length && (
          <div ref={sentinel} className="k-muted py-8 text-center" aria-hidden>
            …
          </div>
        )}
      </div>

      <StyleSheet
        style={openStyle}
        ledger={openStyle ? ledgerFor(openStyle) : []}
        onClose={() => setOpen(null)}
        onPrev={at > 0 ? () => step(-1) : undefined}
        onNext={at >= 0 && at < visible.length - 1 ? () => step(1) : undefined}
      />
    </div>
  );
}

/* ── The card: one image, a name, a status ────────────────────────────────── */

function StyleCard({ style, kept, onOpen }: { style: StyleDef; kept: LedgerRow[]; onOpen: () => void }) {
  const hero = heroOf(style, kept);
  return (
    <Card
      label={`Open ${style.name}`}
      src={hero?.url}
      alt={hero ? `${style.name} — ${hero.what}` : undefined}
      what={hero?.what}
      title={style.name}
      meta={`${familyOf(style)} · ${style.origin.kind}${kept.length ? ` · ${kept.length} kept` : ""}`}
      status={style.status}
      proven={style.status === "proven"}
      onOpen={onOpen}
    />
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

  const images: { id: string; src: string; alt: string; caption: string }[] = [];
  if (style) {
    for (const r of kept) {
      const caption = `kept · ${r.scene} · ${r.mechanism}`;
      images.push({ id: `${r.run}/${r.scene}/${r.mechanism}/${r.seed}`, src: keptFileUrl(r), alt: `${style.name} — ${caption}`, caption });
    }
    for (const x of style.exemplars ?? []) {
      const caption = `${x.role} · ${x.run}`;
      images.push({ id: `${x.run}/${x.file}`, src: exemplarUrl(x), alt: `${style.name} — ${caption}`, caption });
    }
  }
  const scenes = style ? new Set(style.evidence.filter((e) => e.verdict === "keep").map((e) => `${e.run}/${e.scene}`)).size : 0;

  return (
    <Sheet
      open={style !== null}
      onClose={onClose}
      onPrev={onPrev}
      onNext={onNext}
      prevLabel="Previous style"
      nextLabel="Next style"
      eyebrow={style ? <Kicker>{`${familyOf(style)} · ${style.origin.kind}${style.origin.source ? ` from ${style.origin.source}` : ""}`}</Kicker> : undefined}
      title={style?.name ?? ""}
    >
      {style && (
        <Doc>
          <DocLede>
            <StatusGlyph kind={style.status === "proven" ? "keep" : "undecided"} decorative />
            {style.status} · kept on {scenes} scene{scenes === 1 ? "" : "s"}
          </DocLede>

          {images.length > 0 && (
            <DocSection label="Kept and exemplar">
              <Figures items={images} />
            </DocSection>
          )}
          <DocSection label="Recipe">
            <Rule>{style.recipe}</Rule>
          </DocSection>
          <DocSection label="Observables">
            <DefList items={Object.entries(style.observables).map(([k, v]) => ({ term: k.replace(/_/g, " "), value: v }))} />
          </DocSection>
          <DocSection label="Negative">
            <Prose>{style.negative}</Prose>
          </DocSection>
          <DocSection label="Evidence">
            <Stats
              items={[
                { n: `${kept.length}/${ledger.length}`, label: "kept / decided" },
                { n: pct(avg(craft)), label: "craft" },
                { n: pct(avg(sty)), label: "style" },
                { n: scenes, label: "scenes" },
              ]}
            />
            {ledger.length > 0 && (
              <DataTable
                head={["run", "scene", "mechanism", "seed", "verdict", "craft", "style"]}
                rows={ledger.map((r) => [
                  r.run,
                  r.scene,
                  r.mechanism,
                  r.seed,
                  <StatusGlyph key="v" kind={r.verdict === "keep" ? "keep" : "reject"} label={r.verdict === "keep" ? "kept" : "rejected"} />,
                  pct(r.craft),
                  pct(r.style_score),
                ])}
              />
            )}
          </DocSection>
        </Doc>
      )}
    </Sheet>
  );
}
