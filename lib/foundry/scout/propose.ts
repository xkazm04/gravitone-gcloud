// THE NIGHT'S PROPOSALS (spark scout-vision S2) - a `genre` resting on a kept storyboard, a `venture` resting on a
// publishable genre's kept piece (channel) or on kept track clips (album). Words-only candidates, like a direction:
// the operator's keep on the packet births the genre or venture (lib/decision/v1/sources/scout.ts apply), a reject
// with a reason bans it.
//
//   THE DOOR IS THE BATCH'S (./idea.ts's rule): one bad brief refuses the whole batch, naming its place (1-based)
//   and why, before a candidate exists. The scout wing's alone (a muse night proposes nothing), and only while the
//   night is open.
//
//   A GENRE  {kind: "genre", name, fromStoryboard, look, grammar, use?, aim?}. `fromStoryboard` is `<night>/<c-id>`
//            of a storyboard KEPT on a live committed night (./storyboardKept.ts storyboardVerdict); the candidate's
//            `basedOn` is that storyboard's kept cells, and its `use` the brief's or, absent, the storyboard's. One
//            proposal per storyboard while it is open or kept (a rejected one may be proposed again, a dry night's
//            births nothing and holds nothing). A name equal to a live genre's (case and spaces folded) is refused.
//   A VENTURE {kind: "venture", name, ventureKind, frame: {tone, audience, format, look, genres}, basedOn, use?, aim?}.
//            Every `basedOn` entry is `<night>/<cell id>` of a cell a live committed night KEPT (./direction.ts's
//            rule). A CHANNEL names at least one genre and every one is PUBLISHABLE (./genres.ts genreViews), its
//            kept piece's cell among `basedOn`. An ALBUM stands on at least ALBUM_TRACKS kept track clips
//            (`<night>/<c-id>/aN`) of music seeds sharing a genre. A GAME waits for S4 and is refused.

import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import { ALBUM_TRACKS, BORN_VENTURE_KINDS, GENRE_ID_RE, VENTURE_KINDS, type Genre, type Venture } from "@gt/domain/genre";
import type { Store } from "@gt/kernel/store";

import { IDEA_REF_RE, splitRef } from "./direction";
import { archivedDoor } from "./baseline";
import { genreViews, headsOf, pieceCellRef, storeOrProcess } from "./genres";
import { listSeedBatches, seedOf } from "./seedStore";
import { foldSentence, isMusicType } from "./seeds";
import { mutateNight, nextCandidateId, readAllNights, readNight } from "./store";
import { WORDS_PART, storyboardVerdict } from "./storyboardKept";
import { AIM_MAX, USE_MAX, cellId, parseCellId, type Candidate, type GenreProposalCandidate, type Night, type NightId, type StoryboardCandidate, type VentureProposalCandidate } from "./types";
import { activeWing } from "./wingScope";

/** A genre's or a venture's name, plain words. */
export const PROPOSAL_NAME_MAX = 90;
/** The look in words. */
export const PROPOSAL_LOOK_MAX = 200;
/** One beat of a genre's grammar, and how many beats it holds. */
export const GRAMMAR_LINE_MAX = 140;
export const GRAMMAR_MAX = 8;
/** One line of a venture's frame (tone, audience, format). */
export const FRAME_LINE_MAX = 140;

const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[\r\n]/.test(s), { message: "one line" });

const genreSchema = z
  .object({
    kind: z.literal("genre"),
    name: line(PROPOSAL_NAME_MAX),
    fromStoryboard: z.string().trim().regex(IDEA_REF_RE, "a kept storyboard's <night>/<c-id>"),
    look: line(PROPOSAL_LOOK_MAX),
    grammar: z.array(line(GRAMMAR_LINE_MAX)).min(1).max(GRAMMAR_MAX),
    use: line(USE_MAX).optional(),
    aim: line(AIM_MAX).optional(),
  })
  .strict();

const ventureSchema = z
  .object({
    kind: z.literal("venture"),
    name: line(PROPOSAL_NAME_MAX),
    ventureKind: z.enum(VENTURE_KINDS),
    frame: z
      .object({
        tone: line(FRAME_LINE_MAX),
        audience: line(FRAME_LINE_MAX),
        format: line(FRAME_LINE_MAX),
        look: line(PROPOSAL_LOOK_MAX),
        genres: z.array(z.string().trim().regex(GENRE_ID_RE, "a genre id gn-...")).max(GRAMMAR_MAX),
      })
      .strict(),
    basedOn: z.array(z.string().trim().min(1).max(200)).min(1, "a venture stands on at least one kept cell: `<night>/<cell id>`").max(24),
    use: line(USE_MAX).optional(),
    aim: line(AIM_MAX).optional(),
  })
  .strict();

