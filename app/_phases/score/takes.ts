// A CUE'S TAKES — the Score step's half of the answer to the ADR
// .vault/Architect/decisions/2026-08-29-score-take-persistence.md (option D,
// MUSIC-B 2026-10-05): the BYTES live in the server-side sound store (lib/sound,
// origin "score"), and the spot holds only pointers.
//
// PURE, so every decision here is driven by the probe
// (tests/golden-path/score-takes.probe.spec.ts) without a React tree or a
// server. The hook that calls the routes is ./useCueTakes.ts.
//
// WHAT EACH FUNCTION DECIDES
//
//   cueTakeRequest   a spotted cue → the GenerateRequest op "cue". The CUE goes
//                    to the server, never a plan: cueToPlan runs server-side
//                    (lib/sound/generate.ts), so the doctrine lives in one place
//                    and the length bought is the picture's.
//   bindTake         a new pointer, appended once. It becomes ACTIVE only when
//                    nothing is: a second render does not steal the slot, the
//                    creator's pick does (activateTake).
//   adoptTake        a lab take (finalized, labelled) put on a cue AS the active
//                    take — a pointer, so no render and no spend.
//   cueTakes         the spot's pointers resolved against a store listing, plus
//                    any take the store filed for this cue whose pointer never
//                    reached the record (a tab closed before the save landed).
//                    A pointer the store does not answer resolves to `null`:
//                    gone, said, never drawn as held.
//   sectionsOf /     a take's stored plan as sections on its own clock, and a
//   revisionRequest  note on one section as a section edit of that section
//                    alone — the others ride as audio references to the stored
//                    song, byte-for-byte (lib/sound/editPlan.ts).

import { MUSIC_STYLE_BLOCK, type SpottingCue } from "../../_studio/score";
import { asWirePlan, isGenChunk } from "@/lib/sound/editPlan";
import type { GenerateRequest, SoundTake } from "@/lib/sound/types";
import type { WireGenerationChunk } from "@/lib/music/types";

import type { ScoreSpot } from "./spots";

/** The conditioning a noted section is re-rendered under. `medium`, not
 *  `high`: a note asks for a change, and `high` holds the section so close to
 *  the original that the note can be inaudible; `free` drops the seam the kept
 *  neighbours were approved against. */
export const REVISION_STRENGTH = "medium";

const EMPTY_TERMS = { genre: [], mood: [], instrument: [], sfxCategory: null };

/** The request every money-free field of a sound render shares. */
function base(): Omit<GenerateRequest, "op" | "origin"> {
  return {
    kind: "music",
    provider: "elevenlabs",
    prompt: "",
    negative: null,
    durationS: 0,
    loop: null,
    promptInfluence: null,
    technique: [],
    terms: { ...EMPTY_TERMS },
    tempoBpm: null,
    key: null,
    sourceTakeId: null,
    editModes: null,
    plan: null,
    huntId: null,
    nodeId: null,
    title: null,
  };
}

/** A spotted cue → op "cue". `null` without a tempo: the number is the
 *  creator's, nothing upstream states one, and none is invented here. */
export function cueTakeRequest(cue: SpottingCue, projectId: string): GenerateRequest | null {
  if (cue.bpm === undefined) return null;
  return {
    ...base(),
    op: "cue",
    origin: "score",
    title: cue.title,
    tempoBpm: cue.bpm,
    projectId,
    cueId: cue.id,
    cue: {
      title: cue.title,
      intent: cue.note,
      bpm: cue.bpm,
      styleBlock: [...MUSIC_STYLE_BLOCK],
      picture: cue.picture,
    },
  };
}

/** Add a pointer once. Active only when the spot has none yet. */
export function bindTake(spot: ScoreSpot, takeId: string): ScoreSpot {
  const ids = spot.takeIds ?? [];
  return {
    ...spot,
    takeIds: ids.includes(takeId) ? ids : [...ids, takeId],
    activeTakeId: spot.activeTakeId ?? takeId,
  };
}

