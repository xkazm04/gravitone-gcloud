"use client";

// VARIANT C · CONTACT SHEET — the studio as a wall of candidates.
//
// The other two variants draw an instrument and a result. This one draws the
// WORK: every frame the studio generated for one production, pinned up at once,
// four of them ringed because a person walked the wall and picked. That is the
// loop this app is actually for — you do not get a film, you get candidates and
// a decision, and the door is in the middle of them.
//
// The tones are not decorative: they are the real `tone` values on the fixture
// project's frame candidates (app/_studio/scenes.ts), the same strings the
// Lightbox renders. The wall tiles them to fill the viewport; the four rings
// sit on the four scenes that actually have a pick, and scene five — the one
// still undecided — contributes none.

import { SCENES } from "@/app/_studio/scenes";

import { EnterButton, LandingShell } from "./parts";

/** Every candidate the fixture project made, in scene order, with the picks
 *  carried through so the wall shows decisions and not just pictures. */
const FRAMES = SCENES.flatMap((s) =>
  s.frames.map((f) => ({ tone: f.tone, picked: f.id === s.pickedFrameId })),
);

const COLS = 6;
const ROWS = 5;
const CELLS = COLS * ROWS;

export default function GateContactSheet() {
  return (
    <LandingShell label="A contact sheet of generated frames, four of them ringed as picked">
      {/* the wall */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="grid h-full w-full gap-1.5 p-1.5"
          style={{
            gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: CELLS }, (_, i) => {
            const f = FRAMES[i % FRAMES.length];
            const r = Math.floor(i / COLS);
            const c = i % COLS;
            // the sheet assembles outward from the door
            const dist = Math.hypot(r - (ROWS - 1) / 2, c - (COLS - 1) / 2);
            return (
              <div
                key={i}
                className={`overflow-hidden rounded-md bg-gradient-to-br ${f.tone} ${
                  f.picked ? "ring-1 ring-cyan-300/50" : "ring-1 ring-white/[0.04]"
                }`}
                style={{ animation: `gt-bloom 700ms var(--gt-ease) ${dist * 90}ms both` }}
              />
            );
          })}
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
