// The project catalogue: the studio steps, the disciplines, and the templates.
// Pure data and pure lookups; the project RECORD and its IndexedDB I/O stay in
// lib/projects.ts, which re-exports everything here.

/** The six studio steps, in production order. The ONE source of that order —
 *  the /studio stepper and every /projects surface read it from here.
 *
 *  MOTION IS A STEP AGAIN (operator decision, 2026-10-05; card
 *  video-clip-pipeline-B). It was folded into Frames once, on the argument
 *  that a still and the movement given to it are one art-direction decision.
 *  That held while a clip could only be TYPED: nothing in the app could read a
 *  plate, propose what moves, or render it. Motion now owns the turn that
 *  reads a plate and proposes (or declines) its movement, and the later stages
 *  own the render queue, the graded takes and adoption — enough work, with its
 *  own failure states, to be a step. The motion line itself still lives on the
 *  frame (`FrameClip.motion`), so a still and its movement remain one record. */
export const PHASES = ["research", "script", "frames", "motion", "score", "cut"] as const;
export type PhaseKey = (typeof PHASES)[number];

export const PHASE_TITLE: Record<PhaseKey, string> = {
  research: "Research",
  script: "Script",
  frames: "Frames",
  motion: "Motion",
  score: "Score",
  cut: "Cut",
};

/* ── Disciplines — the kind of video, above the template ──────────────────── */

/** The discipline is the question asked BEFORE the template: what kind of
 *  video is this at all. Educational and promotional pieces are different
 *  contracts (see the note on the promotional formats below), and `free` is
 *  the honest third answer — a video the craft library has no template for,
 *  where the studio only keeps time. */
export const DISCIPLINES = ["educational", "trailer", "free", "music-video", "ads"] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  educational: "Educational video",
  trailer: "Movie · game trailer",
  free: "Any video",
  "music-video": "Music video",
  ads: "Ad",
};

/** The one line the create dialog shows under each discipline pill. */
export const DISCIPLINE_NOTE: Record<Discipline, string> = {
  educational: "an argument explained well — the craft library measured these",
  trailer: "a promotional cut that opens a debt another artifact pays",
  free: "no craft template — your own discipline; the studio only keeps time",
  "music-video": "one track, one poster brought to life — beat-driven, not hand-animated",
  ads: "one idea that sells — picked from options, drawn as stills, then animated and finished",
};

/* ── Templates (knowledge/templates/*) ────────────────────────────────────── */

