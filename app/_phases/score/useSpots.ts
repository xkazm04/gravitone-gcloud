"use client";

// THE SPOTTING SESSION, for one project: proposed from the script's movements,
// edited by the creator, and persisted.
//
// "Both — propose, then let them edit." A spot arrives derived (./spots.ts) and
// marked as a proposal; the moment a human touches one it stops being one, and
// they may delete it or add their own. That is the whole state machine.
//
// SEEDED ONCE, then owned — the shape `useTrailerCut` already uses for the cut
// itself, and for the same reason: a proposal recomputed on every load would let
// a change upstream silently rewrite work downstream. The seed needs BOTH reads
// AND the picture, because a spot's scenes are scenes; until the frames land
// there is nothing to place a movement on, and seeding early would write a
// session in which every movement is unplaced.
//
// WHAT IS PERSISTED IS ONLY THE SPOTS. See `ScoreStepData` — a take is an
// object URL over megabytes of decoded audio and this record has no field for
// one. That question stays open and this hook does not pretend otherwise.

import { useCallback, useEffect, useRef, useState } from "react";

import type { Scene } from "../../_studio/projectTypes";

import {
  readStep,
  saveStep,
  type ScoreStepData,
  type StorageTrouble,
  type TrailerCutStepData,
} from "../_shared/stepStore";
import { useLoadFor } from "../_shared/useLoadFor";
import type { TrailerCut } from "../script/trailer/types";

import { newSpot, proposeSpots, type ScoreSpot, type UnplacedMovement } from "./spots";

/** This step's own key. */
const PHASE = "score";
/** Step 2's trailer half — READ here, never written. The rule `useFrames` states
 *  at the same seam: a downstream step that seeded an upstream step's record
 *  would be inventing the artifact it exists to read. */
const TRAILER_PHASE = "script-trailer";

/** How the spots on screen got there — named on the object rather than inferred,
 *  because four of the five cases are absences and a surface that cannot tell
 *  them apart writes the wrong sentence about somebody's project. */
export type SpotOrigin =
  /** Derived from the cut's movements. `placed` may be fewer than `movements`;
   *  the difference is in `unplaced`, with a reason each. */
  | { kind: "proposed"; movements: number; placed: number }
  /** A cut exists and declares no movements — nothing to propose from. */
  | { kind: "no-movements" }
  /** No `script-trailer` record for this project. The commonest case, and NOT an
   *  error: an explainer project never writes one. */
  | { kind: "no-cut" }
  /** The cut is on disk and out of reach. Distinct from `no-cut` in every way
   *  that matters — one is work that has not happened, the other is work that
   *  cannot be read — and drawn differently. */
  | { kind: "cut-unreadable"; trouble: StorageTrouble }
  /** Read back from this step's own record: the creator's session. */
  | { kind: "authored" };

interface Session {
  /** The project this session belongs to. A session for another project must
   *  never be rendered or saved under this one — the `hydratedFor` lesson from
   *  useLoadFor, applied to the state it produces. */
  id: string;
  spots: ScoreSpot[];
  unplaced: UnplacedMovement[];
  origin: SpotOrigin;
  /** Did this project already have a stored record when the session opened? It
   *  decides whether an EMPTY spot list is worth writing: emptying a stored
   *  session is a decision (every spot deleted), while writing `[]` for a
   *  project that has never been seeded would freeze the proposal out forever. */
  hadRecord: boolean;
}

/** How long after the last edit the record is written. The same 600ms
 *  `useFrames` uses, for the same reason: a title is typed a character at a
 *  time and a write per keystroke is a transaction per keystroke. */
const SAVE_MS = 600;

/**
 * What this project's session opens as — a pure function of what was read, so
 * the decision can be driven and asserted without a React tree.
 *
 * The order of the branches is the order of authority: the creator's own record
 * beats everything (a stored session is never re-proposed over), then the
 * reasons there is nothing to propose FROM, and only then the derivation.
 */
function seedSession(input: {
  projectId: string;
  scenes: Scene[];
  stored: ScoreSpot[] | null;
  cut: TrailerCut | null;
  cutTrouble: StorageTrouble | null;
}): Session {
  const { projectId, scenes, stored, cut, cutTrouble } = input;
  const empty = { id: projectId, spots: [], unplaced: [], hadRecord: false };
  if (stored)
    return { id: projectId, spots: stored, unplaced: [], origin: { kind: "authored" }, hadRecord: true };
  if (cutTrouble) return { ...empty, origin: { kind: "cut-unreadable", trouble: cutTrouble } };
  if (!cut) return { ...empty, origin: { kind: "no-cut" } };
  if (cut.movements.length === 0) return { ...empty, origin: { kind: "no-movements" } };

  const proposal = proposeSpots(cut, scenes);
  return {
    id: projectId,
    spots: proposal.spots,
    unplaced: proposal.unplaced,
    origin: { kind: "proposed", movements: cut.movements.length, placed: proposal.spots.length },
    hadRecord: false,
  };
}

