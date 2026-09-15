"use client";

// VARIANT C · CONTACT SHEET — the studio as a wall of candidates.
//
// The other two variants draw an instrument and a result. This one draws the
// WORK: frames pinned up at once, four of them ringed because a person walked
// the wall and picked. That is the loop this app is actually for — you do not
// get a film, you get candidates and a decision, and the door is in the middle
// of them.
//
// ── WHAT IS ON THE WALL, AND WHY IT CHANGED (2026-09-08) ────────────────────
//
// It used to be thirty gradients. `FrameCandidate.tone` is annotated in
// app/_studio/projectTypes.ts as "mock gradient stops", so the one drawing that
// had to carry the entire wordless brief was a drawing of nothing: a stranger
// could not tell what this app makes. The picture had never been given real
// work to show.
//
// It now shows nineteen REAL pictures this repo's own pipeline generated and
// committed — six style plates (public/presets/, built by
// pipeline/build-preset-thumbs.mts, one subject rendered six ways) and thirteen
// card stills (public/deck-art/). Nothing is fetched, generated or keyed at
// runtime; they are files in public/.
//
// Three counts decide the layout, and all three are measured rather than
// chosen:
//
//   30 cells   6 x 5, unchanged — the density that reads as a contact sheet.
//   19 stills  every committed still, each used EXACTLY ONCE. The old wall did
//              FRAMES[i % 15] over 30 cells, i.e. every picture twice at a flat
//              2.00x, which is the most legible kind of repetition there is.
//              Nineteen distinct pictures repeat nowhere.
//   11 tones   the remainder, and they are not filler: a contact sheet is a
//              sheet of CANDIDATES, some of them still just a colour the
//              director asked for. They are the fixture's own `tone` strings.
//
// The eleven tone cells are the eleven NEAREST THE DOOR, because the pocket's
// radial gradient below is opaque ink to 34% of its radius and gone by 78% —
// so the cells a viewer cannot see anyway are the ones that hold no picture,
// and every still lands where it can be looked at. That falls out as a 4x3
// block behind the button with one corner bitten out (the tie at the pocket's
// edge breaks by index); the asymmetry is left in, because a wall of
// candidates that is perfectly symmetrical is a wall nobody worked on.
//
// ── THE RINGS: FOUR, AND THE COMMENT NOW MATCHES THE CODE ───────────────────
//
// This header used to claim "the four rings sit on the four scenes that
// actually have a pick" while the code ringed EIGHT — 4 picks x the 2.00x
// tiling. The count is now derived instead of described: one cell per scene,
// ringed only if that scene has a pick. app/_studio/scenes.ts has five scenes
// and four picks (scene five is still undecided), so the wall draws four rings
// and cannot drift from that again.
//
// WHICH cell carries which scene is the one free choice here (SCENE_CELLS): the
// four ringed cells are spread wide and kept out of the pocket, so the idea the
// picture exists to communicate is visible at a glance rather than hunted for.

import Image from "next/image";

import { SCENES } from "@/app/_studio/scenes";

import { EnterButton, LandingShell } from "./parts";

/** The six style plates: ONE subject rendered in six styles, which is exactly
 *  what a bracket of candidates for a single beat looks like. Bright and flat,
 *  so they are interleaved rather than listed in a block (see STILLS). */
const PLATES = [
  "/presets/blueprint.jpg",
  "/presets/signal-ledger.jpg",
  "/presets/newsprint-cutout.jpg",
  "/presets/paper-relief.jpg",
  "/presets/chalk-argument.jpg",
  "/presets/data-neon.jpg",
];

/** Thirteen card stills — dark, atmospheric, and the closest thing in the repo
 *  to a frame from the fixture project's night-time story. */
const CARD_ART = [
  "/deck-art/template-cinematic.webp",
  "/deck-art/discipline-educational.webp",
  "/deck-art/template-trailer.webp",
  "/deck-art/engine-adjudication.webp",
  "/deck-art/discipline-trailer.webp",
  "/deck-art/template-teaser.webp",
  "/deck-art/engine-reversal-chain.webp",
  "/deck-art/discipline-free.webp",
  "/deck-art/template-short-form-clip.webp",
  "/deck-art/engine-derived-short.webp",
  "/deck-art/template-free-form.webp",
  "/deck-art/template-mid-educational-video.webp",
  "/deck-art/template-short-educational-video.webp",
];

/** The nineteen stills in fill order. Every third slot is a bright plate and the
 *  rest are the dark card stills, so the six loud pictures land spread around
 *  the wall instead of clustering wherever the array happened to end. */
const STILLS: string[] = [];
for (let i = 0, plate = 0, card = 0; i < PLATES.length + CARD_ART.length; i++) {
  STILLS.push(i % 3 === 1 && plate < PLATES.length ? PLATES[plate++] : CARD_ART[card++]);
}

/** The fixture's real `tone` values, for the cells that hold no picture. */
const TONES = SCENES.flatMap((s) => s.frames.map((f) => f.tone));

const COLS = 6;
const ROWS = 5;
const CELLS = COLS * ROWS;

