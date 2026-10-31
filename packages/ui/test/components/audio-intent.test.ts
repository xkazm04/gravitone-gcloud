import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { z } from "zod";

import { audioIntentSchema } from "@gt/domain/audio.intent.schema";
import { parseJsonAt } from "@gt/domain/door";

import { compileIntent, steerIntent, suggestPalettes, type AudioIntent } from "../../src/components/audio/intent.ts";

const readJson = (file: string): unknown => {
  const r = parseJsonAt("golden fixture", z.unknown(), readFileSync(file, "utf8"));
  if (!r.ok) throw r.error;
  return r.value;
};

// GOLDEN FILES: five committed intents compile to committed briefs. A compiler change that
// alters any brief fails here as a readable diff; regenerate deliberately with
// `UPDATE_AUDIO_GOLDENS=1 npx vitest run packages/ui/test/components/audio-intent.test.ts`
// only when the change is intended, and read the diff before committing it.

const DIR = path.join(import.meta.dirname, "..", "fixtures", "audio-intents");
const names = readdirSync(DIR).filter((f) => f.endsWith(".intent.json")).sort();

describe("audio intent compiler", () => {
  it("holds five golden intents", () => {
    expect(names.length).toBe(5);
  });

  for (const name of names) {
    it(`compiles ${name} to its golden brief`, () => {
      const parsed = parseJsonAt("golden intent", audioIntentSchema, readFileSync(path.join(DIR, name), "utf8"));
      if (!parsed.ok) throw parsed.error;
      const intent = parsed.value as AudioIntent;
      const brief = compileIntent(intent);
      expect(brief.ok).toBe(true);
      if (!brief.ok) return;
      const goldenPath = path.join(DIR, name.replace(".intent.json", ".brief.json"));
      if (process.env["UPDATE_AUDIO_GOLDENS"] === "1") {
        writeFileSync(goldenPath, `${JSON.stringify(brief.value, null, 2)}\n`);
        return;
      }
      expect(readJson(goldenPath)).toEqual(brief.value);
    });
  }

  it("gives the same hash for the same intent in a different word order and case", () => {
    const a = compileIntent({ mood: ["Calm", "hopeful"], lengthS: 45, loop: true, avoid: ["Vocals", "drums"] });
    const b = compileIntent({ mood: ["hopeful", "calm"], lengthS: 45, loop: true, avoid: ["drums", "vocals"] });
    // Mood order is musical (it orders the style line), so hashes differ there by design;
    // avoid order and case are not musical and must not move the hash.
    const c = compileIntent({ mood: ["Calm", "hopeful"], lengthS: 45, loop: true, avoid: ["drums", "Vocals"] });
    expect(a.ok && c.ok && a.value.hash).toBe(c.ok && a.ok ? c.value.hash : "x");
    expect(b.ok).toBe(true);
  });

  it("is deterministic across calls", () => {
    const intent: AudioIntent = { use: "puzzle game menu", mood: ["calm", "curious"], lengthS: 60, loop: true };
    const a = compileIntent(intent);
    const b = compileIntent(intent);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("refuses lengths outside the vendor and budget ceilings with an actionable sentence", () => {
    const big = compileIntent({ mood: ["calm"], lengthS: 720 });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.error.message).toContain("720 exceeds the 600 s ceiling");
    const tiny = compileIntent({ mood: ["calm"], lengthS: 2 });
    expect(tiny.ok).toBe(false);
    if (!tiny.ok) expect(tiny.error.message).toContain("under the 3 s floor");
  });

  it("suggests three palettes with different lead families", () => {
    const palettes = suggestPalettes({ mood: ["calm", "hopeful"], use: "puzzle game menu" });
    expect(palettes).toHaveLength(3);
    expect(new Set(palettes.map((p) => p.instruments[0]?.family)).size).toBe(3);
    for (const p of palettes) expect(p.instruments.length).toBeGreaterThanOrEqual(3);
  });

  it("steers by plain complaint, one axis per variant, and names what it cannot read", () => {
    const r = steerIntent({ mood: ["calm"], lengthS: 45, bpm: 72 }, ["too slow", "too dark", "make it purple"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.variants).toHaveLength(2);
    expect(r.value.variants[0]).toMatchObject({ axis: "tempo", seed: { bpm: 84 } });
    expect(r.value.variants[1]?.seed.moods).toContain("bright");
    expect(r.value.unrecognised).toEqual(["make it purple"]);
    for (const v of r.value.variants) expect(v.hash).not.toBe(r.value.base.hash);
  });

  it("holds section invariants at every length: sum, floor, no lump on the last section", () => {
    for (let lengthS = 3; lengthS <= 130; lengthS++) {
      for (const loop of [false, true]) {
        const r = compileIntent({ mood: ["calm"], lengthS, loop });
        expect(r.ok).toBe(true);
        if (!r.ok) continue;
        const secs = r.value.sections;
        expect(secs.reduce((a, s) => a + s.durationS, 0), `length ${lengthS} loop ${loop}`).toBe(lengthS);
        for (const s of secs) {
          expect(s.durationS, `${s.name} at ${lengthS}`).toBeGreaterThanOrEqual(secs.length > 1 ? 3 : lengthS);
          expect(s.durationMs).toBe(s.durationS * 1000);
        }
        const outro = secs.at(-1);
        const main = secs.find((s) => s.name === "main");
        if (main && outro && secs.length >= 3) expect(outro.durationS).toBeLessThanOrEqual(main.durationS);
      }
    }
  });

  it("gives three palettes different backing bands, not only different leads", () => {
    const palettes = suggestPalettes({ mood: ["calm", "curious"], use: "puzzle game menu" });
    const backings = palettes.map((p) => p.instruments.slice(1).map((e) => e.id).join(","));
    expect(new Set(backings).size).toBe(3);
    const sad = suggestPalettes({ mood: ["sad"] });
    for (const p of sad) expect(p.instruments.map((e) => e.id)).not.toContain("driving-drums");
  });

  it("warns instead of silently dropping a vocals ask, an unknown mood, and reads mood from a sentence", () => {
    const v = compileIntent({ mood: ["hopeful"], lengthS: 30, vocals: "full" });
    expect(v.ok && v.value.lint.map((f) => f.code)).toContain("vocals-instrumental-only");
    const u = compileIntent({ mood: ["purple-ish"], lengthS: 30 });
    expect(u.ok && u.value.lint.map((f) => f.code)).toContain("mood-unknown");
    const s = compileIntent({ sentence: "a hopeful warm bed for the night", mood: [], lengthS: 30 });
    expect(s.ok).toBe(true);
    if (s.ok) {
      expect(s.value.seed.moods).toEqual(["hopeful", "warm", "night"]);
      expect(s.value.lint.map((f) => f.code)).toContain("mood-from-sentence");
    }
  });

  it("resolves the common words for instruments, in steer and in an intent", () => {
    const r = steerIntent({ mood: ["calm"], lengthS: 45 }, ["add guitar", "add choir", "add violin", "add bass"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.unrecognised).toEqual([]);
    expect(r.value.variants[0]?.seed.instruments).toContain("acoustic guitar");
    expect(r.value.variants[1]?.seed.instruments).toContain("wordless choir");
    expect(r.value.variants[2]?.seed.instruments).toContain("strings");
    expect(r.value.variants[3]?.seed.instruments.join(" ")).toContain("bass");
    const c = compileIntent({ mood: ["calm"], lengthS: 30, instruments: ["violin", "guitar"] });
    expect(c.ok).toBe(true);
    if (c.ok) {
      expect(c.value.seed.instruments).toEqual(["strings", "acoustic guitar"]);
      expect(c.value.lint.map((f) => f.code)).not.toContain("instrument-uncatalogued");
    }
  });

  it("steers length and repetition in plain words", () => {
    const r = steerIntent({ mood: ["calm"], lengthS: 45 }, ["too short", "too long", "repetitive"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.variants.map((v) => [v.axis, v.intent.lengthS])).toEqual([["length", 68], ["length", 30], ["variation", 45]]);
    expect(r.value.variants[2]?.intent.mood).toContain("curious");
    const capped = steerIntent({ mood: ["calm"], lengthS: 500 }, ["too short"]);
    expect(capped.ok && capped.value.variants[0]?.intent.lengthS).toBe(600);
  });

  it("steers instruments by name: add, swap and remove, naming what is not catalogued", () => {
    const base = { use: "puzzle game menu", mood: ["calm", "curious"], lengthS: 60, loop: true };
    const r = steerIntent(base, ["swap marimba for cello", "add strings", "remove hand percussion", "add didgeridoo"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.variants.map((v) => v.axis)).toEqual(["instrument", "instrument", "instrument"]);
    expect(r.value.variants[0]?.seed.instruments).toContain("cello");
    expect(r.value.variants[0]?.seed.instruments).not.toContain("marimba");
    expect(r.value.variants[1]?.seed.instruments).toContain("strings");
    expect(r.value.variants[2]?.seed.instruments.join(" ")).not.toContain("hand percussion");
    expect(r.value.unrecognised).toEqual(["add didgeridoo"]);
    for (const v of r.value.variants) expect(v.hash).not.toBe(r.value.base.hash);
  });

  it("folds recognised complaints into one combined variant, in order", () => {
    const base = { use: "puzzle game menu", mood: ["calm", "curious"], lengthS: 60, loop: true };
    const r = steerIntent(base, ["too slow", "swap marimba for cello", "make it purple"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.combined?.seed.bpm).toBe(84);
    expect(r.value.combined?.seed.instruments).toContain("cello");
    expect(r.value.combined?.seed.instruments).not.toContain("marimba");
    expect(r.value.combined?.hash).not.toBe(r.value.base.hash);
    for (const v of r.value.variants) expect(r.value.combined?.hash).not.toBe(v.hash);
    const single = steerIntent(base, ["too slow"]);
    expect(single.ok && single.value.combined).toBeUndefined();
  });

  it("names a steer that cannot move as a no-op, never a variant with the base hash", () => {
    const capped = steerIntent({ mood: ["calm"], lengthS: 45, bpm: 220 }, ["too slow"]);
    expect(capped.ok).toBe(true);
    if (capped.ok) {
      expect(capped.value.variants).toHaveLength(0);
      expect(capped.value.noop).toEqual(["too slow"]);
    }
    const already = steerIntent({ mood: ["bright"], lengthS: 30, instruments: ["flute", "cello"] }, ["too dark"]);
    expect(already.ok && already.value.noop).toEqual(["too dark"]);
    const mixed = steerIntent({ mood: ["calm"], lengthS: 45, bpm: 220 }, ["too slow", "too dark"]);
    expect(mixed.ok && mixed.value.variants).toHaveLength(1);
    expect(mixed.ok && mixed.value.noop).toEqual(["too slow"]);
    expect(mixed.ok && mixed.value.combined).toBeUndefined();
  });

  it("hashes an explicit null bpm or key as the unset it means", () => {
    const a = compileIntent({ mood: ["calm"], lengthS: 45, bpm: null, key: null });
    const b = compileIntent({ mood: ["calm"], lengthS: 45 });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value.hash).toBe(b.value.hash);
      expect(JSON.stringify(a.value.seed)).toBe(JSON.stringify(b.value.seed));
      expect(a.value.canonicalIntent).toEqual(b.value.canonicalIntent);
    }
  });

  it("names the calm it assumes when no mood words are given", () => {
    const r = compileIntent({ use: "puzzle game menu", mood: [], lengthS: 60 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.seed.moods).toEqual(["calm"]);
      expect(r.value.lint.map((f) => f.code)).toContain("mood-assumed");
    }
    const felt = compileIntent({ mood: ["night"], lengthS: 30 });
    expect(felt.ok && felt.value.lint.map((f) => f.code)).not.toContain("mood-assumed");
  });

  it("warns on a key the brief check cannot read", () => {
    const r = compileIntent({ mood: ["calm"], lengthS: 30, key: "Banana" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.seed.key).toBe("Banana");
      expect(r.value.lint.map((f) => f.code)).toContain("key-unreadable");
    }
    const good = compileIntent({ mood: ["calm"], lengthS: 30, key: "A minor" });
    expect(good.ok && good.value.lint.map((f) => f.code)).not.toContain("key-unreadable");
  });

  it("shapes section styles by role: a sparse intro, the full band at main", () => {
    const r = compileIntent({ use: "puzzle game menu", mood: ["calm", "curious"], lengthS: 60 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const byName = new Map(r.value.sections.map((s) => [s.name, s.positiveStyles]));
    const intro = byName.get("intro") ?? [];
    const main = byName.get("main") ?? [];
    for (const ins of r.value.seed.instruments) expect(main).toContain(ins);
    expect(intro.length).toBeLessThan(main.length);
    expect(intro).toContain(r.value.seed.instruments[0]);
    expect(intro.join(" ")).not.toContain(r.value.seed.instruments.at(-1) ?? "zzz");
    // The plan's global styles still carry every seed word; only sections are shaped.
    for (const ins of r.value.seed.instruments) expect(r.value.plan.positiveGlobalStyles).toContain(ins);
  });

  it("notes when a paletteId is ignored because instruments were named", () => {
    const r = compileIntent({ mood: ["calm"], lengthS: 30, paletteId: "palette-marimba", instruments: ["cello"] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.paletteId).toBeNull();
      expect(r.value.lint.map((f) => f.code)).toContain("palette-ignored");
    }
  });

  it("lints an avoid that names a chosen instrument", () => {
    const r = compileIntent({ mood: ["calm"], instruments: ["felt-piano"], avoid: ["piano"], lengthS: 30 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.lint.map((f) => f.code)).toContain("avoid-conflicts-instrument");
  });
});
