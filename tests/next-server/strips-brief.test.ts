// ONE ARTICLE SECTION AS A STRIP BRIEF, AND THE CAPTION'S DOOR (spark explainer-real-article-strips
// WP-B): the adapter keeps the data/ brief's shape with the section's own sentences as facts (code,
// images and tables dropped, never paraphrased), leaves `steps` to the turn, and says so in its
// notes; the caption the turn writes is refused outside 30-60 words, as markdown, or pointing at
// the picture; the dry stand-in caption is the section's own first sentences; and the addendum is
// APPENDED to the prompt the author turn already builds, the contract it copies left untouched.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { prepareTurn } from "../../lib/foundry/strips/author.ts";
import { captionOf, CAPTION_WORDS, explainerAddendum, sectionBrief, sentencesOf, standInCaption, withAddendum } from "../../lib/foundry/strips/brief.ts";
import { control } from "../../lib/foundry/strips/cards.ts";

const WS = mkdtempSync(path.join(tmpdir(), "gt-strips-brief-"));
afterAll(() => rmSync(WS, { recursive: true, force: true }));

const SECTION = {
  id: "supply",
  heading: "How supply falls",
  body: [
    "Every four years the **reward** halves. See [the schedule](https://example.org/s) for dates.",
    "",
    "![a chart of the reward](chart.png)",
    "",
    "```js",
    "const reward = 50 / 2 ** halvings;",
    "```",
    "",
    "| year | reward |",
    "|---|---|",
    "| 2024 | 3.125 |",
    "",
    "- Fewer new coins reach the market each year",
    "- The last coin is mined around `2140`.",
  ].join("\n"),
};

describe("a section as a brief", () => {
  it("keeps the data/ brief's keys: the heading as title, the first sentence as beat, the sentences as sourced facts, no steps", () => {
    const b = sectionBrief(SECTION, "Why bitcoin");
    const aqueduct = JSON.parse(readFileSync(path.join(process.cwd(), "pipeline", "strips", "data", "edu-aqueduct.json"), "utf8")) as Record<string, unknown>;
    expect(Object.keys(b).filter((k) => !(k in aqueduct))).toEqual([]);
    expect(b).toMatchObject({ case: "explainer-supply", title: "How supply falls", beat: "Every four years the reward halves.", steps: [], countable: [] });
    expect(b.facts.map((f) => f.text)).toEqual(["Every four years the reward halves.", "See the schedule for dates.", "Fewer new coins reach the market each year", "The last coin is mined around 2140."]);
    expect(new Set(b.facts.map((f) => `${f.source} / ${f.publisher}`))).toEqual(new Set(["article section supply / Why bitcoin"]));
    expect(b.notes).toContain('"How supply falls" (section supply)');
    expect(b.notes).toMatch(/derive 3-6 causal steps/);
  });

  it("drops a fenced block even when it holds sentences, and a section of nothing but code is its heading", () => {
    expect(sentencesOf("Before.\n\n~~~\nThis is not prose. Nor this.\n~~~\n\nAfter.")).toEqual(["Before.", "After."]);
    const b = sectionBrief({ id: "c", heading: "Only code", body: "```\nx = 1\n```" }, null);
    expect([b.beat, b.facts.length, b.facts.some((f) => "publisher" in f)]).toEqual(["Only code", 0, false]);
  });
});

describe("the caption", () => {
  const json = (caption: string) => JSON.stringify({ caption });
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
  it("passes at 30 and 60 words and is refused at 29, 61 and 12", () => {
    expect(CAPTION_WORDS).toEqual({ min: 30, max: 60 });
    expect(captionOf(json(words(30))).findings).toEqual([]);
    expect(captionOf(json(words(60))).findings).toEqual([]);
    expect(captionOf(json(words(29))).findings).toEqual(["caption: 29 words, the bar is 30-60"]);
    expect(captionOf(json(words(61))).findings).toEqual(["caption: 61 words, the bar is 30-60"]);
    expect(captionOf(json(words(12))).findings).toEqual(["caption: 12 words, the bar is 30-60"]);
  });
  it("is refused missing, malformed, with a stray key, as markdown, or pointing at the picture", () => {
    expect(captionOf(undefined).findings).toEqual(["caption: out/caption.json was not written"]);
    expect(captionOf("{not json").findings[0]).toMatch(/^caption: /);
    expect(captionOf(JSON.stringify({ caption: words(40), title: "x" })).findings[0]).toMatch(/^caption: /);
    expect(captionOf(json(`**Bold** ${words(39)}`)).findings).toEqual(["caption: carries markdown; it is spoken, so plain sentences only"]);
    expect(captionOf(json(`As the figure shows ${words(36)}`)).findings).toEqual(['caption: points at the picture ("figure"); say the thing instead']);
  });
  it("a dry card's stand-in is the section's first sentences, never past 60 words", () => {
    expect(standInCaption(SECTION)).toBe("Every four years the reward halves. See the schedule for dates. Fewer new coins reach the market each year The last coin is mined around 2140.");
    // Two sentences of 50 and 20 words: the second would pass the ceiling, so only the first is said.
    const long = { id: "l", heading: "Long", body: `${words(50)}. Then ${words(19)}.` };
    expect(standInCaption(long).split(" ")).toHaveLength(50);
    const one = { id: "o", heading: "One", body: `${words(80)}.` };
    expect(standInCaption(one).split(" ")).toHaveLength(60);
    expect(standInCaption({ id: "e", heading: "Empty", body: "" })).toBe("Empty");
  });
});

describe("the explainer addendum", () => {
  it("is appended to the prompt prepareTurn builds, and the contract it copies is the repo's own, unchanged", async () => {
    const add = await explainerAddendum();
    expect(add).not.toMatch(/<!--/);
    expect(add).toContain("out/caption.json");
    const t = await prepareTurn({ ws: path.join(WS, "card-supply"), lane: "edu", brief: sectionBrief(SECTION, null), approach: control("edu", "explainer-supply"), effort: "high" });
    const prompt = withAddendum(t.agent.prompt, add);
    expect(prompt.startsWith(t.agent.prompt)).toBe(true);
    expect(prompt.endsWith(add)).toBe(true);
    expect(readFileSync(path.join(WS, "card-supply", "inputs", "CONTRACT.md"), "utf8")).toBe(readFileSync(path.join(process.cwd(), "pipeline", "strips", "CONTRACT.md"), "utf8"));
    expect(JSON.parse(readFileSync(path.join(WS, "card-supply", "inputs", "approach.json"), "utf8"))).toMatchObject({ id: "CTRL", case: "explainer-supply", leonardo: "none", grammar: "draw-on" });
  });
});
