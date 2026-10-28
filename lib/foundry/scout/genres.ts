// GENRES AND VENTURES IN THE NIGHTS (spark scout-vision S2) - what the kernel's heads (packages/kernel/src/ventures/)
// have proven, DERIVED from the scout wing's nights on read and never stored: a genre's kept trials (storyboards
// carrying its `genre`, kept on a live committed night - ./storyboardKept.ts storyboardVerdict's rule) and its newest
// piece's verdict. WP2 writes the evidence, the views, the taste sections and the command; WP3 the trial and piece
// schedules.
//
//   EVIDENCE    a trial counts once its storyboard is KEPT on a live committed night (a part counts once committed);
//               a piece is the newest PieceCandidate of the genre on a live night that did not fail, its verdict its
//               `c-NN/video` cell's in that night's record - kept, rejected, or open (undecided, or not yet judged).
//   THE DOOR    `venture: "vn-..."` on an idea, a seed or a storyboard names a LIVE venture the kernel holds
//               (ventureRefusal): an unknown or retired one refuses the brief.
//   THE COMMAND `genre list | genre retire <gn-id>` and `venture list | venture retire <vn-id>`: the views from the
//               kernel and the nights; a retire is the operator's act, in one transaction (the kernel refuses any
//               other actor too).

import { errorMessage, type Result } from "@gt/domain/errors";
import { PIECE_TRIALS, TRIALS_PER_GENRE, genreStateOf, type Genre, type GenreEvidence, type GenreState, type Venture } from "@gt/domain/genre";
import type { Store } from "@gt/kernel/store";
import { listGenres, listVentures, readGenre, readVenture, retireGenre, retireVenture } from "@gt/kernel/ventures/store";

import { kernel } from "../../kernelProcess.ts";
import { storyboardVerdict } from "./storyboardKept";
import { readAllNights } from "./store";
import { cellId, type Night, type NightId } from "./types";
import { withWing } from "./wingScope";

/** A genre as the taste brief, the CLI and the Library read it: its head, its evidence and the state they derive. */
export type GenreView = Genre & { readonly state: GenreState; readonly evidence: GenreEvidence };

/** A piece's one cell (`c-NN/video`): its verdict is the piece's. */
export const PIECE_PART = "video";

const live = (n: Night): boolean => !n.dry && n.committed?.dry !== true;
const oldestFirst = (a: Night, b: Night): number => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id);

/** A piece's verdict in its night's record: kept, rejected, or open (undecided, still open on a remainder, or not judged). */
function pieceVerdict(n: Night, cid: string): "kept" | "rejected" | "open" {
  const k = n.committed;
  if (k === undefined) return "open";
  const cell = cellId(cid, PIECE_PART);
  if ((k.open ?? []).includes(cell)) return "open";
  return k.kept.includes(cell) ? "kept" : k.rejected.includes(cell) ? "rejected" : "open";
}

/** One genre's evidence over the scout wing's nights. */
export function genreEvidenceOf(nights: readonly Night[], genreId: string): GenreEvidence {
  const keptTrials: string[] = [];
  let piece: GenreEvidence["piece"];
  for (const n of [...nights].sort(oldestFirst)) {
    for (const c of n.candidates) {
      if (c.kind === "storyboard" && c.genre === genreId && storyboardVerdict(n, c) === "kept") keptTrials.push(`${n.id}/${c.id}`);
      // The newest wins: nights oldest first, then the night's own order.
      if (c.kind === "piece" && c.genre === genreId && c.status !== "failed" && live(n)) piece = { ref: `${n.id}/${c.id}`, verdict: pieceVerdict(n, c.id) };
    }
  }
  return { keptTrials, ...(piece === undefined ? {} : { piece }) };
}

/** Every genre with its evidence and derived state (genreStateOf), in the order the kernel lists them. */
export function genreViews(nights: readonly Night[], genres: readonly Genre[]): readonly GenreView[] {
  return genres.map((g) => {
    const evidence = genreEvidenceOf(nights, g.id);
    return { ...g, state: genreStateOf(g, evidence), evidence };
  });
}

/** A genre that still takes trials: perfecting, or piece-due (its piece may yet be rejected). */
export const takesTrials = (s: GenreState): boolean => s === "perfecting" || s === "piece-due";

/** The trials of `genreId` night `n` already holds - every one counts, a failed one too (it held the place). */
export const trialsOn = (n: Night, genreId: string): number => n.candidates.filter((c) => c.kind === "storyboard" && c.genre === genreId).length;

/**
 * The trial slots each LIVE genre has left on night `id` (TRIALS_PER_GENRE minus its trials already on that night).
 * A retired or publishable genre has no entry; a night not among `nights` holds no trial yet.
 */
