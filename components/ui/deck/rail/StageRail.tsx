"use client";

// TODO(prototype, 2026-09-09): consolidate the Deck stage-rail switcher.
//
// THIS SWITCHER IS THROWAWAY AND MUST NOT SHIP. It exists so the operator can
// A/B the stage rail against two directions in the running app; the moment one
// is chosen, this file collapses to the winner and the two losers are deleted
// from disk (the /prototype skill's Phase 5, and this repo's own history with
// the deck's art switcher — which lingered for weeks and was removed by ruling
// on 2026-09-08).
//
// The three faces, and what separates them:
//  · pills     — the baseline that shipped. Four outlined controls in a row,
//                each holding its own answer, widths tracking the answers.
//  · filmstrip — PICTORIAL. The rail is one strip of film with four frames cut
//                into it; exposed / developed / unexposed carry the states.
//  · ledger    — TYPOGRAPHIC. No container at all: a hairline with marks on it,
//                names above, answers written beneath, inked up to here.
//
// Both variants fix the same two baseline faults: equal-width divisions, so the
// header's geometry does not re-flow as the wizard is answered; and the answer
// on a line of its own, rather than appended inside the control that selects it.

import { useState } from "react";

import StageRailFilmstrip from "./StageRailFilmstrip";
import StageRailLedger from "./StageRailLedger";
import StageRailPills from "./StageRailPills";
import type { StageRailProps } from "./types";

const FACES = [
  { id: "pills", label: "pills", View: StageRailPills },
  { id: "filmstrip", label: "filmstrip", View: StageRailFilmstrip },
  { id: "ledger", label: "ledger", View: StageRailLedger },
] as const;

type FaceId = (typeof FACES)[number]["id"];

export default function StageRail(props: StageRailProps) {
  // Baseline is the default face, so nothing changes on load until the operator
  // asks it to (the /prototype skill's Phase 2 rule).
  const [face, setFace] = useState<FaceId>("pills");
  const View = FACES.find((f) => f.id === face)?.View ?? StageRailPills;

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-end gap-1">
        <span className="font-jetbrains mr-1 text-label tracking-[0.16em] text-white/25 uppercase">
          rail
        </span>
        {FACES.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={face === f.id}
            onClick={() => setFace(f.id)}
            className={`font-jetbrains rounded border px-2 py-0.5 text-label tracking-[0.12em] transition ${
              face === f.id
                ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                : "border-white/10 text-white/40 hover:border-white/25 hover:text-white/70"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <View {...props} />
    </div>
  );
}
