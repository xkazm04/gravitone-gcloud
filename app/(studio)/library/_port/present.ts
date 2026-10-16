// THE ONE MAPPING from the index's answer to what the Library draws - pure, so both sides (the
// fixture, the kernel's index after the cutover) present through it and a test pins it.
//
// What it decides, each with its reason:
//   the face     a row names its cover by blob; the face is that picture when there is one, and
//                otherwise the item's own data (library.js `face`/`vface`): a take its waveform,
//                a document paper, a style its palette, a clip or an export with no poster - or
//                with media that does not decode - its designed face. Never a blank tile.
//   the preview  a clip or an export that decodes plays in place; one that does not shows its
//                face and the probe's own words (MediaFacts.error) beside it.
//   the lineage  the index sends one node per step; the panel draws one line per ROLE, so
//                consecutive nodes of a role are one line of doors (library.js `node(role, html)`).
//                A node that opens an item selects it; one that names a facet filters by it, and
//                switches kind when the facet is not the current kind's (a style's "plates in
//                this style" lands on Plates); a run also links its Ledger events; a node that
//                names neither is drawn as text, a library-item that is gone as a ghost.

import { isSharedGroup, VOCAB_GROUPS, type LibraryKindName, type LibraryRow, type LineageNode as Node } from "@gt/domain/library";
import type { LibraryItemDetail } from "@gt/domain/libraryItem";
import type { Face, Palette } from "@gt/ui/components/library/Face.tsx";
import type { LineageNode, LineageRef } from "@gt/ui/components/library/Lineage.tsx";
import type { LibraryCard } from "@gt/ui/components/library/LibraryTile.tsx";
import { kindShort } from "@gt/ui/components/library/LibraryGlyph.tsx";

import type { Choice, ShownDetail } from "./contract.ts";

/** What a side knows beyond the row: where a blob is served, and the look the row does not carry. */
export type Media = {
  /** The address of a blob, or null when this side cannot serve it. */
  readonly url: (sha: string, mime: string) => string | null;
  readonly look: (id: string) => { readonly peaks?: readonly number[]; readonly palette?: Palette; readonly video?: string; readonly poster?: string };
  readonly ledger: (id: string) => string;
};

const day = (iso: string | null): string | null => (iso === null ? null : iso.slice(0, 10));

export function faceOf(row: LibraryRow, m: Media): Face {
  const look = m.look(row.id);
  const palette = look.palette === undefined ? {} : { palette: look.palette };
  const cover = row.cover.blobSha === null || row.attention !== undefined ? null : m.url(row.cover.blobSha, row.cover.mime ?? "image/jpeg");
  if (row.kind === "audio") return { kind: "wave", peaks: look.peaks ?? [] };
  if (row.kind === "doc") return { kind: "paper", title: row.title, foot: row.chips.find((c) => c.group === "bundle")?.label ?? row.meta };
  if (cover !== null) return row.kind === "motion" || row.kind === "video" ? { kind: "poster", url: cover, ...(look.video === undefined ? {} : { video: look.video }) } : { kind: "image", url: cover };
  if (row.kind === "style") return { kind: "swatch", name: row.title, sub: row.chips.map((c) => c.label).slice(1, 3).join(" · "), ...palette };
  return { kind: "designed", lead: kindShort(row.kind), name: row.title, tail: row.meta, ...palette };
}

export function cardOf(row: LibraryRow, m: Media): LibraryCard {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    meta: row.meta,
    state: row.state,
    source: row.source,
    date: day(row.date),
    face: faceOf(row, m),
    ...(row.attention === undefined ? {} : { attention: row.attention }),
    // A ratified style is the catalogue's locked look (library.js: the lock on a ratified style).
    ...(row.kind === "style" && row.state === "ratified" ? { locked: true } : {}),
    chips: row.chips.map((c) => c.label),
  };
}

/** The kind a facet door lands on: the current kind when the group is its own (or shared). */
export function gotoFor(group: string, role: string, kind: LibraryKindName): LibraryKindName | undefined {
  if (isSharedGroup(group) || VOCAB_GROUPS[kind].includes(group)) return undefined;
  if (/plate/.test(role) && VOCAB_GROUPS.plate.includes(group)) return "plate";
  return (Object.keys(VOCAB_GROUPS) as (LibraryKindName | "all")[]).find((k): k is LibraryKindName => k !== "all" && VOCAB_GROUPS[k].includes(group));
}

function refOf(n: Node, kind: LibraryKindName, m: Media): LineageRef {
  if (n.ref.kind === "self") return { kind: "text", label: n.label };
  if (n.itemId !== undefined) return { kind: "item", id: n.itemId, label: n.label, itemKind: n.ref.kind === "style" ? "style" : kind };
  if (n.facet !== undefined) {
    const goto = gotoFor(n.facet.group, n.role, kind);
    return { kind: "facet", group: n.facet.group, value: n.facet.value, label: n.label, ...(goto === undefined ? {} : { goto }), ...(n.ref.kind === "run" && n.facet.group === "run" ? { ledger: m.ledger(n.ref.id), mono: true } : {}) };
  }
  return { kind: "text", label: n.label, ...(n.ref.kind === "library-item" || n.ref.kind === "style" ? { ghost: true } : {}) };
}

/** One line per role, in the index's order. */
export function lineageOf(nodes: readonly Node[], kind: LibraryKindName, m: Media): LineageNode[] {
  const out: { role: string; self: boolean; refs: LineageRef[] }[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    const self = n.ref.kind === "self";
    const ref = refOf(n, kind, m);
    if (last !== undefined && last.role === n.role && !self && !last.self) last.refs.push(ref);
    else out.push({ role: n.role, self, refs: [ref] });
  }
  return out.map((l) => ({ role: l.role, refs: l.refs, ...(l.self ? { self: true } : {}) }));
}

export function detailOf(d: LibraryItemDetail, m: Media, held: Readonly<Record<string, readonly string[] | undefined>>, projects: readonly Choice[], atelier?: (styleId: string) => string): ShownDetail {
  const card = cardOf(d.row, m);
  const look = m.look(d.row.id);
  const decodes = d.media === null || d.media.decodable;
  const video = look.video !== undefined && decodes && d.row.attention === undefined ? { src: look.video, ...(look.poster === undefined ? {} : { poster: look.poster }), loop: d.row.kind === "motion" } : undefined;
  const usedBy = (d.vocabulary.find((v) => v.key === "project")?.values ?? []).map((v) => ({ value: v.value, label: v.label }));
  const styleId = d.item.kind === "style" ? d.item.vocabulary.styleId : null;
  return {
    card,
    origin: d.row.origin,
    lines: d.vocabulary.map((v) => ({ group: v.key, label: v.label, values: v.values.map((x) => ({ value: x.value, label: x.label, pressed: (held[v.key] ?? []).includes(x.value) })) })),
    lineage: lineageOf(d.lineage, d.row.kind, m),
    extras: d.extras,
    media: d.media,
    preview: { face: card.face, ...(video === undefined ? {} : { video }) },
    acts: d.acts,
    pinned: d.acts.includes("unpin"),
    projects,
    usedBy,
    ...(styleId !== null && atelier !== undefined ? { atelier: atelier(styleId) } : {}),
  };
}
