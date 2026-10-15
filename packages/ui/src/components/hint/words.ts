// THE TWELVE-WORD RULE, as a type (v1 signal README; CLAUDE.md "The twelve-word rule").
// A disclosure past roughly twelve words is the app narrating itself, moved behind a glyph.
// A string literal over twelve words is a compile error at the call site; a computed
// string (a real error, a price) cannot be counted by the checker and is counted at
// runtime by `hintWords`, which the narration gate and the tests use.

export const HINT_WORDS = 12;

type Count<S extends string, N extends readonly unknown[]> = N["length"] extends 13
  ? true
  : S extends `${string} ${infer Rest}`
    ? Count<Rest, [...N, unknown]>
    : false;

/** true when the literal `S` holds more than twelve space-separated words. */
export type OverTwelve<S extends string> = string extends S ? false : Count<S, [unknown]>;

/** Spread into a props type: a required impossible key appears exactly when `S` is too long. */
export type TwelveWords<S extends string> = OverTwelve<S> extends true
  ? { readonly "a hint holds at most twelve words": never }
  : unknown;

export function hintWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}
