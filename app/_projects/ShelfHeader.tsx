"use client";

// THE SHELF'S TOOLBAR — one row at 1920, two at 1280, and nothing in it that is
// not a control or a figure.
//
// ROUND 2 (2026-10-05) folded five rows into this one. Above the race sheet sat
// a demo strip, a row of state tallies that were also the state filter, a stack
// bar, a search box beside two rows of discipline and template chips, and four
// native <select>s — 250px of chrome over a table that starts where the work
// is. What each row carried has a place here:
//
//   · the state tallies are the State dropdown's options — the same tone dot,
//     the same count, counted over the same facet (shelf.ts#matchesExcept), so
//     the number and the control that narrows to it still cannot disagree;
//   · the two chip rows are ONE Type dropdown, disciplines and templates as two
//     labelled groups, each sorted by name, so neither filter was lost;
//   · Step and Step state are one Step dropdown: a step, then what it says;
//   · the stack bar is the 2px rule along the top edge of the sheet
//     (RaceSheet.tsx#StateRule) — it costs no height there;
//   · the demo strip's sentence is the `demo 6` chip (parts.tsx#DemoChip),
//     handed in through `aside` with the quick-create glyph.
//
// Every control has a FIXED width. A trigger that sized itself to its value
// moved every control after it on each pick, and a toolbar that shifts under
// the pointer is the layout jump round 1 was marked down for.
//
// THE TRIGGERS CARRY A GLYPH, NOT A CAPS PREFIX (Select.tsx `icon`). With
// `TYPE` / `STEP` / `STATE` printed inside each trigger the row needed ~150px
// more than 1920 gives it, and what got truncated to pay for the labels was
// the VALUE — measured, "STEP · Frames ·…" with the state cut off, which is
// the half of the pick that matters. The value names its own dropdown once it
// is set ("Frames · needs a call" is a step, "needs a call" with a tone dot is
// a state), and unset it says so in words: "any type", "any step", "any state".
// The label stays the accessible name of every trigger and listbox.

import { Activity, ArrowDownUp, Clapperboard, Milestone, Rows3, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Select, type SelectGroup, type SelectOption } from "@/components/ui/Select";
import { Keycaps, type KeyBinding, type StackTone, type TallyTone } from "@/components/ui/signal";
import {
  DISCIPLINES,
  DISCIPLINE_LABEL,
  PHASES,
  PHASE_STATE_WORD,
  PHASE_TITLE,
  TEMPLATES,
  type Discipline,
  type PhaseState,
  type Project,
  type ProjectState,
} from "@/lib/projects";
import { isSeeded } from "@/app/_studio/projectSeed";

import { DemoTag, NewProjectButton, STATE_TONE, SynthTag } from "./parts";
import { isSynthetic } from "./synthetic";
import {
  ANY,
  GROUPS,
  MULTI,
  SORTS,
  STATE_ORDER,
  clearFilters,
  isFiltered,
  statePatch,
  stateValue,
  stepPatch,
  stepValue,
  typePatch,
  typeValue,
  type FacetCounts,
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

/** A step's state as a dot — the gate colours of RaceSheet.tsx#GATE, so the
 *  option you pick is drawn the way the gate it finds is drawn. */
export const STEP_DOT: Record<PhaseState, string> = {
  done: "bg-emerald-300/80",
  working: "bg-cyan-300/70",
  review: "bg-amber-300/80",
  blocked: "bg-rose-400",
  empty: "border border-white/35",
};

/** The order a step's states read in the menu: anything started, then the
 *  states that want a person, then the settled ones. */
const STEP_STATES: readonly PhaseState[] = ["working", "review", "blocked", "done", "empty"];

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

const byLabel = <T extends string>(a: SelectOption<T>, b: SelectOption<T>) =>
  a.label.localeCompare(b.label, undefined, { sensitivity: "base" });

/** Type: disciplines and templates, each group by name ascending. Exported for
 *  tests/golden-path/projects-shelf.probe.spec.ts, which holds the order. */
export function typeOptions(facets: FacetCounts): SelectGroup<string>[] {
  return [
    { label: "", options: [{ value: ANY, label: "any type" }] },
    {
      label: "Discipline",
      options: DISCIPLINES.map((d) => ({
        value: `d:${d}`,
        label: DISCIPLINE_LABEL[d],
        meta: facets.disciplines[d],
      })).sort(byLabel),
    },
    {
      label: "Template",
      options: TEMPLATES.map((t) => ({
        value: `t:${t.id}`,
        label: t.label,
        meta: facets.templates[t.id],
      })).sort(byLabel),
    },
  ];
}

function stepOptions(facets: FacetCounts): SelectGroup<string>[] {
  return [
    { label: "", options: [{ value: ANY, label: "any step" }] },
    ...PHASES.map((k, i) => ({
      label: `${i + 1} ${PHASE_TITLE[k]}`,
      options: [
        {
          value: k,
          label: "started",
          meta: facets.steps[k].started,
          trigger: `${PHASE_TITLE[k]} · started`,
        },
        ...STEP_STATES.map((s) => ({
          value: `${k}:${s}`,
          label: PHASE_STATE_WORD[s],
          meta: facets.steps[k][s],
          dot: STEP_DOT[s],
          trigger: `${PHASE_TITLE[k]} · ${PHASE_STATE_WORD[s]}`,
        })),
      ],
    })),
  ];
}

function stateOptions(counts: StateCounts): SelectOption<string>[] {
  return [
    { value: ANY, label: "any state", meta: counts.total },
    ...STATE_ORDER.map((s) => ({
      value: s,
      label: STATE_TONE[s].word,
      dot: STATE_TONE[s].dot,
      meta: counts[s],
    })),
  ];
}

export default function ShelfToolbar({
  query,
  setQuery,
  counts,
  facets,
  shown,
  total,
  searchRef,
  keys,
  onCreate,
  aside,
}: {
  query: ShelfQuery;
  setQuery: (patch: Partial<ShelfQuery>) => void;
  counts: StateCounts;
  facets: FacetCounts;
  shown: number;
  total: number;
  searchRef: React.RefObject<HTMLInputElement | null>;
  keys: KeyBinding[];
  onCreate: () => void;
  aside?: React.ReactNode;
}) {
  const typeV = typeValue(query);
  const stepV = stepValue(query);
  const stateV = stateValue(query);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-2">
      <div
        role="group"
        aria-label="Filter projects"
        className="flex min-w-0 flex-[1_1_auto] flex-wrap items-center gap-2"
      >
        <SearchBox q={query.q} setQuery={setQuery} searchRef={searchRef} keys={keys} />
        <Select
          label="Type"
          icon={<Clapperboard className="h-4 w-4" />}
          className="w-[16.25rem] shrink-0"
          minWidth={300}
          value={typeV}
          placeholder={typeV === MULTI ? `${query.disciplines.length + query.templates.length} types` : undefined}
          options={typeOptions(facets)}
          onChange={(v) => setQuery(typePatch(v))}
        />
        <Select
          label="Step"
          icon={<Milestone className="h-4 w-4" />}
          className="w-[17rem] shrink-0"
          minWidth={260}
          value={stepV}
          placeholder={
            stepV === MULTI && query.phaseState ? `any step · ${PHASE_STATE_WORD[query.phaseState]}` : undefined
          }
          options={stepOptions(facets)}
          onChange={(v) => setQuery(stepPatch(v))}
        />
        <Select
          label="State"
          icon={<Activity className="h-4 w-4" />}
          className="w-52 shrink-0"
          minWidth={240}
          value={stateV}
          placeholder={stateV === MULTI ? `${query.states.length} states` : undefined}
          options={stateOptions(counts)}
          onChange={(v) => setQuery(statePatch(v))}
        />
        <ShownCount
          shown={shown}
          total={total}
          filtered={isFiltered(query)}
          onClear={() => setQuery(clearFilters(query))}
        />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Select
          label="Group"
          icon={<Rows3 className="h-4 w-4" />}
          className="w-44"
          align="right"
          value={query.group}
          options={GROUPS.map((g) => ({ value: g, label: GROUP_WORD[g] }))}
          onChange={(g) => setQuery({ group: g })}
        />
        <Select
          label="Sort"
          icon={<ArrowDownUp className="h-4 w-4" />}
          className="w-[12.5rem]"
          align="right"
          value={query.sort}
          options={SORTS.map((s) => ({ value: s, label: SORT_WORD[s] }))}
          onChange={(s) => setQuery({ sort: s })}
        />
        {aside}
        <NewProjectButton onClick={onCreate} />
      </div>
    </div>
  );
}

