"use client";

// The results' head and toolbar (library.html `.lhead`, `.ltool`, `.fchips`; library.js
// `renderHead`): where the filter has narrowed to, how many it holds and how many the DOM holds
// of them, the search with its grammar, sort, grid or list, size, the detail toggle, and the
// filter as chips that remove themselves.
//
// Free text applies on a pause in typing or on ⏎/↓ (the prototype's 110 ms debounce, lengthened
// because each application is a server render here); the facets apply on click. A query the
// server read differently from how it was typed shows how it was read: the parsed tokens are
// the chips the grammar made, so `mood:tense` is seen to be a filter, not a word.

import { useEffect, useRef, useState } from "react";

import { groupLabel, type LibraryGroup, type ParsedSearch } from "@gt/domain/library";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Crumbs, type Crumb } from "@gt/ui/components/crumbs/Crumbs.tsx";
import { Search, Select } from "@gt/ui/components/field/Field.tsx";
import { count, type Density, type View } from "@gt/ui/components/library/library.ts";
import { kindLabel } from "@gt/ui/components/library/LibraryGlyph.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import { activeCount, type LibraryUrl } from "./url.ts";
import s from "./library.module.css";

/** How long typing may pause before the query applies. */
export const SEARCH_SETTLE_MS = 220;

export type ToolbarProps = {
  readonly u: LibraryUrl;
  readonly groups: readonly LibraryGroup[];
  readonly parsed: ParsedSearch;
  readonly total: number;
  readonly shown: number;
  readonly view: View;
  readonly density: Density;
  readonly detailOn: boolean;
  readonly railOn: boolean;
  readonly onSearch: (q: string) => void;
  readonly onToResults: () => void;
  readonly onRemove: (group: string, value: string) => void;
  readonly onClear: () => void;
  readonly onRoot: () => void;
  readonly onKindOnly: () => void;
  readonly onSort: (sort: LibraryUrl["sort"]) => void;
  readonly onView: (v: View) => void;
  readonly onDensity: (d: Density) => void;
  readonly onDetail: (on: boolean) => void;
  readonly onRail: (on: boolean) => void;
};

const labelIn = (groups: readonly LibraryGroup[], g: string, v: string): string => groups.find((x) => x.key === g)?.values.find((x) => x.value === v)?.label ?? v;

export function Toolbar(p: ToolbarProps) {
  const [draft, setDraft] = useState(p.u.q);
  // A query changed from elsewhere (the crumbs, Esc, a pasted address) replaces the draft;
  // derived during render so the field never shows the old words for a frame.
  const [seenQ, setSeenQ] = useState(p.u.q);
  if (seenQ !== p.u.q) {
    setSeenQ(p.u.q);
    if (draft.trim() !== p.u.q) setDraft(p.u.q);
  }
  const timer = useRef<number | undefined>(undefined);
  const applied = useRef(p.u.q);
  useEffect(() => {
    applied.current = p.u.q;
  }, [p.u.q]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const apply = (q: string): void => {
    window.clearTimeout(timer.current);
    if (q.trim() !== applied.current) {
      applied.current = q.trim();
      p.onSearch(q.trim());
    }
  };
  const type = (q: string): void => {
    setDraft(q);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => apply(q), SEARCH_SETTLE_MS);
  };
  // The search field's own rows of the `library` keymap: Esc clears, ↓ applies and moves on.
  useKeys("library", {
    "clear-search": () => {
      setDraft("");
      apply("");
      p.onToResults();
    },
    "to-results": () => {
      apply(draft);
      p.onToResults();
    },
  });

  const toks = Object.entries(p.u.f).flatMap(([g, vs]) => vs.map((v) => [g, v] as const));
  const first = toks[0];
  const trail: Crumb[] = [{ label: "Library", onPress: p.onRoot }];
  if (first !== undefined) trail.push({ label: kindLabel(p.u.kind), onPress: p.onKindOnly });
  const here = first === undefined ? kindLabel(p.u.kind) : `${groupLabel(first[0])}: ${labelIn(p.groups, first[0], first[1])}${toks.length > 1 ? ` +${toks.length - 1}` : ""}`;
  const active = activeCount(p.u.f);
  return (
    <>
      <div className={s.lhead}>
        <span className={s.crumbs}>
          <Crumbs trail={trail} here={here} />
        </span>
        {p.u.q !== "" && <span className={s.q}>“{p.u.q}”</span>}
        <span className={s.sp} />
        <span aria-live="polite" className={s.total}>
          <Tally value={count(p.total)} label="items" />
        </span>
        <span className={s.rendered} data-testid="rendered">
          <Chip label={`rendered ${count(p.shown)} of ${count(p.total)}`} casing="lower" />
        </span>
      </div>
      <div className={s.tool} role="toolbar" aria-label="library tools">
        <span className={s.railToggle}>
          <Toggle label="vocabulary" glyph="grid" count={active} on={p.railOn} onToggle={p.onRail} controls="lib-rail" name={`vocabulary${active > 0 ? `, ${active} active` : ""}`} />
        </span>
        <form
          className={s.search}
          onSubmit={(e) => {
            e.preventDefault();
            apply(draft);
            p.onToResults();
          }}
        >
          <Search mode="library" label="Search the library" value={draft} onChange={type} placeholder="search · mood:tense · style:painted-3d" keyfield="search" />
        </form>
        <span className={s.sort}>
          <Select<LibraryUrl["sort"]>
            label="Sort"
            value={p.u.sort}
            onChange={p.onSort}
            options={[
              { value: "newest", label: "newest" },
              { value: "name", label: "name" },
              { value: "kind", label: "kind" },
            ]}
          />
        </span>
        <Seg<View>
          label="View"
          value={p.view}
          onChange={p.onView}
          options={[
            { value: "grid", label: "grid", glyph: "grid" },
            { value: "list", label: "list" },
          ]}
        />
        <span className={s.dens}>
          <Seg<Density>
            label="Tile size"
            value={p.density}
            onChange={p.onDensity}
            options={[
              { value: "s", label: "S" },
              { value: "m", label: "M" },
              { value: "l", label: "L" },
            ]}
          />
        </span>
        <span className={s.detTog}>
          <Toggle label="detail" on={p.detailOn} onToggle={p.onDetail} shortcut={{ mode: "library", verb: "detail" }} controls="lib-detail" />
        </span>
      </div>
      {(toks.length > 0 || p.parsed.tokens.length > 0) && (
        <div className={s.fchips} aria-label="Active filters" role="group">
          {toks.map(([g, v]) => (
            <Chip key={`${g}:${v}`} label={`${groupLabel(g)}: ${labelIn(p.groups, g, v)} ×`} tone="cyan" casing="lower" onPress={() => p.onRemove(g, v)} name={`remove ${groupLabel(g)} ${labelIn(p.groups, g, v)}`} />
          ))}
          {p.parsed.tokens.map((t) => (
            <Chip key={`q:${t.key}:${t.value}`} label={`${groupLabel(t.key)} ~ ${t.value}`} tone="violet" casing="lower" ghost name={`search token ${t.key} ${t.value}`} />
          ))}
          {toks.length > 0 && (
            <button type="button" className={s.clear} onClick={p.onClear}>
              clear all
            </button>
          )}
        </div>
      )}
    </>
  );
}
