"use client";

// THE ROOT ERROR BOUNDARY'S BUTTON (app/error.tsx) - what is left of v1's design-system primitives.
// L74 swept what nothing live reached: `Eyebrow`, `Panel`, `Waveform` and `Wordmark` had no caller
// after the cutover, and with `Waveform` gone so did its bar field (components/ui/Equalizer.tsx);
// `Button`'s Almanac branch read a world (components/ui/world.tsx) no provider ever set, so it was
// dead code and the world module went too. The (studio) shell draws its own (@gt/ui Button); this
// one serves the boundary that renders inside the root layout, outside that shell.

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  /** `sm` is the compact control that sits inside a strip or beside a row. */
  size?: "md" | "sm";
};

/** Primary = cyan glow; ghost = mono hairline. */
export function Button({ variant = "primary", size = "md", className = "", children, ...rest }: BtnProps) {
  // The focus ring is explicit here rather than left to the `@layer base`
  // `:focus-visible` default in globals.css: this is the shared CTA, it sits on
  // its own cyan glow, and the 2px offset is what keeps the ring legible
  // against that halo. Colour still comes from the base rule (--gt-accent-cyan)
  // so no colour literal leaves tokens.ts.
  //
  // `gt-glow` is that halo, and it is the SHARED definition (globals.css, off
  // --gt-shadow-glow), never a box-shadow literal re-deriving the token layer.
  const base =
    "rounded-full px-6 py-3 text-label font-semibold transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";
  const styles =
    variant === "primary"
      ? "gt-glow bg-gradient-to-r from-cyan-300 to-cyan-200 text-slate-950 hover:brightness-110"
      : variant === "danger"
        ? "font-jetbrains border border-rose-400/40 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
        : "font-jetbrains border border-white/15 text-white/85 hover:bg-white/5";
  // `type="button"` FIRST, so it is a default a caller can still override with
  // `type="submit"` through `...rest`: a <button> with no type is a SUBMIT button.
  return (
    <button type="button" className={`${base} ${styles} ${size === "sm" ? "px-3 py-1" : ""} ${className}`} {...rest}>
      {children}
    </button>
  );
}