/** `2/306`, in a box sized for the widest it can be, so a filter that takes the
 *  shelf from 306 rows to 2 changes digits and moves nothing. The clear control
 *  holds its place while hidden for the same reason; `invisible` also takes it
 *  out of the tab order, which is what an absent control should be. */
function ShownCount({
  shown,
  total,
  filtered,
  onClear,
}: {
  shown: number;
  total: number;
  filtered: boolean;
  onClear: () => void;
}) {
  const w = String(total).length * 2 + 1;
  return (
    <span className="font-jetbrains flex h-10 items-center text-label tabular-nums">
      <span aria-hidden className="text-right" style={{ minWidth: `${w}ch` }}>
        <span className={filtered ? "text-cyan-200" : "text-white/70"}>{shown}</span>
        <span className="text-white/30">/{total}</span>
      </span>
      <span role="status" className="sr-only">
        {shown} of {total} projects shown
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear filters"
        title="Clear filters"
        className={`cursor-pointer rounded-full p-1.5 text-white/45 transition hover:bg-white/[0.06] hover:text-white ${
          filtered ? "" : "invisible"
        }`}
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </span>
  );
}

/** The search box keeps its own text and writes the URL after a pause: a URL
 *  write per keystroke re-derives the shelf per keystroke, and a controlled
 *  input fed back from the URL drops the letters typed while one is in flight.
 *  It adopts the URL's value only when that value is cleared from outside
 *  ("clear filters") — the one external write it can receive.
 *
 *  The keymap glyph sits in the box's right end, where a decorative `/` cap
 *  used to: the keymap names `/` itself, and as its own control in the row it
 *  cost 28px the row did not have. A sibling of the <label>, not a child — a
 *  button inside a label is a second labelable element in it. */
function SearchBox({
  q,
  setQuery,
  searchRef,
  keys,
}: {
  q: string;
  setQuery: (patch: Partial<ShelfQuery>) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  keys: KeyBinding[];
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
    <div className="relative w-40 shrink-0">
      <label className="block">
        <span className="sr-only">Search projects</span>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/40"
        />
        {/* A native input rather than Field's TextInput: that one takes no ref
          (its props are InputHTMLAttributes), and `/` has to reach this box.
          Same height, radius and fill as a Select trigger, so the row reads as
          one strip of controls. */}
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
          className="font-hanken h-10 w-full rounded-xl border border-white/8 bg-white/[0.03] pr-9 pl-9 text-content text-white transition placeholder:text-white/40 hover:border-white/15 hover:bg-white/[0.05] focus:border-cyan-400/40 focus:bg-cyan-400/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2"
        />
      </label>
      <span className="absolute top-1/2 right-2.5 flex -translate-y-1/2">
        <Keycaps map={keys} label="Shelf keys" />
      </span>
    </div>
  );
}
