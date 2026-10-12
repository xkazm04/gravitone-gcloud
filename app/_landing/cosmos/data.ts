// The registries → the Galaxy the landing draws.
//
// Every list here is READ from the registry that owns it, never copied: a
// discipline appended to lib/projects DISCIPLINES, a template to TEMPLATES, an
// area to app/library/areas.ts or a preset to PRESETS appears on the landing
// with no landing edit. That is the whole point of the redesign (spark
// landing-galaxy): the old atlas was hand-placed for four constellations and was
// already three disciplines and three templates behind the app when it was
// replaced.
//
// Art comes from the deck-art manifest (app/_studio/deckArt.ts) by its
// `<family>-<id>` key; an entry without art gets `null`, and the engine draws it.

import { DECK_ART } from "@/app/_studio/deckArt";
import { LIBRARY_AREAS } from "@/app/library/areas";
import { PRESETS, thumbSrc } from "@/app/library/presets";
import { DISCIPLINES, DISCIPLINE_LABEL, PHASES, TEMPLATES, TEMPLATE_FAMILY } from "@/lib/projects";

import type { Galaxy, GalaxyFamily } from "./types";

const art = (key: string): string | null => DECK_ART[key]?.src ?? null;

export function registryGalaxy(): Galaxy {
  const library: GalaxyFamily[] = LIBRARY_AREAS.map((a) => ({
    id: a.id,
    label: a.label,
    status: a.locked ? "locked" : "live",
    // Styles is the one area whose contents are public and fixed: the presets.
    // The others are per-user (IndexedDB), so the public page shows the area
    // and no invented contents.
    categories:
      a.id === "styles"
        ? PRESETS.map((p) => ({ id: p.id, label: p.name, items: null, art: thumbSrc(p.id) }))
        : [],
  }));
  return {
    types: DISCIPLINES.map((d) => ({ id: d, label: DISCIPLINE_LABEL[d], art: art(`discipline-${d}`) })),
    templates: TEMPLATES.map((t) => ({
      id: t.id,
      label: t.label,
      type: TEMPLATE_FAMILY[t.id],
      seconds: t.defaultS ?? null,
      art: art(`template-${t.id}`),
    })),
    library,
    studioSteps: [...PHASES],
  };
}
