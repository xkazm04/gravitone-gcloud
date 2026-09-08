"use client";

// SCORE / SPOTTING SESSION — the winner. Music against picture: scenes run
// along the clock, cues are spans drawn under them to scale, and clicking a
// span reads its intent. Polish round: lanes carry the same labels as the
// Cut's timeline, and the coverage line states what is scored, refused and
// silent — computed from the cues, never retyped.
//
// AND SINCE 2026-09-08 THE PICTURE IS THE CREATOR'S OWN. This step used to
// import `CUES` — a module constant in app/_studio/score.ts, computed at import
// time by calling `cuesFrom()` with no arguments, which means over the Glass
// Harbor fixture. A creator arrived here from Step 3 having authored plates for
// their own beats and was shown five scenes that are not theirs, with a cue
// detail claiming a brief was "briefed from sc 3, 4" — a provenance sentence
// about somebody else's film — beside a button that spends real money at
// /api/music/generate. Their work stopped travelling at step 3.
//
// The seam was half-built rather than absent: `cuesFrom(spots, scenes)`,
// `sceneClock(scenes)` and `pictureFor(spot, scenes)` all take real scenes and
// merely DEFAULT to the fixture. So nothing in that module changed; this surface
// reads the frames Step 3 saved (score/picture.ts projects them into scenes) and
// passes them.
//
// AND SINCE THE COMMIT AFTER IT, THE SPOTS HAVE AN ORIGIN TOO. `SPOTS` — the
// fixture's three hand-authored rows naming `sc-1 … sc-5` — is no longer read
// here at all; a spotting session is PROPOSED from the movements of the script's
// own cut (./spots.ts), marked as a proposal on the row and on the span it
// draws, edited and added to by the creator, and persisted under this step's own
// key (./useSpots.ts). The fixture stays where it belongs: as the default
// argument of the derivation two probes drive directly.
//
// THE THIRD ARGUMENT WENT THE SAME WAY. `cuesFrom` now also takes the PROJECT —
// its title and logline — because `pictureFor` used to stamp Glass Harbor's onto
// every brief it built, and `cueToPlan` sends them to the vendor as the only
// global narrative context a section-level brief gets. Unreachable while every
// spot was unspottable; live the moment a spot could be placed.

import { useEffect, useMemo, useRef, useState } from "react";

import {
  MUSIC_STYLE_BLOCK,
  cuesFrom,
  sceneClock,
  type CueProject,
  type CueSpot,
  type SpottingCue,
} from "../../_studio/score";
import { CueStatusWord, LANE_GUTTER, TimeRuler, spanStyle } from "../../_studio/projectParts";
import { getProject, type Discipline } from "@/lib/projects";
import {
  MusicRequestError,
  audioUrl,
  costLabel,
  generateCueAudio,
  perSecondPrice,
} from "@/lib/musicClient";
import type { MusicQuote } from "@/lib/music/pricing";
import type { MusicProvenance } from "@/lib/music/types";

import { readStep, type StorageTrouble } from "../_shared/stepStore";
import { useLoadFor } from "../_shared/useLoadFor";
import type { Frame } from "../frames/frames";
import type { FramesStepData } from "../frames/useFrames";
import { pictureFromFrames } from "./picture";
import SpotList from "./SpotList";
import { toCueSpots } from "./spots";
import { useScoreSpots, type SpotOrigin } from "./useSpots";

/** Step 3's key in the step store — read here, never written. `useFrames.ts` is
 *  the only writer, and a downstream step that seeded an upstream step's record
 *  would be inventing the artifact it exists to read. */
const FRAMES_PHASE = "frames";

/** WHY THE TEMPO SLOT CAN BE EMPTY, in one sentence, wherever the emptiness
 *  shows. Written once because it appears three times on this surface and a
 *  refusal explained differently in three places reads as three refusals. */
const NO_TEMPO_WHY =
  "Nothing upstream states a tempo: a movement of the cut carries a role, an ordinal and the cue " +
  "section it sits on, and the cue itself carries sections without durations. This step's craft " +
  "notes are n=0 for the form and say a trailer tempo is chosen from the picture by bar math, " +
  "never defaulted — so the number is yours to set, and the render waits for it.";

/** One cue's live take, in this session.
 *
 *  NOT PERSISTED, and that is a decision rather than a gap: what this holds is an
 *  object URL over decoded audio, and a stored `blob:` URL is dead on the next
 *  load. Persisting a take means writing the BYTES — several megabytes a cue —
 *  into the same IndexedDB whose step store names quota exhaustion as a real
 *  destination. That call is not made here; see the ADR in
 *  .vault/Architect/decisions/2026-08-29-score-take-persistence.md.
 *
 *  `provenance` rides on the done state because it is the ONLY thing on this
 *  surface entitled to name a vendor or a model. It comes back from the engine
 *  with the take (lib/music/types.ts MusicProvenance) and says who served,
 *  with which model id, for how many milliseconds, at what time. Before this it
 *  was returned, passed through musicClient, and read by nobody — while the
 *  surface printed a hand-typed `lyria-3` beside a button wired to ElevenLabs. */
