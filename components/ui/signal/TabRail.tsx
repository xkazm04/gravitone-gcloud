"use client";

// THE TAB BAR THAT DOES NOT HAVE A SLOT FOR A PARAGRAPH.
//
// This is one of the two containers that ENFORCE the sandwich — the reason a
// copy fix alone cannot work. Four surfaces hand-roll a tab row, and all four
// pair it with a blurb slot, so all four fill it:
//
//   app/library/LibraryView.tsx:26-29,74     `MODULES[].blurb`, printed under
//                                            the row: "Visual identities. A
//                                            locked one is required before any
//                                            project."
//   app/foundry/FoundryView.tsx:47-60        `TABS[].blurb`, up to 45 words
//                                            ("Drop a gallery. Its looks are
//                                            read back, grouped into styles,
//                                            replicated from words alone…")
//   app/_phases/script/ScriptStep.tsx:74-79  `TABS[].sub` — four captions
//   app/_phases/frames/FramesStep.tsx:24-29  the fourth spelling
//
// A blurb field on a tab definition is a prompt. Remove the field and the
// sentence has nowhere to go, so this component has no `blurb`, no `sub` and no
// `description`. What the blurb was usually REACHING FOR rides on the tab
// instead: the state, as a <Tally>, and — for a tab that cannot be opened yet —
// a Lock glyph with its reason behind a <Hint>. Neither takes a line of page.
//
// ── Semantics ──────────────────────────────────────────────────────────────
// `role="tablist"` / `role="tab"` / `aria-selected`, roving tabindex, arrow keys
// (and Home/End) walking the row. MANUAL activation: the arrows move focus and
// Enter/Space selects, rather than selecting as focus lands. Two reasons — a
// locked tab must be reachable so its Hint can be read, and selecting on arrow
// would fire the caller's `onSelect` for every tab passed over.
//
// A locked tab is `aria-disabled`, NOT `disabled`. A `disabled` button is
// removed from the tab order, which would put the explanation of why it is
// locked behind a mouse. That is the exact regression this vocabulary exists to
// avoid.
//
// The Hint hangs on the TAB ITSELF, via `useHint` (components/ui/signal/Hint.tsx)
// rather than a nested <Hint> glyph: a <button> inside a `role="tab"` <button>
// is interactive content inside a button — invalid HTML — and a second focusable
// child inside a tablist that owns only tabs.

import { useRef } from "react";

import { Lock } from "lucide-react";

import { HintPopover, hintRootClass, useHint } from "./Hint";
import { Tally, type TallyTone } from "./Tally";

export interface TabDef<T extends string> {
  id: T;
  /** One or two words. Not a sentence — there is nowhere for one to go. */
  label: string;
  /** The state the blurb used to describe, as a count or a ratio. */
  tally?: { value: number; of?: number; tone?: TallyTone; label?: string };
  /** Colours the tab's own text when it carries news (rose = something broke). */
  tone?: "cyan" | "amber" | "rose";
  /** Reachable by keyboard and readable, but not selectable. */
  disabled?: boolean;
  /** Why, in one short clause. Rendered behind the tab's own disclosure. */
  disabledReason?: React.ReactNode;
  /** The `id` of the panel this tab controls, if the caller renders one. */
  panelId?: string;
}

const TONE: Record<NonNullable<TabDef<string>["tone"]>, string> = {
  cyan: "border-cyan-400/25 text-cyan-200/80 hover:text-cyan-100",
  amber: "border-amber-400/30 text-amber-200/80 hover:text-amber-100",
  rose: "border-rose-400/30 text-rose-200/80 hover:text-rose-100",
};

const IDLE = "border-white/10 text-white/50 hover:text-white/80";
const ACTIVE = "border-cyan-400/40 bg-cyan-400/10 text-cyan-200";
const LOCKED = "border-white/[0.06] text-white/30 cursor-not-allowed";

export function TabRail<T extends string>({
  tabs,
  active,
  onSelect,
  label,
  className = "",
}: {
  tabs: ReadonlyArray<TabDef<T>>;
  active: T;
  onSelect: (id: T) => void;
  /** Names the row for a screen reader — "library modules". Required: an
   *  unnamed tablist on a page with two of them is a coin toss. */
  label: string;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);

  /** Roving focus, read off the DOM rather than off a ref per tab — one ref,
   *  read inside an event handler, which is also what keeps this clear of the
   *  React Compiler's ref rules (see lint-baseline.json: the `react-hooks/refs`
   *  bucket is frozen at three). */
  const move = (from: number, delta: number) => {
    const root = listRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    if (els.length === 0) return;
    const next = (from + delta + els.length) % els.length;
    els[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const root = listRef.current;
    if (e.key === "ArrowRight") move(i, 1);
    else if (e.key === "ArrowLeft") move(i, -1);
    else if (e.key === "Home") root?.querySelector<HTMLButtonElement>('[role="tab"]')?.focus();
    else if (e.key === "End") move(0, -1);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={`flex flex-wrap items-center gap-2 border-b border-white/8 pb-3 ${className}`}
    >
      {tabs.map((t, i) => (
        <TabButton
          key={t.id}
          tab={t}
          selected={t.id === active}
          onSelect={onSelect}
          onKeyDown={(e) => onKeyDown(e, i)}
        />
      ))}
    </div>
  );
}

function TabButton<T extends string>({
  tab,
  selected,
  onSelect,
  onKeyDown,
}: {
  tab: TabDef<T>;
  selected: boolean;
  onSelect: (id: T) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const d = useHint();
  const reason = tab.disabled ? tab.disabledReason : undefined;
  const shape =
    "font-jetbrains inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-label transition focus-visible:outline-2 focus-visible:outline-offset-2";
  const skin = tab.disabled ? LOCKED : selected ? ACTIVE : tab.tone ? TONE[tab.tone] : IDLE;

  return (
    // `presentation` so the tablist still owns nothing but tabs, the way a
    // list-based tablist wraps each tab in <li role="presentation">.
    <span role="presentation" {...d.rootProps} className={hintRootClass}>
      <button
        type="button"
        role="tab"
        {...d.triggerProps}
        // AFTER the spread, and never `d.triggerProps.ref` in front of it. The
        // React Compiler's `react-hooks/refs` analysis taints the whole
        // disclosure object the moment a property literally named `ref` is read
        // during render, and then reports every other read off it — four
        // findings against a `lint-baseline.json` bucket frozen at three.
        // Spreading reads the same object without naming the ref, which is what
        // <Hint> itself does. The override below is why the spread comes first:
        // an enabled tab describes nothing, so it must not point at an id whose
        // popover is not rendered.
        aria-describedby={reason ? d.hintId : undefined}
        aria-selected={selected}
        aria-disabled={tab.disabled || undefined}
        aria-controls={tab.panelId}
        tabIndex={selected ? 0 : -1}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (!tab.disabled) onSelect(tab.id);
        }}
        className={`${shape} ${skin}`}
      >
        {tab.disabled && <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />}
        {tab.label}
        {tab.tally && (
          <Tally
            value={tab.tally.value}
            of={tab.tally.of}
            label={tab.tally.label}
            tone={tab.tally.tone ?? "neutral"}
          />
        )}
      </button>
      {reason && <HintPopover d={d}>{reason}</HintPopover>}
    </span>
  );
}
