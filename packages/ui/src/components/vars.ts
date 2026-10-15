// Data that rides into a stylesheet as a custom property: a segment's count, a bar's share.
// Never a design value - those are classes over tokens - only the numbers a view is OF.
import type { CSSProperties } from "react";

export type CssVars = CSSProperties & { readonly [k: `--${string}`]: number | string };

export function vars(v: { readonly [k: `--${string}`]: number | string }): CssVars {
  return v;
}