export type Take =
  | { state: "working" }
  | { state: "done"; url: string; provenance: MusicProvenance }
  | { state: "refused"; msg: string }
  | { state: "error"; msg: string };

/**
 * WHAT MAY BE CLAIMED ABOUT THE ENGINE for one cue — three states kept
 * deliberately apart rather than collapsed into one blank:
 *
 *   · a take in hand → the take's own `MusicProvenance` speaks, and it is the
 *     only thing on this surface entitled to name a vendor or a model id;
 *   · a cue the project fixture calls rendered, with no take here → the record
 *     is ABSENT and says so, because "we have no provenance" and "it was made
 *     by X" are different sentences;
 *   · a cue never rendered → NOTHING is claimed. Not a default, not a dash
 *     standing in for one. Absence reads as absence.
 *
 * Exported because it is the whole decision this direction is about, and a
 * decision inside JSX is a decision nothing can test.
 */
export function engineCredit(cue: SpottingCue, take: Take | undefined): { text: string; why: string } {
  if (take?.state === "done")
    return {
      text: `${take.provenance.vendor} · ${take.provenance.modelId} · ${Math.round(take.provenance.requestedMs / 1000)}s asked`,
      why: `Read from the take's provenance, returned by the render at ${take.provenance.generatedAt}.`,
    };
  if (cue.status === "rendered")
    return {
      text: "model not recorded",
      why:
        "This cue is marked rendered by the project fixture, but no take from this engine is in hand, " +
        "so no provenance exists to name a vendor or a model. Render it to get one.",
    };
  return { text: "", why: "" };
}

/** SPOTS THAT COULD NOT BECOME CUES, said rather than swallowed. A cue's span IS
 *  the film it covers, so a spot whose scenes this project does not have has no
 *  span to draw — and is not quietly given a default one.
 *
 *  Its own component because two states render it: a project WITH a picture the
 *  fixture's spots do not match, and a project with no picture at all, which is
 *  the state `cuesFrom` has always had a written sentence for and could never
 *  reach while `SCENES` was the only argument it was ever passed. */
function UnspottableLine({ items }: { items: { spot: CueSpot; why: string }[] }) {
  if (items.length === 0) return null;
  return (
    <p className="font-jetbrains mt-2 text-label leading-snug text-amber-200/70">
      {items.length} spot{items.length > 1 ? "s" : ""} could not be placed:{" "}
      {items.map((u) => `"${u.spot.title}" ${u.why}`).join("; ")}.
    </p>
  );
}

/**
 * WHERE THESE SPOTS CAME FROM — one line, always, including when the answer is
 * "nowhere and here is why".
 *
 * Four of the five origins are absences, and the reason each is written out
 * rather than collapsed into "no cues yet" is that they have different remedies:
 * a cut nobody composed is Step 2's work, an explainer script has no movement
 * container at all and never will, and a cut that will not open is a storage
 * problem this step must not draw over.
 */
function OriginLine({
  origin,
  unplaced,
  discipline,
}: {
  origin: SpotOrigin;
  unplaced: { movement: { id: string; label: string }; why: string }[];
  discipline: Discipline | undefined;
}) {
  if (origin.kind === "authored") return null;

  if (origin.kind === "proposed")
    return (
      <div data-testid="spot-origin" className="mt-3 border-t border-white/8 pt-3">
        <p className="text-content leading-snug text-slate-400">
          {origin.placed} of {origin.movements} spot{origin.movements === 1 ? "" : "s"} proposed from
          the script&rsquo;s movements — each one is a movement&rsquo;s own label, the scenes its
          beats sit on, and the cue section it points into. Nothing here chose a tempo: the cut does
          not state one and this step will not invent one. Edit, delete or add below; a spot you
          touch stops calling itself a proposal.
        </p>
        {unplaced.length > 0 && (
          <p className="font-jetbrains mt-2 text-label leading-snug text-amber-200/70">
            {unplaced.length} movement{unplaced.length > 1 ? "s" : ""} could not be placed on this
            picture and got no spot:{" "}
            {unplaced.map((u) => `"${u.movement.label}" — ${u.why}`).join("; ")}.
          </p>
        )}
      </div>
    );

  if (origin.kind === "cut-unreadable")
    return (
      <div data-testid="spot-origin" className="mt-3 border-t border-white/8 pt-3">
        <p className="text-content leading-snug text-rose-200/90">
          The script&rsquo;s cut could not be read, so nothing could be proposed from it. The cut is
          not gone — this browser would not hand it over — and no spot below was derived from it.
        </p>
        <p className="font-jetbrains mt-2 text-label leading-snug text-rose-200/60">
          {origin.trouble.kind} · on {origin.trouble.op} of the {origin.trouble.phase} step —{" "}
          {origin.trouble.message}
        </p>
      </div>
    );

  return (
    <div data-testid="spot-origin" className="mt-3 border-t border-white/8 pt-3">
      <p className="text-content leading-snug text-slate-400">
        {origin.kind === "no-movements"
          ? "This project's cut declares no movements, so there is nothing to propose a cue from — a cue's boundaries are the movements' boundaries, and this cut has none to read."
          : discipline === "educational"
            ? "Nothing was proposed, and it is not a fault of this step. Spots derive from the script's MOVEMENTS — \"act boundaries are cue boundaries\" — and only the trailer form carries them: an explainer's act structure lives as prose inside its beat labels, which no function can read. So this project has no musical intent to inherit, and the spotting below is yours to make."
            : "Nothing was proposed: no cut is stored for this project. Step 2 composes one from the spine confirmed in Step 1, and the movements of that cut are what a spot is derived from. Until then the spotting below is yours to make."}
      </p>
    </div>
  );
}

