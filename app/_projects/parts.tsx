"use client";

// The leaves of the /projects shelf: the status language, the formatters, the
// row actions, the marks a row carries, and the two absences (an empty shelf,
// a demo shelf). Shared once by three variants; the race sheet is the one left,
// and they stay apart from it because the host (app/projects/ProjectsView.tsx)
// draws two of them itself.
//
// No colour literal: the cyan / emerald / amber / rose alpha utilities here are
// the rendered form of the accents and status colours already declared in
// components/ui/tokens.ts and used across the phase surfaces (rose = refused,
// amber = needs a call, emerald = locked).

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SURFACE } from "@/components/ui/tokens";
import { PHASES, PHASE_TITLE, type ProjectState } from "@/lib/projects";

import { GATE_POS } from "./shelf";

/* ── The status language, declared once ───────────────────────────────────── */

export const STATE_TONE: Record<
  ProjectState,
  { word: string; text: string; /** a BORDER colour — it draws a rule, not a fill */ rule: string; dot: string }
> = {
  blocked: {
    word: "blocked",
    text: "text-rose-300",
    rule: "border-rose-400/50",
    dot: "bg-rose-400",
  },
  review: {
    word: "needs a call",
    text: "text-amber-300",
    rule: "border-amber-400/50",
    dot: "bg-amber-400",
  },
  working: {
    word: "in production",
    text: "text-cyan-300",
    rule: "border-cyan-400/50",
    dot: "bg-cyan-300",
  },
  delivered: {
    word: "delivered",
    text: "text-emerald-300",
    rule: "border-emerald-400/50",
    dot: "bg-emerald-300",
  },
  draft: {
    word: "draft",
    text: "text-white/45",
    rule: "border-white/20",
    dot: "bg-white/35",
  },
};

/* ── Formatters ───────────────────────────────────────────────────────────── */

/** Runtime as a clock — "0:31", "5:00". Seconds alone read as a file size. */
export function fmtDur(totalS: number): string {
  const m = Math.floor(totalS / 60);
  const s = Math.round(totalS % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Coarse on purpose: a shelf sorted by "last touched" needs the ORDER to be
 *  legible, not the minute. Anything past a fortnight gets a date instead. */
export function relTime(at: number, now: number = Date.now()): string {
  const mins = Math.round((now - at) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days <= 14) return `${days}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ── Leaves ───────────────────────────────────────────────────────────────── */

/** Edit / delete. Present in the DOM at all times (a hover-only control is
 *  invisible to a keyboard); faded until the row is hovered or focused. */
export function RowActions({
  onEdit,
  onDelete,
  title,
}: {
  onEdit: () => void;
  onDelete: () => void;
  title: string;
}) {
  // p-1, not p-1.5: these buttons are in the DOM on every row whether or not
  // they are visible, so their height IS the row height — at p-1.5 they were
  // the thing keeping a one-line row at 41px.
  const btn =
    "cursor-pointer rounded-md border border-white/10 p-1 text-white/45 transition hover:border-white/25 hover:text-white";
  return (
    <span className="flex items-center gap-1.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        aria-label={`Edit ${title}`}
        className={btn}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label={`Delete ${title}`}
        className={`${btn} hover:border-rose-400/40 hover:text-rose-300`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/** The mark on a row the account was HANDED rather than made — see
 *  `isSeeded` in app/_studio/projectSeed.ts.
 *
 *  A WORD, not a tint, because it has to survive the two ways this shelf is
 *  read: colour is never the only signal for a state here, and a row's status
 *  dot already owns the only colour a row carries. Deliberately the quietest
 *  thing on the row — the demo shelf is a product decision, not a warning; it
 *  only has to stop a stranger reading six fictional productions as their own.
 *
 *  Sized `leading-none` on purpose: the tag sits on a lane's title line, and at
 *  text-label's own 1.45 line-height it (16 + 4 + 2 = 22px) stays under the
 *  title's line box instead of setting the line's height.
 *
 *  NO `title=` (Wave 1, 2026-10-08). It carried "An example production this
 *  account was opened with — not your work. Delete it whenever you like." —
 *  the app defining its own word and then granting a permission nobody asked
 *  for. The word is the mark; the `demo N` chip in the toolbar (DemoChip
 *  below) owns the act of clearing them. */
export function DemoTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-jetbrains shrink-0 rounded-full border border-white/15 px-1.5 py-0.5 text-label leading-none text-white/40 ${className}`}
    >
      demo
    </span>
  );
}