/**
 * @param scenes THIS project's picture, or `null` while it is still being read.
 *   `null` holds the seed back; an EMPTY array does not — a project with frames
 *   that place nowhere is a real answer, and the proposal then reports every
 *   movement as unplaced rather than waiting forever.
 */
export function useScoreSpots(projectId: string, scenes: Scene[] | null) {
  const [cut, setCut] = useState<TrailerCut | null>(null);
  const [cutTrouble, setCutTrouble] = useState<StorageTrouble | null>(null);
  const [stored, setStored] = useState<ScoreSpot[] | null>(null);
  /** THIS step's own record could not be read. Nothing is seeded and nothing is
   *  written while it holds — the rule useFrames pays for in full: hydrating on
   *  a failed read is what lets a save effect put an invented empty session on
   *  top of one that is still on disk. */
  const [trouble, setTrouble] = useState<StorageTrouble | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  const read = useLoadFor(
    projectId,
    async (id) => ({
      trailer: await readStep<TrailerCutStepData>(id, TRAILER_PHASE),
      score: await readStep<ScoreStepData>(id, PHASE),
    }),
    ({ trailer, score }) => {
      // A session for the previous project must not survive into this one, even
      // for the render before the seed lands.
      setSession(null);
      if (!score.ok) {
        setTrouble(score.trouble);
        return false;
      }
      setTrouble(null);
      setStored(score.data?.spots ?? null);
      // A FAILED read of the CUT is not fatal here and is not an absent cut
      // either: this step can still hold a session, it simply has nothing to
      // propose from and says which of the two it is.
      setCut(trailer.ok ? (trailer.data?.cut ?? null) : null);
      setCutTrouble(trailer.ok ? null : trailer.trouble);
    },
  );

  /* THE SEED — once per project, when both reads have landed and the picture is
     in hand. Never before, and never again for the same project.

     DURING RENDER, not in an effect, and that is the form React documents for
     state derived from props: an effect would draw one commit of an empty
     session first, which on this surface is the sentence "no cue sits on this
     picture" flashing over a project that has cues. It is also the shape this
     step's own component already uses to drop the previous project's picture
     (ScoreSpotting's `seenProject`), and the one `react-hooks` objects to the
     effect form in favour of. It cannot loop: the branch is gated on
     `session.id !== projectId` and the assignment sets exactly that. */
  if (read && !trouble && scenes !== null && session?.id !== projectId) {
    setSession(seedSession({ projectId, scenes, stored, cut, cutTrouble }));
  }

  const live = session?.id === projectId ? session : null;

  /* ── save ────────────────────────────────────────────────────────────────
     Debounced, never before the seed, and never after a failed read of this
     step's own record. The empty-session guard is the one extra rule: a project
     whose seed produced nothing has not made a decision, and writing `[]` for it
     would turn "never proposed" into "proposed and emptied" permanently. Once a
     record exists, an empty list IS the decision and is written. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!live || trouble) return;
    if (live.spots.length === 0 && !live.hadRecord) return;
    if (timer.current) clearTimeout(timer.current);
    const spots = live.spots;
    timer.current = setTimeout(() => {
      void saveStep<ScoreStepData>(projectId, PHASE, { spots });
    }, SAVE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [live, trouble, projectId]);

  /** Change one spot. ANY change clears `proposed` — the surface must stop
   *  calling a row a proposal the moment a human has had an opinion about it,
   *  and `fromMovement` is kept so the row can still say where it came from. */
  const patchSpot = useCallback((id: string, patch: Partial<Omit<ScoreSpot, "id">>) => {
    setSession((s) =>
      s
        ? {
            ...s,
            hadRecord: true,
            spots: s.spots.map((sp) => (sp.id === id ? { ...sp, ...patch, proposed: false } : sp)),
          }
        : s,
    );
  }, []);

  const removeSpot = useCallback((id: string) => {
    setSession((s) => (s ? { ...s, hadRecord: true, spots: s.spots.filter((sp) => sp.id !== id) } : s));
  }, []);

  /** Add the creator's own spot over the given scenes. */
  const addSpot = useCallback((sceneIds: string[]) => {
    setSession((s) =>
      s
        ? { ...s, hadRecord: true, spots: [...s.spots, newSpot(sceneIds, s.spots.map((sp) => sp.id))] }
        : s,
    );
  }, []);

  return {
    /** Null until the reads have landed AND the picture is in hand. */
    spots: live?.spots ?? null,
    origin: live?.origin ?? null,
    unplaced: live?.unplaced ?? [],
    /** This step's own record could not be read. Nothing is drawn over it. */
    trouble,
    addSpot,
    patchSpot,
    removeSpot,
  };
}
