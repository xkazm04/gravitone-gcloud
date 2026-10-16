// THE SET, WHEN NOTHING IS SELECTED (library.js `summary`): how many items the filter holds out
// of how many, its states as one bar and as doors that filter, its kinds as bars (on All), the
// newest items that have a picture, and the keys. Every number is the server's, for the whole
// result - not for the rows this browser happens to hold (a 50,000-item result is never here).

import { cx } from "../cx.ts";
import { Keycaps } from "../keycaps/Keycaps.tsx";
import { StatusPill } from "../status/StatusPill.tsx";
import { vars } from "../vars.ts";
import { DetailSection } from "./DetailPanel.tsx";
import { STATE_ORDER, count, type LibraryState } from "./library.ts";
import { KINDS, LibraryGlyph, kindLabel, type KindId } from "./LibraryGlyph.tsx";
import s from "./SetSummary.module.css";

export type SetSummaryProps = {
  readonly total: number;
  /** Everything the Library holds, before any filter. */
  readonly of: number;
  readonly kind: KindId;
  readonly states: Readonly<Partial<Record<LibraryState, number>>>;
  readonly kinds: Readonly<Partial<Record<KindId, number>>>;
  readonly newest: readonly { readonly id: string; readonly title: string; readonly url: string }[];
  readonly onState: (state: LibraryState) => void;
  readonly onKind: (kind: KindId) => void;
  readonly onItem: (id: string) => void;
};

export function SetSummary(p: SetSummaryProps) {
  const states = STATE_ORDER.filter((st) => (p.states[st] ?? 0) > 0);
  const kinds = KINDS.filter((k) => k.id !== "all" && (p.kinds[k.id] ?? 0) > 0);
  const max = Math.max(1, ...kinds.map((k) => p.kinds[k.id] ?? 0));
  return (
    <div className={s.sum}>
      <div className={s.head}>
        <span className={s.big}>{count(p.total)}</span>
        <span className={s.of}>
          of {count(p.of)} · {kindLabel(p.kind).toLowerCase()}
        </span>
      </div>
      <div className={s.bar} role="img" aria-label={states.map((st) => `${st} ${p.states[st] ?? 0}`).join(", ") || "no items"}>
        {STATE_ORDER.map((st) => (
          <i key={st} className={cx(s.seg, s[st])} style={vars({ "--n": p.states[st] ?? 0 })} />
        ))}
      </div>
      <div className={s.states}>
        {states.map((st) => (
          <button key={st} type="button" className={s.state} onClick={() => p.onState(st)} aria-label={`filter: ${st}, ${p.states[st] ?? 0}`}>
            <StatusPill machine="library" state={st} />
            <span className={s.n}>{count(p.states[st] ?? 0)}</span>
          </button>
        ))}
      </div>
      {p.kind === "all" && kinds.length > 0 && (
        <DetailSection title="Kinds">
          {kinds.map((k) => (
            <button key={k.id} type="button" className={s.kbar} onClick={() => p.onKind(k.id)}>
              <LibraryGlyph name={k.id} className={s.kmark} />
              <span className={s.ell}>{k.label}</span>
              <span className={s.n}>{count(p.kinds[k.id] ?? 0)}</span>
              <span className={s.meter} aria-hidden="true">
                <i style={vars({ "--share": (p.kinds[k.id] ?? 0) / max })} />
              </span>
            </button>
          ))}
        </DetailSection>
      )}
      {p.newest.length > 0 && (
        <DetailSection title="Newest">
          <div className={s.recent}>
            {p.newest.map((r) => (
              <button key={r.id} type="button" aria-label={r.title} onClick={() => p.onItem(r.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a library item is shown as its own bytes (Face.tsx) */}
                <img src={r.url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </DetailSection>
      )}
      <DetailSection title="Keys">
        <Keycaps mode="library" label="library keys" />
      </DetailSection>
    </div>
  );
}
