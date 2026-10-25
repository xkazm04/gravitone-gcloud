import "server-only";

import { PIECE_TRIALS, type GenreState } from "@gt/domain/genre";
import { genreItemId, genreLibraryState, ventureItemId, type GenreExtras, type VentureExtras } from "@gt/domain/library";

import { fileBlob, type FixtureMedia } from "./fixtureData.ts";

// THE FIXTURE'S GENRES AND VENTURES - four `genre` items and one `venture` (spark scout-vision S2) in the shape
// the genre feed (lib/library/feeds/genre.ts) writes: one on each rung of the ladder and one retired, the
// publishable one tied to the channel venture born from it. Their panels are the fixture's public presets and the
// kept piece is a preset clip, so a tile and the detail draw something; the retired genre's storyboard was never
// drawn, so it has no media and the Library draws its designed face. Fixed dates; the corpus draws nothing from
// its random stream for them.

type Preset = "blueprint" | "chalk-argument" | "data-neon" | "newsprint-cutout" | "paper-relief";

type GenreSpec = {
  readonly id: string;
  readonly name: string;
  readonly state: GenreState;
  readonly night: string;
  readonly storyboard: string;
  readonly use: string;
  readonly look: string;
  readonly grammar: readonly string[];
  readonly trials: readonly string[];
  readonly piece?: { readonly ref: string; readonly verdict: "kept" | "rejected" | "open"; readonly clip?: Preset };
  readonly panel?: Preset;
  readonly venture?: string;
  readonly retiredAt?: string;
};

const VENTURE = {
  id: "vn-quiet-desk",
  name: "Quiet Desk",
  kind: "channel" as const,
  tone: "deadpan, dry",
  audience: "office workers, 25-40",
  format: "a 30 s vertical Short",
  look: "painted 3D, soft key light, muted teal and mustard",
  proposal: "2026-10-24/c-15",
  bornAt: "2026-10-24T08:10:00.000Z",
};

const SPECS: readonly GenreSpec[] = [
  {
    id: "gn-deadpan-office-satire-painted-3d",
    name: "deadpan office satire, painted 3D",
    state: "publishable",
    night: "2026-10-12",
    storyboard: "c-04",
    use: "a 30 s Short: one meeting that should have been an email, played straight",
    look: "painted 3D, soft key light, muted teal and mustard",
    grammar: ["cold open on a mundane object", "the absurd rule stated flatly", "escalation without a reaction shot", "a beat of silence", "the deadpan button"],
    trials: ["2026-10-14/c-06", "2026-10-16/c-03", "2026-10-19/c-07", "2026-10-21/c-02"],
    piece: { ref: "2026-10-23/c-11", verdict: "kept", clip: "paper-relief" },
    panel: "paper-relief",
    venture: VENTURE.id,
  },
  {
    id: "gn-kitchen-table-science-chalk-diagram",
    name: "kitchen-table science, chalk diagram",
    state: "piece-due",
    night: "2026-10-15",
    storyboard: "c-09",
    use: "a 45 s Short: one household experiment and the law it proves",
    look: "chalk on slate, hand-drawn arrows over live objects",
    grammar: ["the question on the table", "the setup in three objects", "the surprise", "the law drawn over it"],
    trials: ["2026-10-17/c-05", "2026-10-19/c-12", "2026-10-22/c-08", "2026-10-24/c-04"],
    panel: "chalk-argument",
  },
  {
    id: "gn-rooftop-noir-ink-wash",
    name: "rooftop noir, ink wash",
    state: "perfecting",
    night: "2026-10-20",
    storyboard: "c-13",
    use: "a 2-minute video: a city told from its rooftops at night",
    look: "ink wash, wet edges, one neon accent",
    grammar: ["establishing skyline", "a figure at the ledge", "the overheard line", "the reveal two roofs over"],
    trials: ["2026-10-22/c-10", "2026-10-24/c-07"],
    piece: { ref: "2026-10-24/c-16", verdict: "rejected" },
    panel: "data-neon",
  },
  {
    id: "gn-tiny-town-documentary",
    name: "tiny-town documentary",
    state: "retired",
    night: "2026-10-09",
    storyboard: "c-02",
    use: "a 3-minute video: one miniature town's one day",
    look: "tilt-shift photoreal",
    grammar: ["dawn over the model", "the first resident", "the market", "dusk"],
    trials: ["2026-10-11/c-04"],
    retiredAt: "2026-10-18T09:30:00.000Z",
  },
];

