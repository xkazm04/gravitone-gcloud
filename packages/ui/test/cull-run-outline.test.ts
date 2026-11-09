// A RUN MADE FROM A CHANNEL EPISODE shows what it was made from (perfect, outline-beside-frames): the card names
// the channel; the opened run shows channel, logline and the five beats, in the head's right half when the run has no
// reference (so the two-row frame grid keeps its height), under the brief when it has one. A run with none of it draws
// as it always did.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { RunCard } from "../src/components/cull/RunCard.tsx";
import { RunModal } from "../src/components/cull/RunModal.tsx";
import type { Run } from "../src/board/runs.ts";

const beats = ["A tower crane sways.", "The cable frays.", "A gust takes the hook.", "The load swings wide.", "It settles."];
const noop = () => undefined;
const reasons = { list: [], max: 1, meaning: {} };

const modal = (over: Record<string, unknown>) =>
  renderToStaticMarkup(
    h(RunModal, { category: "storyboards", label: "F1-09", position: "1/3", runVerdict: undefined, reasons, onRunVerdict: noop, onClose: noop, live: false, foot: null, children: null, ...over }),
  );

describe("the opened run's outline", () => {
  test("channel, logline and the beats are drawn verbatim, the beats as an ordered list of five", () => {
    const html = modal({ channel: "While It Works", logline: "A crane that cannot stop.", beats });
    expect(html).toContain(">While It Works<");
    expect(html).toContain(">A crane that cannot stop.<");
    expect(html.match(/<li>/g)).toHaveLength(5);
    for (const b of beats) expect(html).toContain(`>${b}<`);
    expect(html).toContain('<ol class=');
  });

  test("with no reference the outline sits in the head after the left half; with one it sits under the brief", () => {
    const bare = modal({ logline: "L.", beats });
    expect(bare.indexOf("reference")).toBe(-1);
    const withRef = modal({ logline: "L.", beats, reference: "/ref.png" });
    expect(withRef.indexOf(">L.<")).toBeLessThan(withRef.indexOf("reference F1-09"));
    expect(bare.indexOf(">L.<")).toBeGreaterThan(bare.indexOf("the whole run"));
  });

  test("a run with no episode draws no outline, and a missing field leaves only that field out", () => {
    expect(modal({})).not.toMatch(/<ol|<li/);
    const some = modal({ channel: "While It Works" });
    expect(some).toContain(">While It Works<");
    expect(some).not.toContain("<ol");
    expect(modal({ beats: [] })).not.toContain("<ol");
  });
});

describe("the grid card", () => {
  const run: Run = { row: "c-10", group: "storyboards", members: [0], words: { id: "c-10", label: "F1-09", channel: "While It Works" } };
  const cells = [{ id: "c-10/words", row: "c-10" }];
  const card = (r: Run) =>
    renderToStaticMarkup(h(RunCard, { run: r, at: 0, cells, verdicts: {}, mediaOf: () => ({ url: "", mime: "text/plain" }), wordsOf: () => ({ label: "F1-09" }), current: false, nudged: false, onPress: noop }));

  test("names the channel on the card, and only when the run has one", () => {
    expect(card(run)).toContain(">While It Works<");
    expect(card({ ...run, words: { id: "c-10", label: "F1-09" } })).not.toContain("While It Works");
  });
});
