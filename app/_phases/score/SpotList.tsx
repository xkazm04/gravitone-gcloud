"use client";

// THE SPOTTING SESSION, EDITABLE — one row per spot, and the button that adds
// one.
//
// The vocabulary is `script/trailer/BeatEditor.tsx`'s, deliberately, because it
// is the editable list this app already has: a field is held locally while
// typing and pushed up on blur or after a short pause, so the derivation at the
// top of the page does not re-run on every keystroke; a decision (a range, a
// delete) is not debounced, because the picture it changes should change with
// it.
//
// THE SCENE RANGE IS TWO NUMBERS, not a <select>. Two reasons and both are the
// repo's own: `components/ui/Field.tsx` records that a raw select "renders its
// options in system chrome against a near-black studio and reads as broken",
// and the pill group it offers instead does not scale to a sixteen-scene cut.
// The ordinal is also what the timeline above and the engine's own section
// names already call a scene by ("sc 3"), so the control speaks the label that
// is on screen a few pixels away.

import { useEffect, useRef, useState } from "react";

import { Unlink } from "lucide-react";

import { Hint } from "@/components/ui/signal";

import type { Scene } from "../../_studio/projectTypes";

import type { ScoreSpot } from "./spots";

const DEBOUNCE_MS = 400;

/** The two shared control skins, spelled once. No colour literal: these are the
 *  same white-alpha and cyan utilities the rest of the step draws in, and the
 *  focus ring is the app-wide `:focus-visible` from globals.css. */
const INPUT_BASE =
  "font-jetbrains min-w-0 rounded-lg border bg-white/[0.03] px-2 py-1 text-label " +
  "text-white/80 transition placeholder:text-white/45";
const INPUT = `${INPUT_BASE} border-white/12 hover:border-white/25`;
/** The same control, marked: this ordinal names a scene the picture does not
 *  have. Its own constant rather than a class appended after `border-white/12`,
 *  because two border-colour utilities on one element are decided by the order
 *  Tailwind emits them in, not by the order they are written. */
const INPUT_ORPHAN = `${INPUT_BASE} border-amber-300/50 hover:border-amber-300/70`;
const GHOST_BUTTON =
  "font-jetbrains rounded-lg border border-white/12 px-2.5 py-1 text-label text-white/55 " +
  "transition hover:border-white/25 hover:text-white/85";

/** Where a spot's scenes sit in the picture, as 1-based ordinals — or null when
 *  this project has none of them, which is the state `cuesFrom` reports as
 *  unspottable and the row marks rather than silently repairing. */
function rangeOf(spot: ScoreSpot, scenes: Scene[]): { from: number; to: number } | null {
  const positions = spot.sceneIds
    .map((id) => scenes.findIndex((s) => s.id === id))
    .filter((i) => i >= 0);
  if (positions.length === 0) return null;
  return { from: Math.min(...positions) + 1, to: Math.max(...positions) + 1 };
}

