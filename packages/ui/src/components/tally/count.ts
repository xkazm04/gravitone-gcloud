// THE ONE NUMERAL - a count as every surface draws it: en-US grouping (12,345), fixed so the
// server render and the browser agree whatever the viewer's locale. Tally, the Floor's
// figures, the Library's counts and the model chips all go through it; a second formatter
// under packages/ui/src is a second spelling of the same number (signal.test.ts counts them).
const NUM = new Intl.NumberFormat("en-US");

export const count = (n: number): string => NUM.format(n);
