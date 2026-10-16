// THE VOCABULARY RAIL (library.js `renderNav`, `groupHTML`; library.css `.lnav`, `.kind`, `.fg`):
// the spine of the Library. Kind first, with live counts; then THAT kind's own vocabulary; then
// Attention (only while something needs it), State, Collections and Origin.
//
// Every number is the server's, counted with the group's own filter left out (the disjunctive
// convention: a value's count is what the result would hold if it were added), so the rail is a
// map of where the results live and a next click is never a guess (faceting-and-filters). The
// rail never computes a count and never hides a pressed value: `orderValues` keeps it at 0.
// The vocabulary is read from the data (the groups the port sends); nothing here lists values.
//
// Fold state (which groups are closed, which show all) is the caller's: it is the operator's
// arrangement and outlives a filter change, so it lives above the results' identity.

import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { FacetRow } from "../facet/FacetRow.tsx";
import { Fold } from "../fold/Fold.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { SrOnly } from "../a11y/SrOnly.tsx";
import { foldValues, orderValues, count, type FacetValue, type LibraryState } from "./library.ts";
import { KINDS, LibraryGlyph, kindShort, type KindId } from "./LibraryGlyph.tsx";
import tile from "./LibraryTile.module.css";
import s from "./Rail.module.css";

export type RailSection = "vocabulary" | "attention" | "state" | "collections" | "origin";

export type RailGroup = {
  readonly key: string;
  readonly label: string;
  readonly section: RailSection;
  readonly values: readonly FacetValue[];
};

export type RailProps = {
  readonly kind: KindId;
  readonly kindCounts: Readonly<Partial<Record<KindId, number>>>;
  readonly groups: readonly RailGroup[];
  readonly closed: ReadonlySet<string>;
  readonly expanded: ReadonlySet<string>;
  readonly onKind: (k: KindId) => void;
  readonly onToggle: (group: string, value: string, on: boolean) => void;
  readonly onFold: (group: string, open: boolean) => void;
  readonly onMore: (group: string, all: boolean) => void;
};

const STATES: ReadonlySet<string> = new Set<LibraryState>(["reference", "candidate", "ratified", "rejected", "unjudged"]);

/** The state's own dot, as the tiles draw it (library.css `.frow .sd`). */
function StateDot({ state }: { readonly state: string }) {
  return <span className={cx(s.dot, tile[state])} />;
}

export function FacetGroup({ g, open, all, onToggle, onFold, onMore }: { readonly g: RailGroup; readonly open: boolean; readonly all: boolean } & Pick<RailProps, "onToggle" | "onFold" | "onMore">) {
  const held = g.values.filter((v) => v.selected).map((v) => v.value);
  const values = orderValues(g.key, g.values, held);
  if (values.length === 0) return null;
  const f = foldValues(values, all);
  return (
    <Fold title={g.label} open={open} onToggle={(o) => onFold(g.key, o)} active={held.length} total={values.length} level={4}>
      <div className={s.rows} data-group={g.key}>
        {f.shown.map((v) => (
          <FacetRow
            key={v.value}
            mark="check"
            label={v.label}
            count={v.count}
            pressed={v.selected}
            onToggle={(on) => onToggle(g.key, v.value, on)}
            {...(g.key === "state" && STATES.has(v.value) ? { lead: <StateDot state={v.value} /> } : {})}
          />
        ))}
        {f.hidden > 0 && (
          <button type="button" className={s.more} onClick={() => onMore(g.key, true)}>
            +{f.hidden} more
          </button>
        )}
        {f.canFold && (
          <button type="button" className={s.more} onClick={() => onMore(g.key, false)}>
            fewer
          </button>
        )}
      </div>
    </Fold>
  );
}

function Section({ label, head, children }: { readonly label: string; readonly head?: ReactNode; readonly children: ReactNode }) {
  return (
    <section className={s.sec} aria-label={label}>
      {head !== undefined && <div className={s.head}>{head}</div>}
      {children}
    </section>
  );
}

export function Rail(p: RailProps) {
  const groups = (sec: RailSection) => p.groups.filter((g) => g.section === sec && g.values.length > 0);
  const draw = (g: RailGroup) => (
    <FacetGroup key={g.key} g={g} open={!p.closed.has(g.key)} all={p.expanded.has(g.key)} onToggle={p.onToggle} onFold={p.onFold} onMore={p.onMore} />
  );
  const vocab = groups("vocabulary");
  const attention = groups("attention").filter((g) => g.values.some((v) => v.count > 0 || v.selected));
  const coll = groups("collections");
  return (
    <div className={s.rail}>
      <Section label="Kind" head={<CapsHeading text="kind" />}>
        <div className={s.kinds}>
          {KINDS.map((k) => {
            const n = p.kindCounts[k.id] ?? 0;
            return (
              <button key={k.id} type="button" className={cx(s.kind, n === 0 && s.zero)} aria-current={p.kind === k.id ? "true" : undefined} onClick={() => p.onKind(k.id)}>
                <LibraryGlyph name={k.id} className={s.kindMark} />
                <span className={s.label}>{k.label}</span>
                <span className={s.count} aria-hidden="true">
                  {count(n)}
                </span>
                <SrOnly text={`, ${n}`} />
              </button>
            );
          })}
        </div>
      </Section>
      {vocab.length > 0 && (
        <Section
          label="Vocabulary"
          head={
            <span className={s.vocabHead}>
              <LibraryGlyph name={p.kind} className={s.headMark} />
              <CapsHeading text={`vocabulary · ${kindShort(p.kind)}`} />
            </span>
          }
        >
          {vocab.map(draw)}
        </Section>
      )}
      {attention.length > 0 && <Section label="Attention">{attention.map(draw)}</Section>}
      {groups("state").length > 0 && <Section label="State">{groups("state").map(draw)}</Section>}
      {coll.length > 0 && (
        <Section label="Collections" head={<CapsHeading text="collections" />}>
          {coll.map(draw)}
        </Section>
      )}
      {groups("origin").length > 0 && <Section label="Origin">{groups("origin").map(draw)}</Section>}
    </div>
  );
}