/** The creator's pick. An id the spot does not hold is refused, unchanged. */
export function activateTake(spot: ScoreSpot, takeId: string): ScoreSpot {
  return spot.takeIds?.includes(takeId) ? { ...spot, activeTakeId: takeId } : spot;
}

/** A lab take put on the cue as the one it uses — a pointer, no render. */
export function adoptTake(spot: ScoreSpot, takeId: string): ScoreSpot {
  return activateTake(bindTake(spot, takeId), takeId);
}

/** Lab takes a cue can adopt: finalized music, matched by label. */
export function adoptable(shelf: readonly SoundTake[], label = ""): SoundTake[] {
  const want = label.trim().toLowerCase();
  return shelf.filter(
    (t) =>
      t.kind === "music" &&
      t.stage === "finalized" &&
      t.file !== null &&
      (!want || (t.label ?? "").toLowerCase().includes(want)),
  );
}

export interface CueTakeRow {
  id: string;
  /** `null` = the store does not have it (any more). */
  take: SoundTake | null;
}

/**
 * The spot's takes, resolved. Pointers first, in arrival order; then any take
 * the store filed for THIS project's cue that no pointer names yet — the
 * render landed, the record's save did not. Strays are looked for only when
 * the project is named: a spot id is unique within a project, not across them.
 */
export function cueTakes(spot: ScoreSpot, shelf: readonly SoundTake[], projectId?: string): CueTakeRow[] {
  const byId = new Map(shelf.map((t) => [t.id, t]));
  const ids = spot.takeIds ?? [];
  const rows: CueTakeRow[] = ids.map((id) => ({ id, take: byId.get(id) ?? null }));
  const strays = shelf
    .filter((t) => projectId !== undefined && t.projectId === projectId && t.cueId === spot.id && !ids.includes(t.id))
    // The store lists newest first; the cue's list reads in arrival order.
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return [...rows, ...strays.map((t) => ({ id: t.id, take: t }))];
}

export interface TakeSection {
  index: number;
  /** The section's own bracketed name from the plan ("sc 2"), else its ordinal. */
  name: string;
  startMs: number;
  endMs: number;
}

/** A take's stored plan as sections on the take's clock. Empty when the take
 *  carries no plan or no song to edit against — a revision is impossible then,
 *  and the surface offers none. */
export function sectionsOf(take: SoundTake): TakeSection[] {
  const plan = asWirePlan(take.plan);
  if (!plan || !take.songId) return [];
  let at = 0;
  return plan.chunks.filter(isGenChunk).map((c, index) => {
    const startMs = at;
    at += c.duration_ms;
    const named = /^\[([^\]]+)\]/.exec(c.text)?.[1];
    return { index, name: named ?? String(index + 1), startMs, endMs: at };
  });
}

/**
 * A note on ONE section → a section edit of that section. Every other section
 * is `keep` — referenced against the stored song, not re-rendered — and the
 * noted one is re-rendered with the note as a direction, in the vendor's own
 * brace grammar (lib/music/elevenlabs.ts toChunk).
 */
export function revisionRequest(
  take: SoundTake,
  sectionIndex: number,
  note: string,
  link: { projectId: string | null; cueId: string | null } = { projectId: take.projectId, cueId: take.cueId },
): GenerateRequest {
  const plan = asWirePlan(take.plan);
  const gen = plan ? plan.chunks.filter(isGenChunk) : [];
  const said = note.trim();
  const chunks: WireGenerationChunk[] = gen.map((c, i) =>
    i === sectionIndex && said ? { ...c, text: `${c.text}\n{${said}}` } : c,
  );
  return {
    ...base(),
    op: "section-edit",
    origin: "score",
    prompt: said,
    tempoBpm: take.tempoBpm,
    sourceTakeId: take.id,
    editModes: gen.map((_, i) => (i === sectionIndex ? REVISION_STRENGTH : "keep")),
    plan: { chunks },
    projectId: link.projectId,
    cueId: link.cueId,
  };
}
