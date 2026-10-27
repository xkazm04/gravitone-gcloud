import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonAt } from "../src/door.ts";
import { libraryItemSchema } from "../src/libraryItem.ts";
import {
  FIXED_ORDER,
  KIND_LABELS,
  LIBRARY_ACTS,
  LIBRARY_KINDS,
  MEDIA_KINDS,
  TRIS_BANDS,
  trisBand,
  normText,
  parseSearch,
  railGroups,
  SEARCH_KEYS,
  STYLE_OBSERVABLES,
  techniqueBand,
  tokenOf,
  VOCAB_GROUPS,
} from "../src/library.ts";

// The Library's read contract: the search grammar as the ONE door user text goes
// through, the rail's order per kind, and the observables held equal to the vocab.

describe("parseSearch", () => {
  it("splits free words from key:value tokens and resolves the prototype's aliases", () => {
    expect(parseSearch("dusk mood:tense palette:warm-cool-split")).toEqual({
      words: ["dusk"],
      tokens: [
        { key: "mood", value: "tense" },
        { key: "palette_strategy", value: "warm cool split" },
      ],
    });
  });
  it("reads a quoted value whole and a quoted phrase as its words", () => {
    expect(parseSearch('style:"painted 3d" "night market"')).toEqual({ words: ["night", "market"], tokens: [{ key: "style", value: "painted 3d" }] });
  });
  it("folds case and diacritics, and treats - and _ as spaces, as the index tokenizes", () => {
    expect(parseSearch("Café NOIR-ish")).toEqual({ words: ["cafe", "noir", "ish"], tokens: [] });
    expect(normText("Ŝtrâße_09")).toBe("straße 09");
  });
  it("folds a key's case the same way whether its value is quoted or not", () => {
    expect(parseSearch('Mood:"dark ambient"')).toEqual({ words: [], tokens: [{ key: "mood", value: "dark ambient" }] });
    expect(parseSearch('STYLE:"painted 3d" Mood:tense')).toEqual(parseSearch('style:"painted 3d" mood:tense'));
  });
  it("keeps an unknown key as a free word, so 16:9 and a url are searchable text", () => {
    expect(parseSearch("aspect:16:9 ratio:16")).toEqual({ words: ["ratio", "16"], tokens: [{ key: "aspect", value: "16 9" }] });
    expect(parseSearch("16:9").tokens).toEqual([]);
  });
  it("keeps an id verbatim and drops a token whose value folds to nothing", () => {
    expect(parseSearch("id:Plate:Forge-01 mood:--")).toEqual({ words: [], tokens: [{ key: "id", value: "Plate:Forge-01" }] });
  });
  it("is total: empty and whitespace-only text parse to nothing", () => {
    expect(parseSearch("")).toEqual({ words: [], tokens: [] });
    expect(parseSearch("   ")).toEqual({ words: [], tokens: [] });
  });
  it("reads back what tokenOf writes", () => {
    for (const [k, v] of [["mood", "tense"], ["style", "painted 3d"], ["project", 'a "b" c']] as const) {
      const t = parseSearch(tokenOf(k, v)).tokens;
      expect(t).toEqual([{ key: k, value: normText(v) }]);
    }
  });
  it("knows every rail group as a key", () => {
    for (const k of LIBRARY_KINDS) for (const g of railGroups(k)) expect(SEARCH_KEYS.has(g.key), g.key).toBe(true);
  });
});

describe("the rail", () => {
  it("runs vocabulary, attention, state, collections, origin - in that order, for every kind", () => {
    const order = ["vocabulary", "attention", "state", "collections", "origin"];
    for (const k of [...LIBRARY_KINDS, "all"] as const) {
      const sections = railGroups(k).map((g) => g.section);
      const firsts = sections.filter((s, i) => sections.indexOf(s) === i);
      expect(firsts).toEqual(k === "all" ? order.slice(1) : order);
    }
    expect(railGroups("plate").slice(0, 3).map((g) => g.key)).toEqual(["style", "family", "render_mode"]);
  });
  it("has a label for every kind and a group list for every kind", () => {
    expect(KIND_LABELS.map((k) => k.kind)).toEqual(["all", ...LIBRARY_KINDS]);
    expect(Object.keys(VOCAB_GROUPS).sort()).toEqual(["all", ...LIBRARY_KINDS].sort());
  });
  it("bands a doc's technique count", () => {
    expect([0, 1, 4, 5, 8, 9, 15, 16, 40].map(techniqueBand)).toEqual(["0", "1–4", "1–4", "5–8", "5–8", "9–15", "9–15", "16+", "16+"]);
  });
});

describe("the observables are the vocab's", () => {
  it("each is an enum field of the style_source subset, in group style", () => {
    const vocabSchema = z.object({
      fields: z.record(z.string(), z.object({ kind: z.string(), group: z.string().optional() })),
      subsets: z.record(z.string(), z.array(z.string())),
    });
    const file = path.resolve(import.meta.dirname, "../../../pipeline/vocab/cinematography.json");
    const doc = parseJsonAt("vocab", vocabSchema, readFileSync(file, "utf8"));
    if (!doc.ok) throw doc.error;
    const source = doc.value.subsets["style_source"] ?? [];
    for (const o of STYLE_OBSERVABLES) {
      expect(source, o).toContain(o);
      expect(doc.value.fields[o]?.kind, o).toBe("enum");
      expect(doc.value.fields[o]?.group, o).toBe("style");
    }
  });
});

describe("the model kind (spark game-3d-assets)", () => {
  it("is a media kind with its own rail, chips and a triangle band in vocabulary order", () => {
    expect(LIBRARY_KINDS).toContain("model");
    expect(MEDIA_KINDS).toContain("model");
    expect(VOCAB_GROUPS.model).toEqual(["class", "technique", "rig", "tris"]);
    expect(FIXED_ORDER["tris"]).toEqual(TRIS_BANDS);
    expect(LIBRARY_ACTS).toContain("export");
  });
  it("bands triangles by PoF's presets: prop 10k, weapon 15k inside 20k, character 40k", () => {
    expect([0, 10_000, 10_001, 20_000, 40_000, 40_001].map(trisBand)).toEqual(["0–10k", "0–10k", "10–20k", "10–20k", "20–40k", "40k+"]);
  });
  it("admits a model record through the door and refuses a class the asset store does not have", () => {
    const rec = { kind: "model", id: "model:mesh:a:b", title: "a", state: "candidate", collections: [], origin: "mesh", rights: { use: "publishable" }, source: "real", lineage: [], vocabulary: { class: "weapon", technique: "M1", rigged: false, tris: 12_000 } };
    expect(libraryItemSchema.safeParse(rec).success).toBe(true);
    expect(libraryItemSchema.safeParse({ ...rec, vocabulary: { ...rec.vocabulary, class: "vehicle" } }).success).toBe(false);
    expect(libraryItemSchema.safeParse({ ...rec, vocabulary: { class: "weapon", technique: "T9", rigged: false } }).success).toBe(false);
  });
});
