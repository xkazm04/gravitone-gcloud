// GENRES AND VENTURES (spark scout-vision S2) - pure and zod-free, so a screen may import the states (the
// client-closure gate). The kernel holds a genre's and a venture's HEAD (packages/kernel/src/ventures/); what a
// genre has proven is DERIVED from the scout nights' verdicts on read (lib/foundry/scout/genres.ts), never stored.
//
// A GENRE is a use x a look x a grammar, born when the operator keeps a night's `genre` proposal resting on a kept
// storyboard. Every live genre gets up to TRIALS_PER_GENRE trials a night (storyboards of kept ideas in the genre,
// every panel clipped). PIECE_TRIALS kept trials make a piece due: the best trial rendered in full and cut. The
// operator keeping the piece makes the genre publishable. Retiring is an act, and it is terminal.
//
// A VENTURE is what a channel, an album or a game becomes: one frame later nights produce for. It is born when the
// operator keeps a night's `venture` proposal - a channel from a publishable genre, an album from kept tracks, a
// game from its asset catalogue (S4; refused until then).

export const GENRE_ID_RE = /^gn-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const VENTURE_ID_RE = /^vn-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const GENRE_STATES = ["perfecting", "piece-due", "publishable", "retired"] as const;
export type GenreState = (typeof GENRE_STATES)[number];

/** Trials a live genre may draw in one night, taken first from the night's storyboard cap. */
export const TRIALS_PER_GENRE = 2;
/** Kept trials that make a piece due. */
export const PIECE_TRIALS = 4;

export type Genre = {
  readonly id: string;
  /** Plain words: `deadpan office satire, painted 3D`. */
  readonly name: string;
  /** `<night>/<c-id>` of the kept storyboard the genre was born from. */
  readonly bornFrom: string;
  /** `<night>/<c-id>` of the kept proposal that birthed it. */
  readonly proposal: string;
  /** What the genre's videos are for, format first (`a 30 s Short: ...`). */
  readonly use: string;
  /** The look in words (a kept style's name or a description). */
  readonly look: string;
  /** The beats a video of this genre moves through, in order (the storyboard's bullets). */
  readonly grammar: readonly string[];
  /** The venture it now produces for; omitted until one is born from it. */
  readonly ventureId?: string;
  readonly bornAt: string;
  readonly by: string;
  /** Omitted while live. */
  readonly retiredAt?: string;
};

/** What the nights' verdicts say about one genre (derived on read). */
export type GenreEvidence = {
  /** `<night>/<c-id>` of every trial of the genre kept on a live committed night, oldest first. */
  readonly keptTrials: readonly string[];
  /** The newest piece of the genre, and its verdict; omitted when none was made. */
  readonly piece?: { readonly ref: string; readonly verdict: "kept" | "rejected" | "open" };
};

export function genreStateOf(g: Pick<Genre, "retiredAt">, e: GenreEvidence): GenreState {
  if (g.retiredAt !== undefined) return "retired";
  if (e.piece?.verdict === "kept") return "publishable";
  if (e.keptTrials.length >= PIECE_TRIALS) return "piece-due";
  return "perfecting";
}

export const VENTURE_KINDS = ["channel", "album", "game"] as const;
export type VentureKind = (typeof VENTURE_KINDS)[number];
/** The kinds a proposal may birth before S4 builds the game onboarding. */
export const BORN_VENTURE_KINDS = ["channel", "album"] as const satisfies readonly VentureKind[];
/** Kept track clips of music seeds sharing a genre that make an album worth proposing. */
export const ALBUM_TRACKS = 4;

/** The frame later nights produce inside. */
export type VentureFrame = {
  /** The register: `deadpan, dark`. */
  readonly tone: string;
  readonly audience: string;
  /** `a 30 s vertical Short`, `a 3-minute video`, `a 10-track album`. */
  readonly format: string;
  /** The look (or the sound, for an album) in words. */
  readonly look: string;
  /** Genre ids it produces in; at least one for a channel. */
  readonly genres: readonly string[];
  /** Character names it reuses (S3); omitted until then. */
  readonly characters?: readonly string[];
};

export type Venture = {
  readonly id: string;
  readonly name: string;
  readonly kind: VentureKind;
  readonly frame: VentureFrame;
  /** `<night>/<c-id>` of the kept proposal that birthed it. */
  readonly proposal: string;
  readonly bornAt: string;
  readonly by: string;
  readonly retiredAt?: string;
};

/** `gn-` / `vn-` + the name's words, lower case, hyphenated (at most six words); `-2`, `-3` when taken. */
export function mintSlugId(prefix: "gn" | "vn", name: string, taken: ReadonlySet<string>): string {
  const words = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 0)
    .slice(0, 6);
  const base = `${prefix}-${words.length === 0 ? "untitled" : words.join("-")}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}
