"use client";

// THE REEL STUDIO'S PARTS (spark reel-studio): the Filmstrip as the overview draws it (inert stills, the loupe), as
// the review draws it under the players (each frame seeks, the playhead and the pinned notes over it), a phone
// film's tall strip, and a strip before its film exists. The stills are the fixture's real frames of Towers of
// Light, so the specimen looks like the screen.
import { useState } from "react";

import { Filmstrip, Still } from "@gt/ui/components/filmstrip/Filmstrip.tsx";

import { Row, Section, Spec } from "./Spec.tsx";

const frames = (face: "d" | "p"): string[] => Array.from({ length: 12 }, (_, i) => `/fixtures/reels/towers-of-light/${face}-${String(i).padStart(2, "0")}.jpg`);
const SECONDS = 96;
const MARKS = [
  { at: 0.21, label: "note at 0:20: legibility" },
  { at: 0.58, label: "note at 0:55: pacing" },
];

export function ReelSection() {
  const [at, setAt] = useState(0.33);
  return (
    <Section id="reels">
      <Spec names={["Filmstrip", "Still"]} source="spark reel-studio · /reels rows · the review's rail" wide>
        <Row label="row · loupe">
          <Filmstrip frames={frames("d")} label="Towers of Light, twelve frames" loupe />
        </Row>
        <Row label="rail · seeks">
          <Filmstrip frames={frames("d")} label="Towers of Light, seek a frame" size="rail" at={at} marks={MARKS} seconds={SECONDS} onPick={(_, x) => setAt(x)} />
        </Row>
        <Row label="tall">
          <Filmstrip frames={frames("p")} label="Towers of Light, phone frames" aspect="tall" />
        </Row>
        <Row label="still">
          <Still src="/fixtures/reels/towers-of-light/poster.jpg" />
        </Row>
        <Row label="no film">
          <Filmstrip frames={[]} label="no frames yet" />
        </Row>
      </Spec>
    </Section>
  );
}
