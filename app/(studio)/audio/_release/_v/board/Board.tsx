"use client";

// LAYOUT VARIANT "board" (spark audio-distribution, S1): a label's catalog. Releases are sleeves on a
// shelf in four columns by status; the shelf of kept takes is a drawer pulled out beside them. A card
// opened expands in place into its release sheet - its column widens, the others narrow to spines -
// so the rest of the catalog stays in view while one record is assembled.
import { useMemo, useState } from "react";

import type { ReleaseStatus } from "@gt/domain/release";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";
import { cx } from "@gt/ui/components/cx.ts";

import type { VariantProps } from "../props.ts";
import { COLUMNS, columnOf, problemsOf } from "./board.ts";
import { Card } from "./Card.tsx";
import { Sheet } from "./Sheet.tsx";
import { Shelf } from "./Shelf.tsx";
import s from "./board.module.css";

const SHELF_ID = "release-board-shelf";
const EMPTY = { draft: "no drafts", ready: "nothing ready", scheduled: "nothing scheduled", published: "nothing published" } as const;

export function Board({ read, state, dispatch, newId }: VariantProps) {
  const [shelfOpen, setShelfOpen] = useState(state.releases.length === 0);
  const rows = useMemo(
    () =>
      state.releases.map((r) => {
        const problems = problemsOf(r);
        return { r, problems, col: columnOf(r, problems) };
      }),
    [state.releases],
  );
  const open = rows.find((x) => x.r.id === state.openId) ?? null;
  const openCol = open === null ? -1 : COLUMNS.indexOf(open.col);
  const inCol = (c: ReleaseStatus) => rows.filter((x) => x.col === c);

  return (
    <div className={s.board} data-variant-body="board">
      <header className={s.head}>
        <h2 className={s.label}>
          {read.artist}
          <Tally value={state.releases.length} label="releases" />
        </h2>
        <Toggle label="shelf" on={shelfOpen} onToggle={setShelfOpen} count={read.shelf.length} controls={SHELF_ID} />
        <span className={s.grow} />
        <span className={s.colTallies}>
          {COLUMNS.map((c) => (
            <Tally key={c} value={inCol(c).length} label={c} />
          ))}
        </span>
      </header>
      <div className={s.floor} data-shelf={shelfOpen ? "open" : "closed"}>
        <Shelf
          id={SHELF_ID}
          open={shelfOpen}
          shelf={read.shelf}
          target={open?.r ?? null}
          onClose={() => setShelfOpen(false)}
          onCreate={(takes) => {
            dispatch({ type: "create", id: newId(), artist: read.artist, takes });
            setShelfOpen(false);
          }}
          onAdd={(takes) => {
            if (open === null) return;
            for (const take of takes) dispatch({ type: "addTrack", id: open.r.id, take });
          }}
        />
        <div className={s.cols} data-open={openCol}>
          {COLUMNS.map((c, i) => {
            const here = inCol(c);
            const narrow = openCol !== -1 && openCol !== i;
            return (
              <section key={c} className={cx(s.col, s[`col_${c}`])} data-narrow={narrow ? "" : undefined} aria-label={c}>
                <h3 className={s.colHead}>
                  {c}
                  <Tally value={here.length} />
                </h3>
                {here.length === 0 ? (
                  <div className={s.colEmpty}>
                    <Empty label={EMPTY[c]} />
                  </div>
                ) : (
                  <ul className={s.cards}>
                    {here.map((x) =>
                      x.r.id === state.openId ? (
                        <li key={x.r.id} className={s.sheetSlot}>
                          <Sheet
                            release={x.r}
                            problems={x.problems}
                            column={x.col}
                            read={read}
                            dispatch={dispatch}
                            onClose={() => dispatch({ type: "open", id: null })}
                            onShelf={() => setShelfOpen(true)}
                          />
                        </li>
                      ) : (
                        <Card key={x.r.id} release={x.r} problems={x.problems} compact={narrow} onOpen={() => dispatch({ type: "open", id: x.r.id })} />
                      ),
                    )}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
