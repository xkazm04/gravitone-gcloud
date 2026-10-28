// The sentence compiler (lexicon.ts) on twenty sentences people actually type, and the lexicon
// held to Suno's form rules (pipeline/SUNO-PROPOSE-PROMPT.md): no quality adjectives, no artist
// or title names in what a row EMITS (a cue may name a film; that is how people talk).
import { describe, expect, test } from "vitest";

import { ATLAS, atlasFor, auditionHref, nearFor, playableIds, roleOfWord, sketchHref, soundFor, standInsOf, swapsFor } from "../../src/components/audio/atlas.ts";
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
  ["a cozy igloo in winter by the fireplace", { m: ["cozy"], unheard: ["igloo"] }],
  ["tokyo city pop at sunset", { g: ["city pop"], i: ["electric piano"] }],
  ["spooky halloween party", { m: ["eerie"], i: ["choir"] }],
  ["calm meditation without drums", { m: ["calm"], avoid: ["drums"], bpm: [55, 75] }],
  ["energetic workout music at 128 bpm", { m: ["energetic"], bpm: [128, 128] }],
  ["western showdown at high noon", { g: ["western"], i: ["nylon guitar"], unheard: [] }],
  ["romantic paris cafe", { m: ["romantic"], i: ["accordion"] }],
  ["groovy 70s funk with slap bass", { g: ["funk"], i: ["slap bass"], bpm: [100, 115] }],
  ["video game boss fight in a volcano", { g: ["chiptune", "epic orchestral"], i: ["taiko drums"], unheard: ["volcano"] }],
  ["peaceful forest morning", { g: ["folk"], m: ["calm"], i: ["nylon guitar"] }],
  ["mysterious space ambient", { g: ["space ambient"], m: ["mysterious"], i: ["synth pad"] }],
  ["wedding first dance with strings and piano", { g: ["romantic ballad"], i: ["grand piano", "string section"] }],
  ["zelda dungeon flute vibes", { g: ["dark ambient"], i: ["woodwinds"], unheard: ["zelda"] }],
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

  test("a tempo is heard only where it can be played: 40-220 bpm, and 'beats' only as 'beats per'", () => {
    expect(translate("a 300 bpm gabber track").seed.bpm).not.toBe(300);
    expect(translate("a loop of 16 beats").seed.bpm).toBeNull();
    expect(translate("120 beats per minute").seed.bpm).toBe(120);
  });

  test("every atlas instrument is heard as itself: a term learned by ear and typed compiles back", () => {
    for (const e of ATLAS) {
      const t = translate(e.term);
      expect(t.seed.instruments, e.term).toContain(e.term);
      expect(t.unheard, e.term).toEqual([]);
    }
  });

  test("an instrument's name keeps the reading of the words inside it", () => {
    const t = translate("slow jazz guitar");
    expect(t.seed.instruments).toContain("jazz guitar");
    expect(t.seed.genres).toContain("jazz");
    expect(t.seed.bpm).not.toBeNull();
    expect(translate("rock drums").seed.genres).toContain("rock");
  });

  test("every genre and mood the lexicon can emit, typed, is heard as itself", () => {
    const t = translate("a bossa nova cafe in rio");
    expect(t.unheard).toEqual([]);
    expect(t.seed.genres[0]).toBe("bossa nova");
    expect(provenanceOf(t, "genres", "bossa nova")).toEqual([1, 2, 5]);
    const genres = new Set(ROWS.flatMap((r) => r.g ?? []));
    for (const g of genres) expect(translate(g).unheard, g).toEqual([]);
  });

  test("a slip of the keyboard is offered its word, never applied; a short real word is left alone", () => {
    const t = translate("melancolic jaz with a saxaphone");
    expect(t.near.map((n) => [t.tokens[n.token]?.text, n.to])).toEqual([
      ["melancolic", "melancholic"],
      ["saxaphone", "saxophone"],
    ]);
    expect(t.unheard).toContain("melancolic");
    expect(t.seed.moods).toEqual([]);
    expect(translate("a five year old by the lake").near).toEqual([]);
    expect(translate("an exciting trailer for my indie game").near).toEqual([]);
  });

  test("a derived name never takes a written reading away: the words inside it keep theirs", () => {
    expect(translate("solo piano").seed.instruments).toContain("grand piano");
    expect(translate("dark ambient").seed.moods).toContain("dark");
    expect(translate("focused").seed.genres).toContain("lo-fi hip hop");
    expect(translate("still raining, sad piano").seed.moods).not.toContain("still");
    expect(translate("city lights").seed.moods).not.toContain("light");
  });

  test("a word's offsets are the sentence as typed, whatever the script: a slip's chip rewrites the right letters", () => {
    for (const lead of ["雨が好き", "café", "한국"]) {
      const s = `${lead} melancolic`;
      const t = translate(s);
      const n = t.near[0];
      const tok = n === undefined ? undefined : t.tokens[n.token];
      expect(tok === undefined ? null : s.slice(tok.start, tok.end)).toBe("melancolic");
    }
  });

  test("a key the sentence says beats the moods' lean", () => {
    expect(translate("sad piano in E major").seed.key).toBe("E major");
    expect(translate("happy tune in b flat minor").seed.key).toBe("Bb minor");
    expect(translate("something happy in minor").seed.key).toBe("A minor");
    expect(translate("sad piano in E major").unheard).toEqual([]);
  });

  test("a short real word is not offered a word one letter CHANGED from it", () => {
    expect(translate("a short noise in eight bars").near).toEqual([]);
    expect(translate("nigth chilll").near.map((n) => n.to)).toEqual(["night", "chill"]);
  });

  test("a possessive is the word it belongs to, straight or curly", () => {
    expect(translate("my startup's launch").unheard).toEqual([]);
    expect(translate("my startup’s launch").unheard).toEqual([]);
  });

  test("the key follows the way the seed's moods lean, with the words behind them", () => {
    const sad = translate("sad piano for a breakup");
    expect(sad.seed.key).toBe("A minor");
    expect(sad.key?.from).toEqual(provenanceOf(sad, "moods", "sad"));
    expect(translate("a happy ukulele tune").seed.key).toBe("C major");
    expect(translate("chill vibes for a sunday afternoon").seed.key).toBeNull();
    expect(translate("piano").key).toBeNull();
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

  test("an audition is addressed by instrument, whole tempo and key; a tempo it cannot play falls back", () => {
    expect(auditionHref("rhodes", 91.6, "A minor")).toBe("/audio/audition?id=rhodes&bpm=92&key=A+minor");
    expect(auditionHref("rhodes", null, null)).toBe("/audio/audition?id=rhodes&bpm=90");
    expect(auditionHref("rhodes", 300, null)).toBe("/audio/audition?id=rhodes&bpm=90");
  });

  test("a word with no samples here is offered the nearest sounds that can play, never a guess", () => {
    const all = new Set(ATLAS.map((e) => e.id));
    expect(roleOfWord("saxophone")).toBe("winds");
    expect(roleOfWord("brushed drums")).toBe("drums");
    expect(roleOfWord("felt piano")).toBe("keys");
    expect(roleOfWord("vinyl crackle")).toBeUndefined();
    expect(nearFor("brushed drums", all).every((e) => e.role === "drums")).toBe(true);
    expect(nearFor("saxophone", all)[0]?.role).toBe("winds");
    expect(nearFor("vinyl crackle", all)).toEqual([]);
    expect(nearFor("brushed drums", all, ["jazz drums"]).map((e) => e.id)).not.toContain("jazz-drums");
  });

  test("a sketch hears a word with no samples through its register's nearest, and says so", () => {
    const all = new Set(ATLAS.map((e) => e.id));
    expect(playableIds(["muted trumpet", "upright bass"], all)).toEqual(["brass-section", "upright-bass"]);
    expect(standInsOf(["muted trumpet", "upright bass"], all).map((x) => [x.word, x.as.term])).toEqual([["muted trumpet", "brass section"]]);
    expect(soundFor("brushed drums", all)?.term).toBe("jazz drums");
    expect(soundFor("vinyl crackle", all)).toBeUndefined();
    expect(soundFor("rhodes", new Set(["grand-piano"]))?.term).toBe("grand piano");
    expect(soundFor("rhodes", new Set(["live-drums"]))).toBeUndefined();
  });

  test("a sketch names each instrument once", () => {
    expect(sketchHref(["grand-piano", "grand-piano", "rhodes"], [0, 3], 90, null)).toBe("/audio/sketch?ids=grand-piano%2Crhodes&levels=03&bpm=90");
  });
});
