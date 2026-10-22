"use client";

// THE LIBRARY'S CLIENT HALF - what a person does between two server renders (page.tsx renders
// the answer: the first block of rows, the rail's counts, the selected item's detail). Its state,
// each with its reason:
//
//   the query     kind, words, facets, sort - in the URL. A change is a navigation the server
//                 answers; while it is in flight the results say aria-busy and keep the old rows
//                 (they are still a true answer to the old question, which the crumbs still name).
//   the window    view, size, selection, the detail panel - in the URL by replaceState, no round
//                 trip, so the arrows move at key-repeat speed and a copied link opens on the item.
//   the rows      a block cache per query (./blocks.ts); the rest of a 50,000-item result is asked
//                 for as it scrolls into view.
//   the details   fetched per selection through the port and kept by id for the visit.
//   the folds     which rail groups are closed or opened past seven: the operator's arrangement,
//                 kept across queries (not in the URL: an arrangement is not an address).
//   the drawers   below 1360px the detail, below 1280px the rail, are drawers (library.css).
//
// Keys: the `library` mode of the one keymap (packages/ui/src/keymap/bindings.ts).

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import type { LibraryAct, LibraryKindName } from "@gt/domain/library";
import { Panel } from "@gt/ui/components/panel/Panel.tsx";
import { DetailPanel } from "@gt/ui/components/library/DetailPanel.tsx";
import { backStep, count, stepTo, type Density, type Step, type View } from "@gt/ui/components/library/library.ts";
import type { KindId } from "@gt/ui/components/library/LibraryGlyph.tsx";
import { Rail } from "@gt/ui/components/library/Rail.tsx";
import { SetSummary } from "@gt/ui/components/library/SetSummary.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import { useShell } from "../../_shell/Providers.tsx";
import type { LibraryPort, ShownDetail, ShownPage } from "../_port/contract.ts";
import { useBlocks } from "./blocks.ts";
import { DetailView } from "./DetailView.tsx";
import { Results, type ResultsHandle } from "./Results.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { useNarrow } from "./useNarrow.ts";
import { hrefOf, identity, queryOf, toggled, withKind, type LibraryUrl } from "./url.ts";
import s from "./library.module.css";

export type LibraryProps = { readonly url: LibraryUrl; readonly page: ShownPage; readonly detail: ShownDetail | null; readonly port: LibraryPort };

const STEP: Readonly<Record<string, Step>> = { "←": "left", "→": "right", "↑": "up", "↓": "down", PgUp: "page-up", PgDn: "page-down", Home: "first", End: "last" };

