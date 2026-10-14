import { describe, expect, expectTypeOf, it } from "vitest";
import { LIBRARY_AREAS, libraryArea } from "../src/libraryAreas.ts";
import { PRESETS, presetById, thumbSrc } from "../src/presets.ts";
import {
  DISCIPLINES,
  PHASES,
  TEMPLATES,
  TEMPLATE_FAMILY,
  disciplineOf,
  templateOf,
  templatesFor,
  type TemplateId,
} from "../src/projects.ts";
import { deckArtFor } from "../src/deckArt.ts";

describe("projects catalogue", () => {
  it("keeps the six steps in production order", () => {
    expect(PHASES).toEqual(["research", "script", "frames", "motion", "score", "cut"]);
  });
  it("keeps the ten template ids in append order", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([
      "short-form-clip",
      "short-educational-video",
      "mid-educational-video",
      "teaser",
      "trailer",
      "cinematic",
      "free-form",
      "music-video",
      "ad-social-15",
      "ad-spot-30",
    ]);
  });
  it("types TemplateId as the union of those ids", () => {
    expectTypeOf<TemplateId>().toEqualTypeOf<
      | "short-form-clip"
      | "short-educational-video"
      | "mid-educational-video"
      | "teaser"
      | "trailer"
      | "cinematic"
      | "free-form"
      | "music-video"
      | "ad-social-15"
      | "ad-spot-30"
    >();
  });
  it("gives every discipline a template", () => {
    for (const d of DISCIPLINES) expect(templatesFor(d).length).toBeGreaterThan(0);
    expect(TEMPLATE_FAMILY.teaser).toBe("trailer");
  });
  it("falls back positionally to short-educational-video", () => {
    expect(templateOf("nope" as TemplateId).id).toBe("short-educational-video");
    expect(disciplineOf("ad-spot-30")).toBe("ads");
  });
});

describe("presets, areas, deck art", () => {
  it("lists six presets, all educational", () => {
    expect(PRESETS).toHaveLength(6);
    expect(presetById.get("blueprint")?.discipline).toBe("educational");
    expect(thumbSrc("blueprint")).toBe("/presets/blueprint.jpg");
  });
  it("lists four library areas, animations locked", () => {
    expect(LIBRARY_AREAS.map((a) => a.id)).toEqual(["styles", "assets", "animations", "audio"]);
    expect(libraryArea("animations").locked).toBe("no engine yet");
  });
  it("answers undefined for art that was never made", () => {
    expect(deckArtFor("template", "trailer")?.src).toBe("/deck-art/template-trailer.webp");
    expect(deckArtFor("discipline", "ads")).toBeUndefined();
  });
});