const briefSchema = z.discriminatedUnion("kind", [genreSchema, ventureSchema]);
type Brief = z.output<typeof briefSchema>;
type GenreBrief = z.output<typeof genreSchema>;
type VentureBrief = z.output<typeof ventureSchema>;
type Proposal = GenreProposalCandidate | VentureProposalCandidate;
/** A proposal before the night gives it an id. */
type Draft = Omit<GenreProposalCandidate, "id"> | Omit<VentureProposalCandidate, "id">;

/** The world a batch is checked against: every night of the wing, the kernel's heads, the seed batches when an album asks. */
type World = { readonly nights: readonly Night[]; readonly genres: readonly Genre[]; readonly ventures: readonly Venture[] };

const nightIn = (w: World, id: NightId): Night | undefined => w.nights.find((n) => n.id === id);

/** A proposal's verdict in its night: kept or rejected on a committed record, else open; a dry night's holds nothing. */
function proposalState(n: Night, c: Candidate): "kept" | "rejected" | "open" | "void" {
  const k = n.committed;
  if (k === undefined) return "open";
  if (n.dry || k.dry) return "void";
  const cell = cellId(c.id, WORDS_PART);
  if ((k.open ?? []).includes(cell)) return "open";
  return k.kept.includes(cell) ? "kept" : k.rejected.includes(cell) ? "rejected" : "open";
}

/** The genre proposal some night holds for `ref` while it is open or kept, as `<night>/<c-id>`. */
function heldProposal(nights: readonly Night[], ref: string): string | undefined {
  for (const n of nights) {
    for (const c of n.candidates) {
      if (c.kind !== "genre" || c.fromStoryboard !== ref) continue;
      const s = proposalState(n, c);
      if (s === "open" || s === "kept") return `${n.id}/${c.id} (${s})`;
    }
  }
  return undefined;
}

/** Why `cell` is not a kept cell of a live committed night, or undefined (./direction.ts's rule). */
function notKept(n: Night, cell: string): string | undefined {
  const k = n.committed;
  if (k === undefined) return `night ${n.id} is ${n.state}: it has no verdicts yet`;
  if (n.dry || k.dry) return `night ${n.id} was dry: its keeps were of stand-ins`;
  if ((k.open ?? []).includes(cell)) return `${cell} is still open on night ${n.id}'s remainder`;
  if (k.kept.includes(cell)) return undefined;
  return k.rejected.includes(cell) ? `night ${n.id} rejected ${cell}` : `night ${n.id} did not keep ${cell}`;
}

function genreDraft(b: GenreBrief, w: World, at: string): Result<Omit<GenreProposalCandidate, "id">> {
  const p = splitRef(b.fromStoryboard);
  const n = p === null ? undefined : nightIn(w, p.night);
  if (p === null || n === undefined) return err("invalid", `${at}: fromStoryboard: no night ${p?.night ?? b.fromStoryboard}`);
  const sb = n.candidates.find((c): c is StoryboardCandidate => c.id === p.rest && c.kind === "storyboard");
  if (sb === undefined) return err("invalid", `${at}: fromStoryboard: night ${n.id} has no storyboard ${p.rest}`);
  if (n.dry || n.committed?.dry === true) return err("refused", `${at}: fromStoryboard: ${b.fromStoryboard} is a dry night's: its keep was of stand-ins`);
  const v = storyboardVerdict(n, sb);
  if (v !== "kept") return err("refused", `${at}: fromStoryboard: ${b.fromStoryboard} is ${v ?? (n.committed === undefined ? `on night ${n.id}, ${n.state} and not judged` : "not kept")}; a genre is born only from a kept storyboard`);
  const held = heldProposal(w.nights, b.fromStoryboard);
  if (held !== undefined) return err("refused", `${at}: fromStoryboard: ${b.fromStoryboard} already has genre proposal ${held}`);
  const twin = w.genres.find((g) => g.retiredAt === undefined && foldSentence(g.name) === foldSentence(b.name));
  if (twin !== undefined) return err("refused", `${at}: name: "${b.name}" is live genre ${twin.id}'s`);
  const use = b.use ?? sb.use;
  if (use === undefined) return err("invalid", `${at}: use: storyboard ${b.fromStoryboard} states none, so the proposal gives its own`);
  const k = n.committed;
  const open = new Set(k?.open ?? []);
  const basedOn = (k?.kept ?? []).filter((cell) => !open.has(cell) && parseCellId(cell)?.candidate === sb.id).map((cell) => `${n.id}/${cell}`);
  return ok({ kind: "genre", sourceIds: [], status: "rendered", name: b.name, fromStoryboard: b.fromStoryboard, look: b.look, grammar: b.grammar, basedOn, use, ...(b.aim === undefined ? {} : { aim: b.aim }) });
}

