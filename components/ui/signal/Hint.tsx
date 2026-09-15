"use client";

// THE DISCLOSURE — one glyph, one popover, one spelling.
//
// This is the linchpin of the signal vocabulary. Five independent route audits
// each arrived at the same instinct — "move that sentence into `title=`" — and
// native `title` is the wrong destination four ways over: it waits about a
// second before it appears, it does not exist on touch, it cannot be styled or
// measured, and screen readers expose it inconsistently. Worst of all it is
// UNBOUNDED, so it invites keeping the paragraph. This repo already shows that:
//
//   app/foundry/ExtractView.tsx:609   a three-sentence `title=` on a checkbox
//                                     ("Every image becomes its own style; its
//                                     recipe is written by the vision model…")
//   app/_phases/score/ScoreSpotting.tsx:77-81
//                                     NO_TEMPO_WHY, a four-sentence constant
//                                     written once precisely because it is used
//                                     as a tooltip in three places
//   app/_phases/script/_matrix/shared.tsx:143-147
//                                     a three-sentence methodology footnote
//                                     printed permanently under three tabs
//   app/_phases/_shared/notebook/Chips.tsx:24,58
//                                     two more `title=` paragraphs on chips
//
// A HINT IS NOT A LICENCE TO KEEP THE PARAGRAPH. That is the whole point and it
// is the easiest thing to get wrong: moving a 60-word explanation behind a glyph
// hides it, it does not delete it, and the next reader inherits the same
// narration one click further away. The working rule, stated here and in the
// README:
//
//   If the disclosure runs past roughly TWELVE WORDS it is almost certainly
//   still the app narrating itself. Delete it instead.
//
// What survives that test is a real constraint, a real limit, a real number, a
// real vendor rule — the work, not the app talking about itself. Two of the four
// sites above pass it after a trim; two do not and should simply go.
//
// ── Behaviour ──────────────────────────────────────────────────────────────
// Opens on hover, on focus, and on click/tap (so a touch device and a keyboard
// reach the same content a mouse does). Closes on Escape, on blur out of the
// group, and on a pointer down outside it. The popover is the glass surface,
// capped at ~34ch, and flips from above to below when the trigger sits near the
// top of the viewport — a single measurement taken in the OPEN handler, not in
// an effect, so nothing here writes state during a render pass.
//
// The description element is ALWAYS in the DOM. When closed it is `sr-only`
// rather than unmounted, which is what makes `aria-describedby` resolve at all
// times: a screen-reader user hears the disclosure when the trigger takes focus,
// without having to discover that there is something to open. Field.tsx's
// NumberInput makes the same argument about its unit span.
//
// No colour literal, no JS-driven animation (so nothing to guard for
// `prefers-reduced-motion` — see components/ui/deck/motionGuard.ts for the case
// that does need one).

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { AlertTriangle, Info, Keyboard, Lock } from "lucide-react";

export type HintVariant = "info" | "lock" | "warn" | "keys";
export type HintTone = "inherit" | "cyan" | "amber" | "rose";

/** Where the popover ended up, decided once per open. */
type HintSide = "top" | "bottom";
type HintAlign = "start" | "center" | "end";

/** The trigger is this tall, so the flip threshold knows what it is clearing. */
const FLIP_MARGIN_PX = 200;
/** How close to a viewport edge the trigger's centre may sit before the popover
 *  stops centring on it and hugs that edge instead. ~34ch is about 300px. */
const EDGE_MARGIN_PX = 180;

/**
 * The disclosure state machine, without the glyph.
 *
 * Exported because <TabRail> needs the SAME disclosure hung on a different
 * trigger: a disabled tab explains itself, and a <Hint> button nested inside a
 * `role="tab"` button would be interactive content inside a <button> — invalid
 * HTML, and a second focusable child inside a `tablist` that owns only tabs. So
 * the tab itself becomes the trigger. One spelling of the behaviour, two
 * triggers; the alternative was TabRail growing a private copy of this file.
 */
