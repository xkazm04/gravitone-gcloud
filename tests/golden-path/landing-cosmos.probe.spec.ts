// LANE — THE LANDING DRAWS THE REGISTRIES, AND ONLY THE REGISTRIES (dynamic).
//
// The Paper Cosmos (app/_landing/cosmos) replaced a landing that was hand-placed
// for four constellations and was already three disciplines and three templates
// behind the app on the day it was retired. The redesign's whole claim is the
// GROWTH PROPERTY: a discipline appended to lib/projects DISCIPLINES, a template
// to TEMPLATES, an area to app/library/areas.ts or a preset to PRESETS appears
// on the landing with no landing edit, in its own seeded colour and shape.
//
// Two halves hold it, and this file pins both:
//   1. data.ts reads every list from the registry that owns it (one type per
//      discipline, one template per template, one family per area, Styles = the
//      presets), so nothing is copied;
//   2. the engine never names an item. Its looks come from hash(id), its layout
//      from counts. An id spelled as a literal anywhere in the engine is a
//      special case waiting to drift, so a literal id fails here even if the
//      code around it is harmless today.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { registryGalaxy } from "@/app/_landing/cosmos/data";
import { LIBRARY_AREAS } from "@/app/library/areas";
import { PRESETS, thumbSrc } from "@/app/library/presets";
import { DISCIPLINES, PHASES, TEMPLATES, TEMPLATE_FAMILY } from "@/lib/projects";

import { stripComments } from "./_helpers";

const ENGINE = "app/_landing/cosmos/engine";

test("registryGalaxy has one type per discipline, one template per template, one family per area", () => {
  const g = registryGalaxy();

  expect(g.types.map((t) => t.id)).toEqual([...DISCIPLINES]);
  for (const t of g.types) expect(t.label, `type ${t.id} has a label`).toBeTruthy();

  expect(g.templates.map((t) => t.id)).toEqual(TEMPLATES.map((t) => t.id));
  const typeIds = new Set(g.types.map((t) => t.id));
  for (const t of g.templates) {
    expect(typeIds.has(t.type), `template ${t.id} points at type ${t.type}, which the galaxy does not have`).toBe(true);
    expect(t.type).toBe(TEMPLATE_FAMILY[t.id as keyof typeof TEMPLATE_FAMILY]);
  }

  expect(g.library.map((f) => f.id)).toEqual(LIBRARY_AREAS.map((a) => a.id));
  for (const a of LIBRARY_AREAS) {
    const f = g.library.find((x) => x.id === a.id)!;
    expect(f.status, `${a.id}: locked in the registry is locked on the landing`).toBe(a.locked ? "locked" : "live");
  }

  expect(g.studioSteps).toEqual([...PHASES]);
});

test("Styles carries the presets, with their pictures and no invented counts", () => {
  const styles = registryGalaxy().library.find((f) => f.id === "styles");
  expect(styles, "the Styles area is on the landing").toBeTruthy();
  expect(styles!.categories.map((c) => c.id)).toEqual(PRESETS.map((p) => p.id));
  for (const c of styles!.categories) {
    expect(c.art).toBe(thumbSrc(c.id));
    // per-user counts live in IndexedDB; a public page must never claim one
    expect(c.items).toBeNull();
  }
});

test("no engine source names a discipline, template or library area", () => {
  const files = readdirSync(ENGINE).filter((f) => f.endsWith(".ts"));
  // a walk that reads nothing would pass in a voice indistinguishable from success
  expect(files.length, "the engine walk found no modules — it is reading the wrong tree").toBeGreaterThan(8);

  const ids = [...DISCIPLINES, ...TEMPLATES.map((t) => t.id), ...LIBRARY_AREAS.map((a) => a.id)];
  const offenders: string[] = [];
  for (const f of files) {
    const src = stripComments(readFileSync(join(ENGINE, f), "utf8"));
    for (const id of ids) {
      const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const hit = new RegExp(`(["'\`])${esc}\\1`).exec(src);
      if (hit) offenders.push(`${ENGINE}/${f} spells ${hit[0]}`);
    }
  }
  expect(
    offenders,
    "the engine must derive every look from hash(id) and every position from counts; a literal id is a special case that the next registry entry will not get",
  ).toEqual([]);
});
