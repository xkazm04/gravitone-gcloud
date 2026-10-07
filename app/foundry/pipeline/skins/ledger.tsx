// v1 · DENSE LEDGER — rules and type do all the work; no card chrome at all.
//
// THE BET. A pipeline board is a TABLE, and a well-set table needs no boxes. All
// hierarchy here comes from three things a financial terminal has always used:
// WEIGHT (the gate's title is the only semibold text on the board), ALIGNMENT
// (every figure is right-aligned in tabular numerals, and the three fields of
// the lower strip sit at the same x on every card in a column, so forty cards
// read as three columns of a column), and a HAIRLINE (one rule between the two
// rows; one rule in the middle of every row gap, drawn by `world`). There is no
// chip, no pill, no rounded inner surface, no icon and no colour but the stage's.
//
// ONE TYPE SIZE, deliberately. `text-label` for everything — title, figure,
// vendor, state, dwell. A ledger that changes size to signal importance is a
// ledger that has given up on weight and alignment doing it, and the repo's
// floor (1rem) means the alternative was 1.125rem against 1rem, which is not a
// hierarchy, it is a wobble.
//
// WHERE IT LOSES, stated so it is judged against its own claim: there is nothing
// to admire. The first ten seconds of meeting this direction are its worst ten
// seconds, and a screenshot of it is a screenshot of a spreadsheet.
//
// WHAT THIS DIRECTION CANNOT HAVE, which is a finding about the skin contract
// rather than a choice: "no card chrome at all" is not reachable from a skin.
// The ENGINE owns the card's 1px border, its `rounded-xl` corner and its stage
// tint (Card.tsx), and the shell is `overflow-hidden`, so a child cannot paint
// over a border it is clipped inside. Every card here still wears an outline
// this direction would rather not have. The ruling in `world` is the answer:
// a hairline in the middle of EVERY row gap across the whole board, so the eye
// is given rows of a ledger to read even while the tiles are still there.

import type { CanonStage, PipelineEntry } from "@/lib/board/pipeline";

import { CARD_H, GAP, LANE_PAD, PITCH, type Layout } from "../geometry";
import type { PipelineSkin } from "../types";

/** The margin mark, the one place this direction spends colour. Full height is
 *  "a person is the next step"; the short centred bar is "a machine is". Which
 *  satisfies lib/board/pipeline.ts STAGE_MEANS: gate differs from working in
 *  KIND here (length and hue), not merely by its column. */
const GUTTER: Record<CanonStage, string> = {
  proposed: "top-0 h-full bg-white/10",
  working: "top-[30%] h-[40%] bg-cyan-300/70",
  gate: "top-0 h-full bg-amber-300",
  done: "top-0 h-full bg-emerald-300/30",
};

const valueOf = (entry: PipelineEntry, name: string): string | undefined =>
  entry.facts.find((f) => f.name === name)?.value;

/** How long it has sat, in the largest unit that is still exact enough to act
 *  on. Dwell is the one figure a pipeline always has and no adapter reports. */
function dwell(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

/** THE figure a row is about, picked in the order a ledger would read it: money
 *  first, because it is the only number anybody re-types somewhere else; then
 *  the duration; then how many of a thing there are; then dwell. `strong` is
 *  reserved for money — the one full-white glyph a card may hold. */
function figure(entry: PipelineEntry): { text: string; strong: boolean } {
  const money = valueOf(entry, "cost");
  if (money) return { text: money, strong: true };
  const length = valueOf(entry, "length");
  if (length) return { text: length.replace(/\s+/g, ""), strong: false };
  const count = valueOf(entry, "versions") ?? valueOf(entry, "sources") ?? valueOf(entry, "patches");
  if (count) return { text: `×${count}`, strong: false };
  return { text: dwell(entry.item.createdAt), strong: false };
}

function ledgerFace(entry: PipelineEntry) {
  const stage = entry.placement.stage;
  const fig = figure(entry);
  const vendor = valueOf(entry, "provider") ?? valueOf(entry, "model") ?? entry.item.group ?? entry.item.source;
  // The BAND before the status: a band is the finer fact and it is also the
  // shorter word, and 232px of card minus two fixed cells leaves about nine
  // monospace characters here. A ledger truncates the long word, never the
  // column position.
  const state = (entry.placement.band ?? valueOf(entry, "status") ?? stage).replace(/[-_]/g, " ");
  const waited = dwell(entry.item.createdAt);
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-1.5 pr-11 pl-3">
      <span aria-hidden className={`absolute left-0 w-[3px] ${GUTTER[stage]}`} />
      {/* Row one: the name, and the figure right-aligned in a fixed cell so the
          decimal points of forty cards stand in one line. */}
      <div className="grid grid-cols-[minmax(0,1fr)_68px] items-baseline gap-x-2">
        <p className={`font-hanken truncate text-label ${stage === "gate" ? "font-semibold text-white" : "text-white/85"}`}>{entry.item.title}</p>
        <p className={`font-jetbrains truncate text-right text-label tabular-nums ${fig.strong ? "text-white" : "text-white/70"}`}>{fig.text}</p>
      </div>
      {/* Row two: three fields at three fixed x positions, under one rule. */}
      <div className="font-jetbrains grid grid-cols-[minmax(0,1fr)_96px_40px] items-baseline border-t border-white/10 pt-1.5 text-label text-white/45">
        <span className="truncate">{vendor}</span>
        <span className="truncate border-l border-white/10 pl-2 uppercase">{state}</span>
        <span className="truncate border-l border-white/10 pl-2 text-right tabular-nums">{waited || "—"}</span>
      </div>
    </div>
  );
}

/** THE RULING. One element per lane, not one per row: a repeating gradient puts
 *  a hairline in the middle of every row gap for as many rows as the lane is
 *  tall, so the cost of ruling a 500-row lane is the cost of ruling a 2-row one.
 *  Offset by CARD_H + GAP/2 so a rule lands under a card, never across it.
 *  The colour is `--gt-hairline`, the same hairline the glass surface uses. */
function ledgerWorld(layout: Layout) {
  const ruleAt = LANE_PAD + CARD_H + GAP / 2;
  return (
    <div aria-hidden className="absolute top-0 left-0">
      {layout.lanes.map((lane) => (
        <span
          key={lane.key}
          className="absolute top-0 left-0 border-t border-white/15"
          style={{
            transform: `translate3d(0, ${lane.y}px, 0)`,
            width: layout.width,
            height: lane.h,
            backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${ruleAt}px, var(--gt-hairline) ${ruleAt}px ${ruleAt + 1}px, transparent ${ruleAt + 1}px ${ruleAt + PITCH}px)`,
          }}
        />
      ))}
      {layout.stages.map((span) => (
        <span
          key={span.stage}
          className="absolute top-0 left-0 border-l border-white/12"
          style={{ transform: `translate3d(${span.x}px, 0, 0)`, height: layout.height }}
        />
      ))}
    </div>
  );
}

export const ledger: PipelineSkin = {
  face: ledgerFace,
  world: ledgerWorld,
  // A ledger's own words. `running` and `settled` are what the column of
  // numbers under them actually is; `gate` keeps its name because a ledger
  // never renames the line somebody has to sign.
  stageLabel: { working: "running", done: "settled" },
};
