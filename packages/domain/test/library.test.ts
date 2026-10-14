import { describe, expect, expectTypeOf, it } from "vitest";

import {
  jobIdSchema,
  libraryItemIdSchema,
  partIdSchema,
  runIdSchema,
  slotIdSchema,
  styleIdSchema,
  type JobId,
  type PartId,
  type RunId,
  type StyleId,
} from "../src/ids.ts";
import { libraryItemSchema, type LibraryItem } from "../src/libraryItem.ts";
import { styleSchema } from "../src/style.ts";
import { accept, AT, BLOB, refuse } from "./_records.ts";

describe("record ids", () => {
  it("each record has its own brand", () => {
    expectTypeOf<RunId>().not.toExtend<JobId>();
    expectTypeOf<PartId>().not.toExtend<JobId>();
    expectTypeOf<StyleId>().toExtend<string>();
    expectTypeOf<string>().not.toExtend<StyleId>();
  });
  it("is minted at a door and refuses the empty id", () => {
    for (const s of [runIdSchema, partIdSchema, jobIdSchema, libraryItemIdSchema, styleIdSchema, slotIdSchema]) {
      expect(s.parse("x")).toBe("x");
      refuse(s, "", "(root)");
    }
  });
});

const take = {
  id: "st-ee050dbf66",
  kind: "audio",
  title: "Dockside bar, late set",
  vocabulary: {
    type: "music",
    genre: ["noir jazz"],
    mood: ["smoky", "lonely"],
    instrument: ["muted trumpet", "double bass", "brushed drums"],
    provider: "local",
    durationS: 75,
    tempoBpm: 72,
    key: "Bb major",
  },
  state: "unjudged",
  collections: [],
  origin: "import",
  rights: { use: "publishable" },
  source: "fixture",
  lineage: [],
};

describe("library item", () => {
  it("parses a fixture take with its kind's vocabulary", () => {
    const it2 = accept(libraryItemSchema, take);
    expect(it2.kind).toBe("audio");
    expect("media" in it2).toBe(false);
  });
  it("the vocabulary is the kind's own — an audio item cannot carry a plate's mechanism", () => {
    refuse(libraryItemSchema, { ...take, vocabulary: { station: "forge", mechanism: "ref-early" } }, "vocabulary");
    refuse(libraryItemSchema, { ...take, kind: "sculpture" }, "kind");
    expectTypeOf<Extract<LibraryItem, { kind: "audio" }>["vocabulary"]["tempoBpm"]>().toEqualTypeOf<number | undefined>();
  });
  it("a plate points at its style rather than copying the style's facets", () => {
    const plate = {
      ...take,
      id: "forge/lotr-cavalry/painted-3d--ref-early.jpg",
      kind: "plate",
      title: "Painted 3D · lotr-cavalry",
      vocabulary: { station: "forge", styleId: "painted-3d", scene: "lotr-cavalry", mechanism: "ref-early" },
      state: "ratified",
      origin: "forge",
      source: "real",
      media: BLOB,
      at: AT,
    };
    expect(accept(libraryItemSchema, plate).kind).toBe("plate");
  });
  it("a derived item names the item it came from, and never itself", () => {
    const derived = { ...take, id: "ill-0001", source: "derived", lineage: [{ kind: "run", id: "suno-batch-19" }] };
    refuse(libraryItemSchema, derived, "derived");
    accept(libraryItemSchema, { ...derived, lineage: [{ kind: "library-item", id: "st-ee050dbf66" }] });
    refuse(libraryItemSchema, { ...derived, lineage: [{ kind: "library-item", id: "ill-0001" }] }, "ancestor");
  });
  it("the prototype's `illustrative` is not a source a stored record may have", () => {
    refuse(libraryItemSchema, { ...take, source: "illustrative" }, "source");
  });
});

const paintedEvidence = [
  { run: "2026-08-26-dry-run", scene: "wow-archer", mechanism: "text", verdict: "keep", at: "2026-08-26T18:21:52.962Z", by: "operator" },
  { run: "2026-08-26-dry-run", scene: "wow-archer", mechanism: "ref-early", verdict: "keep", at: "2026-08-26T18:21:52.962Z", by: "operator" },
  { run: "2026-08-26-sweep-01", scene: "lotr-cavalry", mechanism: "ref-early", verdict: "keep", at: "2026-08-27T07:13:28.768Z", by: "operator" },
];
const painted = {
  id: "painted-3d",
  name: "Painted 3D",
  family: "animation",
  status: "proven",
  origin: { kind: "readback", source: "arcane-fights", models: ["qwen3.8:27b", "gemini-3.7-flash"] },
  observables: { render_mode: "painterly", palette_strategy: "warm-cool-split", black_handling: "crushed" },
  recipe: "Stylised 3D characters with hand-painted matte textures and visible brush strokes on every surface.",
  negative: "photograph, photoreal skin, film grain, flat cel shading, text, watermark",
  evidence: paintedEvidence,
};

describe("style", () => {
  it("parses v1's painted-3d, proven on two distinct run/scene keeps", () => {
    const s = accept(styleSchema, painted);
    expect("palette" in s).toBe(false);
  });
  it("proven needs operator keeps in two distinct run/scene cells — two mechanisms on one cell are one", () => {
    refuse(styleSchema, { ...painted, evidence: paintedEvidence.slice(0, 2) }, "1");
  });
  it("an agent's keep is evidence, not a vote", () => {
    const agent = paintedEvidence.map((e, i) => (i === 2 ? { ...e, by: "agent" } : e));
    refuse(styleSchema, { ...painted, status: "locked", evidence: agent }, "operator keeps");
    accept(styleSchema, { ...painted, status: "candidate", evidence: agent });
  });
  it("a palette is three colours, one per role", () => {
    const palette = [
      { name: "ink", hex: "#0b0d12", role: "ground" },
      { name: "bone", hex: "#e8e1d4", role: "objects" },
      { name: "neon", hex: "#2fb7ff", role: "accent" },
    ];
    accept(styleSchema, { ...painted, palette });
    refuse(styleSchema, { ...painted, palette: [palette[0], palette[1], { ...palette[2], role: "objects" }] }, "one colour per role");
    refuse(styleSchema, { ...painted, palette: palette.slice(0, 2) }, "palette");
  });
  it("only a replica exemplar carries a settle reason", () => {
    const ex = { role: "source", media: BLOB, run: "2026-08-27-artstyle-train" };
    accept(styleSchema, { ...painted, exemplars: [ex, { ...ex, role: "replica", settled: "no-usable-fix" }] });
    refuse(styleSchema, { ...painted, exemplars: [{ ...ex, settled: "target-met" }] }, "settled");
  });
});
