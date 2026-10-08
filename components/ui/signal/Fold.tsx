"use client";

// A SECTION THAT OPENS ON DEMAND — the second level of a layered screen.
//
// The waves (docs/waves/README.md) restructure long reads into levels: the state
// of the work first, the record one press down. Before this the "one press down"
// was spelled five ways — four native <details> (app/library/SpecEditor.tsx:57,
// app/articles/parts.tsx:386, app/articles/RunView.tsx:343,
// app/foundry/Lightbox.tsx:342) and a hand-rolled `aria-expanded` button per
// surface (app/_phases/frames/FramesAssembly.tsx:360, app/_projects/RaceSheet.tsx
// :501, app/playground/triage/Batch.tsx:73 …) — each with its own chevron, its
// own spacing, and no memory of having been opened.
// (The articles pair and the foundry lightbox have since adopted this; the
// line numbers above are where they were.)
//
// THE HEADER HAS NO SLOT FOR A SENTENCE, and that absence is the component, for
// the reason <TabRail> has none: a container with a slot for a paragraph will be
// handed a paragraph. A Fold is a title (a noun, one to four words) and the state
// of what is inside it — `tally` for a count, `marks` for a PipRow / StaleBadge /
// Hint. A sub-heading that explains what the section is for is the app talking
// about itself; it goes, it is not folded.
//
// AND A FOLD IS NOT WHERE NARRATION GOES TO HIDE. Folding a paragraph about the
// app moves it one click away and changes nothing about it; THE LAW
// (./README.md) deletes it. What belongs behind a Fold is the WORK when it is
// long: the full list of sources, every gate detail verbatim, a run's log, the
// rejected candidates. If the body would be a paragraph explaining the screen,
// there should be no Fold.
//
// ── Semantics ──────────────────────────────────────────────────────────────
// The WAI disclosure pattern: a real <button> inside a heading (`level`, h3 by
// default, so the outline survives), `aria-expanded`, `aria-controls` naming
// the region once it exists. `marks` sit BESIDE the button, never inside it — a
// <Hint> is itself a button, and a button inside a button is invalid HTML.
//
// ── Cost ───────────────────────────────────────────────────────────────────
// The body is not rendered until the first open: a closed Fold over a 300-row
// list costs its header and nothing else. After that it stays mounted and is
// `hidden` when closed, so a half-typed field or a scrolled list inside it
// survives a close — re-mounting on every toggle would throw that away.
//
// ── Memory ─────────────────────────────────────────────────────────────────
// `remember="research.sources"` keeps the open state across reloads through
// lib/useRemembered.ts (one localStorage record, evicted with the identity).
// Hydration-safe: the first render is `defaultOpen`, the remembered state lands
// right after. Controlled use (`open` + `onOpenChange`) ignores `remember`.

import { useId, useState } from "react";

import { ChevronRight } from "lucide-react";

import { useRemembered } from "@/lib/useRemembered";

import { useWorld } from "../world";
import { Tally, type TallyTone } from "./Tally";

type HeadingLevel = 2 | 3 | 4 | 5 | 6;

export interface FoldProps {
  /** A noun, one to four words. Not a sentence: there is nowhere for one to go. */
  title: string;
  /** The count the section holds, drawn as a <Tally> beside the title. */
  tally?: { value: number; of?: number; tone?: TallyTone; label?: string };
  /** Other STATE beside the title: a PipRow, a StaleBadge, a Hint. Never prose. */
  marks?: React.ReactNode;
  /** Uncontrolled starting state. */
  defaultOpen?: boolean;
  /** Controlled state; pair with `onOpenChange`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Remember the open state under this key (lib/useRemembered.ts). */
  remember?: string;
  /** The heading level the button sits in. Default 3. */
  level?: HeadingLevel;
  /** On the button, for probes. */
  testId?: string;
  className?: string;
  children: React.ReactNode;
}

const OPEN_STATES = ["1", "0"] as const;

/**
 * ```tsx
 * <Fold title="Sources" tally={{ value: sources.length }} remember="research.sources">
 *   <SourceList sources={sources} />
 * </Fold>
 * ```
 */
export function Fold({
  title,
  tally,
  marks,
  defaultOpen = false,
  open: controlled,
  onOpenChange,
  remember,
  level = 3,
  testId,
  className = "",
  children,
}: FoldProps) {
  const almanac = useWorld() === "almanac";
  const id = useId();
  const headId = `${id}-head`;
  const bodyId = `${id}-body`;

  const [stored, setStored] = useRemembered(
    controlled === undefined ? remember : undefined,
    defaultOpen ? "1" : "0",
    OPEN_STATES,
  );
  const open = controlled ?? stored === "1";

  // Mounted once opened, by ANY route — a click, a controlled parent, or a
  // remembered "open" landing after hydration. Derived during render (React's
  // "storing information from previous renders"), so the body mounts in the
  // same commit that first sees `open`, with no effect and no extra frame.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  const toggle = () => {
    const next = !open;
    if (controlled === undefined) setStored(next ? "1" : "0");
    onOpenChange?.(next);
  };

  const H = `h${level}` as const;

  return (
    <section className={almanac ? `k-sect ${className}` : `border-t border-white/8 ${className}`}>
      <div className="flex items-center gap-3">
        <H className="m-0 min-w-0 flex-1">
          <button
            type="button"
            id={headId}
            aria-expanded={open}
            aria-controls={mounted ? bodyId : undefined}
            onClick={toggle}
            data-testid={testId}
            className={
              almanac
                ? "k-sect__btn"
                : "flex w-full min-w-0 items-center gap-2 rounded-sm py-3 text-left text-white/75 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300/70"
            }
          >
            <ChevronRight
              aria-hidden
              className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
            />
            <span className="font-hanken truncate text-label font-medium tracking-wide">{title}</span>
          </button>
        </H>
        {(tally || marks) && (
          <span className="flex shrink-0 items-center gap-2">
            {tally && <Tally {...tally} />}
            {marks}
          </span>
        )}
      </div>
      {mounted && (
        <div
          id={bodyId}
          role="region"
          aria-labelledby={headId}
          hidden={!open}
          className={almanac ? "k-sect__body" : "pb-4"}
        >
          {children}
        </div>
      )}
    </section>
  );
}