/** Distance from the door, in cells. */
const doorDistance = (i: number) =>
  Math.hypot(Math.floor(i / COLS) - (ROWS - 1) / 2, (i % COLS) - (COLS - 1) / 2);

/** The cells nearest the door hold a tone rather than a still — the pocket eats
 *  them either way, so no picture is spent where nobody can see it. */
const VEILED = new Set(
  Array.from({ length: CELLS }, (_, i) => i)
    .sort((a, b) => doorDistance(a) - doorDistance(b) || a - b)
    .slice(0, CELLS - STILLS.length),
);

/** One cell per scene, in scene order — chosen for spread and for sitting
 *  clear of the pocket. Every one of them holds a still: a decision is about a
 *  picture somebody looked at, so ringing a bare tone would be a lie.
 *
 *  THE MIX IS DELIBERATE. The first pass put all four rings on plates purely by
 *  arithmetic — SCENE_CELLS happened to land on four slots where `i % 3 === 1`
 *  — and the wall then said "the bright graphic ones are the picked ones",
 *  which is a difference in KIND, not a decision. Three card stills and one
 *  plate: the ring has to mean somebody chose, not that this tile came from a
 *  different folder. Top-centre, upper-right, mid-left, bottom-right — around
 *  the door and off its axes, so no ring hides behind the button. The fifth
 *  entry is scene five, which has no pick and so draws nothing; it is listed
 *  anyway because this array is one cell PER SCENE, and a scene added to
 *  scenes.ts needs a cell here or it silently rings nowhere. */
const SCENE_CELLS = [3, 11, 12, 28, 5];

/** Ringed iff that scene has a pick — four today, and derived rather than
 *  described, which is the whole repair: the header used to say four while the
 *  code drew eight. */
const PICKED = new Set(
  SCENES.flatMap((s, i) => (s.pickedFrameId ? [SCENE_CELLS[i]] : [])),
);

let nextStill = 0;
const WALL = Array.from({ length: CELLS }, (_, i) => ({
  still: VEILED.has(i) ? null : STILLS[nextStill++],
  tone: TONES[i % TONES.length],
  picked: PICKED.has(i),
  dist: doorDistance(i),
}));

/** The grease-pencil mark. A picked frame is separated from its neighbours on
 *  THREE channels, because colour alone is not a signal (and because measured
 *  on a 1920-wide capture the old ring-cyan-300/50 vs ring-white/[0.04] split
 *  was invisible at tile scale):
 *
 *    · luminance — unpicked stills are dimmed and desaturated, picked ones run
 *      at full strength. This is what carries across a room, and it doubles as
 *      the thing that stops the six bright plates shouting over the button.
 *    · weight    — a 2px inset ring against a hairline.
 *    · shape     — corner brackets, the mark a person actually makes on a
 *      contact sheet. Shape survives greyscale, colour-blindness and a
 *      photograph of a monitor.
 */
const CORNERS = [
  "top-2 left-2 border-t-2 border-l-2",
  "top-2 right-2 border-t-2 border-r-2",
  "bottom-2 left-2 border-b-2 border-l-2",
  "bottom-2 right-2 border-b-2 border-r-2",
];

export default function GateContactSheet() {
  return (
    <LandingShell label="A contact sheet of thirty generated frames, four of them ringed as picked">
      {/* the wall */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="grid h-full w-full gap-1.5 p-1.5"
          style={{
            gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
          }}
        >
          {WALL.map((cell, i) => (
            <div
              key={i}
              className={`relative overflow-hidden rounded-md bg-gradient-to-br ${cell.tone} ${
                cell.picked
                  ? "ring-2 ring-cyan-300/90 ring-inset"
                  : "ring-1 ring-white/[0.06] ring-inset"
              }`}
              // the sheet assembles outward from the door
              style={{ animation: `gt-bloom 700ms var(--gt-ease) ${cell.dist * 90}ms both` }}
            >
              {cell.still && (
                /* alt="" — the tiles are art inside LandingShell's role="img"
                   region, which already carries the accessible name for the
                   whole picture. Thirty alt strings would be thirty ways to say
                   the same thing badly. `fill` because deck-art (4:3) and the
                   preset plates (16:9) are different shapes and the cell, not
                   the file, decides the crop. Quality is left at the Next 16
                   default: `qualities` now defaults to [75], so any other value
                   would need a next.config entry to serve at all. */
                <Image
                  src={cell.still}
                  alt=""
                  fill
                  sizes="17vw"
                  className={`object-cover ${
                    cell.picked ? "" : "opacity-50 saturate-[0.4] brightness-75"
                  }`}
                />
              )}
              {cell.picked &&
                CORNERS.map((c) => (
                  <span key={c} className={`absolute h-6 w-6 rounded-[2px] border-white/95 ${c}`} />
                ))}
            </div>
          ))}
        </div>
        {/* the pocket the door stands in */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(46% 46% at 50% 50%, var(--gt-ink) 0%, var(--gt-ink) 34%, transparent 78%)",
          }}
        />
      </div>

      <div className="relative" style={{ animation: "gt-rise 700ms var(--gt-ease) 500ms both" }}>
        <EnterButton />
      </div>
    </LandingShell>
  );
}
