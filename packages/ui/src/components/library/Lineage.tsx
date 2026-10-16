// WHERE AN ITEM CAME FROM AND WHERE IT WENT (library.js `lineage`; library.css `.lin`, `.lnode`):
// a short vertical thread, oldest first, with THIS item lit in the middle. Each node is a role
// (source, run, style, lesson, used by) and its references, each a door:
//   item    another Library item: selects it (its thumbnail when it has one, else its kind)
//   facet   a value of the vocabulary: filters by it (a run, a hunt, a bundle, "6 forge plates")
//   text    something the Library knows by name only - drawn, not linked (the prototype's
//           "not in catalogue" ghost chip says a style is referenced but not kept)
// A run also links its Ledger events, the one page that always renders for any id.
// A parent that is gone is a `text` ref with `ghost`: the item still has a past, and it says so
// (@gt/domain/libraryItem: "the Library shows that as a broken link, never as an item with no past").

import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { LedgerLink } from "../ledgerlink/LedgerLink.tsx";
import { LibraryGlyph, type KindId } from "./LibraryGlyph.tsx";
import s from "./Lineage.module.css";

export type LineageRef =
  | { readonly kind: "item"; readonly id: string; readonly label: string; readonly itemKind: Exclude<KindId, "all">; readonly thumb?: string }
  | { readonly kind: "facet"; readonly group: string; readonly value: string; readonly label: string; readonly goto?: Exclude<KindId, "all">; readonly ledger?: string; readonly mono?: boolean }
  | { readonly kind: "text"; readonly label: string; readonly ghost?: boolean };

export type LineageNode = { readonly role: string; readonly self?: boolean; readonly refs: readonly LineageRef[] };

export type LineageProps = {
  readonly nodes: readonly LineageNode[];
  readonly onItem: (id: string) => void;
  readonly onFacet: (group: string, value: string, goto?: Exclude<KindId, "all">) => void;
};

function Ref({ r, onItem, onFacet }: { readonly r: LineageRef } & Pick<LineageProps, "onItem" | "onFacet">) {
  switch (r.kind) {
    case "item":
      return (
        <button type="button" className={s.link} onClick={() => onItem(r.id)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a library item is shown as its own bytes (Face.tsx) */}
          {r.thumb !== undefined ? <img className={s.thumb} src={r.thumb} alt="" loading="lazy" /> : <LibraryGlyph name={r.itemKind} className={s.mark} />}
          <span className={s.ell}>{r.label}</span>
        </button>
      );
    case "facet":
      return (
        <>
          <button type="button" className={cx(s.link, s.plain, r.mono === true && s.mono)} onClick={() => onFacet(r.group, r.value, r.goto)}>
            {r.label}
          </button>
          {r.ledger !== undefined && <LedgerLink href={r.ledger} subject={r.label} label="" />}
        </>
      );
    case "text":
      return <Chip label={r.label} casing="lower" ghost={r.ghost === true} />;
  }
}

export function Lineage({ nodes, onItem, onFacet }: LineageProps) {
  return (
    <ol className={s.lineage} aria-label="lineage">
      {nodes.map((n, i) => (
        <li key={`${n.role}:${i}`} className={cx(s.node, n.self === true && s.self)} aria-current={n.self === true ? "true" : undefined}>
          <span className={s.role}>{n.role}</span>
          <span className={s.refs}>
            {n.refs.map((r, j) =>
              n.self === true && r.kind === "text" ? (
                <span key={j} className={s.selfText}>
                  {r.label}
                </span>
              ) : (
                <Ref key={j} r={r} onItem={onItem} onFacet={onFacet} />
              ),
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