/** Every basedOn entry a kept cell of a live committed night, or the first that is not. */
function keptGround(basedOn: readonly string[], w: World, at: string): Result<void> {
  for (const [i, ref] of basedOn.entries()) {
    const where = `${at}: basedOn ${i + 1} "${ref}"`;
    const p = splitRef(ref);
    const n = p === null ? undefined : nightIn(w, p.night);
    if (p === null || parseCellId(p.rest) === null) return err("invalid", `${where}: not <night>/<cell id>`);
    if (n === undefined) return err("invalid", `${where}: no night ${p.night}`);
    const why = notKept(n, p.rest);
    if (why !== undefined) return err("refused", `${where}: ${why}; a venture stands only on a kept cell`);
  }
  return ok(undefined);
}

/** The kept music clips `basedOn` names, by their seeds' genre (folded): an album needs ALBUM_TRACKS in one. */
async function albumGround(basedOn: readonly string[], w: World, at: string): Promise<Result<void>> {
  const batches = await listSeedBatches();
  const by = new Map<string, number>();
  for (const ref of basedOn) {
    const p = splitRef(ref);
    const cell = p === null ? null : parseCellId(p.rest);
    const t = p === null || cell === null ? undefined : nightIn(w, p.night)?.candidates.find((c) => c.id === cell.candidate);
    if (t?.kind !== "track" || cell === null || !t.clips.some((x) => x.part === cell.part) || t.fromSeed === undefined) continue;
    const s = seedOf(batches, t.fromSeed)?.seed;
    if (s === undefined || !isMusicType(s.type)) continue;
    by.set(foldSentence(s.genre), (by.get(foldSentence(s.genre)) ?? 0) + 1);
  }
  const most = Math.max(0, ...by.values());
  return most >= ALBUM_TRACKS ? ok(undefined) : err("refused", `${at}: basedOn: an album stands on ${ALBUM_TRACKS} kept track clips of music seeds sharing a genre (<night>/<c-id>/aN); this one names ${most}`);
}

async function ventureDraft(b: VentureBrief, w: World, at: string): Promise<Result<Omit<VentureProposalCandidate, "id">>> {
  const kind = b.ventureKind;
  if (kind !== "channel" && kind !== "album") return err("refused", `${at}: ventureKind: a ${kind} venture is not born yet (S4); a proposal births a ${BORN_VENTURE_KINDS.join(" or ")}`);
  const basedOn = [...new Set(b.basedOn)];
  const ground = keptGround(basedOn, w, at);
  if (!ground.ok) return ground;
  const twin = w.ventures.find((v) => v.retiredAt === undefined && foldSentence(v.name) === foldSentence(b.name));
  if (twin !== undefined) return err("refused", `${at}: name: "${b.name}" is live venture ${twin.id}'s`);
  if (kind === "channel") {
    if (b.frame.genres.length === 0) return err("invalid", `${at}: frame.genres: a channel is born from at least one publishable genre`);
    const views = genreViews(w.nights, w.genres);
    for (const id of b.frame.genres) {
      const v = views.find((x) => x.id === id);
      if (v === undefined) return err("refused", `${at}: frame.genres: no genre ${id}`);
      if (v.state !== "publishable" || v.evidence.piece === undefined) return err("refused", `${at}: frame.genres: ${id} is ${v.state}; a channel is born from a publishable genre`);
      const piece = pieceCellRef(v.evidence.piece.ref);
      if (!basedOn.includes(piece)) return err("refused", `${at}: basedOn: a channel of ${id} stands on its kept piece ${piece}`);
    }
  } else {
    const album = await albumGround(basedOn, w, at);
    if (!album.ok) return album;
  }
  const frame = { tone: b.frame.tone, audience: b.frame.audience, format: b.frame.format, look: b.frame.look, genres: b.frame.genres };
  return ok({ kind: "venture", sourceIds: [], status: "rendered", name: b.name, ventureKind: kind, frame, basedOn, ...(b.use === undefined ? {} : { use: b.use }), ...(b.aim === undefined ? {} : { aim: b.aim }) });
}

