// The 3D viewer and the Board's model cell (spark game-3d-assets WP3), rendered without a browser:
// three is behind one lazy boundary that no tile crosses, the server render is the honest loading
// state over the poster, a browser without WebGL is told so, and a model tile never mounts a canvas.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { CullTile, kindOf, Zoom } from "../src/components/cull/CullTile.tsx";
import { RunFace } from "../src/components/cull/RunCard.tsx";
import { hasWebGL, ModelViewer, type CanvasMaker } from "../src/components/model/ModelViewer.tsx";

const SRC = path.resolve(import.meta.dirname, "../src");
const noop = () => undefined;
const POSTER = "data:image/svg+xml;utf8,%3Csvg%2F%3E";
const words = { label: "hooded archer · T2", meta: "character · 108 tris · T2", poster: POSTER };
const media = { url: "data:model/gltf-binary;base64,Z2xURg==", mime: "model/gltf-binary" };

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
}

describe("the lazy boundary", () => {
  test("only ModelStage imports three or @react-three, and only ModelViewer reaches it, by a dynamic import", () => {
    const importers = walk(SRC).filter((f) => /from "(three|@react-three\/fiber)["/]/.test(readFileSync(f, "utf8")));
    expect(importers.map((f) => path.relative(SRC, f).replace(/\\/g, "/"))).toEqual(["components/model/ModelStage.tsx"]);
    const reachers = walk(SRC).filter((f) => /ModelStage(\.tsx)?["']/.test(readFileSync(f, "utf8")) && !f.endsWith("ModelStage.tsx"));
    expect(reachers.map((f) => path.basename(f))).toEqual(["ModelViewer.tsx"]);
    const viewer = readFileSync(path.join(SRC, "components/model/ModelViewer.tsx"), "utf8");
    expect(viewer).toMatch(/lazy\(\(\) => import\("\.\/ModelStage\.tsx"\)\)/);
    expect(viewer).not.toMatch(/^import [^;]*ModelStage/m);
  });
});

describe("ModelViewer", () => {
  test("renders on the server as loading over the poster, with the measured counts and no canvas", () => {
    const html = renderToStaticMarkup(h(ModelViewer, { src: media.url, title: "hooded archer", poster: POSTER, tris: 18_000, bones: 23 }));
    expect(html).toContain('data-model-state="loading"');
    expect(html).toContain('aria-label="hooded archer, 3D model"');
    expect(html).toContain(`src="${POSTER.replace(/&/g, "&amp;")}"`);
    expect(html).toContain(">loading<");
    expect(html).toContain("18,000");
    expect(html).toContain(">bones<");
    expect(html).not.toContain("<canvas");
  });

  test("offers no toggle before there is a stage to toggle, and no bones chip for a static mesh", () => {
    const html = renderToStaticMarkup(h(ModelViewer, { src: media.url, title: "rune axe", tris: 48, bones: 0 }));
    expect(html).toContain(">tris<");
    expect(html).not.toContain(">wireframe<");
    expect(html).not.toContain(">bones<");
  });

  test("hasWebGL asks the browser for a context and says no when it has none, or throws", () => {
    const doc = (ctx: unknown): CanvasMaker => ({ createElement: () => ({ getContext: () => ctx }) });
    expect(hasWebGL(doc({}))).toBe(true);
    expect(hasWebGL(doc(null))).toBe(false);
    const broken: CanvasMaker = {
      createElement: () => {
        throw new Error("no canvas");
      },
    };
    expect(hasWebGL(broken)).toBe(false);
  });
});

describe("a model cell on the Board", () => {
  test("model/* is its own kind", () => {
    expect(kindOf("model/gltf-binary")).toBe("model");
  });

  test("the tile draws the poster, never a canvas, and speaks as a plate does", () => {
    const html = renderToStaticMarkup(h(CullTile, { index: 0, words, media, verdict: undefined, current: true, nudged: false, onPress: noop }));
    expect(html).toMatch(/<img[^>]*src="data:image\/svg\+xml/);
    expect(html).not.toContain(media.url);
    expect(html).not.toMatch(/<canvas|data-model-state/);
    expect(html).toContain("· 3D");
    expect(html).toContain('aria-label="hooded archer · T2 character · 108 tris · T2"');
  });

  test("a model with no poster is its words, still no canvas", () => {
    const html = renderToStaticMarkup(h(CullTile, { index: 0, words: { label: words.label, meta: words.meta }, media, verdict: undefined, current: false, nudged: false, onPress: noop }));
    expect(html).not.toMatch(/<img|<canvas/);
    expect(html).toContain(">hooded archer · T2<");
  });

  test("the lens reaches the viewer lazily: before it arrives it shows the poster, never the glb as a picture", () => {
    const html = renderToStaticMarkup(h(Zoom, { words, media, verdict: undefined, position: "3/4", onClose: noop, specimen: true }));
    expect(html).toMatch(/<img[^>]*src="data:image\/svg\+xml/);
    expect(html).not.toContain(media.url);
    const tile = readFileSync(path.join(SRC, "components/cull/CullTile.tsx"), "utf8");
    expect(tile).toMatch(/lazy\(\(\) => import\("\.\.\/model\/ModelViewer\.tsx"\)/);
    expect(tile).not.toMatch(/^import [^;]*ModelViewer/m);
  });

  test("a model run's card is its poster", () => {
    const run = { row: "hooded-archer", words: undefined, members: [0], group: "3d" };
    const html = renderToStaticMarkup(h(RunFace, { run, cells: [{ id: "c-1", row: "hooded-archer" }], mediaOf: () => media, wordsOf: () => words }));
    expect(html).toMatch(/<img[^>]*src="data:image\/svg\+xml/);
    expect(html).not.toMatch(/<canvas/);
  });
});
