"use client";

// Shared leaves for every /projects variant. The three surfaces differ in how
// they ARRANGE a shelf of projects; they must not differ on what a blocked step
// looks like, how "2h ago" is spelled, or where the edit affordance lives.
//
// No colour literal: the cyan / emerald / amber / rose alpha utilities here are
// the rendered form of the accents and status colours already declared in
// components/ui/tokens.ts and used across the phase surfaces (rose = refused,
// amber = needs a call, emerald = locked).

import { Pencil, Plus, Trash2 } from "lucide-react";

import type { PhaseKey, Project, ProjectState } from "@/lib/projects";

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

/* ── The shelf's contract ─────────────────────────────────────────────────── */

/** What a shelf surface is handed. It outlived the three variants it was
 *  written for: the host still owns navigation, creation and deletion, and the
 *  surface still owns nothing but the drawing. */
export type ShelfProps = {
  projects: Project[];
  /** Open a project. `step` opens it AT that step — the matrix passes the
   *  column you clicked, so reading down a column and diving in is one move. */
  onOpen: (p: Project, step?: PhaseKey) => void;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
  onCreate: () => void;
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

/** The one CTA on this page. Same affordance in all three variants — they
 *  differ on where it sits, never on what it is. */
export function NewProjectButton({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`font-jetbrains inline-flex cursor-pointer items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-1.5 text-[12px] text-cyan-200 transition hover:bg-cyan-400/20 ${className}`}
    >
      <Plus className="h-3.5 w-3.5" />
      New project
    </button>
  );
}

/** Nothing on the shelf yet. Shared so all three variants say it the same way. */
export function EmptyShelf({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/12 px-6 py-16 text-center">
      <p className="font-instrument text-2xl text-white/80">No projects yet.</p>
      <p className="font-hanken mx-auto mt-2 max-w-sm text-base text-slate-400">
        A project is a name, a template and a target runtime. Everything else — scenes, frames, cues,
        the cut — is made inside the studio.
      </p>
      <button
        onClick={onCreate}
        className="font-jetbrains mt-6 cursor-pointer rounded-full border border-cyan-400/40 bg-cyan-400/10 px-5 py-2 text-[12px] text-cyan-200 transition hover:bg-cyan-400/20"
      >
        New project
      </button>
    </div>
  );
}