export type FixtureGenreItem = {
  readonly kind: "genre" | "venture";
  readonly id: string;
  readonly title: string;
  readonly state: "candidate" | "ratified" | "rejected";
  readonly at: string;
  readonly vocabulary: { readonly ladder: GenreState; readonly venture?: string; readonly ventureName?: string } | { readonly type: "channel" | "album" | "game" };
  readonly f: Record<string, string[]>;
  readonly media?: { readonly sha256: string; readonly bytes: number; readonly mime: string };
  readonly facts?: FixtureMedia;
  readonly extras: { readonly genre: GenreExtras } | { readonly venture: VentureExtras };
  readonly meta: string;
  readonly lineage: readonly { readonly kind: "run" | "candidate"; readonly id: string }[];
};

/** A venture id's name, for the fixture's facet labels (the index labels it from the record). */
export const FIXTURE_VENTURE_NAMES: ReadonlyMap<string, string> = new Map([[VENTURE.id, VENTURE.name]]);

const panelOf = (p: Preset): FixtureMedia => fileBlob(`/presets/${p}.jpg`, 1920, 1080);
const mediaOf = (m: FixtureMedia) => ({ sha256: m.sha, bytes: 240_000, mime: m.mime });

/** The four genres, then the venture. */
export function fixtureGenres(): readonly FixtureGenreItem[] {
  const genres = SPECS.map((g): FixtureGenreItem => {
    const m = g.panel === undefined ? undefined : panelOf(g.panel);
    const bornFrom = `${g.night}/${g.storyboard}`;
    const venture = g.venture === undefined ? undefined : { id: g.venture, name: FIXTURE_VENTURE_NAMES.get(g.venture) ?? g.venture };
    const extras: GenreExtras = {
      state: g.state,
      use: g.use,
      look: g.look,
      grammar: g.grammar,
      keptTrials: g.trials,
      ...(g.piece === undefined ? {} : { piece: { ref: g.piece.ref, verdict: g.piece.verdict, ...(g.piece.clip === undefined ? {} : { video: `/clips/presets/${g.piece.clip}.webm` }) } }),
      bornFrom: { ref: bornFrom, ...(m === undefined ? {} : { image: m.url }) },
      proposal: `${g.night}/c-14`,
      ...(venture === undefined ? {} : { venture }),
      ...(g.retiredAt === undefined ? {} : { retiredAt: g.retiredAt }),
    };
    return {
      kind: "genre",
      id: genreItemId(g.id),
      title: g.name,
      state: genreLibraryState(g.state),
      at: `${g.night}T08:00:00.000Z`,
      vocabulary: { ladder: g.state, ...(venture === undefined ? {} : { venture: venture.id, ventureName: venture.name }) },
      f: { ladder: [g.state], ...(venture === undefined ? {} : { venture: [venture.id] }), run: [g.night] },
      ...(m === undefined ? {} : { media: mediaOf(m), facts: m }),
      extras: { genre: extras },
      meta: `${g.state.replace(/-/g, " ")} · ${g.trials.length}/${PIECE_TRIALS} trials`,
      lineage: [
        { kind: "run", id: g.night },
        { kind: "candidate", id: bornFrom },
      ],
    };
  });
  const first = SPECS.find((g) => g.venture === VENTURE.id);
  const m = first?.panel === undefined ? undefined : panelOf(first.panel);
  const genreIds = SPECS.filter((g) => g.venture === VENTURE.id).map((g) => ({ id: g.id, name: g.name }));
  const venture: FixtureGenreItem = {
    kind: "venture",
    id: ventureItemId(VENTURE.id),
    title: VENTURE.name,
    state: "ratified",
    at: VENTURE.bornAt,
    vocabulary: { type: VENTURE.kind },
    f: { type: [VENTURE.kind] },
    ...(m === undefined ? {} : { media: mediaOf(m), facts: m }),
    extras: { venture: { kind: VENTURE.kind, tone: VENTURE.tone, audience: VENTURE.audience, format: VENTURE.format, look: VENTURE.look, genres: genreIds, proposal: VENTURE.proposal } },
    meta: `${VENTURE.kind} · ${genreIds.length} ${genreIds.length === 1 ? "genre" : "genres"}`,
    lineage: [{ kind: "candidate", id: VENTURE.proposal }],
  };
  return [...genres, venture];
}
