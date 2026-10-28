import { describe, expect, it } from "vitest";

import { libraryItemSchema } from "../src/libraryItem.ts";
import { AGE_BANDS, ageBand, buildOf, corePrompt, CHIP_GROUPS, FIXED_ORDER, KIND_LABELS, LIBRARY_KINDS, MEDIA_KINDS, parseSearch, railGroups, SEARCH_KEYS, VOCAB_GROUPS } from "../src/library.ts";

// The character kind (spark scout-use-aim): a kept muse woman as one Library item. The kind is
// appended LAST so every stored kind_ord keeps its meaning; its vocabulary is her age band, build,
// the look directions she was kept in and the applications those stills served; her core prompt is
// built by a pure function, held here against the shapes the muse prompts really have.

describe("the kind", () => {
  it("is appended last, so no stored kind_ord shifts, and is a media kind with its own rail and chips", () => {
    // Appended after model; the scout's genre and venture (spark scout-vision S2) were appended after it.
    expect(LIBRARY_KINDS.at(LIBRARY_KINDS.indexOf("model") + 1)).toBe("character");
    expect(LIBRARY_KINDS.slice(0, 8)).toEqual(["image", "plate", "style", "motion", "audio", "video", "doc", "model"]);
    expect(MEDIA_KINDS).toContain("character");
    expect(VOCAB_GROUPS.character).toEqual(["age", "build", "look", "application"]);
    expect(CHIP_GROUPS.character).toEqual(["age", "build", "application"]);
    expect(KIND_LABELS.find((k) => k.kind === "character")).toEqual({ kind: "character", label: "Characters", short: "character" });
    expect(railGroups("character").slice(0, 4).map((g) => g.key)).toEqual(["age", "build", "look", "application"]);
  });
  it("names its groups as search keys, so look:risograph is a token and not a word", () => {
    for (const g of VOCAB_GROUPS.character) expect(SEARCH_KEYS.has(g), g).toBe(true);
    expect(parseSearch("look:anime-cel age:30").tokens).toEqual([
      { key: "look", value: "anime cel" },
      { key: "age", value: "30" },
    ]);
  });
});

describe("the age band", () => {
  it("bands an age, never open-ended below, and lists the bands in order", () => {
    expect([18, 25, 29, 30, 34, 35, 39, 40, 44, 45, 50, 61].map(ageBand)).toEqual(["under 30", "under 30", "under 30", "30–34", "30–34", "35–39", "35–39", "40–44", "40–44", "45+", "45+", "45+"]);
    expect(FIXED_ORDER["age"]).toEqual(AGE_BANDS);
  });
});

describe("the build", () => {
  it("is the word a card's look puts before `build`", () => {
    expect(buildOf("olive skin, long dark wavy hair, slim build, an emerald silk scarf")).toBe("slim");
    expect(buildOf("an angular jaw, lean build, a black leather jacket")).toBe("lean");
    expect(buildOf("a wide-set gaze, curvy-and-fit build, a denim apron")).toBe("curvy-and-fit");
  });
  it("skips a filler word and is absent when the look names none", () => {
    expect(buildOf("her build is hidden under a coat")).toBeUndefined();
    expect(buildOf("a tall woman with the same build as her sister, lean build")).toBe("lean");
    expect(buildOf("fair skin, a sleek black bob")).toBeUndefined();
  });
});

const CARD = { name: "Sofia", age: 29, look: "olive skin, long dark wavy hair with a centre part, faint freckles across the nose, slim build, an emerald silk scarf" };

describe("the core prompt", () => {
  it("is her card block verbatim, then the still's prompt with the sentence that restates the card taken out", () => {
    const prompt = `Two-colour risograph print, misregistered inks, grain. Sofia, aged 29, ${CARD.look}. Seated at a harbour cafe, half a smile. Avoid: text, watermark.`;
    expect(corePrompt(CARD, prompt)).toBe(`Sofia, aged 29, ${CARD.look}.\n\nTwo-colour risograph print, misregistered inks, grain. Seated at a harbour cafe, half a smile. Avoid: text, watermark.`);
  });
  it("cuts a card sentence that opens or closes the prompt, and one split across lines", () => {
    expect(corePrompt(CARD, `Sofia, aged 29, ${CARD.look}. Gouache, visible ridges.`)).toBe(`Sofia, aged 29, ${CARD.look}.\n\nGouache, visible ridges.`);
    expect(corePrompt(CARD, `Gouache, visible ridges. Sofia, aged 29, ${CARD.look}.`)).toBe(`Sofia, aged 29, ${CARD.look}.\n\nGouache, visible ridges.`);
    expect(corePrompt(CARD, `Gouache.\nSofia, aged 29,\n${CARD.look}, with fine pores.\nLaughing.`)).toBe(`Sofia, aged 29, ${CARD.look}.\n\nGouache. Laughing.`);
  });
  it("loses the sentences that state her age when the prompt did not restate the look verbatim", () => {
    expect(corePrompt(CARD, "Anime cel. A woman aged 29 with a green scarf. On a rooftop.")).toBe(`Sofia, aged 29, ${CARD.look}.\n\nAnime cel. On a rooftop.`);
  });
  it("is the card alone when nothing else was in the prompt", () => {
    expect(corePrompt(CARD, `Sofia, aged 29, ${CARD.look}.`)).toBe(`Sofia, aged 29, ${CARD.look}.`);
  });
  it("does not double the full stop of a look that ends in one", () => {
    expect(corePrompt({ ...CARD, look: "short hair." }, "Ink. Sofia, aged 29, short hair. Walking.")).toBe("Sofia, aged 29, short hair.\n\nInk. Walking.");
  });
});

describe("the door", () => {
  const rec = { kind: "character", id: "character:muse:sofia", title: "Sofia", state: "ratified", collections: [], origin: "scout", rights: { use: "publishable" }, source: "real", lineage: [], vocabulary: { age: 29, build: "slim", looks: ["risograph-two-colour"], applications: ["dating-sim"] } };
  it("admits a character and refuses a fractional or negative age", () => {
    expect(libraryItemSchema.safeParse(rec).success).toBe(true);
    expect(libraryItemSchema.safeParse({ ...rec, vocabulary: { ...rec.vocabulary, age: 29.5 } }).success).toBe(false);
    expect(libraryItemSchema.safeParse({ ...rec, vocabulary: { ...rec.vocabulary, age: -1 } }).success).toBe(false);
  });
  it("takes a legacy character: no build, no looks recorded", () => {
    const { build: _build, ...vocab } = rec.vocabulary;
    void _build;
    expect(libraryItemSchema.safeParse({ ...rec, vocabulary: { ...vocab, looks: [], applications: [] } }).success).toBe(true);
  });
});
