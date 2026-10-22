// The opened run's ONE live model (spark game-3d-assets WP4, Director's ruling): in the mosaic's
// RunModal the cell under the cursor, when it is a model, is the viewer's host and every other cell
// is a poster - so one WebGL context exists at a time, and it follows the cursor. The mosaic's run
// card never hosts one. Rendered without a browser: the host is the `data-live-model` cell (the
// canvas itself mounts only client-side, behind the viewer's lazy boundary).
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { RunFace } from "../../packages/ui/src/components/cull/RunCard.tsx";
import { RunView } from "../../packages/ui/src/components/cull/RunView.tsx";

const POSTER = "data:image/svg+xml,%3Csvg%2F%3E";
const cells = [
  { id: "c-05/t1", row: "c-05" },
  { id: "c-05/t2", row: "c-05" },
];
const run = { row: "c-05", words: { id: "c-05", label: "character · hooded archer", group: "3d" }, members: [0, 1], group: "3d" };
const mediaOf = (id: string) => ({ url: `/api/foundry/file?kind=mesh&run=hero&path=${id.slice(5)}.glb`, mime: "model/gltf-binary" });
const wordsOf = (id: string) => ({ label: id.endsWith("t1") ? "T1 · budget generation" : "T2 · game-camera design", meta: "18,000 / 40,000 tris", poster: POSTER });
const view = (cur: number) => renderToStaticMarkup(h(RunView, { run, cells, verdicts: {}, mediaOf, wordsOf, cur, nudged: new Set<number>(), onPress: () => undefined }));
const live = (html: string): string[] => [...html.matchAll(/data-tile="(\d+)"[^>]*data-live-model=""/g)].map((m) => m[1] ?? "");

describe("the opened run's live model", () => {
  test("exactly one cell hosts the viewer - the current one - and the other is its poster", () => {
    const at0 = view(0);
    expect(live(at0)).toEqual(["0"]);
    expect(at0).toMatch(/<button[^>]*data-tile="1"/);
    expect(at0.match(/<img[^>]*src="data:image\/svg\+xml/g)?.length).toBe(1);
    // The cursor moves the host: the old cell is a poster again.
    const at1 = view(1);
    expect(live(at1)).toEqual(["1"]);
    expect(at1).toMatch(/<button[^>]*data-tile="0"/);
  });

  test("the host is not a button (the viewer's toggles are) and takes no focus on a press", () => {
    const html = view(0);
    expect(html).toMatch(/<div[^>]*role="gridcell"[^>]*aria-selected="true"[^>]*aria-label="T1 · budget generation 18,000 \/ 40,000 tris"[^>]*data-live-model|<div[^>]*data-tile="0"[^>]*data-live-model/);
    const src = readFileSync(path.resolve(import.meta.dirname, "../../packages/ui/src/components/cull/RunModelTile.tsx"), "utf8");
    expect(src).toContain("onMouseDown={(e) => e.preventDefault()}");
    expect(src).toMatch(/lazy\(\(\) => import\("\.\.\/model\/ModelViewer\.tsx"\)/);
  });

  test("a non-model cell under the cursor is the ordinary tile", () => {
    const html = renderToStaticMarkup(h(RunView, { run, cells, verdicts: {}, mediaOf: () => ({ url: "/a.png", mime: "image/png" }), wordsOf, cur: 0, nudged: new Set<number>(), onPress: () => undefined }));
    expect(live(html)).toEqual([]);
  });

  test("the mosaic's card never hosts a viewer", () => {
    const html = renderToStaticMarkup(h(RunFace, { run: { ...run, words: undefined }, cells, mediaOf, wordsOf }));
    expect(html).not.toMatch(/data-live-model|data-model-state|<canvas/);
  });
});