function SpotRow({
  spot,
  scenes,
  focused,
  onFocus,
  onPatch,
  onRemove,
}: {
  spot: ScoreSpot;
  scenes: Scene[];
  focused: boolean;
  onFocus: () => void;
  onPatch: (patch: Partial<Omit<ScoreSpot, "id">>) => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(spot.title);
  const [note, setNote] = useState(spot.note);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ title, note });
  const flushRef = useRef<() => void>(() => {});

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch: Partial<Omit<ScoreSpot, "id">> = {};
    if (latest.current.title !== spot.title) patch.title = latest.current.title;
    if (latest.current.note !== spot.note) patch.note = latest.current.note;
    if (Object.keys(patch).length) onPatch(patch);
  };

  // Refs are written after render, never during it — BeatEditor.tsx records why
  // the render-phase form is a bug the compiler lint is right to object to.
  useEffect(() => {
    latest.current = { title, note };
    flushRef.current = flush;
  });
  // A pending edit is flushed on unmount rather than lost.
  useEffect(() => () => { if (timer.current) flushRef.current(); }, []);

  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, DEBOUNCE_MS);
  };

  const range = rangeOf(spot, scenes);
  const setRange = (from: number, to: number) => {
    // Clamped and ordered here rather than trusted: a number input accepts
    // anything typed into it, and a range that runs backwards would ask
    // `pictureFor` for a scene list that is not the film's own order.
    const lo = Math.max(1, Math.min(scenes.length, Math.min(from, to)));
    const hi = Math.max(1, Math.min(scenes.length, Math.max(from, to)));
    onPatch({ sceneIds: scenes.slice(lo - 1, hi).map((s) => s.id) });
  };

  return (
    <li
      data-testid={`spot-${spot.id}`}
      className={`rounded-xl border p-3 transition ${
        focused ? "border-cyan-400/35 bg-cyan-400/[0.04]" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="cue title"
          value={title}
          onChange={(e) => { setTitle(e.target.value); schedule(); }}
          onBlur={flush}
          onFocus={onFocus}
          placeholder="title"
          className={`${INPUT} flex-1 basis-56`}
        />
        {/* THE PROPOSAL STATE, said on the row that carries it. It disappears
            the moment the creator changes anything about this spot — a row a
            human has had an opinion about is not a proposal any more, and
            `patchSpot` clears the flag rather than this component deciding. */}
        {spot.proposed && (
          <span className="font-jetbrains inline-flex items-center gap-1 rounded-full border border-amber-300/30 px-2 py-0.5 text-label tracking-[0.12em] text-amber-200/80 uppercase">
            proposed
            {/* WHICH movement, and nothing else. The tooltip that hung here
                spent three clauses re-describing the pill, the row and the
                span it draws on the timeline above. */}
            {spot.fromMovement && (
              <Hint tone="amber" label="the movement this came from">
                {spot.fromMovement}
              </Hint>
            )}
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`delete the cue "${spot.title}"`}
          className={GHOST_BUTTON}
        >
          delete
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-jetbrains text-label tracking-[0.12em] text-white/35 uppercase">scenes</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={scenes.length}
          aria-label="first scene"
          value={range?.from ?? ""}
          onChange={(e) => setRange(Number(e.target.value), range?.to ?? Number(e.target.value))}
          className={`${range === null ? INPUT_ORPHAN : INPUT} w-16`}
        />
        <span className="font-jetbrains text-label text-white/30">→</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={scenes.length}
          aria-label="last scene"
          value={range?.to ?? ""}
          onChange={(e) => setRange(range?.from ?? Number(e.target.value), Number(e.target.value))}
          className={`${range === null ? INPUT_ORPHAN : INPUT} w-16`}
        />
        {/* THE TEMPO, AND ITS ABSENCE. Empty is a real value here and it is the
            value every proposed spot arrives with: nothing upstream of this step
            states a tempo, and this step's own craft directory is n=0 and
            declines to supply one. So the placeholder asks rather than
            suggesting, and the render button stays shut until a human answers. */}
        <span className="font-jetbrains text-label tracking-[0.12em] text-white/35 uppercase">tempo</span>
        <input
          type="number"
          inputMode="numeric"
          min={40}
          max={220}
          aria-label="tempo in beats per minute"
          value={spot.bpm ?? ""}
          placeholder="—"
          onChange={(e) => {
            const n = Number(e.target.value);
            // An empty box is "nobody has chosen", not zero. `undefined` is what
            // the record and the surface both read as absence.
            onPatch({ bpm: e.target.value.trim() === "" || !Number.isFinite(n) ? undefined : n });
          }}
          className={`${INPUT} w-20`}
        />
        <span className="font-jetbrains text-label text-white/35">bpm</span>
        {/* A RANGE OVER NOTHING, MARKED ON THE PAIR THAT IS WRONG rather than
            written out beside it: the two ordinals name scenes this project does
            not have, so there is no span and the derivation calls the spot
            unspottable. */}
        {range === null && (
          <Unlink
            aria-label="covers no scene this project has"
            className="h-4 w-4 shrink-0 text-amber-300/80"
          />
        )}
      </div>

      <input
        aria-label="what this cue is for"
        value={note}
        onChange={(e) => { setNote(e.target.value); schedule(); }}
        onBlur={flush}
        onFocus={onFocus}
        placeholder="what this cue is for"
        className={`${INPUT} mt-2 w-full`}
      />
    </li>
  );
}

export default function SpotList({
  spots,
  scenes,
  focusId,
  onFocus,
  onPatch,
  onRemove,
  onAdd,
}: {
  spots: ScoreSpot[];
  /** This project's picture, in clock order. The scene ordinals the range
   *  controls speak are positions in THIS array. */
  scenes: Scene[];
  focusId: string;
  onFocus: (id: string) => void;
  onPatch: (id: string, patch: Partial<Omit<ScoreSpot, "id">>) => void;
  onRemove: (id: string) => void;
  onAdd: (sceneIds: string[]) => void;
}) {
  return (
    <div data-testid="spot-list" className="mt-4 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-jetbrains text-label tracking-[0.14em] text-white/40 uppercase">
          the spotting session
        </h3>
        <p className="font-jetbrains text-label text-white/35">
          {spots.length} spot{spots.length === 1 ? "" : "s"} on {scenes.length} scene
          {scenes.length === 1 ? "" : "s"} of picture
        </p>
      </div>

      {spots.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {spots.map((spot) => (
            <SpotRow
              key={spot.id}
              spot={spot}
              scenes={scenes}
              focused={focusId === spot.id}
              onFocus={() => onFocus(spot.id)}
              onPatch={(patch) => onPatch(spot.id, patch)}
              onRemove={() => onRemove(spot.id)}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        data-testid="spot-add"
        // The first scene, so a new spot is ON the picture from the moment it
        // exists — an empty range would draw nothing and read as a broken row.
        onClick={() => onAdd(scenes.length ? [scenes[0].id] : [])}
        disabled={scenes.length === 0}
        className="font-jetbrains mt-3 rounded-lg border border-cyan-400/30 bg-cyan-400/[0.08] px-3 py-1.5 text-label font-medium text-cyan-200/90 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
      >
        add a cue
      </button>
    </div>
  );
}
