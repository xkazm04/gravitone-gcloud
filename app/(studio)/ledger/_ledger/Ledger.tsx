"use client";

// THE LEDGER'S CLIENT HALF - what a person does between two server renders, and nothing the
// server already decided (page.tsx). Its state, each with its reason:
//
//   the filter     lives in the URL. A facet click, a submitted search, a dragged range or the
//                  order toggle REPLACES the URL and the server renders the new answer
//                  (table: filtering - facets apply on change, free text on an explicit act).
//                  page.tsx keys this component by the filter's identity, so a different
//                  filter is a fresh mount: no rows, selection or older pages of the old
//                  filter survive into the new one (async-ui-states: windowing-vs-identifying).
//   the selection  and the table/JSONL view are WINDOWING: written to the URL with
//                  history.replaceState (Next keeps useSearchParams in step without a server
//                  round trip), so J/K moves at key-repeat speed and a copied link still
//                  opens on the same act.
//   older pages    appended by a Server Action with the page's own cursor (keyset), never an
//                  offset; dropped with everything else on an identifying change.
//   live arrivals  the feed's seqs: a coalesced router.refresh() redraws rows, counts and
//                  strip together (feed.ts says why), and the arrived rows flash once.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { errorMessage } from "@gt/domain/errors";
import type { Event } from "@gt/domain/event";
import { useKeys } from "@gt/ui/keymap/dispatch";
import type { Range } from "@gt/ui/components/timestrip/strip.ts";
import { TimeStrip } from "@gt/ui/components/timestrip/TimeStrip.tsx";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { useShell } from "../../_shell/Providers.tsx";
import { subjectLink } from "../../_shell/links.ts";
import { Detail } from "./Detail.tsx";
import { Facets as FacetRail } from "./Facets.tsx";
import { useLedgerFeed } from "./feed.ts";
import { EMPTY, isFiltered, toSearch, type LedgerFilter } from "./filter.ts";
import { List, type ListHandle } from "./List.tsx";
import type { Facets, Page, Related, Strip } from "./read.ts";
import { Toolbar } from "./Toolbar.tsx";
import s from "./ledger.module.css";

export type LedgerProps = {
  readonly filter: LedgerFilter;
  readonly search: string;
  readonly page: Page;
  readonly facets: Facets;
  readonly strip: Strip;
  readonly selected: Event | null;
  readonly nowMs: number;
  readonly ignored: readonly string[];
  readonly inRange?: number;
  readonly syncError?: string;
  readonly older: (input: { search: string; cursor: { t: string; seq: number } }) => Promise<ActionResult<Page>>;
  readonly related: (input: { seq: number }) => Promise<ActionResult<Related & { readonly event: Event }>>;
};

/** How long a burst of arrivals may run before the page redraws (realtime-events: coalescing). */
const COALESCE_MS = 700;
const FRESH_MS = 1300;

