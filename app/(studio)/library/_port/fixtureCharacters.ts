import "server-only";

import { ageBand, buildOf, corePrompt, type CharacterExtras, type CharacterLook } from "@gt/domain/library";

import { fileBlob, type FixtureMedia } from "./fixtureData.ts";

// THE FIXTURE'S MUSE CHARACTERS - six `character` items (spark scout-use-aim) in the shape the
// character feed (lib/library/feeds/character.ts) writes: one item per woman, her card, the core
// prompt corePrompt builds from it, and every look she was kept in, newest first. Their stills are
// the fixture's public style presets, so a tile and a thumbnail draw something; the dates are fixed and
// the corpus draws nothing from its random stream for them (the stream before them is unchanged).

type Still = { readonly night: string; readonly c: string; readonly look?: string; readonly genre: string; readonly app: string; readonly style: "blueprint" | "chalk-argument" | "data-neon" | "newsprint-cutout" | "paper-relief"; readonly styleId?: string };

type Spec = {
  readonly slug: string;
  readonly card: CharacterExtras["card"];
  readonly state: "ratified" | "candidate";
  /** Newest first. */
  readonly stills: readonly Still[];
  /** The newest still's prompt: look, card, action, Avoid - the order techniques.md fixes. */
  readonly prompt: string;
};

const SPECS: readonly Spec[] = [
  {
    slug: "sofia",
    card: { name: "Sofia", age: 29, look: "olive skin, long dark wavy hair with a centre part, faint freckles across the nose, slim build, an emerald silk scarf", personality: "a warm, impulsive travel photographer who laughs easily" },
    state: "ratified",
    stills: [
      { night: "2026-10-24", c: "c-02", look: "risograph-two-colour", genre: "risograph two-colour print", app: "dating-sim", style: "paper-relief", styleId: "paper-relief" },
      { night: "2026-10-23-2", c: "c-02", look: "35mm-anamorphic", genre: "ultra-photoreal portrait", app: "videogame", style: "newsprint-cutout" },
    ],
    prompt: "Two-colour risograph print, misregistered inks, grain. Sofia, aged 29, olive skin, long dark wavy hair with a centre part, faint freckles across the nose, slim build, an emerald silk scarf. Seated at a harbour cafe, looking up from a camera, half a smile. Avoid: text, watermark, extra fingers.",
  },
  {
    slug: "hana",
    card: { name: "Hana", age: 31, look: "fair skin, a sleek black bob with blunt bangs, narrow rectangular glasses, slender build, a charcoal turtleneck", personality: "a calm, precise game designer with a hidden sarcastic streak" },
    state: "ratified",
    stills: [
      { night: "2026-10-23-2", c: "c-03", look: "anime-cel", genre: "anime cel", app: "companion-chat", style: "data-neon", styleId: "data-neon" },
    ],
    prompt: "Anime cel shading, flat shadow shapes, clean line. Hana, aged 31, fair skin, a sleek black bob with blunt bangs, narrow rectangular glasses, slender build, a charcoal turtleneck. At a desk of sketched level maps, one eyebrow raised. Avoid: text, watermark, warped hands.",
  },
  {
    slug: "nadia",
    card: { name: "Nadia", age: 33, look: "fair skin, straight platinum hair in a high ponytail, an angular jaw, a thin scar through the left eyebrow, lean build, a black leather jacket", personality: "a guarded motorcycle mechanic who warms up slowly" },
    state: "ratified",
    stills: [
      { night: "2026-10-24", c: "c-05", look: "real-time-3d", genre: "real-time 3D companion", app: "videogame", style: "blueprint" },
      { night: "2026-10-23-2", c: "c-08", genre: "ultra-photoreal portrait", app: "roleplay", style: "chalk-argument" },
    ],
    prompt: "Real-time 3D render, soft rim light, shallow depth. Nadia, aged 33, fair skin, straight platinum hair in a high ponytail, an angular jaw, a thin scar through the left eyebrow, lean build, a black leather jacket. Leaning on a workbench, wiping oil from her hands. Avoid: text, watermark.",
  },
  {
    slug: "leila",
    card: { name: "Leila", age: 38, look: "deep brown skin, short natural curls, high cheekbones, athletic build, a mustard field jacket", personality: "a dry-witted war correspondent who never quite sits down" },
    state: "ratified",
    stills: [{ night: "2026-10-24", c: "c-07", look: "gouache-portrait", genre: "gouache portrait", app: "genre-video", style: "newsprint-cutout", styleId: "newsprint-cutout" }],
    prompt: "Gouache on toned paper, visible brush ridges. Leila, aged 38, deep brown skin, short natural curls, high cheekbones, athletic build, a mustard field jacket. Crossing a rain-wet square at dusk, notebook under her arm. Avoid: text, watermark, extra fingers.",
  },
  {
    slug: "katya",
    card: { name: "Katya", age: 44, look: "pale skin, silver-streaked auburn hair pinned up, grey eyes, slender build, a wine-red wool coat", personality: "a patient antiquarian bookseller with a taste for gossip" },
    state: "ratified",
    stills: [{ night: "2026-10-23-2", c: "c-11", look: "ink-wash", genre: "ink wash", app: "short", style: "chalk-argument" }],
    prompt: "Ink wash with dry-brush edges on rice paper. Katya, aged 44, pale skin, silver-streaked auburn hair pinned up, grey eyes, slender build, a wine-red wool coat. Behind a shop counter stacked with spines, glancing over her shoulder. Avoid: text, watermark.",
  },
  {
    slug: "noor",
    card: { name: "Noor", age: 27, look: "light brown skin, a long braid over one shoulder, wide-set dark eyes, curvy-and-fit build, a denim apron", personality: "an eager pastry chef who narrates everything she bakes" },
    state: "candidate",
    stills: [{ night: "2026-10-24", c: "c-09", look: "35mm-anamorphic", genre: "ultra-photoreal portrait", app: "companion-chat", style: "paper-relief" }],
    prompt: "35mm anamorphic still, warm tungsten, light halation. Noor, aged 27, light brown skin, a long braid over one shoulder, wide-set dark eyes, curvy-and-fit build, a denim apron. Flour on her forearms at a steel bench, laughing at someone off frame. Avoid: text, watermark, extra fingers.",
  },
];

