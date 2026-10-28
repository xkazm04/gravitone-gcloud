// The sentence compiler (lexicon.ts) on twenty sentences people actually type, and the lexicon
// held to Suno's form rules (pipeline/SUNO-PROPOSE-PROMPT.md): no quality adjectives, no artist
// or title names in what a row EMITS (a cue may name a film; that is how people talk).
import { describe, expect, test } from "vitest";

import { ATLAS, atlasFor, auditionHref, swapsFor } from "../../src/components/audio/atlas.ts";
import { provenanceOf, translate } from "../../src/components/audio/lexicon.ts";
import { ROWS } from "../../src/components/audio/lexicon.rows.ts";

type Want = { readonly g?: readonly string[]; readonly m?: readonly string[]; readonly i?: readonly string[]; readonly avoid?: readonly string[]; readonly bpm?: readonly [number, number]; readonly unheard?: readonly string[] };

const CASES: readonly (readonly [string, Want])[] = [
  ["something like a heist movie but chill", { g: ["jazz funk"], m: ["cool", "suspenseful"], i: ["upright bass", "jazz drums"], bpm: [85, 95], unheard: [] }],
  ["like a rainy café at night", { g: ["lo-fi jazz"], m: ["cozy", "melancholic"], i: ["rhodes"], bpm: [70, 85], unheard: [] }],
  ["upbeat product demo, no vocals", { g: ["corporate pop"], m: ["upbeat"], avoid: ["vocals"], bpm: [105, 120] }],
  ["dreamy 80s synth for coding", { g: ["dream pop", "synth-pop"], i: ["synth pad"], unheard: [] }],
  ["sad piano", { m: ["melancholic", "sad"], i: ["grand piano"], bpm: [60, 80] }],
  ["epic fantasy trailer with choir", { g: ["epic orchestral"], i: ["choir"] }],
  ["lofi beats to study to", { g: ["lo-fi hip hop"], i: ["rhodes"], bpm: [70, 90] }],
  ["a cozy cabin in winter by the fireplace", { m: ["cozy"], unheard: ["cabin"] }],
  ["tokyo city pop at sunset", { g: ["city pop"], i: ["electric piano"] }],
  ["spooky halloween party", { m: ["eerie"], i: ["choir"] }],
  ["calm meditation without drums", { m: ["calm"], avoid: ["drums"], bpm: [55, 75] }],
  ["energetic workout music at 128 bpm", { m: ["energetic"], bpm: [128, 128] }],
  ["western showdown at high noon", { g: ["western"], i: ["nylon guitar"], unheard: ["showdown", "high", "noon"] }],
  ["romantic paris cafe", { m: ["romantic"], i: ["accordion"] }],
  ["groovy 70s funk with slap bass", { g: ["funk"], i: ["slap bass"], bpm: [100, 115] }],
  ["video game boss fight", { g: ["chiptune"], unheard: ["boss", "fight"] }],
  ["peaceful forest morning", { g: ["folk"], m: ["calm"], i: ["nylon guitar"] }],
  ["mysterious space ambient", { g: ["space ambient"], m: ["mysterious"], i: ["synth pad"] }],
  ["wedding first dance with strings and piano", { g: ["romantic ballad"], i: ["grand piano", "string section"] }],
  ["zelda dungeon flute vibes", { i: ["woodwinds"], unheard: ["zelda", "dungeon"] }],
];

describe("translate: a sentence compiled into a seed", () => {
  test.each(CASES)("%s", (sentence, want) => {
    const t = translate(sentence);
    for (const w of want.g ?? []) expect(t.seed.genres).toContain(w);
    for (const w of want.m ?? []) expect(t.seed.moods).toContain(w);
    for (const w of want.i ?? []) expect(t.seed.instruments).toContain(w);
    for (const w of want.avoid ?? []) expect(t.seed.avoid).toContain(w);
    if (want.bpm !== undefined) {
      expect(t.seed.bpm).not.toBeNull();
      expect(t.seed.bpm ?? 0).toBeGreaterThanOrEqual(want.bpm[0]);
      expect(t.seed.bpm ?? 0).toBeLessThanOrEqual(want.bpm[1]);
    }
    if (want.unheard !== undefined) expect(t.unheard).toEqual(want.unheard);
  });

  test("the same sentence compiles to the same seed, every time", () => {
    expect(translate("like a rainy café at night")).toEqual(translate("like a rainy café at night"));
  });

  test("every term carries the words that produced it", () => {
    const t = translate("something like a heist movie but chill");
    const from = provenanceOf(t, "instruments", "upright bass").map((i) => t.tokens[i]?.text);
    expect(from).toEqual(["heist", "movie"]);
    expect(provenanceOf(t, "genres", "chillhop").map((i) => t.tokens[i]?.text)).toEqual(["chill"]);
    expect(provenanceOf(t, "genres", "no such term")).toEqual([]);
  });

  test("a fence is the word as said, and no instrument carrying it stays", () => {
    const t = translate("rainy cafe, no drums");
    expect(t.seed.avoid).toEqual(["drums"]);
    expect(t.seed.instruments).toContain("rhodes");
    expect(t.seed.instruments.filter((i) => i.includes("drum"))).toEqual([]);
  });

  test("caps hold the style line short; the overflow is offered, not dropped", () => {
    const t = translate("dreamy 80s synth stuff for coding at 3am");
    expect(t.seed.genres.length).toBeLessThanOrEqual(2);
    expect(t.seed.instruments.length).toBeLessThanOrEqual(4);
    expect(t.spare.length).toBeGreaterThan(0);
  });

  test("a length said in words is heard as seconds", () => {
    expect(translate("90 seconds for a product demo").lengthS?.value).toBe(90);
    expect(translate("a 2-minute trailer").lengthS?.value).toBe(120);
    expect(translate("90 seconds for a product demo").unheard).toEqual([]);
    expect(translate("sad piano").lengthS).toBeNull();
  });

  test("an empty sentence is a blank seed", () => {
    const t = translate("   ");
    expect(t.tokens).toEqual([]);
    expect(t.seed.genres).toEqual([]);
    expect(t.seed.bpm).toBeNull();
  });
});

