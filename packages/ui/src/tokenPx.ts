// A TOKEN AS A NUMBER OF PIXELS, for the few places that lay out in numbers rather than in CSS (an SVG's geometry, a
// virtual list's row height). Since the design baseline (P1, 2026-11-17) some lengths are `clamp(min, fluid, max)`,
// and Number.parseFloat of a clamp is NaN - the Scout's stage graph drew `width="NaN"`. A clamp reads as its floor:
// the size at the narrowest viewport, the one a layout in numbers must still fit (the same rule
// tests/next-gates/rail-more-target.test.ts reads a clamp by). Anything that is not a length is a thrown error at
// module load, not a NaN carried into the DOM.
import { tokens, type TokenName } from "./tokens.ts";

export function lengthPx(value: string): number {
  const v = value.trim();
  const inner = /^clamp\(\s*([^,]+),/.exec(v)?.[1] ?? v;
  const n = Number.parseFloat(inner);
  if (!Number.isFinite(n) || !/^-?[\d.]+px$/.test(inner.trim())) throw new Error(`not a px length: ${value}`);
  return n;
}

export const tokenPx = (name: TokenName): number => lengthPx(tokens[name]);
