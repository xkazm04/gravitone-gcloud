// The cull's TEXT tile (CullTile, Zoom over a text/* candidate): a scout finding's claim and quote,
// or a watchlist line, drawn as words where a plate would be - the same button, the same spoken
// name as a plate, and the lens holds the quote whole.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { CullTile, Zoom, kindOf } from "../src/components/cull/CullTile.tsx";

const words = { label: "Hold the subject still and let the camera move", meta: "cinematic · 02-frames", prompt: "pick one: the lens or the actor" };
const media = { url: "", mime: "text/plain" };
const noop = () => undefined;

describe("the text tile", () => {
  test("a text/* candidate is a text cell", () => {
    expect(kindOf("text/plain")).toBe("text");
    expect(kindOf("text/markdown")).toBe("text");
    expect(kindOf("image/png")).toBe("image");
  });

  test("draws the claim, the quote and where it lands, and no media; speaks as a plate does", () => {
    const html = renderToStaticMarkup(h(CullTile, { index: 0, words, media, verdict: { verdict: "keep", reasons: [] }, current: true, nudged: false, onPress: noop }));
    expect(html).toContain(">Hold the subject still and let the camera move<");
    expect(html).toContain(">pick one: the lens or the actor<");
    expect(html).toContain(">cinematic · 02-frames<");
    expect(html).not.toMatch(/<img|<video/);
    expect(html).toContain('role="gridcell"');
    expect(html).toContain('aria-label="Hold the subject still and let the camera move cinematic · 02-frames, keep"');
  });

  test("the lens shows the quote whole", () => {
    const long = { ...words, prompt: "a quote long enough that the tile clamps it to three lines, ".repeat(6).trim() };
    const html = renderToStaticMarkup(h(Zoom, { words: long, media, verdict: undefined, position: "7/9", onClose: noop, specimen: true }));
    expect(html).toContain(`<blockquote`);
    expect(html).toContain(long.prompt);
    expect(html).not.toMatch(/<img|<video/);
  });
});