const QUALITY = /\b(amazing|awesome|best|beautiful|great|high[- ]quality|professional|masterpiece|perfect|incredible|stunning|hit)\b/i;
const NAMES = /\b(zelda|mario|beatles|daft punk|hans zimmer|zimmer|john williams|taylor swift|nintendo|disney|pixar|bond|star wars|ghibli)\b/i;

describe("the lexicon keeps Suno's form rules", () => {
  const emitted = ROWS.flatMap((r) => [...(r.g ?? []), ...(r.m ?? []), ...(r.i ?? [])]);

  test("no row emits a quality adjective", () => {
    expect(emitted.filter((w) => QUALITY.test(w))).toEqual([]);
  });

  test("no row emits an artist's, a studio's or a title's name", () => {
    expect(emitted.filter((w) => NAMES.test(w))).toEqual([]);
  });

  test("every row emits something, and a tempo range is a real one", () => {
    for (const r of ROWS) {
      expect((r.g?.length ?? 0) + (r.m?.length ?? 0) + (r.i?.length ?? 0) + (r.bpm === undefined ? 0 : 1)).toBeGreaterThan(0);
      if (r.bpm !== undefined) {
        expect(r.bpm[0]).toBeGreaterThanOrEqual(40);
        expect(r.bpm[1]).toBeLessThanOrEqual(220);
        expect(r.bpm[0]).toBeLessThanOrEqual(r.bpm[1]);
      }
    }
  });

  test("every cue is lower-case and accent-free, so the tokenizer can reach it", () => {
    for (const r of ROWS) for (const c of r.cue) expect(c).toBe(c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
  });

  test("about a hundred and fifty rows", () => {
    expect(ROWS.length).toBeGreaterThanOrEqual(140);
  });
});

describe("the atlas", () => {
  test("ids and terms are unique, and every spelling names one instrument", () => {
    expect(new Set(ATLAS.map((e) => e.id)).size).toBe(ATLAS.length);
    expect(new Set(ATLAS.map((e) => e.term)).size).toBe(ATLAS.length);
    const akas = ATLAS.flatMap((e) => e.aka);
    expect(new Set(akas).size).toBe(akas.length);
  });

  test("a seed word finds its instrument by term or spelling, in any case", () => {
    expect(atlasFor("Rhodes")?.id).toBe("rhodes");
    expect(atlasFor("double bass")?.id).toBe("upright-bass");
    expect(atlasFor("tuba")).toBeUndefined();
  });

  test("the lexicon's playable instruments are atlas terms", () => {
    const named = new Set(ROWS.flatMap((r) => r.i ?? []));
    for (const e of ATLAS.filter((x) => named.has(x.term))) expect(atlasFor(e.term)).toBe(e);
    expect([...named].filter((w) => atlasFor(w) !== undefined).length).toBeGreaterThanOrEqual(15);
  });

  test("a swap offers the same register first, never itself, never what is held or cannot play", () => {
    const rhodes = atlasFor("rhodes");
    if (rhodes === undefined) throw new Error("no rhodes");
    const all = new Set(ATLAS.map((e) => e.id));
    const c = swapsFor(rhodes, all, ["rhodes", "grand piano"]);
    expect(c[0]?.role).toBe("keys");
    expect(c.map((e) => e.id)).not.toContain("rhodes");
    expect(c.map((e) => e.id)).not.toContain("grand-piano");
    expect(swapsFor(rhodes, new Set(["rhodes"]))).toEqual([]);
  });

  test("an audition is addressed by instrument, whole tempo and key", () => {
    expect(auditionHref("rhodes", 91.6, "A minor")).toBe("/audio/audition?id=rhodes&bpm=92&key=A+minor");
    expect(auditionHref("rhodes", null, null)).toBe("/audio/audition?id=rhodes&bpm=90");
  });
});
