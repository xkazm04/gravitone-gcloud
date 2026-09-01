"use client";

import { SURFACE } from "./tokens";
import { EqBars, usePauseOffscreen, type BarColor } from "./Equalizer";

/** The eyebrow pill's class list. Module-local: it was exported for a
 *  `StudioDark` surface that has never existed in this repo (it belonged to the
 *  app this design system was ported from) and nothing here ever imported it.
 *  If a surface does need the pill without <Eyebrow>'s dot, export it then. */
const EYEBROW_CLASS =
  "font-jetbrains inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/5 px-3 py-1 text-label uppercase tracking-[0.18em] text-cyan-300";

/** Mono uppercase eyebrow pill with a live dot. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className={EYEBROW_CLASS}>
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
      {children}
    </span>
  );
}

/** Glass panel — the core surface for every module. */
export function Panel({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
}) {
  return <Tag className={`${SURFACE} rounded-2xl ${className}`}>{children}</Tag>;
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

/** Primary = cyan glow; ghost = mono hairline. */
export function Button({ variant = "primary", className = "", children, ...rest }: BtnProps) {
  // The focus ring is explicit here rather than left to the `@layer base`
  // `:focus-visible` default in globals.css: this is the shared CTA, it sits on
  // its own cyan glow, and the 2px offset is what keeps the ring legible
  // against that halo. Colour still comes from the base rule (--gt-accent-cyan)
  // so no colour literal leaves tokens.ts.
  //
  // `gt-glow` is that halo, and it is the SHARED definition (globals.css, off
  // --gt-shadow-glow). It used to be a raw box-shadow literal typed out here at
  // the exact opacity --gt-glow-cyan already held — a design-system primitive
  // re-deriving the token layer, which is the one thing tokens.ts exists to
  // stop.
  const base =
    "rounded-full px-6 py-3 text-label font-semibold transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";
  const styles =
    variant === "primary"
      ? "gt-glow bg-gradient-to-r from-cyan-300 to-cyan-200 text-slate-950 hover:brightness-110"
      : "font-jetbrains border border-white/15 text-white/85 hover:bg-white/5";
  // `type="button"` FIRST, so it is a default a caller can still override with
  // `type="submit"` through `...rest`. A <button> with no type is a SUBMIT
  // button, which makes the shared CTA of this design system a form-submitter
  // by accident the first time one is placed inside a <form>. The repo already
  // shows the reflex this belongs to: the one form it has (ProjectDialog) hand-
  // writes type="button" on its raw style pills. A primitive should carry that,
  // not each call site.
  return (
    <button type="button" className={`${base} ${styles} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Live equalizer / waveform. Decorative keyframe when nothing is playing; real
 *  amplitude off the AudioBus the moment a source is registered (see EqBars).
 *  Reduced motion is honoured at the bus + in globals.css, and the keyframe
 *  stops entirely once the field scrolls out of view (usePauseOffscreen). */
export function Waveform({
  bars = 28,
  className = "",
  color = "cyan",
}: {
  bars?: number;
  className?: string;
  color?: BarColor;
}) {
  const { ref, paused } = usePauseOffscreen<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`flex items-end gap-[3px] ${paused ? "anim-paused" : ""} ${className}`}
      aria-hidden
    >
      <EqBars bars={bars} color={color} height="100%" />
    </div>
  );
}

/** Wordmark. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5">
        <Waveform bars={4} className="h-3.5 w-4" />
      </span>
      <span className="font-instrument text-2xl tracking-tight text-white">Gravitone</span>
    </div>
  );
}