export function Library({ url: u, page, detail: first, port }: LibraryProps) {
  const router = useRouter();
  const { toast } = useShell();
  const [pending, startTransition] = useTransition();
  const { narrow, railNarrow } = useNarrow();

  // ── the window: local, mirrored to the URL without a render ──
  const [view, setView] = useState<View>(u.view);
  const [density, setDensity] = useState<Density>(u.d);
  const [sel, setSel] = useState<string | null>(u.sel);
  const [detailPref, setDetailPref] = useState<boolean | null>(u.detail);
  const detailOn = detailPref ?? (narrow ? false : true);
  const [railOpen, setRailOpen] = useState(false);
  const [shown, setShown] = useState(0);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [inResults, setInResults] = useState(false);

  const here = useMemo<LibraryUrl>(() => ({ ...u, view, d: density, sel, detail: detailPref === false ? false : detailPref === true && narrow ? true : null }), [u, view, density, sel, detailPref, narrow]);
  // Not while a navigation is in flight: `u` is still the old query then, and writing it would
  // put the old address back under the new one (the new render writes the window after it).
  useEffect(() => {
    if (pending) return;
    const href = hrefOf(here);
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.replaceState(null, "", href);
  }, [here, pending]);

  // ── the query: an identifying change is a navigation ──
  const go = useCallback((next: LibraryUrl) => startTransition(() => router.replace(hrefOf({ ...next, view, d: density, sel, detail: here.detail }), { scroll: false })), [router, view, density, sel, here.detail]);
  const id = identity(u);
  const query = useCallback((offset: number, limit: number) => queryOf(u, offset, limit), [u]);
  const blocks = useBlocks(port, id, query, page.items);

  // ── details, by id ──
  const [details, setDetails] = useState<ReadonlyMap<string, ShownDetail>>(() => new Map(first === null ? [] : [[first.card.id, first]]));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (sel === null || details.has(sel)) return;
    let live = true;
    void port.detail({ id: sel, facets: u.f }).then((r) => {
      if (!live) return;
      if (r.ok) setDetails((m) => new Map(m).set(sel, r.value));
      else toast(`library: ${r.error.error}`);
    });
    return () => {
      live = false;
    };
  }, [sel, details, port, u.f, toast]);
  const current = sel === null ? null : (details.get(sel) ?? null);

  // ⏎/↓ from the search selects the first item OF THE ANSWER: when the search just changed, that
  // is the next render's first row, not the one on screen while the query is in flight.
  // Derived during render once the answer is in, so no frame shows the old first row selected.
  const [wantFirst, setWantFirst] = useState(false);
  if (wantFirst && !pending) {
    const c = blocks.at(0);
    setWantFirst(false);
    if (c !== undefined) setSel(c.id);
  }

  // ── selection ──
  const results = useRef<ResultsHandle | null>(null);
  const select = useCallback(
    (next: string | null, open = false) => {
      setSel(next);
      if (next === null) return;
      const i = blocks.indexOf(next);
      if (i >= 0) results.current?.reveal(i);
      if (open && narrow) setDetailPref(true);
    },
    [blocks, narrow],
  );
  const move = (step: Step): void => {
    const cur = sel === null ? -1 : blocks.indexOf(sel);
    const to = stepTo(cur, step, page.total, results.current?.columns() ?? 1, results.current?.pageSize() ?? 10, view);
    if (to < 0) return;
    void blocks.ensure(to).then((c) => {
      if (c === undefined) return;
      setSel(c.id);
      results.current?.reveal(to);
    });
  };

  // ── the filter ──
  const setFacet = (group: string, value: string, on: boolean, goto?: LibraryKindName): void => {
    const base = goto !== undefined && goto !== u.kind ? withKind({ ...u, f: {} }, goto) : u;
    go(toggled(base, group, value, on));
  };
  const setKind = (k: KindId): void => go(withKind(u, k));
  const clearAll = (): void => go({ ...u, f: {}, q: "" });

  // ── acts ──
  const act = (a: LibraryAct): void => {
    if (sel === null) return;
    const target = sel;
    setBusy(true);
    void port.act({ id: target, act: a, facets: u.f }).then((r) => {
      setBusy(false);
      if (!r.ok) return toast(`library: ${r.error.error}`);
      setDetails((m) => new Map(m).set(target, r.value.detail));
      toast(r.value.said);
      // The rail's pinned and project counts moved: the server re-reads them.
      startTransition(() => router.refresh());
    });
  };

  // ── keys ──
  useKeys(
    "library",
    {
      search: () => document.querySelector<HTMLInputElement>("[data-keyfield=search]")?.focus(),
      move: (hit) => move(STEP[hit.cap] ?? "down"),
      page: (hit) => move(STEP[hit.cap] ?? "page-down"),
      edge: (hit) => move(STEP[hit.cap] ?? "first"),
      open: () => {
        if (sel === null) {
          const c = blocks.at(0);
          if (c !== undefined) select(c.id, true);
          setDetailPref(true);
        } else setDetailPref(!detailOn);
      },
      detail: () => setDetailPref(!detailOn),
      back: () => {
        const b = backStep({ railDrawer: railNarrow && railOpen, detailDrawer: narrow && detailOn, selected: sel !== null, query: u.q !== "" });
        if (b === "close-rail") setRailOpen(false);
        else if (b === "close-detail") setDetailPref(false);
        else if (b === "deselect") setSel(null);
        else if (b === "clear-query") go({ ...u, q: "" });
        else return false;
        results.current?.focus();
        return undefined;
      },
    },
    { facts: inResults ? ["in-results"] : [] },
  );
  // Nothing focused (the page just loaded, or a drawer closed) is the results' focus too, as the
  // prototype's `inRes` counted document.body.
  useEffect(() => {
    const sync = (): void => setInResults(document.activeElement === document.body || document.activeElement?.getAttribute("role") === "listbox");
    const later = (): void => void window.setTimeout(sync, 0);
    sync();
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", later);
    return () => {
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", later);
    };
  }, []);

  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    root.current?.setAttribute("data-ready", "true");
  }, []);

  const position = current === null || sel === null ? undefined : blocks.indexOf(sel);
  const summaryStates = Object.fromEntries((page.groups.find((g) => g.key === "state")?.values ?? []).map((v) => [v.value, (u.f["state"]?.length ?? 0) > 0 && !v.selected ? 0 : v.count]));
  const newest = page.items.flatMap((c) => (c.face.kind === "image" ? [{ id: c.id, title: c.title, url: c.face.url }] : [])).slice(0, 6);
  return (
    <div ref={root} className={s.lib} data-component="Library" data-detail={detailOn} data-rail={railOpen} data-narrow={narrow}>
      <aside className={s.nav} id="lib-rail" aria-label="Library vocabulary">
        <Panel title="Library" tally={{ value: count(page.everything) }}>
          <Rail
            kind={u.kind}
            kindCounts={page.kindCounts}
            groups={page.groups}
            closed={closed}
            expanded={expanded}
            onKind={setKind}
            onToggle={(g, v, on) => setFacet(g, v, on)}
            onFold={(g, open) => setClosed((x) => (open ? new Set([...x].filter((k) => k !== g)) : new Set(x).add(g)))}
            onMore={(g, all) => setExpanded((x) => (all ? new Set(x).add(g) : new Set([...x].filter((k) => k !== g))))}
          />
        </Panel>
      </aside>
      <section className={s.center} aria-label="Results">
        <Toolbar
          u={u}
          groups={page.groups}
          parsed={page.parsed}
          total={page.total}
          shown={shown}
          view={view}
          density={density}
          detailOn={detailOn}
          railOn={railOpen}
          onSearch={(q) => go({ ...u, q })}
          onToResults={() => {
            results.current?.focus();
            if (sel === null) setWantFirst(true);
          }}
          onRemove={(g, v) => setFacet(g, v, false)}
          onClear={clearAll}
          onRoot={() => go({ ...u, kind: "all", f: {}, q: "" })}
          onKindOnly={() => go({ ...u, f: {} })}
          onSort={(sort) => go({ ...u, sort })}
          onView={setView}
          onDensity={setDensity}
          onDetail={setDetailPref}
          onRail={setRailOpen}
        />
        <Results
          ref={results}
          view={view}
          density={density}
          total={page.total}
          blocks={blocks}
          sel={sel}
          filtered={Object.keys(u.f).length > 0 || u.q !== ""}
          busy={pending}
          onSelect={(x) => select(x, true)}
          onOpen={(x) => {
            select(x);
            setDetailPref(true);
          }}
          onClear={clearAll}
          onShown={setShown}
          onFocusChange={setInResults}
        />
        {blocks.error !== null && <p className={s.blockErr} role="alert">{blocks.error}</p>}
      </section>
      <button type="button" className={s.scrim} aria-label="close drawer" tabIndex={-1} onClick={() => (railOpen ? setRailOpen(false) : setDetailPref(false))} />
      <aside className={s.det} id="lib-detail" aria-label="Item detail" hidden={!detailOn && !narrow}>
        <DetailPanel
          kind={sel === null ? "set" : (current?.card.kind ?? "all")}
          {...(position !== undefined && position >= 0 ? { position: { index: position, total: page.total } } : {})}
          {...(sel === null ? {} : { onStep: (d: -1 | 1) => move(d < 0 ? "prev" : "next") })}
          onClose={() => setDetailPref(false)}
        >
          {sel === null ? (
            <SetSummary total={page.total} of={page.everything} kind={u.kind} states={summaryStates} kinds={page.kindCounts} newest={newest} onState={(st) => setFacet("state", st, true)} onKind={setKind} onItem={(x) => select(x)} />
          ) : current === null ? (
            <p className={s.reading} role="status">
              reading {sel}
            </p>
          ) : (
            <DetailView key={current.card.id} d={current} busy={busy} onFacet={(g, v, goto) => setFacet(g, v, !(u.f[g] ?? []).includes(v), goto)} onItem={(x) => select(x)} onPin={(on) => act(on ? { act: "pin" } : { act: "unpin" })} onUse={(projectId) => act({ act: "use-in-project", projectId })} onExport={(project) => act({ act: "export", project })} />
          )}
        </DetailPanel>
      </aside>
    </div>
  );
}