export type FixtureCharacter = {
  readonly id: string;
  readonly title: string;
  readonly state: Spec["state"];
  readonly at: string;
  readonly vocabulary: { readonly age: number; readonly build?: string; looks: string[]; applications: string[] };
  readonly f: Record<string, string[]>;
  readonly media: { readonly sha256: string; readonly bytes: number; readonly mime: string };
  readonly facts: FixtureMedia;
  readonly extras: CharacterExtras;
  readonly meta: string;
  readonly runs: readonly string[];
  readonly styleIds: readonly string[];
};

const stillOf = (s: Still): FixtureMedia => fileBlob(`/presets/${s.style}.jpg`, 1080, 1920);
const uniq = <T,>(xs: readonly T[]): T[] => [...new Set(xs)];

/** The six characters, newest still first, a card to a prompt. */
export function fixtureCharacters(): readonly FixtureCharacter[] {
  return SPECS.map((s) => {
    const newest = s.stills[0] as Still;
    const m = stillOf(newest);
    const looks: CharacterLook[] = s.stills.map((x) => ({ night: x.night, cell: `${x.c}/board`, ...(x.look === undefined ? {} : { look: x.look }), genre: x.genre, image: stillOf(x).url, ...(x.styleId === undefined ? {} : { styleId: x.styleId }) }));
    const build = buildOf(s.card.look);
    const lookSlugs = uniq(s.stills.flatMap((x) => (x.look === undefined ? [] : [x.look])));
    const apps = uniq(s.stills.map((x) => x.app));
    const runs = uniq(s.stills.map((x) => `muse:${x.night}`));
    const band = ageBand(s.card.age);
    return {
      id: `character:muse:${s.slug}`,
      title: s.card.name,
      state: s.state,
      at: `${newest.night.slice(0, 10)}T08:00:00.000Z`,
      vocabulary: { age: s.card.age, ...(build === undefined ? {} : { build }), looks: lookSlugs, applications: apps },
      f: { age: [band], ...(build === undefined ? {} : { build: [build] }), look: lookSlugs, application: apps, run: runs },
      media: { sha256: m.sha, bytes: 310_000, mime: m.mime },
      facts: m,
      extras: { card: s.card, prompt: corePrompt(s.card, s.prompt), looks },
      meta: `aged ${s.card.age}${build === undefined ? "" : ` · ${build} build`} · ${looks.length} ${looks.length === 1 ? "look" : "looks"}`,
      runs,
      styleIds: uniq(s.stills.flatMap((x) => (x.styleId === undefined ? [] : [x.styleId]))),
    };
  });
}