/** The mark on a `?seed=N` row (./synthetic.ts): in memory, dev-only, never
 *  stored. Same weight as `DemoTag` — it only has to stop a volume fixture
 *  being read as somebody's work in a screenshot. */
export function SynthTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-jetbrains shrink-0 rounded-full border border-dashed border-white/15 px-1.5 py-0.5 text-label leading-none text-white/35 ${className}`}
    >
      synthetic
    </span>
  );
}

/** The CTA on a shelf that already has work on it. Outlined, not filled: when
 *  there are projects to read, the projects are the hero and the create button
 *  is a tool on the shelf's edge. `EmptyShelf` deliberately draws the SAME
 *  action filled — see the note there. `h-10`: it ends the toolbar row, whose
 *  every other control is a 40px Select trigger. */
export function NewProjectButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`font-jetbrains inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 text-label text-cyan-200 transition hover:bg-cyan-400/20 ${className}`}
    >
      <Plus aria-hidden className="h-4 w-4" />
      New project
    </button>
  );
}

/** THE DEMO SHELF, AS A CHIP (round 2, 2026-10-05).
 *
 *  It was a full-width strip over the shelf: `demo` + "6 rows on this shelf are
 *  examples this account was opened with — open them, edit them, or clear them
 *  out." + a `clear the examples` button. The sentence was the app describing
 *  its own seeding; every one of those rows already wears the `demo` mark
 *  (DemoTag above), so what the strip added was the COUNT and the ACT. This is
 *  both, in the toolbar: the same quiet mark with the number in it, and the
 *  clear behind it.
 *
 *  THE TRIGGER NEVER UNMOUNTS WHILE THE QUESTION IS OPEN, which is the rule the
 *  strip's inline confirm kept for the reason Modal.tsx and ConfirmDelete spend
 *  paragraphs on: a confirm that swaps its own opener out drops a keyboard user
 *  on <body>. The confirm `autoFocus`es (it only ever mounts from a press, so it
 *  cannot steal focus on load), Escape hands focus back to the chip, and when
 *  the last example goes the chip goes with it — the host then puts focus on
 *  the landmark (ProjectsView.tsx#clearExamples).
 *
 *  The question is a statement of consequence, which CLAUDE.md exempts: it
 *  says how many records go, and that is the whole of it. */
export function DemoChip({
  count,
  busy,
  onClear,
  noun = ["project", "projects"],
}: {
  count: number;
  busy: boolean;
  onClear: () => void;
  /** What an example IS on this shelf, singular and plural, for the chip's
   *  accessible name. The Library's audio shelf passes takes (2026-10-05). */
  noun?: readonly [string, string];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const shut = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <span
      ref={root}
      className="relative shrink-0"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          shut();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-label={`${count} example ${count === 1 ? noun[0] : noun[1]}`}
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className={`font-jetbrains inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-label transition disabled:cursor-default disabled:opacity-50 ${
          open
            ? "border-white/30 bg-white/[0.06] text-white/80"
            : "border-white/15 text-white/45 hover:border-white/30 hover:text-white/75"
        }`}
      >
        demo
        <span className="tabular-nums text-white/70">{count}</span>
      </button>
      {open && (
        <span
          role="group"
          aria-label="Clear the examples"
          className="gt-float absolute top-[calc(100%+8px)] right-0 z-50 flex w-max items-center gap-3 rounded-2xl border border-white/10 bg-[var(--gt-ink)]/95 py-2 pr-2 pl-4 shadow-[var(--gt-shadow-float)] backdrop-blur-xl"
        >
          <span className="font-hanken text-content text-white/80">
            Delete {count === 1 ? "the example" : `the ${count} examples`}?
          </span>
          <button
            type="button"
            onClick={shut}
            className="font-jetbrains cursor-pointer rounded-full px-3 py-1 text-label text-white/55 transition hover:bg-white/[0.06] hover:text-white"
          >
            keep
          </button>
          <button
            type="button"
            autoFocus
            onClick={onClear}
            disabled={busy}
            className="font-jetbrains cursor-pointer rounded-full border border-rose-400/40 bg-rose-400/10 px-3 py-1 text-label text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-default disabled:opacity-50"
          >
            {busy ? "clearing…" : "clear them"}
          </button>
        </span>
      )}
    </span>
  );
}

/** Nothing on the shelf yet.
 *
 *  THIS PANEL IS THE PAGE. There is one thing to do on an empty shelf, so the
 *  create button here is FILLED — the only filled control on the screen — while
 *  the two other create paths (the expert form's glyph, the library link under
 *  the shelf) stay outlined and quiet. Weight is the whole fix: measured
 *  2026-09-08 the brightest element on this screen was an amber banner whose
 *  button pointed at /library, i.e. away.
 *
 *  IT ALSO CARRIES THE SPINE, and that is the other half. Drawing the five steps
 *  hollow makes the empty state the same shape as the shelf it becomes rather
 *  than a placeholder for it — and it is the only honest thing this screen
 *  knows about a project that does not exist yet. Round 2 (2026-10-05) redrew
 *  the spine as one race lane — the rail, five hollow gates at the race sheet's
 *  own `GATE_POS`, the finish line — because the matrix cells it used to draw
 *  belong to a shelf that is gone, and on the glass panel every other surface
 *  on this page stands on, not a dashed hole.
 *
 *  THE DEFINITION IS GONE (2026-09-08). Under the headline sat "A project is a
 *  name, a discipline, a template and a target runtime. Everything else —
 *  scenes, frames, cues, the cut — is made inside the studio, one step at a
 *  time." — the app reciting its own data model on the one screen where the
 *  reader is about to be asked for those four things one at a time anyway
 *  (/projects/new asks each as its own stage). `No projects yet.` stays: its
 *  subject is the shelf's contents, not the software. */
export function EmptyShelf({ onCreate, aside }: { onCreate: () => void; aside?: React.ReactNode }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl px-6 pt-14 pb-12 text-center ${SURFACE}`}>
      {/* The expert shortcut, in the panel's corner rather than in its stack:
          reachable on a first-run shelf (an expert with an empty account is
          still an expert), but out of the one column that holds the single
          filled control this screen is built around. */}
      {aside && <span className="absolute top-3 right-3 flex items-center gap-2">{aside}</span>}
      <p className="font-instrument text-3xl text-white/85">No projects yet.</p>

      <HollowLane className="mx-auto mt-10 max-w-2xl" />

      <button
        onClick={onCreate}
        className="font-jetbrains mt-10 inline-flex cursor-pointer items-center gap-2 rounded-full bg-cyan-300 px-6 py-2.5 text-label font-medium text-slate-950 shadow-lg shadow-cyan-400/20 transition hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Plus aria-hidden className="h-4 w-4" />
        New project
      </button>
    </div>
  );
}