export function Ledger(p: LedgerProps) {
  const router = useRouter();
  const { toast } = useShell();
  const [, startTransition] = useTransition();
  const f = p.filter;

  // ── rows: this render's page, then any older pages read since ──
  const [more, setMore] = useState<{ readonly events: readonly Event[]; readonly page: Page } | null>(null);
  const rows = useMemo(() => {
    if (more === null) return p.page.events;
    const have = new Set(p.page.events.map((e) => e.seq));
    return [...p.page.events, ...more.events.filter((e) => !have.has(e.seq))];
  }, [p.page.events, more]);
  const tail = more?.page ?? p.page;
  const [loading, setLoading] = useState(false);
  const loadOlder = useCallback(async () => {
    if (tail.cursor === undefined || loading) return;
    setLoading(true);
    const r = await p.older({ search: p.search, cursor: tail.cursor });
    setLoading(false);
    if (!r.ok) return toast(`ledger: ${r.error.error}`);
    setMore((m) => ({ events: [...(m?.events ?? []), ...r.value.events], page: r.value }));
  }, [tail.cursor, loading, p, toast]);

  // ── windowing state: selection and view, kept in the URL without a render ──
  const [sel, setSel] = useState<number | null>(f.ev ?? p.selected?.seq ?? rows[0]?.seq ?? null);
  const [view, setView] = useState(f.view);
  const [extra, setExtra] = useState<ReadonlyMap<number, Event>>(() => new Map(p.selected === null ? [] : [[p.selected.seq, p.selected]]));
  useEffect(() => {
    const url = `/ledger${(() => {
      const q = toSearch({ ...f, ev: sel, view });
      return q === "" ? "" : `?${q}`;
    })()}`;
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(null, "", url);
  }, [sel, view, f]);
  const byseq = useMemo(() => new Map(rows.map((e) => [e.seq, e])), [rows]);
  const current = sel === null ? null : (byseq.get(sel) ?? extra.get(sel) ?? null);

  // ── the filter: an identifying change is a navigation ──
  const apply = useCallback(
    (next: Partial<LedgerFilter>) => {
      const q = toSearch({ ...f, ...next, ev: null });
      startTransition(() => router.replace(q === "" ? "/ledger" : `/ledger?${q}`, { scroll: false }));
    },
    [f, router],
  );

  // ── narrow layouts: the rail and the detail are drawers ──
  const [facetsOpen, setFacetsOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const select = useCallback((seq: number, open = false) => {
    setSel(seq);
    if (open) {
      setDetailOpen(true);
      setFacetsOpen(false);
    }
  }, []);
  const remember = useCallback((e: Event) => setExtra((m) => new Map(m).set(e.seq, e)), []);

  // ── live: coalesced refresh, arrivals flash once drawn ──
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  const pending = useRef<number[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const live = useLedgerFeed(p.facets.head, {
    onEvents: (seqs) => {
      pending.current.push(...seqs);
      if (timer.current !== undefined) return;
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        const arrived = new Set(pending.current.splice(0));
        setFresh(arrived);
        startTransition(() => router.refresh());
        window.setTimeout(() => setFresh(new Set()), FRESH_MS);
      }, COALESCE_MS);
    },
    onReset: () => startTransition(() => router.refresh()),
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // ── keys: the `ledger` mode of the one keymap (bindings.ts) ──
  const list = useRef<ListHandle | null>(null);
  const [listFocused, setListFocused] = useState(false);
  const index = sel === null ? -1 : rows.findIndex((e) => e.seq === sel);
  const move = (d: number): void => {
    if (rows.length === 0) return;
    const i = index < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, index + d));
    const e = rows[i];
    if (e === undefined) return;
    setSel(e.seq);
    list.current?.reveal(i);
  };
  const open = (e: Event | null): void => {
    if (e !== null) window.location.assign(subjectLink(e).href);
  };
  const reset = (): void => apply({ ...EMPTY, order: f.order });
  useKeys(
    "ledger",
    {
      search: () => document.querySelector<HTMLInputElement>("[data-keyfield=search]")?.focus(),
      next: () => move(1),
      prev: () => move(-1),
      page: (hit) => move((hit.cap === "PgUp" ? -1 : 1) * Math.max(1, (list.current?.pageSize() ?? 10) - 1)),
      edge: (hit) => move(hit.cap === "Home" ? -rows.length : rows.length),
      "open-subject": () => open(current),
      view: () => setView((v) => (v === "jsonl" ? "table" : "jsonl")),
      back: () => {
        if (facetsOpen) return setFacetsOpen(false);
        if (detailOpen) return setDetailOpen(false);
        if (f.from !== null) return apply({ from: null, to: null });
        if (isFiltered(f)) return reset();
        return false;
      },
    },
    { facts: listFocused ? ["list-focused"] : [] },
  );

  const copy = (text: string, done: string): void => {
    navigator.clipboard.writeText(text).then(
      () => toast(done),
      (e: unknown) => toast(`copy refused - ${errorMessage(e)}`),
    );
  };

  // Hydrated: the keys and the controls answer from here on. Live probes wait on this
  // instead of network-idle, which a page holding its event stream open never reaches.
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    root.current?.setAttribute("data-ready", "true");
  }, []);

  const range: Range | null = f.from === null || f.to === null ? null : { from: f.from, to: f.to };
  return (
    <div ref={root} className={s.lg} data-component="Ledger" data-facets={facetsOpen} data-detail={detailOpen} data-view={view}>
      <Toolbar
        filter={f}
        facets={p.facets}
        rows={rows}
        capped={tail.capped}
        scanned={tail.scanned}
        exhausted={tail.exhausted}
        ignored={p.ignored}
        live={live}
        view={view}
        facetsOpen={facetsOpen}
        {...(p.syncError === undefined ? {} : { syncError: p.syncError })}
        onFacets={setFacetsOpen}
        onApply={apply}
        onView={setView}
        onRows={() => list.current?.focus()}
      />
      <TimeStrip days={p.strip.days} today={p.strip.today} nowMs={p.nowMs} range={range} {...(p.inRange === undefined ? {} : { inRange: p.inRange })} onRange={(r) => apply({ from: r?.from ?? null, to: r?.to ?? null })} />
      <div className={s.body}>
        <FacetRail filter={f} facets={p.facets} onApply={apply} />
        <List
          ref={list}
          filter={f}
          rows={rows}
          head={p.facets.head}
          view={view}
          sel={sel}
          fresh={fresh}
          capped={tail.capped}
          loading={loading}
          onOlder={() => void loadOlder()}
          onSelect={select}
          onOpen={open}
          onOrder={() => apply({ order: f.order === "desc" ? "asc" : "desc" })}
          onReset={reset}
          onCopy={copy}
          onFocusChange={setListFocused}
        />
        <Detail
          event={current}
          nowMs={p.nowMs}
          related={p.related}
          onSelect={(e) => {
            remember(e);
            select(e.seq);
            const i = rows.findIndex((x) => x.seq === e.seq);
            if (i >= 0) list.current?.reveal(i);
          }}
          onQuery={(q) => apply({ ...EMPTY, q, order: f.order })}
          onClose={() => setDetailOpen(false)}
          onCopy={copy}
        />
      </div>
    </div>
  );
}
