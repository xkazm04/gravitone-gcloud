// THE TWELVE-WORD RULE, as a type (v1 signal README; CLAUDE.md "The twelve-word rule").
// A disclosure past roughly twelve words is the app narrating itself, moved behind a glyph.
// A string literal over twelve words is a compile error at the call site; a computed
// string (a real error, a price) cannot be counted by the checker and is counted at
// runtime by `hintWords`, which the narration gate and the tests use.

export const HINT_WORDS = 12;

// The type counts as `hintWords` does: any run of whitespace is one break, and a leading or
// trailing run is no word. It used to split on single spaces only, so thirteen words joined by
// line breaks compiled (the runtime counter said 13) and a double space was counted as a word.
type Spaced<S extends string> = S extends `${infer A}\n${infer B}`
  ? Spaced<`${A} ${B}`>
  : S extends `${infer A}\r${infer B}`
    ? Spaced<`${A} ${B}`>
    : S extends `${infer A}\t${infer B}`
      ? Spaced<`${A} ${B}`>
      : S;

type Count<S extends string, N extends readonly unknown[]> = N["length"] extends 13
  ? true
  : S extends ` ${infer Rest}`
    ? Count<Rest, N>
    : S extends `${string} ${infer Rest}`
      ? Count<Rest, [...N, unknown]>
      : S extends ""
        ? false
        : [...N, unknown]["length"] extends 13
          ? true
          : false;

/** true when the literal `S` holds more than twelve words. A union is over when any member is
 *  (`boolean`), since a ternary shows one branch at a time. */
export type OverTwelve<S extends string> = string extends S ? false : Count<Spaced<S>, []>;

/** Spread into a props type: a required impossible key appears exactly when `S` - or any
 *  member of a union `S` - is too long. `true extends` and not `extends true`: a union's
 *  OverTwelve is `boolean`, which `extends true` reads as false and let through. */
export type TwelveWords<S extends string> = true extends OverTwelve<S>
  ? { readonly "a hint holds at most twelve words": never }
  : unknown;

export function hintWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}