export const TEMPLATES = [
  {
    id: "short-form-clip",
    label: "Short-form clip",
    /** Target the brief asks for; `range` is what the craft library measured. */
    defaultS: 30,
    range: [15, 60] as const,
    note: "≤60s, target ≤30s — usually derived from a mid-length video",
  },
  {
    id: "short-educational-video",
    label: "Short educational",
    defaultS: 120,
    range: [60, 180] as const,
    note: "one idea, explained well — a question chain with facts hung on it",
  },
  {
    id: "mid-educational-video",
    label: "Mid-length educational",
    defaultS: 300,
    range: [180, 360] as const,
    note: "3–6 min — the shortest length that holds a full argument",
  },

  // ── The promotional formats ───────────────────────────────────────────────
  //
  // THREE IDS, NOT ONE, AND THEY ARE APPENDED RATHER THAN INSERTED.
  //
  // The three above are self-sufficient pieces: each answers the question it
  // raises, and a withheld answer in one of them reads as not having one. A
  // promotional cut inverts that — its product is an UNPAID DEBT, and it
  // succeeds by opening a gap another artifact closes. That is a different
  // contract, not a different length, which is why these are not a `range` on
  // an existing entry.
  //
  // And it is three contracts, not one. The craft library's own source
  // separates them (`.vault/Research/2026-08-23-trailer-cinematic-grammar.md`
  // C7, "Teaser vs trailer vs cinematic are different contracts"), and the
  // registry's length-ladder gives the mechanism: shortening a promotional cut
  // REMOVES whole parts in a known order rather than scaling every part, so the
  // rungs "are not versions of each other". A single `trailer` id with a wide
  // range would encode exactly the uniform-trimming model that technique exists
  // to prevent.
  //
  // APPENDED, because `templateOf`'s fallback is POSITIONAL (`TEMPLATES[1]`).
  // Inserting anything ahead of `short-educational-video` silently re-points
  // every unrecognised id at a different format.
  //
  // Every figure below is sourced in `knowledge/templates/<id>/TEMPLATE.md`,
  // and none of it was measured in this repo — the corpus for all three is
  // n=0. The `note` is the one line the create dialog shows.
  {
    id: "teaser",
    label: "Teaser",
    /** ~1 min, one hook. C7 · S30. Nothing below 60s is measured anywhere the
     *  library can reach — see the template's evidence gap. */
    defaultS: 60,
    range: [15, 60] as const,
    note: "≤60s, one hook — imagery and tone, light on story",
  },
  {
    id: "trailer",
    label: "Trailer",
    /** 90–150s (C7); the registry's measured centre of gravity sits just above
     *  two minutes, which is why the default is 120 rather than the midpoint. */
    defaultS: 120,
    range: [90, 150] as const,
    note: "90–150s — the full spine, and it may spell out plot",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    /** NOT distinguished by length — see the template. The band is the vault's
     *  own beat sheet ("90–120 s cinematic trailer; scale durations
     *  proportionally for 60 s"), and it overlaps `trailer` on purpose. */
    defaultS: 120,
    range: [60, 120] as const,
    note: "imagery when the footage does not exist yet — a stage, not a length",
  },

  // ── The free discipline ───────────────────────────────────────────────────
  //
  // ONE ID, APPENDED LAST, AND IT CLAIMS NO CRAFT. The `range` is not a
  // measurement — nothing in knowledge/ measured "any video" — it is the
  // widest band the runtime input accepts, and lib/formatBrief.ts renders this
  // template as NOT STATED rather than as a format with rules.
  {
    id: "free-form",
    label: "Free form",
    defaultS: 90,
    range: [15, 600] as const,
    note: "no craft template — your own discipline; the studio only keeps time",
  },

  // ── The music-video discipline ────────────────────────────────────────────
  //
  // ONE ID, APPENDED LAST. The runtime is the attached track's real decoded
  // duration (lib/audioEnvelope.ts, WP2), never a user-typed target — `range`
  // is the band a single-poster piece stays watchable in, not a measurement
  // from knowledge/, which this template does not have one of either.
  {
    id: "music-video",
    label: "Music video",
    defaultS: 120,
    range: [60, 240] as const,
    note: "one track, one poster animated to it — length follows the mp3",
  },

  // ── The ads discipline ────────────────────────────────────────────────────
  //
  // TWO IDS, APPENDED LAST (positional fallback, see `templateOf`). An ad pays
  // its own debt — unlike the promotional family above, whose product is a gap
  // another artifact closes — so these are their own family, not trailer rungs.
  // Both are n=0: the figures are doctrine quoted in
  // knowledge/templates/<id>/TEMPLATE.md, never measured in this repo.
  {
    id: "ad-social-15",
    label: "Social vertical",
    defaultS: 15,
    range: [6, 20] as const,
    note: "9:16, hook in the first second, sound-off first",
  },
  {
    id: "ad-spot-30",
    label: "Spot",
    defaultS: 30,
    range: [20, 45] as const,
    note: "16:9 or 1:1 — room for a small arc and an end-card",
  },
] as const;

export type TemplateId = (typeof TEMPLATES)[number]["id"];

/** Which discipline each template belongs to. Exhaustive on purpose: a template
 *  appended without a family here is a typecheck failure, not an orphan pill. */
export const TEMPLATE_FAMILY: Record<TemplateId, Discipline> = {
  "short-form-clip": "educational",
  "short-educational-video": "educational",
  "mid-educational-video": "educational",
  teaser: "trailer",
  trailer: "trailer",
  cinematic: "trailer",
  "free-form": "free",
  "music-video": "music-video",
  "ad-social-15": "ads",
  "ad-spot-30": "ads",
};

/** The templates a discipline offers, in catalogue order. Never empty — every
 *  discipline owns at least one template, which is what lets the dialog take
 *  `templatesFor(d)[0]` as the default without a guard. */
export function templatesFor(d: Discipline) {
  return TEMPLATES.filter((t) => TEMPLATE_FAMILY[t.id] === d);
}

/** The discipline a template implies — how a record written before
 *  `discipline` existed gets one (see `migrateProject`). */
export function disciplineOf(template: TemplateId): Discipline {
  return TEMPLATE_FAMILY[template] ?? TEMPLATE_FAMILY[templateOf(template).id];
}

/** The catalogue entry for an id, with a fallback for one that is not in it.
 *
 *  THE FALLBACK IS POSITIONAL AND THAT IS LOAD-BEARING. `TEMPLATES[1]` is
 *  `short-educational-video` — the middle of the three self-sufficient formats,
 *  which is the right answer for a dropdown that must render something. It is
 *  only correct while the self-sufficient formats stay first, so the later
 *  entries (promotional, then free-form) are APPENDED and never inserted ahead of it;
 *  an insert at the front would silently re-point every unrecognised id at a
 *  different format, and nothing would fail.
 *
 *  It is also right ONLY for a dropdown. `formatBriefFor` in lib/formatBrief.ts
 *  deliberately refuses to fall back, because a default in a prompt is a format
 *  the user never chose, stated to a model as fact. */
export function templateOf(id: TemplateId) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[1];
}
