// Class composition for CSS Modules. A module's map is typed as an index (css-modules.d.ts),
// so a lookup is `string | undefined` until the build resolves it; this drops the misses
// instead of rendering the word "undefined" into a class attribute.
export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join(" ");
}