/** One race lane with nothing on it: the rail, five gates in their `empty`
 *  colours, the dashed finish line, and — when `labels` — the step names under
 *  the gates they belong to. The same geometry RaceSheet.tsx#Lane draws a real
 *  project on, so an empty shelf and a no-match are the shape of what is not
 *  there rather than a box around nothing. */
export function HollowLane({
  className = "",
  labels = true,
  dim = false,
}: {
  className?: string;
  labels?: boolean;
  dim?: boolean;
}) {
  return (
    <div aria-hidden className={className}>
      <div className="relative h-6">
        <span
          className={`absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 ${dim ? "bg-white/[0.06]" : "bg-white/12"}`}
        />
        <span className="absolute top-0 right-0 bottom-0 border-r border-dashed border-emerald-300/25" />
        {PHASES.map((k, i) => (
          <span
            key={k}
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-[var(--gt-ink)] ${dim ? "border-white/12" : "border-white/30"}`}
            style={{ left: `${GATE_POS(i)}%` }}
          />
        ))}
      </div>
      {labels && (
        <div className="relative mt-2 h-6">
          {PHASES.map((k, i) => (
            <span
              key={k}
              className="font-jetbrains absolute top-0 -translate-x-1/2 text-label whitespace-nowrap text-white/35"
              style={{ left: `${GATE_POS(i)}%` }}
            >
              <span className="text-cyan-200/60">{i + 1}</span> {PHASE_TITLE[k]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