export function useHint() {
  const hintId = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ side: HintSide; align: HintAlign }>({
    side: "top",
    align: "center",
  });
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  /** Measure in the handler that opens, never in an effect. A layout effect that
   *  measures and then calls setState is exactly the `set-state-in-effect`
   *  shape this repo's lint ratchet freezes at ten. */
  const show = useCallback(() => {
    const el = triggerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const centre = r.left + r.width / 2;
      setPos({
        side: r.top < FLIP_MARGIN_PX ? "bottom" : "top",
        align:
          centre < EDGE_MARGIN_PX
            ? "start"
            : window.innerWidth - centre < EDGE_MARGIN_PX
              ? "end"
              : "center",
      });
    }
    setOpen(true);
  }, []);

  const hide = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => (open ? hide() : show()), [open, hide, show]);

  // Outside pointer-down. Only mounted while open, so a page full of hints
  // costs one listener between them all rather than one each.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  /** Spread on the positioning wrapper. It must be `relative` and `inline-flex`;
   *  `hintRootClass` is that, so callers do not re-derive it. */
  const rootProps = {
    ref: rootRef,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: (e: React.FocusEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.stopPropagation();
        setOpen(false);
      }
    },
  };

  /** Spread on the element that owns the description — the glyph button, or a
   *  tab. `ref` is here so `show()` has something to measure. */
  const triggerProps = {
    ref: triggerRef,
    "aria-describedby": hintId,
  };

  return { hintId, open, pos, show, hide, toggle, rootProps, triggerProps };
}

export type HintDisclosure = ReturnType<typeof useHint>;

/** The wrapper class the disclosure's positioning assumes. */
export const hintRootClass = "relative inline-flex items-center";

const SIDE: Record<HintSide, string> = {
  top: "bottom-full mb-2",
  bottom: "top-full mt-2",
};
const ALIGN: Record<HintAlign, string> = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
};

/**
 * The popover itself. Always rendered; `sr-only` when closed so that
 * `aria-describedby` never dangles and the content is announced on focus.
 */
export function HintPopover({
  d,
  children,
}: {
  d: HintDisclosure;
  children: React.ReactNode;
}) {
  return (
    <span
      id={d.hintId}
      role="tooltip"
      className={
        d.open
          ? `glass-panel gt-float absolute z-50 w-max max-w-[34ch] rounded-xl px-3 py-2 text-left text-label leading-snug font-normal tracking-normal whitespace-normal text-white/85 normal-case ${SIDE[d.pos.side]} ${ALIGN[d.pos.align]}`
          : "sr-only"
      }
    >
      {children}
    </span>
  );
}

const GLYPH: Record<HintVariant, typeof Info> = {
  info: Info,
  lock: Lock,
  warn: AlertTriangle,
  keys: Keyboard,
};

/** What the glyph is called when the caller does not say. A trigger with no
 *  accessible name is a button announced as "button". */
const DEFAULT_LABEL: Record<HintVariant, string> = {
  info: "More about this",
  lock: "Why this is locked",
  warn: "What to watch for",
  keys: "Keyboard shortcuts",
};

const TONE: Record<HintTone, string> = {
  inherit: "text-current opacity-55 hover:opacity-100",
  cyan: "text-cyan-300/75 hover:text-cyan-200",
  amber: "text-amber-300/80 hover:text-amber-200",
  rose: "text-rose-300/80 hover:text-rose-200",
};

/**
 * A small glyph that discloses one short thing on hover, focus or tap.
 *
 * ```tsx
 * <Hint>a bar is 4 beats at the cue's tempo</Hint>
 * <Hint variant="lock" tone="amber">locked sheets take no new proofs</Hint>
 * ```
 */
export function Hint({
  children,
  label,
  variant = "info",
  tone = "inherit",
  className = "",
}: {
  /** The disclosure. Past ~12 words it is narration — delete it instead. */
  children: React.ReactNode;
  /** The glyph's accessible name. Defaults per variant. */
  label?: string;
  variant?: HintVariant;
  tone?: HintTone;
  className?: string;
}) {
  const d = useHint();
  const Glyph = GLYPH[variant];
  return (
    <span {...d.rootProps} className={`${hintRootClass} ${className}`}>
      <button
        type="button"
        {...d.triggerProps}
        aria-label={label ?? DEFAULT_LABEL[variant]}
        onClick={d.toggle}
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 ${TONE[tone]}`}
      >
        <Glyph className="h-3.5 w-3.5" aria-hidden />
      </button>
      <HintPopover d={d}>{children}</HintPopover>
    </span>
  );
}