/** The batch as briefs, or the first bad one's place and why; nothing is read or written here. */
export function parseProposals(raw: unknown): Result<Brief[]> {
  if (!Array.isArray(raw)) return err("invalid", "propose: the input is a JSON array of proposals [{kind: genre, name, fromStoryboard, look, grammar} | {kind: venture, name, ventureKind, frame, basedOn}]");
  if (raw.length === 0) return err("invalid", "propose: the batch holds no proposal");
  const out: Brief[] = [];
  for (const [i, item] of raw.entries()) {
    const at = `proposal ${i + 1}`;
    const r = parseAt(at, briefSchema, item);
    if (!r.ok) return r;
    const b = r.value;
    const twice = out.findIndex((x) => x.kind === b.kind && (foldSentence(x.name) === foldSentence(b.name) || (x.kind === "genre" && b.kind === "genre" && x.fromStoryboard === b.fromStoryboard)));
    if (twice >= 0) return err("invalid", `${at}: repeats proposal ${twice + 1} of this batch`);
    out.push(b);
  }
  return ok(out);
}

/**
 * `[{kind: "genre", name, fromStoryboard, look, grammar, use?, aim?} | {kind: "venture", name, ventureKind, frame,
 * basedOn, use?, aim?}]` -> the night's new proposal candidates, or the first bad brief's place and why. One bad brief
 * refuses the batch; nothing is written then. The kernel's heads are read from `o.store`, else the process's.
 */
export async function addProposals(id: NightId, raw: unknown, o: { readonly store?: Store } = {}): Promise<Result<readonly Proposal[]>> {
  if (activeWing() !== "scout") return err("refused", `the ${activeWing()} wing proposes no genre or venture`);
  const shut = archivedDoor(id);
  if (shut !== undefined) return err("refused", shut);
  const parsed = parseProposals(raw);
  if (!parsed.ok) return parsed;
  const night = await readNight(id);
  if (night.state !== "open") return err("refused", `night ${id} is ${night.state}; it takes no more proposals`);
  let heads: Result<{ readonly genres: readonly Genre[]; readonly ventures: readonly Venture[] }>;
  try {
    heads = headsOf(storeOrProcess(o.store));
  } catch (e) {
    return err("unavailable", `propose: the kernel's genres and ventures: ${errorMessage(e)}`);
  }
  if (!heads.ok) return err(heads.error.code, `propose: the kernel's genres and ventures: ${heads.error.message}`);
  const w: World = { nights: await readAllNights(), ...heads.value };
  const drafts: Draft[] = [];
  for (const [i, b] of parsed.value.entries()) {
    const at = `proposal ${i + 1}`;
    const d = b.kind === "genre" ? genreDraft(b, w, at) : await ventureDraft(b, w, at);
    if (!d.ok) return d;
    drafts.push(d.value);
  }
  let made: Proposal[] = [];
  let refusal: string | undefined;
  await mutateNight(id, (n) => {
    if (n.state !== "open") return n;
    // A batch that landed meanwhile may have proposed the same storyboard: checked again under the lock.
    for (const [i, d] of drafts.entries()) {
      const held = d.kind === "genre" ? heldProposal([n], d.fromStoryboard) : undefined;
      if (held !== undefined) {
        refusal = `proposal ${i + 1}: fromStoryboard: ${d.kind === "genre" ? d.fromStoryboard : ""} already has genre proposal ${held}`;
        return n;
      }
    }
    let next = n;
    made = [];
    for (const d of drafts) {
      const c = { ...d, id: nextCandidateId(next) } as Proposal;
      next = { ...next, candidates: [...next.candidates, c] };
      made.push(c);
    }
    return next;
  });
  if (refusal !== undefined) return err("refused", refusal);
  if (made.length === 0) return err("refused", `night ${id} closed while the proposals were checked; it takes no more proposals`);
  return ok(made);
}
