"use client";

// The header every /projects variant shares: the shelf's state as tallies and a
// proportional rail, the filters as chips, the arrangement as two selects.
//
// No sentence in it. What the old shelf would have said ("3 projects need a
// call") is the amber tally; what a filter bar usually explains is the pressed
// state of the chip. The tallies are also the state filter — the number and the
// control that narrows to it are one object, so they cannot disagree.

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Select } from "@/components/ui/Field";
import { Keycaps, StackBar, Tally, type KeyBinding, type StackTone, type TallyTone } from "@/components/ui/signal";
import {
  DISCIPLINES,
  DISCIPLINE_LABEL,
  PHASES,
  PHASE_STATE_WORD,
  PHASE_TITLE,
  TEMPLATES,
  TEMPLATE_FAMILY,
  type Discipline,
  type PhaseKey,
  type PhaseState,
  type Project,
  type ProjectState,
} from "@/lib/projects";
import { isSeeded } from "@/app/_studio/projectSeed";

import { DemoTag, NewProjectButton, STATE_TONE, SynthTag } from "./parts";
import { isSynthetic } from "./synthetic";
import {
  PHASE_STATES,
  STATE_ORDER,
  clearFilters,
  isFiltered,
  type ShelfGroup,
  type ShelfQuery,
  type ShelfSort,
  type StateCounts,
} from "./shelf";

/** One tone per project state, in the vocabulary Tally and StackBar share. */
export const STATE_SIGNAL: Record<ProjectState, TallyTone & StackTone> = {
  blocked: "rose",
  review: "amber",
  working: "cyan",
  draft: "neutral",
  delivered: "emerald",
};

export const GROUP_WORD: Record<ShelfGroup, string> = {
  none: "no grouping",
  discipline: "by discipline",
  template: "by template",
  state: "by state",
};

export const SORT_WORD: Record<ShelfSort, string> = {
  "needs-you": "needs you next",
  updated: "last updated",
  created: "newest",
  title: "title",
};

/** A group's heading, in the catalogue's own words. */
export function groupLabel(g: ShelfGroup, key: string): string {
  if (g === "discipline") return DISCIPLINE_LABEL[key as Discipline] ?? key;
  if (g === "template") return TEMPLATES.find((t) => t.id === key)?.label ?? key;
  if (g === "state") return STATE_TONE[key as ProjectState]?.word ?? key;
  return "All projects";
}

/** The demo / synthetic mark a row carries, or nothing. */
export function ProjectMarks({ p }: { p: Project }) {
  if (isSeeded(p)) return <DemoTag />;
  if (isSynthetic(p)) return <SynthTag />;
  return null;
}

const CHIP =
  "font-jetbrains cursor-pointer rounded-full border px-2.5 py-0.5 text-label transition focus-visible:outline-2 focus-visible:outline-offset-2";
const CHIP_ON = "border-cyan-400/50 bg-cyan-400/10 text-cyan-100";
const CHIP_OFF = "border-white/10 text-white/55 hover:border-white/25 hover:text-white/80";

const SELECT = "py-1.5 text-label";

function toggle<T>(xs: readonly T[], x: T): T[] {
  return xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x];
}