export function trialSlots(nights: readonly Night[], genres: readonly Genre[], id: NightId): ReadonlyMap<string, number> {
  const night = nights.find((n) => n.id === id);
  const out = new Map<string, number>();
  for (const v of genreViews(nights, genres)) {
    if (!takesTrials(v.state)) continue;
    out.set(v.id, Math.max(0, TRIALS_PER_GENRE - (night === undefined ? 0 : trialsOn(night, v.id))));
  }
  return out;
}

/**
 * A piece of the genre still in flight: pending, or made but not yet judged (its night uncommitted, or its cell open).
 * A dry night's piece is a rehearsal (words only, never evidence) and holds nothing up.
 */
function pieceInFlight(nights: readonly Night[], genreId: string): boolean {
  return nights.some((n) => !n.dry && n.candidates.some((c) => c.kind === "piece" && c.genre === genreId && c.status !== "failed" && (c.status === "pending" || pieceVerdict(n, c.id) === "open")));
}

/** Kept clip cells (`c-NN/clip-N`) of trial `cid` on night `n`; a cell still open on a remainder is not kept. */
function keptClips(n: Night, cid: string): number {
  const k = n.committed;
  if (k === undefined) return 0;
  const open = new Set(k.open ?? []);
  return k.kept.filter((cell) => !open.has(cell) && cell.startsWith(`${cid}/clip-`)).length;
}

/**
 * Genres whose piece is due (state piece-due and no piece in flight), each with its best kept trial `<night>/<c-id>`:
 * the kept trial with the most kept clip cells, ties to the newest (evidence is oldest first, so the later wins).
 */
export function piecesDue(nights: readonly Night[], genres: readonly Genre[]): readonly { readonly genre: string; readonly trial: string }[] {
  const byId = new Map(nights.map((n) => [n.id, n]));
  const out: { genre: string; trial: string }[] = [];
  for (const v of genreViews(nights, genres)) {
    if (v.state !== "piece-due" || pieceInFlight(nights, v.id)) continue;
    let best: { readonly trial: string; readonly clips: number } | undefined;
    for (const ref of v.evidence.keptTrials) {
      const cut = ref.lastIndexOf("/");
      const n = byId.get(ref.slice(0, cut));
      const clips = n === undefined ? 0 : keptClips(n, ref.slice(cut + 1));
      if (best === undefined || clips >= best.clips) best = { trial: ref, clips };
    }
    if (best !== undefined) out.push({ genre: v.id, trial: best.trial });
  }
  return out;
}

/** What the genre does next, in the work's words. */
function nextStep(v: GenreView): string {
  if (v.state === "perfecting") return "next: trials";
  if (v.state === "piece-due") return "next: its piece, the best kept trial in full";
  return v.ventureId === undefined ? "next: a channel venture" : `producing for ${v.ventureId}`;
}

/** A venture's frame in one line: `a 30 s vertical Short · deadpan, dark · adults · painted 3D · gn-a, gn-b`. */
export const frameLine = (v: Pick<Venture, "frame">): string => [v.frame.format, v.frame.tone, v.frame.audience, v.frame.look, v.frame.genres.join(", ") || "no genre"].join(" · ");

/** The taste brief's `## Genre ladder` and `## Ventures` sections: the live heads only. (`## Genres` is taken: the idea
 *  genres the operator kept and threw, taste.ts.) */
export function genreSections(views: readonly GenreView[], ventures: readonly Venture[]): string[] {
  const genres = views.filter((v) => v.state !== "retired").map((v) => `- ${v.id} · ${v.name} · ${v.state} · kept trials ${v.evidence.keptTrials.length}/${PIECE_TRIALS} · ${nextStep(v)}`);
  const live = ventures.filter((v) => v.retiredAt === undefined).map((v) => `- ${v.id} · ${v.kind} · ${v.name} · ${frameLine(v)}`);
  const none = (xs: readonly string[]): readonly string[] => (xs.length === 0 ? ["- none"] : xs);
  return ["## Genre ladder", "", ...none(genres), "", "## Ventures", "", ...none(live), ""];
}

/** Both heads in one snapshot of the store. */
export function headsOf(store: Store): Result<{ readonly genres: readonly Genre[]; readonly ventures: readonly Venture[] }> {
  return store.read((r) => ({ genres: listGenres(r), ventures: listVentures(r) }));
}

/** The taste brief's two sections over a store and the scout wing's nights; a store that will not read says so in one line. */
export function genreTaste(store: Store, nights: readonly Night[]): string[] {
  const h = headsOf(store);
  if (!h.ok) return ["## Genre ladder", "", `- unread: ${h.error.message}`, ""];
  return genreSections(genreViews(nights, h.value.genres), h.value.ventures);
}

