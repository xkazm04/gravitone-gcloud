"use client";

// What is left of the v1 /projects shelf's leaves. The shelf, the wizard and the studio retired in
// Phase 4 wave D (they redirect to the Project); two pieces outlived them because two v1 routes not
// yet rebuilt still draw them - `relTime` (app/articles/ArticlesView.tsx) and `DemoChip`
// (app/library/audio/AudioWorkbench.tsx). They move with those routes (Phase 5 Library, Phase 6
// cutover); nothing new imports from here.

import { useEffect, useRef, useState } from "react";

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

/** THE DEMO SHELF, AS A CHIP (round 2, 2026-10-05).
 *
 *  It was a full-width strip over the shelf: `demo` + "6 rows on this shelf are
 *  examples this account was opened with — open them, edit them, or clear them
 *  out." + a `clear the examples` button. The sentence was the app describing
 *  its own seeding; every one of those rows already wears the `demo` mark
 *  (the shelf's DemoTag, retired with it), so what the strip added was the COUNT and the ACT. This is
 *  both, in the toolbar: the same quiet mark with the number in it, and the
 *  clear behind it.
 *
 *  THE TRIGGER NEVER UNMOUNTS WHILE THE QUESTION IS OPEN, which is the rule the
 *  strip's inline confirm kept for the reason Modal.tsx and ConfirmDelete spend
 *  paragraphs on: a confirm that swaps its own opener out drops a keyboard user
 *  on <body>. The confirm `autoFocus`es (it only ever mounts from a press, so it
 *  cannot steal focus on load), Escape hands focus back to the chip, and when
 *  the last example goes the chip goes with it — the host then puts focus on
 *  the landmark.
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
