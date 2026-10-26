// A STORYBOARD ON THE CULL (spark scout-storyboards WP4b): its words card reads the paragraph as a paragraph
// and its `- ` lines as a list (WordsBody, no markdown dependency); its run files under a storyboards tab of
// its own; and the opened run's head leaves out the paragraph its words card already shows.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { parseAt } from "@gt/domain/door";
import { candidateIdSchema, packetIdSchema } from "@gt/domain/ids";
import { reasonVocabulary } from "@gt/domain/source";

import { CATEGORIES, TABS, categoryOf, inWordsCard, runsOf, tabOf } from "../src/board/runs.ts";
import { MatrixCull } from "../src/components/cull/MatrixCull.tsx";
import { wordsSpan } from "../src/components/cull/RunView.tsx";
import { VariantCard } from "../src/components/cull/VariantCard.tsx";
import { wordBlocks } from "../src/components/cull/WordsBody.tsx";

const PARAGRAPH = "A night watchman climbs a stairwell after a lantern that will not let him catch it.";
const BODY = `${PARAGRAPH}\n\n- beats: the lantern moves, the chase\n- format: a 30 s vertical short`;
const noop = () => undefined;

describe("the words parser", () => {
  test("a paragraph, a blank line, then `- ` lines: one paragraph and one list", () => {
    expect(wordBlocks(BODY)).toEqual([
      { kind: "p", text: PARAGRAPH },
      { kind: "list", items: ["beats: the lantern moves, the chase", "format: a 30 s vertical short"] },
    ]);
  });

  test("a quote with no `- ` line is one paragraph; lines join, blank lines split, a list may come first", () => {
    expect(wordBlocks("pick one: the lens or the actor")).toEqual([{ kind: "p", text: "pick one: the lens or the actor" }]);
    expect(wordBlocks("one\ntwo\n\nthree")).toEqual([
      { kind: "p", text: "one two" },
      { kind: "p", text: "three" },
    ]);
    expect(wordBlocks("- a\n- b\nafter")).toEqual([
      { kind: "list", items: ["a", "b"] },
      { kind: "p", text: "after" },
    ]);
    expect(wordBlocks("")).toEqual([]);
    // A hyphen with no space is a word, not an item.
    expect(wordBlocks("-dash")).toEqual([{ kind: "p", text: "-dash" }]);
  });

  test("the words card draws the paragraph and the bullets as a list", () => {
    const html = renderToStaticMarkup(
      h(VariantCard, { index: 4, words: { label: "The lantern that keeps three steps ahead", meta: "idea: Lantern-lit stairwell · 4 frames · local · free", prompt: BODY }, media: { url: "", mime: "text/plain" }, verdict: undefined, current: false, nudged: false, reasons: reasonVocabulary("scout"), onFocus: noop, onVerdict: noop }),
    );
    expect(html).toContain(`>${PARAGRAPH}<`);
    expect(html).toContain('role="list"');
    expect(html.match(/role="listitem"/g)).toHaveLength(2);
    expect(html).toContain(">beats: the lantern moves, the chase<");
    expect(html).not.toContain("- beats");
    expect(html).not.toMatch(/<img|<video/);
  });
});

describe("the storyboards tab", () => {
  test("a storyboards run is its own category and its own tab, after ideas", () => {
    expect(CATEGORIES.indexOf("storyboards")).toBe(CATEGORIES.indexOf("ideas") + 1);
    expect(TABS.at(-1)).toBe("storyboards");
    const [run] = runsOf([{ id: "c-10/panel-1", row: "c-10" }], [{ id: "c-10", label: "board", group: "storyboards" }]);
    if (run === undefined) throw new Error("no run");
    expect(tabOf(categoryOf(run, "image/png"))).toBe("storyboards");
  });

  test("the paragraph is in the words card, so the head need not say it; a still's prompt is not", () => {
    const cells = [
      { id: "c-10/panel-1", row: "c-10" },
      { id: "c-10/words", row: "c-10" },
    ];
    const [run] = runsOf(cells, [{ id: "c-10", label: "board", group: "storyboards", prompt: PARAGRAPH }]);
    if (run === undefined) throw new Error("no run");
    const mime = (id: string) => (id.endsWith("/words") ? "text/plain" : "image/png");
    const words = (id: string) => (id.endsWith("/words") ? { label: "board", prompt: BODY } : { label: "frame 1", prompt: "a lone figure" });
    expect(inWordsCard(run, cells, mime, words, PARAGRAPH)).toBe(true);
    expect(inWordsCard(run, cells, mime, words, "a lone figure")).toBe(false);
  });
});

describe("the opened board's rows", () => {
  test("the words card closes the row its stills began, else takes a row of its own", () => {
    // 4 frames: the 4th frame and the words share row 2; 5 frames: the words close row 2; 2 frames: row 1.
    expect(wordsSpan(4, 3)).toBe(2);
    expect(wordsSpan(5, 3)).toBe(1);
    expect(wordsSpan(2, 3)).toBe(1);
    expect(wordsSpan(1, 2)).toBe(1);
    // 3 frames: the row is full, so the words take one of their own.
    expect(wordsSpan(3, 3)).toBeUndefined();
  });
});

describe("a storyboards tab on the desk", () => {
  const must = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
    if (!r.ok) throw new Error("test value refused");
    return r.value;
  };
  const item = (id: string, row: string, mime: string) => ({ id: must(parseAt("test", candidateIdSchema, id)), row, url: `/${id}`, media: { sha256: "0".repeat(64), bytes: 1, mime }, grades: [] });

  test("a board with frames is a 16:9 card; a dry board's words are decided in a list under it", () => {
    const html = renderToStaticMarkup(
      h(MatrixCull, {
        packet: {
          view: { id: must(parseAt("test", packetIdSchema, "pkt:scout:2026-10-23")), lane: "image", source: "scout", mode: "matrix-cull", state: "open", rev: 1, items: [item("c-10/panel-1", "c-10", "image/png"), item("c-10/words", "c-10", "text/plain"), item("c-11/words", "c-11", "text/plain")], decisions: [], undecided: 3, canUndo: false, reasons: reasonVocabulary("scout"), pairs: [] },
          present: {
            items: { "c-10/panel-1": { label: "frame 1" }, "c-10/words": { label: "The lantern", prompt: BODY }, "c-11/words": { label: "Words only", prompt: BODY } },
            rows: [
              { id: "c-10", label: "The lantern", group: "storyboards", prompt: PARAGRAPH },
              { id: "c-11", label: "Words only", group: "storyboards", prompt: PARAGRAPH },
            ],
          },
        },
        verdicts: {},
        decide: noop,
        undo: noop,
        onCommit: noop,
        keys: false,
      }),
    );
    expect(html).toContain('aria-label="storyboards runs"');
    expect(html).toContain('role="grid" aria-label="storyboards"');
    expect(html).toContain('aria-label="The lantern, 2 variants, 0 decided"');
    expect(html.match(/role="listitem"/g)).toHaveLength(2);
  });
});
