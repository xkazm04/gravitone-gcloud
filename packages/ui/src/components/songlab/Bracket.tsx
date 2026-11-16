// THE BRACKET IS THE PAGE (the contest winner "Knockout", the owner's first why): R16 -> QF -> SF ->
// final as columns, every entrant one 28 px row with its seed and its rights chip. One match glows
// amber - the one the ear judges now. A decided match marks its winner ✓ (or ▲ for an upset: the
// lower seed advanced), crosses out the loser, marks ✕ where neither advanced, and lights the
// connector its winner walks along. A place no entrant holds yet is a ghost row (`winner of R16 1`).
//
// A match is a door only once it is booked: pressing it opens it in the booth. A ghost, a bye and
// a walkover are not doors (no tab stop), as in the winner.
import { SrOnly } from "../a11y/SrOnly.tsx";
import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { Tally } from "../tally/Tally.tsx";
import { vars } from "../vars.ts";
import type { BracketView, MatchView, SlotView } from "./songlab.ts";
import s from "./Bracket.module.css";

export type BracketProps = {
  readonly bracket: BracketView;
  /** The match the ear judges now (glows). */
  readonly glow?: string;
  /** The match open in the booth (outlined when it is not the glowing one). */
  readonly selected?: string;
  readonly onOpen?: (matchId: string) => void;
};

const MARK = {
  won: { glyph: "✓", cls: s.won, say: "advances" },
  upset: { glyph: "▲", cls: s.up, say: "upset" },
  neither: { glyph: "✕", cls: s.none, say: "neither" },
} as const;

function Slot({ slot }: { readonly slot: SlotView }) {
  if (slot.kind === "ghost") {
    return (
      <div className={cx(s.slot, s.ghost)} data-role="sl-slot-ghost">
        <span className={s.sd}>{slot.seed ?? ""}</span>
        <span className={s.lb}>{slot.text}</span>
        <span className={s.tail} />
      </div>
    );
  }
  const { entrant: e, mark } = slot;
  const glyph = mark === "won" || mark === "upset" || mark === "neither" ? MARK[mark] : null;
  return (
    <div className={cx(s.slot, (mark === "won" || mark === "upset" || mark === "walked") && s.win, (mark === "out" || mark === "neither") && s.out)} data-role="sl-slot">
      <span className={s.sd}>{e.seed}</span>
      <span className={s.lb}>{e.label}</span>
      <span className={s.tail}>
        {glyph !== null && (
          <span className={glyph.cls}>
            <span aria-hidden="true">{glyph.glyph}</span>
            <SrOnly text={glyph.say} />
          </span>
        )}
        <Chip label={e.rights.short} tone="amber" name={e.rights.licence} />
      </span>
    </div>
  );
}

function Match({ m, glow, selected, onOpen, index, roundName }: { readonly m: MatchView; readonly glow: boolean; readonly selected: boolean; readonly onOpen: ((id: string) => void) | undefined; readonly index: number; readonly roundName: string }) {
  const door = m.status === "open" || m.status === "done";
  const name = `${roundName} match ${index + 1}${m.status === "open" ? ", open" : m.status === "done" ? ", decided" : ""}`;
  const cls = cx(
    s.match,
    m.status === "tbd" && s.tbd,
    m.status === "open" && s.open,
    m.outcome === "upset" && s.upset,
    m.outcome === "neither" && s.neither,
    glow && s.cur,
    selected && !glow && s.sel,
  );
  return (
    <button
      type="button"
      className={cls}
      aria-label={name}
      aria-current={glow ? "true" : undefined}
      tabIndex={door ? undefined : -1}
      aria-disabled={door ? undefined : true}
      onClick={door && onOpen !== undefined ? () => onOpen(m.id) : undefined}
      data-role={glow ? "sl-match-current" : "sl-match"}
      data-match={m.id}
    >
      <Slot slot={m.a} />
      <Slot slot={m.b} />
    </button>
  );
}

export function Bracket({ bracket, glow, selected, onOpen }: BracketProps) {
  const last = bracket.rounds.length - 1;
  return (
    <div className={s.bracket} data-role="sl-bracket" aria-label="bracket" role="group">
      {bracket.rounds.map((r, ri) => (
        <div key={r.round} className={s.round} style={vars({ "--n": r.matches.length })}>
          <div className={s.rhead}>
            <span className={s.caps} data-role="sl-round">
              {r.name}
            </span>
            <Tally value={r.decided} label={`of ${r.of}`} />
            {r.open > 0 && <Chip label={`${r.open} open`} tone="amber" casing="lower" />}
          </div>
          <div className={s.cells}>
            {r.matches.map((m, i) => (
              <div key={m.id} className={cx(s.cell, ri === last && s.fcell, m.lit && s.lit, ri > 0 && (m.a.kind === "entrant" || m.b.kind === "entrant") && s.litin)}>
                <Match m={m} glow={glow === m.id} selected={selected === m.id} onOpen={onOpen} index={i} roundName={r.name} />
                {ri === last && (
                  <div className={cx(s.champ, bracket.champion === undefined && s.waiting)} data-role="sl-champion">
                    <span className={s.caps}>takes the draw</span>
                    <div className={s.t}>{bracket.champion?.entrant.label ?? "—"}</div>
                    {bracket.champion !== undefined && (
                      <div className={s.chips}>
                        <Chip label={`seed ${bracket.champion.entrant.seed}`} casing="lower" />
                        <Chip label={bracket.champion.entrant.rights.licence} tone="amber" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
