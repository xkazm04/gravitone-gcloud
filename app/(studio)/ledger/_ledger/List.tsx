"use client";

// The centre of the Ledger: the event table, or the same rows as JSON Lines (ledger.js
// `paintRows`, `renderHead`). Windowed through @gt/ui/window - fixed rows, so the window
// is arithmetic and the DOM holds a screen of rows however long the page is (plan §9.5).
// Row heights are the tokens' own (`h-event`, `h-line`), read from the generated mirror, so
// the stylesheet and the arithmetic cannot drift a pixel apart.
//
// The JSON Lines head shows the two ways an agent asks for exactly these rows: this page's
// address, and the JSONL route with the same params (app/api/ledger) - the prototype's
// `GT_LEDGER.query(...)` line, now a URL an agent can fetch.

import { useImperativeHandle, type Ref } from "react";

import type { Event } from "@gt/domain/event";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { EventRow } from "@gt/ui/components/eventrow/EventRow.tsx";
import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";
import { JsonLine } from "@gt/ui/components/jsonl/Json.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { tokens } from "@gt/ui/tokens";
import { pageStep } from "@gt/ui/window/core";
import { useWindow } from "@gt/ui/window/useWindow";

import { subjectLink, sourceOf } from "../../_shell/links.ts";
import { isFiltered, toSearch, type LedgerFilter } from "./filter.ts";
import { isDerived, shortTime, timeOf, toneOf, trailOf } from "./vocab.ts";
import s from "./ledger.module.css";

export const ROW = Number.parseInt(tokens["h-event"], 10);
export const LINE = Number.parseInt(tokens["h-line"], 10);

export type ListHandle = { readonly reveal: (i: number) => void; readonly focus: () => void; readonly pageSize: () => number };

export type ListProps = {
  readonly ref: Ref<ListHandle>;
  readonly filter: LedgerFilter;
  readonly rows: readonly Event[];
  readonly head: number;
  readonly view: "table" | "jsonl";
  readonly sel: number | null;
  readonly fresh: ReadonlySet<number>;
  readonly capped: boolean;
  readonly loading: boolean;
  readonly onOlder: () => void;
  readonly onSelect: (seq: number, open?: boolean) => void;
  readonly onOpen: (e: Event) => void;
  readonly onOrder: () => void;
  readonly onReset: () => void;
  readonly onCopy: (text: string, done: string) => void;
  readonly onFocusChange: (focused: boolean) => void;
};

export function List({ ref, ...p }: ListProps) {
  const h = p.view === "jsonl" ? LINE : ROW;
  // Destructured: the window's numbers are render data, its ref is not (react-hooks/refs).
  const { ref: scroller, onScroll, reveal, start, end, padTop, padBottom } = useWindow<HTMLDivElement>({ count: p.rows.length, layout: () => ({ kind: "list", rowHeight: h }), overscan: 10, key: p.view });
  useImperativeHandle(
    ref,
    () => ({
      reveal,
      focus: () => scroller.current?.focus(),
      pageSize: () => pageStep({ kind: "list", rowHeight: h }, scroller.current?.clientHeight ?? 600),
    }),
    [reveal, scroller, h],
  );
  const query = toSearch({ ...p.filter, ev: null, view: "table" });
  const shown = p.rows.slice(start, end);
  return (
    <section className={s.center} aria-label="events">
      {p.view === "jsonl" ? (
        <div className={s.avHead}>
          <div className={s.avQ}>
            <code>
              <i>/ledger?</i>
              {query}
            </code>
            <code>
              <i>GET /api/ledger?</i>
              {query === "" ? "format=jsonl" : `${query}&format=jsonl`}
            </code>
          </div>
          <Tally value={p.rows.length} label="lines" />
          <Button size="sm" tone="violet" glyph="doc" label="Copy JSONL" onPress={() => p.onCopy(p.rows.map((e) => JSON.stringify(e)).join("\n"), `${p.rows.length} lines copied`)} />
        </div>
      ) : (
        <div className={s.cols} role="row">
          <button type="button" onClick={p.onOrder} aria-label={p.filter.order === "desc" ? "order: newest first" : "order: oldest first"}>
            #<Glyph name={p.filter.order === "desc" ? "down" : "up"} className={s.colGlyph} />
          </button>
          <span role="columnheader">time</span>
          <span role="columnheader">actor</span>
          <span role="columnheader">type</span>
          <span role="columnheader">subject</span>
          <span role="columnheader" className={s.r}>
            cost
          </span>
          <span role="columnheader">src</span>
        </div>
      )}
      <div
        ref={scroller}
        onScroll={onScroll}
        className={s.scroll}
        role="grid"
        aria-label="events"
        aria-rowcount={p.rows.length}
        tabIndex={0}
        onFocus={(e) => {
          if (e.target === e.currentTarget) p.onFocusChange(true);
        }}
        onBlur={() => p.onFocusChange(false)}
      >
        {p.rows.length === 0 ? (
          p.head === 0 ? (
            <Empty label="nothing recorded yet" />
          ) : isFiltered(p.filter) ? (
            <Empty label="0 events" action={{ label: "clear filters", size: "sm", onPress: p.onReset }} />
          ) : (
            <Empty label="0 events" />
          )
        ) : (
          <div className={p.view === "jsonl" ? s.lines : undefined} style={{ paddingTop: padTop, paddingBottom: padBottom }}>
            {shown.map((e, k) => {
              const i = start + k;
              if (p.view === "jsonl") return <JsonLine key={e.seq} n={e.seq} text={JSON.stringify(e)} selected={e.seq === p.sel} index={i + 1} onSelect={() => p.onSelect(e.seq)} />;
              const link = subjectLink(e);
              const trail = trailOf(e);
              return (
                <EventRow
                  key={e.seq}
                  seq={e.seq}
                  time={shortTime(timeOf(e))}
                  derived={isDerived(e)}
                  actor={e.actor}
                  type={e.type}
                  tone={toneOf(e.type)}
                  subject={{ kind: e.subject.kind, label: link.label, href: link.href }}
                  {...(trail === undefined ? {} : { trail })}
                  {...(e.cost === undefined ? {} : { cost: e.cost })}
                  source={sourceOf(e) ?? "kernel"}
                  selected={e.seq === p.sel}
                  fresh={p.fresh.has(e.seq)}
                  index={i + 1}
                  onSelect={() => p.onSelect(e.seq, true)}
                  onOpen={() => p.onOpen(e)}
                />
              );
            })}
          </div>
        )}
        {p.capped && (
          <div className={s.older}>
            <Button size="sm" label={p.loading ? "reading" : "older"} glyph="down" disabled={p.loading} onPress={p.onOlder} tally={{ value: p.rows.length, label: "shown" }} />
          </div>
        )}
      </div>
    </section>
  );
}