export default function ScoreSpotting({ projectId }: { projectId: string }) {
  /** THIS PROJECT'S PICTURE, as far as the frames step has written one.
   *
   *  `null` means the read has not landed — which is NOT the same as an empty
   *  cut, and the three states below are drawn differently on purpose. */
  const [read, setRead] = useState<{
    frames: Frame[];
    targetS: number;
    /** WHOSE FILM. Carried through to `cuesFrom` and from there into the vendor
     *  brief's only global narrative context — see `CueProject`. Read from the
     *  project record rather than the fixture, which is the bug this closes. */
    project: CueProject;
    /** Only to phrase the sentence about WHY there is nothing to propose from.
     *  An educational project is on the explainer lane by definition
     *  (`frames.ts#framesLane`), and an explainer script has no movements. */
    discipline: Discipline | undefined;
  } | null>(null);
  /** The read that did not happen, when one did not.
   *
   *  `loadStep` flattens a FAILED read and a NEVER-WRITTEN key to the same
   *  `undefined`; its own doc names `readStep` as the way to tell them apart,
   *  and here they are opposites. "No frames yet" is a creator who has not
   *  composed a picture, and the honest answer is `cuesFrom`'s own — there is
   *  nothing to spot against. A failed read is a picture that IS on disk and out
   *  of reach; drawing the first over the second would tell a creator with a
   *  finished cut that they have no film. */
  const [trouble, setTrouble] = useState<StorageTrouble | null>(null);

  // A project change must not leave the previous project's picture on screen for
  // the render or two before the new read lands — the adjust-during-render form
  // rather than an effect, which is the same shape (and the same reason)
  // StudioView.tsx uses for a `?step=` that changes under an open studio.
  const [seenProject, setSeenProject] = useState(projectId);
  if (projectId !== seenProject) {
    setSeenProject(projectId);
    setRead(null);
    setTrouble(null);
  }

  // Through the shared primitive rather than a hand-rolled `let alive = true`:
  // a load is issued for a KEY and by the time it lands the key may have moved.
  // `apply` returning false on a failed read is the primitive's own honest-read
  // rule — nothing was read, so nothing may be treated as read.
  useLoadFor(
    projectId,
    async (id) => {
      // The record carries `targetS`, the cut's declared runtime, which is what
      // closes the last placeable beat — the same number FramesAssembly hands
      // `durationOf` as `render.durationS`. A record that will not open is not
      // fatal here (see `pictureFromFrames`); a frames record that will not open
      // is, and that is the one this surface refuses to draw over.
      const project = await getProject(id).catch(() => undefined);
      const step = await readStep<FramesStepData>(id, FRAMES_PHASE);
      return { project, step };
    },
    ({ project, step }) => {
      if (!step.ok) {
        setTrouble(step.trouble);
        setRead(null);
        return false;
      }
      setTrouble(null);
      setRead({
        frames: step.data?.frames ?? [],
        targetS: project?.targetS ?? 0,
        // A record that would not open leaves the title and logline EMPTY rather
        // than falling back to the fixture's. An empty narrative context is a
        // brief that says nothing about the story; the fixture's is a brief that
        // says something false about it, and the two are not close.
        project: { title: project?.title ?? "", logline: project?.logline ?? "" },
        discipline: project?.discipline,
      });
    },
  );

  /** The film, derived. Never authored here and never defaulted to the fixture:
   *  a project with no frames has no picture, which is a real state with a real
   *  screen rather than a reason to show somebody else's. */
  const picture = useMemo(
    () => (read ? pictureFromFrames(read.frames, read.targetS) : null),
    [read],
  );

  /** THE SPOTTING SESSION — proposed from the script's movements, edited here,
   *  persisted under this step's own key. `null` while the reads land. */
  const session = useScoreSpots(projectId, picture?.scenes ?? null);

  /** Spots + this project's picture + this project's story → cues. All three
   *  arguments are the creator's now; before this pair of commits every one of
   *  them was Glass Harbor's. */
  const spotted = useMemo(
    () =>
      cuesFrom(
        toCueSpots(session.spots ?? []),
        picture?.scenes ?? [],
        read?.project ?? { title: "", logline: "" },
      ),
    [session.spots, picture, read?.project],
  );
  const cues = spotted.cues;
  /** Which rows are still proposals, by cue id — looked up rather than carried
   *  down through `cuesFrom`, because nothing below this line (a span, a
   *  duration, a vendor brief) may differ because a row was proposed. */
  const proposedIds = useMemo(
    () => new Set((session.spots ?? []).filter((s) => s.proposed).map((s) => s.id)),
    [session.spots],
  );

  const [focus, setFocus] = useState("");
  const [takes, setTakes] = useState<Record<string, Take>>({});
  // THE PRICE, BEFORE THE CLICK. `null` = still asking, `"unknown"` = the route
  // did not answer. Neither is allowed to render as a number.
  const [price, setPrice] = useState<MusicQuote | "unknown" | null>(null);

  useEffect(() => {
    let live = true;
    perSecondPrice()
      .then((q) => live && setPrice(q))
      .catch(() => live && setPrice("unknown"));
    return () => {
      live = false;
    };
  }, []);

  // Open on the refused cue when there is one — and survive a project with no
  // cues at all, which is now the state this surface is genuinely in most of the
  // time: cues are derived from the picture, and the fixture's spots name scenes
  // no real project has. Derived rather than seeded into `useState`, because the
  // cues are no longer known at import time — they arrive with the read.
  const cue =
    cues.find((c) => c.id === focus) ?? cues.find((c) => c.status === "failed") ?? cues[0];
  const take = cue ? takes[cue.id] : undefined;

  /** THE URLS THIS SURFACE OWNS, RELEASED WHEN IT GOES, keyed by the cue whose
   *  take they carry.
   *
   *  `blobUrl`'s docstring says "Caller revokes when done", and `f964607` made
   *  the playground bench the first caller in this repository that did. It did
   *  not reach here — the production step calling the same helper — so every
   *  rendered cue left a multi-megabyte decoded blob alive for the life of the
   *  tab, and re-rendering a cue dropped the previous url on the floor with no
   *  reference left to release it.
   *
   *  Keyed rather than a list so a REPLACE releases the take it replaces; the
   *  unmount sweep then has one url per cue to clear, not one per click.
   *  Written only from the event handler and the cleanup, never synced during
   *  render — react-hooks/refs objects to that, and objects correctly. */
  const owned = useRef<Record<string, string>>({});
  /** Whether this surface is still mounted, for the await below. A take that
   *  lands after the step is gone must not mint a url nobody can revoke, and
   *  must not setState on a component that no longer exists. */
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const url of Object.values(owned.current)) URL.revokeObjectURL(url);
      owned.current = {};
    };
  }, []);

  async function renderCue() {
    // NO TEMPO, NO RENDER, and the guard is here as well as on the button's
    // `disabled`: `/api/music/generate` validates bpm in 40..220 and the brief
    // puts the number into the plan's own style words, so a cue with no tempo
    // has nothing to send and nothing this surface may invent for it.
    if (!cue || cue.bpm === undefined) return;
    const bpm = cue.bpm;
    setTakes((t) => ({ ...t, [cue.id]: { state: "working" } }));
    try {
      const out = await generateCueAudio({
        title: cue.title,
        intent: cue.note,
        bpm,
        styleBlock: MUSIC_STYLE_BLOCK,
        // THE FILM ITSELF. No `durS`: the seconds of music bought are derived
        // server-side from these scenes, so the length requested cannot drift
        // from the length of picture it plays under.
        picture: cue.picture,
      });
      // Minting AFTER the mounted check, not before it: a url created for a
      // surface that has gone has no owner left to release it.
      if (!mounted.current) return;
      const url = audioUrl(out);
      const replaced = owned.current[cue.id];
      if (replaced) URL.revokeObjectURL(replaced);
      owned.current[cue.id] = url;
      setTakes((t) => ({
        ...t,
        [cue.id]: { state: "done", url, provenance: out.provenance },
      }));
    } catch (e) {
      if (!mounted.current) return;
      // A refusal is a spotting outcome, not an error — the region reverts to
      // refused-silence and the surface says so, in its own color.
      const refused = e instanceof MusicRequestError && e.code === "refused";
      const msg = e instanceof Error ? e.message : "The music call failed.";
      setTakes((t) => ({ ...t, [cue.id]: refused ? { state: "refused", msg } : { state: "error", msg } }));
    }
  }

  // The clock is derived ONCE, from THIS project's scenes, and the cue spans are
  // derived from the same walk — the picture lane and the music lane can no
  // longer disagree about where a scene starts, and neither can now be about a
  // different film from the one the creator made.
  const sceneCells = sceneClock(picture?.scenes ?? []);
  /** The seconds of film on screen. Every span and every tick is measured
   *  against this one number — see `DerivedPicture.totalS` for why it is the
   *  sum of the scenes' own holds rather than the project's target runtime. */
  const clockS = picture?.totalS ?? 0;

  const credit = cue ? engineCredit(cue, take) : { text: "", why: "" };
  // Before the click: what this cue's own length costs. After a take: what the
  // take ACTUALLY asked for, read off its provenance — whatever came back wins
  // over the estimate shown beforehand.
  const estimate = costLabel(price, cue?.durS ?? 0);
  const settled =
    take?.state === "done" ? costLabel(price, Math.round(take.provenance.requestedMs / 1000)) : null;

  /* WHAT THE COVERAGE LINE COUNTS, AND WHY IT CHANGED.
   *
   * It used to be `scored` / `refused` / `silent`, read off `CueSpot.status` and
   * summed over `durS`. Both halves broke the moment spots stopped being the
   * fixture:
   *
   *   · `status` is a fact about a TAKE, and no spot proposed from a movement or
   *     added by a creator has one. Every real project therefore read
   *     "0s scored · 0s refused · 286s unspotted" over a film whose whole length
   *     was covered by cues. The film was spotted; nothing had been rendered,
   *     which is a different sentence.
   *   · summing `durS` double-counts. Movements overlap by construction here —
   *     the fixture's rung 1 covers scenes 3-5 and rung 2 covers 5-7 — so the
   *     sum can exceed the clock. The scenes are a SET, and the set is exact.
   *
   * So the line counts picture: which scenes a cue sits on, and which none does.
   * Takes are counted separately and only for THIS session, because they are not
   * persisted (see `Take`) and a count that survived a reload would be a claim
   * about audio that did not. */
  const spottedSceneIds = new Set(
    (session.spots ?? []).filter((s) => cues.some((c) => c.id === s.id)).flatMap((s) => s.sceneIds),
  );
  const spottedS = (picture?.scenes ?? [])
    .filter((s) => spottedSceneIds.has(s.id))
    .reduce((n, s) => n + s.targetS, 0);
  const unspottedS = clockS - spottedS;
  const takesHeld = Object.values(takes).filter((t) => t.state === "done").length;

  /* THE FRAMES ARE ON DISK AND OUT OF REACH — a storage failure, which is NOT
     an absence of picture and must never be drawn as one. The creator's cut is
     not gone; this browser would not hand it over. Same voice and the same
     colour as the studio's own door, because it is the same failure, and it
     names the store's own kind so the remedy (a full quota, another tab holding
     an upgrade) is the right one.

     FIRST OF THE THREE, and the order is the whole point — it was written the
     other way round and the failure was invisible: a failed read leaves no
     picture, so a `!picture` branch above this one swallows it and the surface
     sits on "reading…" forever while the trouble bell rings in the header. Two
     states that look identical to a user waiting for a spinner that will never
     resolve. Measured against a simulated read failure on 2026-09-08. */
  if (trouble)
    return (
      <div className="rounded-2xl border border-rose-400/30 bg-rose-400/5 p-4">
        <p className="text-content leading-snug text-rose-200">
          This project&rsquo;s frames could not be read. Nothing has been lost, and nothing here
          will guess: a cue is a span of film, so there is no cue to brief and no music to buy
          until the picture can be read again.
        </p>
        {/* The store's own words, on their own line rather than spliced into the
            sentence above — a browser's DOMException message ends with no full
            stop and ran straight into the next sentence when it was inlined. */}
        <p className="font-jetbrains mt-2 text-label leading-snug text-rose-200/60">
          {trouble.kind} · on {trouble.op} of the {trouble.phase} step — {trouble.message}
        </p>
      </div>
    );

  /* THIS STEP'S OWN RECORD IS OUT OF REACH — the spotting session, not the
     picture. Its own branch beside the frames one above and for the identical
     reason: a failed read leaves no spots, and drawing the empty-session screen
     over it would tell a creator who has spotted a whole cut that they have
     spotted nothing. Nothing is seeded and nothing is written while it holds
     (see `useScoreSpots`), so the work on disk stays there. */
  if (session.trouble)
    return (
      <div className="rounded-2xl border border-rose-400/30 bg-rose-400/5 p-4">
        <p className="text-content leading-snug text-rose-200">
          This project&rsquo;s spotting session could not be read. Nothing has been lost and nothing
          has been written: the cues you placed are on disk, and this step will not propose a fresh
          set over them.
        </p>
        <p className="font-jetbrains mt-2 text-label leading-snug text-rose-200/60">
          {session.trouble.kind} · on {session.trouble.op} of the {session.trouble.phase} step —{" "}
          {session.trouble.message}
        </p>
      </div>
    );

  /* THE READ HAS NOT LANDED — and it is a claim about this surface, not about
     the project. Said, rather than drawn as an empty timeline for the instant
     before the frames arrive: an empty timeline is a claim that the project has
     no picture, which is the sentence below and a different one.

     `session.spots` is null for the same kind of instant — the spots are seeded
     from the cut AND the picture, so they land one commit after the frames do,
     and an empty music lane in that window is the same false claim. */
  if (!picture || session.spots === null || session.origin === null)
    return (
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
        <p className="font-jetbrains text-content text-white/35">
          reading this project&rsquo;s frames and its spotting session…
        </p>
      </div>
    );

  /* NO PICTURE, NO CUES — and this is the state `cuesFrom` has carried a written
     sentence for since it was built, unreachable until now because the only
     scenes it was ever passed were the fixture's five. `UnspottableLine` renders
     that sentence: "this project has no scenes yet — there is no picture to spot
     against", one line per spot, from the derivation rather than retyped here.

     Distinct from the storage failure above in colour, wording and remedy: that
     one is the browser's fault and points at storage, this one is simply work
     that has not been done yet and points at the step that does it. */
  if (picture.scenes.length === 0)
    return (
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
        <p className="text-content leading-snug text-slate-400">
          Nothing to spot. Cues are spans of film, and this project has no frames for them to sit
          on — so there is no cue to brief, no duration to buy and nothing to draw on the clock.
          Spot music once the picture exists: Step 3 is where a beat becomes a frame with a length.
        </p>
        {picture.unplaced.length > 0 && (
          <p className="font-jetbrains mt-2 text-label leading-snug text-amber-200/70">
            {picture.unplaced.length} beat{picture.unplaced.length > 1 ? "s" : ""} carry no
            timecode, so nothing can say where they sit or how long they hold.
          </p>
        )}
        <UnspottableLine items={spotted.unspottable} />
      </div>
    );

  return (
    <div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
        <div className="flex gap-3">
          <span className={LANE_GUTTER} />
          <div className="flex-1">
            <TimeRuler totalS={clockS} />
          </div>
        </div>

        {/* picture lane — THE CREATOR'S OWN BEATS. The cell used to read
            "sc {index}", which was true of the fixture and unreadable as
            anything else: the number is this surface's own ordinal, and a
            creator has no way to tell which of their beats it is. The slug is
            the beat's own label, so the lane now names the film that is on
            screen. Truncated in the cell because a span is only as wide as the
            seconds it holds; the full slug, its role and its length are on the
            title, which is where the detail belongs rather than in a smaller
            type size that this app's scale does not have. */}
        <div className="mt-3 flex items-center gap-3">
          <span className={`font-jetbrains ${LANE_GUTTER} text-right text-label tracking-[0.12em] text-white/40 uppercase`}>
            picture
          </span>
          <div className="relative h-9 flex-1">
            {sceneCells.map(({ scene, startS }) => (
              <div
                key={scene.id}
                style={spanStyle(startS, scene.targetS, clockS)}
                className="absolute inset-y-0 overflow-hidden rounded-md border border-white/10 bg-white/[0.04] px-2"
                title={`${scene.index} · ${scene.slug} — ${scene.mood} · ${startS}s → ${startS + scene.targetS}s`}
              >
                <span className="font-jetbrains block truncate text-label leading-9 text-white/50">
                  {scene.index} · {scene.slug}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* music lane */}
        <div className="mt-2 flex items-center gap-3">
          <span className={`font-jetbrains ${LANE_GUTTER} text-right text-label tracking-[0.12em] text-white/40 uppercase`}>
            music
          </span>
          <div className="relative h-11 flex-1">
            {/* A PROPOSED SPAN IS DRAWN AS ONE — dashed and amber, the same
                vocabulary the "not performed" row and the unplaced lines use
                everywhere else on this step for a thing that is declared rather
                than settled. A proposal that looked identical to a decision on
                the one surface where the money is spent would be the whole
                point of marking it thrown away. */}
            {cues.map((c) => {
              const proposed = proposedIds.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => setFocus(c.id)}
                  style={spanStyle(c.startS, c.durS, clockS)}
                  title={proposed ? `${c.title} — proposed from the script, not yet yours` : c.title}
                  /* `overflow-hidden`, and it is not cosmetic: the label inside
                     truncates, but a span narrower than its own text still
                     PAINTED that text past its border — with three fixture cues
                     over a 31s clock nothing was ever narrow enough to show it,
                     and with eight movements over a 286s cut four labels
                     overprinted into one grey smear (measured 2026-09-08). The
                     picture lane above has carried this class since it was
                     written; the music lane never did. */
                  className={`absolute inset-y-0 overflow-hidden rounded-md border px-2 text-left transition ${
                    c.status === "failed"
                      ? "border-dashed border-rose-400/40 bg-rose-400/[0.04]"
                      : proposed
                        ? "border-dashed border-amber-300/40 bg-amber-300/[0.06]"
                        : "border-cyan-400/30 bg-cyan-400/[0.08]"
                  } ${focus === c.id ? "ring-1 ring-cyan-300/50" : ""}`}
                >
                  <span
                    className={`font-jetbrains block truncate text-label leading-[2.6] ${
                      c.status === "failed"
                        ? "text-rose-300/90"
                        : proposed
                          ? "text-amber-200/90"
                          : "text-cyan-200/90"
                    }`}
                  >
                    {c.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="font-jetbrains mt-3 text-content text-white/35">
          <span className="text-cyan-300/80">{spottedS}s spotted</span>
          {" · "}
          {unspottedS}s with no cue over it — spans to scale on the {clockS}s of picture this
          project has
          {takesHeld > 0 &&
            ` · ${takesHeld} take${takesHeld > 1 ? "s" : ""} rendered in this session, none kept past a reload`}
        </p>
        {/* BEATS THAT ARE NOT ON THE CLOCK. Named here rather than dropped in
            silence: they exist in the cut, they simply have no timecode, so
            there is no span to draw and nothing can be scored over them. See
            the null-hold note in ./picture. */}
        {picture.unplaced.length > 0 && (
          <p className="font-jetbrains mt-2 text-label leading-snug text-amber-200/70">
            {picture.unplaced.length} beat{picture.unplaced.length > 1 ? "s" : ""} carry no
            timecode and hold no span, so they are not on this clock:{" "}
            {picture.unplaced.map((f) => `"${f.title}"`).join(", ")}.
          </p>
        )}
        <UnspottableLine items={spotted.unspottable} />
        {/* WHERE THE SPOTS CAME FROM, under the timeline they are drawn on. */}
        <OriginLine
          origin={session.origin}
          unplaced={session.unplaced}
          discipline={read?.discipline}
        />
      </div>

      {/* THE SESSION ITSELF — propose, then let them edit. */}
      <SpotList
        spots={session.spots}
        scenes={picture.scenes}
        focusId={cue?.id ?? ""}
        onFocus={setFocus}
        onPatch={session.patchSpot}
        onRemove={session.removeSpot}
        onAdd={session.addSpot}
      />

      {!cue ? (
        /* SPOTS, BUT NONE OF THEM ON THIS PICTURE. Not an error and not an empty
           box with a disabled button: every spot in the session names scenes
           this project does not have, so not one of them has a span.
           `text-content` rather than the `text-sm` this block carried since it
           was written — 14px, under this app's 16px floor, and invisible to
           `check:type`, which reads the extra-small class and arbitrary px
           sizes but not the intermediate named rungs. Unreachable copy until
           2026-09-08, which is exactly how it survived.

           AN EMPTY SESSION DOES NOT REACH HERE, and that is a deliberate cut: it
           is already answered twice above — `OriginLine` says why nothing was
           proposed, and the spotting session's own card says "0 spots" beside
           the button that adds one. A third panel restating it was three
           paragraphs for one fact (measured on the Score step, 2026-09-08). */
        session.spots.length > 0 && (
          <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
            <p className="text-content leading-snug text-slate-400">
              No cue sits on this picture. There {picture.scenes.length === 1 ? "is" : "are"}{" "}
              {picture.scenes.length} scene{picture.scenes.length > 1 ? "s" : ""} on the clock
              above, and not one spot in this session covers any of them — a cue&rsquo;s span IS
              the film it covers, so a spot with no picture gets no span rather than a default one,
              and nothing here will buy music for a film that does not exist.
            </p>
          </div>
        )
      ) : (
      <div
        className={`mt-4 rounded-2xl border p-4 ${
          cue.status === "failed" ? "border-rose-400/25 bg-rose-400/[0.03]" : "border-white/8 bg-white/[0.02]"
        }`}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-label font-medium text-white">{cue.title}</h3>
          <span className="font-jetbrains text-label text-white/40">
            {cue.startS}s → {cue.startS + cue.durS}s ·{" "}
            {cue.bpm === undefined ? (
              /* NO TEMPO, SAID WHERE THE NUMBER WOULD HAVE GONE. Nothing
                 upstream states one — a Movement has no tempo and neither does
                 the Cue it points into — and this step's craft directory is n=0
                 and says a trailer tempo "is chosen from the picture by bar
                 math", never defaulted. So the slot reads as unanswered rather
                 than being filled with a plausible 84. */
              <span className="text-amber-200/80" title={NO_TEMPO_WHY}>
                no tempo
              </span>
            ) : (
              `${cue.bpm} bpm`
            )}
          </span>
          {/* Only a take has a status. A spot that has never been to the engine
              has none, and neither "rendered" nor "failed" is true of it. */}
          {cue.status && <CueStatusWord status={cue.status} />}
          {proposedIds.has(cue.id) && (
            <span
              className="font-jetbrains rounded-full border border-amber-300/30 px-2 py-0.5 text-label tracking-[0.12em] text-amber-200/80 uppercase"
              title="Derived from a movement of the script's cut. Edit anything about it below and it becomes yours."
            >
              proposed
            </span>
          )}
          {/* THE ENGINE THAT ANSWERED, OR NOTHING. A model id is a property of
              a take, so it is printed only when a take exists to own it — and
              then it is read off the provenance the engine returned, never off
              the cue. A cue with no take in hand says the record is absent
              rather than falling back to a default, because a default here is
              indistinguishable from a fact and this exact spot printed a
              fictional vendor for months. */}
          {credit.text && (
            <span className="font-jetbrains text-label text-white/30" title={credit.why}>
              {credit.text}
            </span>
          )}
          {cue.status === "failed" && cue.failure && (
            <span
              className="font-jetbrains rounded border border-rose-400/25 px-1.5 py-0.5 text-label text-rose-300/80"
              title="The engine's own outcome vocabulary (MusicErrorKind, lib/music/errors.ts) — a state the adapter really returns, not a description of one."
            >
              kind={cue.failure}
            </span>
          )}
        </div>
        <p className={`mt-1.5 text-content leading-snug ${cue.status === "failed" ? "text-rose-200/90" : "text-slate-400"}`}>
          {/* The purpose sentence, and its absence. A proposed spot carries the
              label of the cue section its movement points into, verbatim; a
              movement that names no section leaves this empty, which the script
              step's own checker already reports as unmeasured rather than
              filling in. Nothing here writes prose about somebody's film. */}
          {cue.note || (
            <span className="text-amber-200/70">
              no intent recorded — say what this cue is for in the session below; it is the one
              sentence the model is told about the moment.
            </span>
          )}
        </p>
        {/* A SPECIFIED BEHAVIOUR THIS BUILD DOES NOT HAVE, said out loud. The
            dashed border and the words carry the whole meaning: the studio
            intends this, the studio does not do it, and nothing on the timeline
            above should be read as if it did. */}
        {cue.declaredNotPerformed && (
          <p className="font-jetbrains mt-2 inline-flex items-center gap-2 rounded border border-dashed border-amber-300/30 px-2 py-1 text-label text-amber-200/70">
            <span className="uppercase tracking-[0.14em] text-amber-300/60">not performed</span>
            {cue.declaredNotPerformed} — declared intent; there is no mixing stage in this build.
          </p>
        )}
        {/* The music engine is real now — /api/music/generate renders a cue's
            brief through lib/music: title, intent, bpm, the project's standing
            style block, AND the scenes this cue plays under. The duration is
            not sent; it is derived from those scenes server-side, so the
            seconds of music bought are the seconds of film covered. */}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={renderCue}
            // SHUT WITHOUT A TEMPO, and the title says why rather than leaving a
            // dead button. `/api/music/generate` validates bpm in 40..220 and
            // `cueToPlan` puts it into the plan's own words and into `barsFit`;
            // there is nothing to send and nothing honest to substitute.
            disabled={take?.state === "working" || cue.bpm === undefined}
            title={cue.bpm === undefined ? NO_TEMPO_WHY : undefined}
            className={`rounded-lg border border-cyan-400/30 bg-cyan-400/[0.08] px-3 py-1.5 text-label font-medium text-cyan-200/90 transition hover:bg-cyan-400/[0.14] disabled:opacity-50 ${
              // A render in flight is a wait; a missing tempo is a refusal. The
              // cursor should not say "hold on" about the second one.
              take?.state === "working" ? "disabled:cursor-wait" : "disabled:cursor-not-allowed"
            }`}
          >
            {take?.state === "working"
              ? "rendering…"
              : cue.bpm === undefined
                ? "set a tempo to render"
                : take?.state === "done"
                  ? "render another take"
                  : cue.status === "failed"
                    ? "re-ask the model"
                    : "render this cue"}
          </button>
          <span className="font-jetbrains text-label text-white/35">
            {cue.bpm === undefined ? "no tempo yet" : `${cue.bpm} bpm`} · duration derived from
            picture
          </span>
          {/* WHAT THE CLICK COSTS, BESIDE THE BUTTON THAT SPENDS IT — not a
              dialog, which would kill the one thing a spotting session is for.
              Today it reads "13s of audio · unpriced", because ElevenLabs bills
              in credits and nobody in this repo has measured the rate
              (lib/music/pricing.ts). That is the honest sentence; $0.00 would
              not be. The figure comes from /api/music/pricing, the same
              declaration the server meters against. */}
          <span
            className={`font-jetbrains text-label ${price === "unknown" ? "text-amber-300/70" : "text-white/35"}`}
            title={estimate.title}
          >
            {estimate.text}
          </span>
        </div>
        {/* WHAT THIS CUE IS BRIEFED FROM, NAMED. It used to read "briefed from
            sc 3, 4" on one line with the tempo and the price — which was
            readable only because the fixture's scenes were called "sc 3" and
            "sc 4". A real project's scenes are its own beats, and their labels
            are sentences ("EXT. PIER 7 — NIGHT"): two of them in a horizontal
            flex row either wrapped the price off the end or had to be truncated,
            and truncating this is truncating the provenance — the one line that
            says WHICH film the money is about to be spent on.
            So it is its own block, wrapping rather than clipped, and it keeps
            the scene's ordinal beside its slug because the ordinal is what the
            timeline above and the engine's own section names use. The moods
            stay on the title: they are what the model is told, and they are
            detail, not identity. */}
        <p
          className="font-jetbrains mt-2 text-label leading-snug text-white/35"
          title={cue.picture.scenes.map((sc) => `${sc.index} ${sc.slug} — ${sc.mood}`).join("\n")}
        >
          briefed from {cue.picture.scenes.length} scene
          {cue.picture.scenes.length > 1 ? "s" : ""} —{" "}
          {cue.picture.scenes.map((sc) => `${sc.index} ${sc.slug}`).join(" · ")}
        </p>
        {take?.state === "done" && (
          <>
            <audio controls src={take.url} className="mt-3 h-9 w-full" />
            {/* THE RECEIPT. Same vocabulary as the estimate above it, so a user
                can compare them without translating — and the same refusal to
                print a dollar figure nobody measured. */}
            <p className="font-jetbrains mt-1.5 text-label text-white/35" title={settled?.title}>
              rendered · {settled?.text}
            </p>
          </>
        )}
        {(take?.state === "refused" || take?.state === "error") && (
          <p className="font-jetbrains mt-3 text-content leading-snug text-rose-200/70">{take.msg}</p>
        )}
        {cue.status === "failed" && take?.state !== "done" && (
          <p className="font-jetbrains mt-3 text-content leading-snug text-rose-200/60">
            {cue.durS}s of the {clockS}s clock plays silent until a take lands. A refusal keeps
            it silent on purpose — refused-silence is a state this cut renders, not an error it hides.
          </p>
        )}
      </div>
      )}
    </div>
  );
}
