// One act of the ledger as a list row (ledger.js `rowHtml`, ledger.css `.ev`; INVENTORY.md
// owed it as the event row): `# · time · actor · type · subject · cost · src`, at one fixed
// height so a list of thousands can be windowed by arithmetic.
//
// Kept from the prototype: the actor's colour as a rule at the row's left edge and on its
// glyph; the type as a mono tag in its tone; the subject's label as the row's one link (it
// navigates; the rest of the row selects); the verbatim error, else the note, trailing the
// subject in the space left; a cost marked with where it came from when that is not a
// receipt (`est` for a model's estimate); `≈` before a time that was derived rather than
// recorded. Dropped: the prototype's per-row provenance tag (`real · fixture · illustrative`):
// a store holds one universe, so the Ledger says "fixture" once, in its toolbar, and the
// column names the v1 store the act came from instead. Upgraded: the cells are gridcells of a real row (the prototype's rows carried
// role=row with bare spans, so a screen reader announced one run-on string), and the `≈`
// speaks ("derived time") instead of being an unexplained glyph.
import type { Actor, Cost } from "@gt/domain/event";
import type { Tone } from "../chip/tone.ts";
import { cx } from "../cx.ts";
import { Glyph } from "../glyph/Glyph.tsx";
import { SrOnly } from "../a11y/SrOnly.tsx";
import { usd } from "./usd.ts";
import s from "./EventRow.module.css";

export type EventRowProps = {
  readonly seq: number;
  /** As drawn: `10-14 09:12`. */
  readonly time: string;
  /** The time was inferred, not written down when it happened. */
  readonly derived: boolean;
  readonly actor: Actor;
  readonly type: string;
  readonly tone: Tone;
  readonly subject: { readonly kind: string; readonly label: string; readonly href: string };
  /** The verbatim error, else the note or reason; drawn after the subject. */
  readonly trail?: { readonly text: string; readonly error: boolean };
  readonly cost?: Cost;
  /** Which store the act came from (`forge`, `dojo`). */
  readonly source: string;
  readonly selected: boolean;
  /** Arrived live since the list was drawn. */
  readonly fresh?: boolean;
  /** 1-based position in the whole list, for aria-rowindex. */
  readonly index: number;
  readonly onSelect: () => void;
  readonly onOpen: () => void;
};

const COST_MARK: Readonly<Record<Cost["src"], string>> = { real: "", model: "est", illustrative: "ill" };

export function EventRow(p: EventRowProps) {
  const mark = p.cost === undefined ? "" : COST_MARK[p.cost.src];
  return (
    <div
      className={cx(s.row, s[p.actor.kind], p.fresh === true && s.fresh)}
      role="row"
      aria-rowindex={p.index}
      aria-selected={p.selected}
      data-seq={p.seq}
      onClick={(e) => {
        if (!(e.target instanceof Element) || e.target.closest("a") === null) p.onSelect();
      }}
      onDoubleClick={p.onOpen}
    >
      <span className={s.n} role="gridcell">
        #{p.seq}
      </span>
      <span className={s.t} role="gridcell">
        <span className={s.apx} aria-hidden="true">
          {p.derived ? "≈" : ""}
        </span>
        {p.time}
        {p.derived && <SrOnly text=", derived time" />}
      </span>
      <span className={s.a} role="gridcell">
        <Glyph name={p.actor.kind} className={s.glyph} />
        <span>{p.actor.id}</span>
      </span>
      <span role="gridcell">
        <span className={cx(s.ty, p.tone !== "neutral" && s[p.tone])}>{p.type}</span>
      </span>
      <span className={s.s} role="gridcell">
        <span className={s.k}>{p.subject.kind}</span>
        <a href={p.subject.href} tabIndex={-1}>
          {p.subject.label}
        </a>
        {p.trail !== undefined && <span className={cx(s.nt, p.trail.error && s.er)}>{p.trail.text}</span>}
      </span>
      <span className={cx(s.c, (p.cost === undefined || p.cost.usd === 0) && s.z)} role="gridcell">
        {p.cost === undefined ? (
          <>
            <span aria-hidden="true">—</span>
            <SrOnly text="no cost" />
          </>
        ) : (
          <>
            {usd(p.cost.usd)}
            {mark !== "" && (
              <>
                <sup aria-hidden="true">{mark}</sup>
                <SrOnly text={`, ${p.cost.src}`} />
              </>
            )}
          </>
        )}
      </span>
      <span className={s.sr} role="gridcell">
        <span className={s.src}>{p.source}</span>
      </span>
    </div>
  );
}
