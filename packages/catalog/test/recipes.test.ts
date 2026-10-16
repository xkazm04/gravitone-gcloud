import { describe, expect, it } from "vitest";
import { COMPOSER_RECIPE, PART_OPTIONS } from "../src/partOptions.ts";
import { TEMPLATES } from "../src/projects.ts";
import { filmDefaults, planParts, RECIPE_IDS, RECIPES, recipeById, WORK_KINDS } from "../src/recipes.ts";

describe("recipes", () => {
  it("has one film per v1 template that is not a music video, then album, explainer and the singles", () => {
    const films = RECIPES.filter((r) => r.family === "film");
    expect(films.map((r) => r.template).sort()).toEqual(TEMPLATES.map((t) => t.id).filter((id) => id !== "music-video").sort());
    expect(RECIPE_IDS.slice(0, 3)).toEqual(["film/short-educational-video", "album-video", "explainer"]);
    for (const id of ["article/post", "track/music", "track/sfx", "style/extract", "style/forge-sweep", "style/dojo-cycle", "strips/edu", "strips/stat"]) expect(RECIPE_IDS).toContain(id);
    expect(new Set(RECIPE_IDS).size).toBe(RECIPE_IDS.length);
  });

  it("keeps every recipe a graph: keys unique, edges point at a key before them, a gate waits for what it judges", () => {
    for (const r of RECIPES) {
      const seen = new Set<string>();
      for (const p of r.parts) {
        expect(seen.has(p.key), `${r.id}: ${p.key} twice`).toBe(false);
        for (const dep of p.after) expect(seen.has(dep), `${r.id}: ${p.key} waits for ${dep}, not declared before it`).toBe(true);
        if (p.kind === "gate") expect(p.after).toContain(p.judges);
        seen.add(p.key);
      }
    }
  });

  it("gives every units input a recipe reads a default that says where it came from", () => {
    for (const r of RECIPES)
      for (const p of r.parts)
        if (p.kind !== "gate" && p.kind !== "slot" && "input" in p.units) {
          const d = r.defaults[p.units.input];
          expect(d, `${r.id}: ${p.key} reads ${p.units.input} with no default`).toBeDefined();
          expect(d?.note.length).toBeGreaterThan(10);
        }
  });

  it("draws the prototype's trailer from a 120 s template exactly (24 plates, 8 shots, 2 prompts)", () => {
    const d = filmDefaults(120);
    expect([d.plates.value, d.shots.value, d.prompts.value]).toEqual([24, 8, 2]);
    const film = recipeById("film/trailer");
    expect(film?.defaults.plates?.value).toBe(24);
    const short = filmDefaults(15);
    expect(short.plates.value).toBe(3);
    expect(short.prompts.value).toBe(1);
  });

  it("plans units from the inputs, clamped into the part's range, defaults otherwise", () => {
    const film = recipeById("film/trailer");
    if (film === undefined) throw new Error("no film/trailer");
    const units = (inputs: Parameters<typeof planParts>[1]) => Object.fromEntries(planParts(film, inputs).flatMap((p) => ("units" in p ? [[p.key, p.units]] : [])));
    expect(units({})).toMatchObject({ research: 1, frames: 24, motion: 8, score: 2, cut: 1 });
    expect(units({ plates: 40, shots: 999 })).toMatchObject({ frames: 40, motion: 200 });
    expect(units({ plates: 0 })).toMatchObject({ frames: 1 });
  });

  it("declares options for every work kind, and routes every composer lane to a recipe that exists", () => {
    for (const k of WORK_KINDS) expect(PART_OPTIONS[k].options.length, k).toBeGreaterThan(0);
    for (const c of Object.values(COMPOSER_RECIPE)) for (const id of [c.recipe, c.music, c.sfx]) if (id !== undefined) expect(recipeById(id), id).toBeDefined();
  });
});
