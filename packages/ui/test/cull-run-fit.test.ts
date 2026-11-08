// FIVE FRAMES, ONE SCREEN (perfect, five-frames-one-screen): a run of four to six cells shares the opened run's
// body in two rows (no 42vh floor, so nothing falls below the fold); one to three are as they were, and a run
// past six keeps rows of their own height and scrolls.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { Cell } from "../src/board/cull.ts";
import { FIT, RunView } from "../src/components/cull/RunView.tsx";

const noop = () => undefined;
function view(n: number): string {
  const cells: Cell[] = Array.from({ length: n }, (_, i) => ({ id: `f${i}`, row: "r" }));
  return renderToStaticMarkup(
    h(RunView, {
      run: { row: "r", words: undefined, members: cells.map((_, i) => i), group: "storyboards" },
      cells,
      verdicts: {},
      mediaOf: (id: string) => ({ url: `/${id}.png`, mime: "image/png" }),
      wordsOf: (id: string) => ({ label: id }),
      cur: 0,
      nudged: new Set<number>(),
      reasons: { list: [], meaning: {}, max: 1 } as never,
      onFocus: noop,
      onVerdict: noop,
    }),
  );
}
const classes = (html: string) => (/role="grid"/.exec(html) === null ? "" : (/class="([^"]*)"[^>]*role="grid"/.exec(html)?.[1] ?? ""));

describe("how many rows a run takes in the opened run", () => {
  test("a run fits at six", () => expect(FIT).toBe(6));
  test("four to six cells are the two-row fit, not the scrolling one", () => {
    for (const n of [4, 5, 6]) {
      expect(classes(view(n)), `${n} cells`).toMatch(/runTilesFit/);
      expect(classes(view(n)), `${n} cells`).not.toMatch(/runTilesMany/);
    }
  });
  test("up to three cells are unchanged, and past six the rows keep scrolling", () => {
    for (const n of [1, 2, 3]) expect(classes(view(n)), `${n} cells`).not.toMatch(/runTilesFit|runTilesMany/);
    expect(classes(view(7))).toMatch(/runTilesMany/);
    expect(classes(view(7))).not.toMatch(/runTilesFit/);
  });
});
