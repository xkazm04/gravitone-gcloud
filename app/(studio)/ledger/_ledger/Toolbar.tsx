"use client";

// The Ledger's toolbar (ledger.js `renderTop`): search, who acted, how many of how many,
// what it cost and by whose figure, the range the strip set, order and view. Every count
// here is the server's for the whole filter except two the server cannot give and which
// say so: cost is summed over the rows loaded (a `+` when more rows match), and a text
// search reports how many rows it examined when it stopped before the end.

import { useState } from "react";

import type { ActorKind, Event } from "@gt/domain/event";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Search } from "@gt/ui/components/field/Field.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { StaleBadge } from "@gt/ui/components/stalebadge/StaleBadge.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";
import { usd } from "@gt/ui/components/eventrow/usd.ts";
import { shortDay } from "@gt/ui/components/timestrip/TimeStrip.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import type { Feed } from "./feed.ts";
import { hasPost, splitFilter, type LedgerFilter } from "./filter.ts";
import type { Facets } from "./read.ts";
import { costOf, isFixture } from "./vocab.ts";
import s from "./ledger.module.css";

type Who = "all" | ActorKind;

export type ToolbarProps = {
  readonly filter: LedgerFilter;
  readonly facets: Facets;
  readonly rows: readonly Event[];
  readonly capped: boolean;
  readonly scanned: number;
  readonly exhausted: boolean;
  readonly ignored: readonly string[];
  readonly live: Feed;
  readonly view: "table" | "jsonl";
  readonly facetsOpen: boolean;
  readonly syncError?: string;
  readonly onFacets: (open: boolean) => void;
  readonly onApply: (next: Partial<LedgerFilter>) => void;
  readonly onView: (view: "table" | "jsonl") => void;
  /** Focus the list (the search field's ↓ / ⏎). */
  readonly onRows: () => void;
};

export function Toolbar(p: ToolbarProps) {
  const f = p.filter;
  const [draft, setDraft] = useState(f.q);
  const a = p.facets.actor;
  // Free text applies on an explicit act (table: filtering), never per keystroke: each
  // application is a server render. A query already applied moves on to the rows.
  const submit = (): void => {
    if (draft.trim() !== f.q) p.onApply({ q: draft.trim() });
    else p.onRows();
  };
  // The search field's own rows of the `ledger` keymap: Esc clears, ↓ submits and moves on.
  useKeys("ledger", {
    "clear-search": () => {
      setDraft("");
      if (f.q !== "") p.onApply({ q: "" });
    },
    "to-rows": () => submit(),
  });
  const post = hasPost(splitFilter(f).post);
  // Rows on screen when a text search narrowed them; the kernel's total otherwise.
  const shown = post ? p.rows.length : p.facets.total;
  const cost = costOf(p.rows);
  const marks = (["model", "illustrative"] as const).filter((k) => (cost.bySrc[k] ?? 0) !== 0);
  const active = f.type.length + f.lane.length + f.project.length + f.src.length;
  return (
    <div className={s.top} role="toolbar" aria-label="ledger filters">
      <span className={s.facetToggle}>
        <Toggle label="facets" glyph="grid" count={active} on={p.facetsOpen} onToggle={p.onFacets} controls="lg-facets" name={`facets${active > 0 ? `, ${active} active` : ""}`} />
      </span>
      {/* ⏎ submits through the form, not the keymap: the keymap gives Enter on a focused
          input to the input (keymap.ts resolve, `onControl`), and the `ledger` mode's
          ⏎ row for this field is not marked onControl - so a native submit is the one
          path that is neither a second keydown listener nor dead. */}
      <form
        className={s.search}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Search mode="ledger" label="search events" value={draft} onChange={setDraft} placeholder="id · text · actor:agent type:run.end" keyfield="search" />
      </form>
      <Seg<Who>
        label="actor"
        value={f.actor ?? "all"}
        onChange={(v) => p.onApply({ actor: v === "all" ? null : v })}
        options={[
          { value: "all", label: "All", count: a.all },
          { value: "operator", label: "Operator", glyph: "operator", accent: "operator", count: a.operator },
          { value: "agent", label: "Agent", glyph: "agent", accent: "agent", count: a.agent },
          { value: "machine", label: "Machine", glyph: "machine", accent: "machine", count: a.machine },
        ]}
      />
      <span aria-live="polite">
        <Tally value={post && !p.exhausted ? `${shown}+` : shown} of={p.facets.head} label="events" />
      </span>
      <span className={s.cost}>
        <Chip label="cost" value={cost.priced === 0 ? "—" : `${usd(Number(cost.total.toFixed(2)))}${p.capped ? "+" : ""}`} name={`cost of loaded events ${usd(cost.total)}`} />
        {marks.map((k) => (
          <SourceTag key={k} kind={k} value={usd(cost.bySrc[k] ?? 0)} />
        ))}
      </span>
      {f.from !== null && f.to !== null && (
        <Chip
          label={`${shortDay(f.from)}${f.to === f.from ? "" : ` → ${shortDay(f.to)}`} ×`}
          tone="cyan"
          casing="lower"
          onPress={() => p.onApply({ from: null, to: null })}
          name="clear date range"
        />
      )}
      {p.rows.some(isFixture) && <Chip label="fixture" tone="amber" casing="lower" name="fixture universe" />}
      {post && !p.exhausted && <Chip label="searched" value={p.scanned} tone="amber" casing="lower" name={`text search examined the ${f.order === "asc" ? "oldest" : "newest"} ${p.scanned} events`} />}
      {p.ignored.map((x) => (
        <Chip key={x} label={`ignored ${x}`} tone="amber" casing="lower" ghost />
      ))}
      {p.live.armed && <StaleBadge edge={p.live.edge} feed="ledger feed" {...(p.live.ageMs === undefined ? {} : { ageMs: p.live.ageMs })} />}
      {p.syncError !== undefined && <Chip label="sync" value={p.syncError} tone="amber" casing="lower" />}
      <span className={s.sp} />
      <Toggle
        label={f.order === "desc" ? "newest" : "oldest"}
        glyph={f.order === "desc" ? "down" : "up"}
        on={f.order === "asc"}
        onToggle={() => p.onApply({ order: f.order === "desc" ? "asc" : "desc" })}
        name={f.order === "desc" ? "newest first" : "oldest first"}
      />
      <Toggle label="{ } jsonl" on={p.view === "jsonl"} onToggle={(on) => p.onView(on ? "jsonl" : "table")} name="agent view, JSON Lines" />
    </div>
  );
}