/** The store a door was handed, else the process's (lib/kernelProcess.ts); throws the kernel's refusal when it will not open. */
export function storeOrProcess(store?: Store): Store {
  if (store !== undefined) return store;
  const k = kernel();
  if (!k.ok) throw k.error;
  return k.value.store;
}

/**
 * Why `venture` cannot be written on a brief, or undefined: it names a venture the kernel holds and has not retired.
 * Reads the store handed in, else the process's (lib/kernelProcess.ts) - only when a brief names one.
 */
export function ventureRefusal(venture: string, store?: Store): string | undefined {
  let s: Store;
  try {
    s = storeOrProcess(store);
  } catch (e) {
    return `venture ${venture}: ${errorMessage(e)}`;
  }
  const r = s.read((x) => readVenture(x, venture));
  if (!r.ok) return `venture ${venture}: ${r.error.message}`;
  if (r.value === undefined) return `no venture ${venture}`;
  return r.value.retiredAt === undefined ? undefined : `venture ${venture} was retired ${r.value.retiredAt.slice(0, 10)}`;
}

/* ── the CLI ───────────────────────────────────────────────────────────────── */

type CommandResult = { readonly code: number; readonly lines: readonly string[]; readonly doc: Readonly<Record<string, unknown>> };
const refused = (message: string, code = 1): CommandResult => ({ code, lines: [message], doc: { ok: false, error: message } });

/** `gn-deadpan-office  piece-due    4/4  deadpan office satire, painted 3D · from 2026-10-24/c-10`. */
const genreLine = (v: GenreView): string => `${v.id.padEnd(28)} ${v.state.padEnd(11)} ${String(v.evidence.keptTrials.length)}/${PIECE_TRIALS}  ${v.name}${v.ventureId === undefined ? "" : ` · ${v.ventureId}`}`;
const ventureLine = (v: Venture): string => `${v.id.padEnd(28)} ${v.kind.padEnd(7)} ${(v.retiredAt === undefined ? "live" : "retired").padEnd(7)} ${v.name} · ${frameLine(v)}`;

/** `genre list | retire <id>` and `venture list | retire <id>` - the CLI's lines, its --json doc and its exit code. */
export async function genresCommand(
  what: "genre" | "venture",
  args: readonly string[],
  o: { readonly store: Store; readonly actor: { readonly kind: "operator"; readonly id: string } },
): Promise<CommandResult> {
  const [sub, id] = args;
  if (sub === "list") {
    const h = headsOf(o.store);
    if (!h.ok) return refused(h.error.message);
    if (what === "venture") {
      const vs = h.value.ventures;
      return { code: 0, lines: vs.length === 0 ? ["no ventures yet"] : vs.map(ventureLine), doc: { ok: true, ventures: vs } };
    }
    // A genre is the scout wing's: its evidence is the scout nights', whichever wing the command runs in.
    const nights = await withWing("scout", () => readAllNights());
    const views = genreViews(nights, h.value.genres);
    return { code: 0, lines: views.length === 0 ? ["no genres yet"] : views.map(genreLine), doc: { ok: true, genres: views } };
  }
  if (sub === "retire") {
    if (id === undefined) return refused(`${what} retire needs an id: \`scout.mts ${what} list\` lists them`, 2);
    // The type says operator; the kernel refuses any other actor too. Checked here so a cast cannot reach the store.
    if ((o.actor.kind as string) !== "operator") return refused(`retiring ${what} ${id} is the operator's act; ${o.actor.kind} ${o.actor.id} cannot`);
    const found = o.store.read((r) => (what === "genre" ? readGenre(r, id) : readVenture(r, id)));
    if (!found.ok) return refused(found.error.message);
    if (found.value === undefined) return refused(`no ${what} ${id}: \`scout.mts ${what} list\` lists them`);
    const r = o.store.tx((t) => (what === "genre" ? retireGenre(t, id, o.actor) : retireVenture(t, id, o.actor)));
    if (!r.ok) return refused(`${what} ${id}: ${errorMessage(r.error)}`);
    return { code: 0, lines: [`${what} ${id} retired · ${r.value.name}`], doc: { ok: true, [what]: r.value } };
  }
  return refused(`${what} takes list or retire <id>${sub === undefined ? "" : `, not ${sub}`}`, 2);
}

/** A piece's cell as a channel's ground names it: `<night>/<c-id>/video`. */
export const pieceCellRef = (pieceRef: string): string => `${pieceRef}/${PIECE_PART}`;
