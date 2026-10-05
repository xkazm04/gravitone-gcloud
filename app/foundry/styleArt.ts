// WHICH PICTURE STANDS FOR A STYLE — pure, so the Styles shelf, its document
// sheet and the plant header's Styles station all pick the same one.
//
// Lifted out of StylesShelf.tsx on 2026-10-05 when a second reader (the
// pipeline header's station thumbnails, ./plant.tsx) needed the same answer:
// two copies of "the style's best face" is two faces.

import { deriveFamily } from "@/lib/foundry/extract/vocabulary";
import type { Catalogue, Exemplar, LedgerRow, StyleDef } from "@/lib/foundry/types";

import { fileUrl } from "./foundryClient";

/** A kept ledger row names every axis, so its file needs no lookup: kept
 *  candidates stay byte-identical on disk after a commit, at the path the
 *  forge wrote them to. (A deleted file 404s harmlessly if a run directory
 *  is cleaned by hand; the row remains the record.) */
export function keptPath(r: LedgerRow): string {
  return `scenes/${r.scene}/candidates/${r.style}--${r.mechanism}--s${r.seed}.png`;
}

export function keptFileUrl(r: LedgerRow): string {
  return fileUrl(r.run, keptPath(r));
}

export const exemplarUrl = (x: Exemplar) => fileUrl(x.run, x.file, x.kind);

/** The family a style files under. Families are DERIVED from observables
 *  (deriveFamily) when the stored field is `unsorted` — eleven singleton
 *  commits proved the raw field filters nothing. */
export function familyOf(s: StyleDef): string {
  return s.family && s.family !== "unsorted" ? s.family : deriveFamily(s.observables ?? {});
}

/** Every ledger row about one style. */
export function ledgerFor(cat: Catalogue, s: StyleDef): LedgerRow[] {
  return cat.ledger.filter((r) => r.style === s.id);
}

/** The rows a human KEPT, newest ledger order preserved. */
export function keptRows(cat: Catalogue, s: StyleDef): LedgerRow[] {
  return ledgerFor(cat, s).filter((r) => r.verdict === "keep");
}

/** The card's one image: kept forge work first (the style in use), then the
 *  transfer (the recipe on a new scene), then a replica, then a source. */
export function heroOf(s: StyleDef, kept: LedgerRow[]): { url: string; what: string } | null {
  if (kept.length) return { url: keptFileUrl(kept[0]), what: "kept render" };
  for (const role of ["transfer", "replica", "source"] as const) {
    const x = s.exemplars?.find((e) => e.role === role);
    if (x) return { url: exemplarUrl(x), what: role };
  }
  return null;
}

/** Families with their counts, biggest first, ties by name. */
export function familyCounts(styles: StyleDef[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const s of styles) counts.set(familyOf(s), (counts.get(familyOf(s)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