export default function ShelfHeader({
  query,
  setQuery,
  counts,
  shown,
  total,
  searchRef,
  keys,
  groups = ["none", "discipline", "template", "state"],
  onCreate,
  aside,
}: {
  query: ShelfQuery;
  setQuery: (patch: Partial<ShelfQuery>) => void;
  counts: StateCounts;
  shown: number;
  total: number;
  searchRef: React.RefObject<HTMLInputElement | null>;
  keys: KeyBinding[];
  /** The groupings this variant can draw. */
  groups?: readonly ShelfGroup[];
  onCreate: () => void;
  aside?: React.ReactNode;
}) {
  const filtered = isFiltered(query);
  // Templates follow the discipline chips: with "Trailer" pressed, the template
  // row offers teaser · trailer · cinematic and nothing that cannot match.
  const templates = TEMPLATES.filter(
    (t) => query.disciplines.length === 0 || query.disciplines.includes(TEMPLATE_FAMILY[t.id]),
  );

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="group" aria-label="Filter by state" className="flex flex-wrap items-center gap-1.5">
          {STATE_ORDER.map((s) => {
            const on = query.states.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => setQuery({ states: toggle(query.states, s) })}
                className={`cursor-pointer rounded transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  on ? "ring-2 ring-white/40" : query.states.length > 0 ? "opacity-45 hover:opacity-80" : ""
                }`}
              >
                <Tally label={STATE_TONE[s].word} value={counts[s]} tone={STATE_SIGNAL[s]} />
              </button>
            );
          })}
        </div>
        <StackBar
          className="min-w-[10rem] flex-1"
          showCounts={false}
          label="Projects by state"
          segments={STATE_ORDER.map((s) => ({ n: counts[s], tone: STATE_SIGNAL[s], label: STATE_TONE[s].word }))}
        />
        <Tally label="shown" value={shown} of={total} />
        {aside}
        <NewProjectButton onClick={onCreate} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SearchBox q={query.q} setQuery={setQuery} searchRef={searchRef} />

        <div role="group" aria-label="Filter by discipline" className="flex flex-wrap items-center gap-1.5">
          {DISCIPLINES.map((d) => {
            const on = query.disciplines.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const disciplines = toggle(query.disciplines, d);
                  // A template whose discipline just left the filter can only
                  // match nothing now; drop it with its family.
                  const keep = query.templates.filter(
                    (t) => disciplines.length === 0 || disciplines.includes(TEMPLATE_FAMILY[t]),
                  );
                  setQuery({ disciplines, templates: keep });
                }}
                className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
              >
                {DISCIPLINE_LABEL[d]}
              </button>
            );
          })}
        </div>

        <div role="group" aria-label="Filter by template" className="flex flex-wrap items-center gap-1.5">
          {templates.map((t) => {
            const on = query.templates.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => setQuery({ templates: toggle(query.templates, t.id) })}
                className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-40">
          <Select
            aria-label="Step"
            value={query.phase ?? ""}
            onChange={(e) => setQuery({ phase: (e.target.value || undefined) as PhaseKey | undefined })}
            className={SELECT}
          >
            <option value="">any step</option>
            {PHASES.map((k) => (
              <option key={k} value={k}>
                {PHASE_TITLE[k]}
              </option>
            ))}
          </Select>
        </span>
        <span className="w-44">
          <Select
            aria-label="Step state"
            value={query.phaseState ?? ""}
            onChange={(e) => setQuery({ phaseState: (e.target.value || undefined) as PhaseState | undefined })}
            className={SELECT}
          >
            <option value="">{query.phase ? "started" : "any state"}</option>
            {PHASE_STATES.map((s) => (
              <option key={s} value={s}>
                {PHASE_STATE_WORD[s]}
              </option>
            ))}
          </Select>
        </span>
        <span className="w-44">
          <Select
            aria-label="Group"
            value={query.group}
            onChange={(e) => setQuery({ group: e.target.value as ShelfGroup })}
            className={SELECT}
          >
            {groups.map((g) => (
              <option key={g} value={g}>
                {GROUP_WORD[g]}
              </option>
            ))}
          </Select>
        </span>
        <span className="w-48">
          <Select
            aria-label="Sort"
            value={query.sort}
            onChange={(e) => setQuery({ sort: e.target.value as ShelfSort })}
            className={SELECT}
          >
            {(Object.keys(SORT_WORD) as ShelfSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_WORD[s]}
              </option>
            ))}
          </Select>
        </span>
        <Keycaps map={keys} label="Shelf keys" />
        {filtered && (
          <button
            type="button"
            onClick={() => setQuery(clearFilters(query))}
            className="font-jetbrains inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/12 px-3 py-0.5 text-label text-white/55 transition hover:border-white/25 hover:text-white/80"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
            clear filters
          </button>
        )}
      </div>
    </div>
  );
}

/** The search box keeps its own text and writes the URL after a pause: a
 *  `router.replace` per keystroke is a navigation per keystroke, and a
 *  controlled input fed back from the URL drops the letters typed while one is
 *  in flight. It adopts the URL's value only when that value is cleared from
 *  outside ("clear filters") — the one external write it can receive. */
function SearchBox({
  q,
  setQuery,
  searchRef,
}: {
  q: string;
  setQuery: (patch: Partial<ShelfQuery>) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState(q);
  const [prevQ, setPrevQ] = useState(q);
  if (q !== prevQ) {
    setPrevQ(q);
    if (q === "") setText("");
  }
  const write = useRef(setQuery);
  useEffect(() => {
    write.current = setQuery;
  }, [setQuery]);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <label className="relative block w-64">
      <span className="sr-only">Search projects</span>
      {/* A native input rather than Field's TextInput: that one takes no ref
          (its props are InputHTMLAttributes), and `/` has to reach this box. */}
      <input
        ref={searchRef}
        type="search"
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => write.current({ q: v }), 160);
        }}
        placeholder="Search"
        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-1.5 pr-9 text-label text-white transition placeholder:text-white/45 hover:border-white/20 focus:border-cyan-400/40 focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      <kbd
        aria-hidden
        className="font-jetbrains pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-white/15 px-1.5 text-label leading-snug text-white/40"
      >
        /
      </kbd>
    </label>
  );
}

/** A filter that matched nothing, drawn as the shape of the rows it would have
 *  shown, with the one move that brings them back. */
export function NoMatch({ onClear, rows = 3 }: { onClear: () => void; rows?: number }) {
  return (
    <div className="relative rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center">
      <p className="sr-only">No project matches</p>
      <div aria-hidden className="mx-auto max-w-xl space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-3 rounded-[3px] border border-dashed border-white/20" />
        ))}
      </div>
      <p className="font-instrument mt-6 text-2xl text-white/75">No project matches.</p>
      <button
        type="button"
        onClick={onClear}
        className="font-jetbrains mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-1.5 text-label text-cyan-200 transition hover:bg-cyan-400/20"
      >
        <X aria-hidden className="h-3.5 w-3.5" />
        clear filters
      </button>
    </div>
  );
}
