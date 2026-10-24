// The IDEAS tab (operator, 2026-10-22): runs that are only words - a finding's claim and its quote, a
// source line for the watchlist, a batch's seeds - as dense rows decided in place, by click or by key,
// with no picture to open. Filed under their categories (seeds, notes, sources). A row is the run's one
// cell; the desk's cursor rides it like any tile. A decision's note shows under its row, and the row
// being noted (E) holds the note's field there (spark scout-decision-graph).
import { reasonsOf } from "@gt/domain/source";
import type { ReactNode } from "react";

import type { BoardVerdict } from "../../board/boardGate.ts";
import { stillOpen, type Cell } from "../../board/cull.ts";
import type { ItemWords } from "../../board/port.ts";
import type { Run } from "../../board/runs.ts";
import { cx } from "../cx.ts";
import { spokenTile } from "./CullTile.tsx";
import { NoteText } from "./NoteField.tsx";
import { VerdictPick, type VerdictReasons } from "./VerdictPick.tsx";
import { WordsBody } from "./WordsBody.tsx";
import s from "./Verdict.module.css";

export type IdeaListProps = {
  readonly categories: readonly { readonly category: string; readonly runs: readonly { readonly run: Run; readonly at: number }[] }[];
  readonly cells: readonly Cell[];
  readonly verdicts: Readonly<Record<string, BoardVerdict>>;
  readonly wordsOf: (id: string) => ItemWords;
  readonly cur: number;
  readonly nudged: ReadonlySet<number>;
  readonly reasons: VerdictReasons;
  readonly onFocus: (cell: number) => void;
  readonly onVerdict: (cell: number, v: BoardVerdict | null) => void;
  /** The row 5 rejected without a reason (a cell index): its chips are asked for. */
  readonly asked?: number;
  /** The row being noted, and its field (./NoteField.tsx). */
  readonly noting?: { readonly cell: number; readonly field: ReactNode };
  /** The tab it lists (its grid's name): `ideas`, or `storyboards` for a words-only board. */
  readonly label?: string;
};

export function IdeaList({ categories, cells, verdicts, wordsOf, cur, nudged, reasons, asked, onFocus, onVerdict, noting, label = "ideas" }: IdeaListProps) {
  const required = reasons.required === true;
  return (
    <div className={s.ideas} role="grid" aria-label={label}>
      {categories.map((c) => (
        <section key={c.category} className={s.ideaGroup} aria-label={`${c.category}, ${c.runs.length}`}>
          <header className={s.ideaHead}>
            <span className={s.ideaEyebrow}>{c.category}</span>
            <span className={s.ideaCount}>{c.runs.length}</span>
          </header>
          {c.runs.flatMap(({ run }) =>
            run.members.map((i) => {
              const id = cells[i]?.id ?? "";
              const w = wordsOf(id);
              const v = verdicts[id];
              return (
                <article
                  key={id}
                  className={cx(s.idea, i === cur && s.cur, v?.verdict === "keep" && s.kept, v?.verdict === "reject" && s.rejected, nudged.has(i) && stillOpen(v, required) && s.nudge)}
                  data-tile={i}
                  role="gridcell"
                  aria-selected={i === cur}
                  aria-label={spokenTile(w, v)}
                  onMouseDown={() => onFocus(i)}
                >
                  <div className={s.ideaWords}>
                    <p className={s.ideaClaim}>{w.label}</p>
                    {w.prompt !== undefined && <WordsBody text={w.prompt} className={s.ideaQuote} />}
                    {w.meta !== undefined && <span className={s.ideaMeta}>{w.meta}</span>}
                    {noting?.cell === i ? noting.field : v?.note !== undefined && <NoteText text={v.note} />}
                  </div>
                  <VerdictPick label={w.label} verdict={v} reasons={{ ...reasons, list: reasonsOf(reasons, run.group) }} onChange={(nv) => onVerdict(i, nv)} size="sm" keyed ask={asked === i} />
                </article>
              );
            }),
          )}
        </section>
      ))}
    </div>
  );
}
