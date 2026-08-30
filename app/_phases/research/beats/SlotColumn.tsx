"use client";

// One part of the spine, drawn as a column the way the triage board draws a
// research dimension: the column is the unit of attention, and an unpicked
// column is the finding.

import type { CueSection } from "../../script/trailer/types";
import type { BeatSlot } from "./beats";
import VariantTile from "./VariantTile";

export default function SlotColumn({
  slot,
  picked,
  cueSection,
  onPick,
  readOnly = false,
}: {
  slot: BeatSlot;
  picked: string | null;
  cueSection: CueSection | undefined;
  onPick: (variantId: string | null) => void;
  readOnly?: boolean;
}) {
  const m = slot.movement;
  const unpicked = !picked;
  const shown = readOnly ? slot.variants.filter((v) => v.id === picked) : slot.variants;

  return (
    <section
      data-testid={`slot-${slot.id}`}
      className={`rounded-2xl border p-4 ${
        unpicked && !readOnly
          ? "border-amber-400/25 bg-amber-400/[0.03]"
          : "border-white/8 bg-white/[0.015]"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={`font-jetbrains text-content tracking-[0.16em] uppercase ${m.role === "climax" ? "text-cyan-300" : "text-white"}`}>
          {m.label}
        </h3>
        <span className="font-jetbrains text-label text-white/30">
          {readOnly ? "frozen" : picked ? "picked" : `${slot.variants.length} to choose from`}
        </span>
      </div>
      <p className="font-jetbrains mt-1 text-label tracking-[0.12em] text-white/35 uppercase">
        {m.role} · ordinal {m.ordinal}
      </p>
      <p className="mt-1.5 text-label leading-relaxed text-white/40">
        {cueSection
          ? `sits on the cue's ${cueSection.label}${cueSection.isBoundary ? " — a boundary" : ""}`
          : "sits on no cue section — this act boundary is unmeasured"}
      </p>

      {unpicked && !readOnly && (
        <p className="font-jetbrains mt-3 text-label leading-relaxed text-amber-200/85">
          nothing picked here — the spine has a hole at {m.role} until one is
        </p>
      )}

      {readOnly && shown.length === 0 && (
        <p className="font-jetbrains mt-3 text-label leading-relaxed text-amber-200/85">
          the frozen spine names no beat for this part
        </p>
      )}

      <ul className="mt-3 space-y-2.5">
        {shown.map((v) => (
          <li key={v.id}>
            <VariantTile
              variant={v}
              picked={v.id === picked}
              readOnly={readOnly}
              onPick={() => onPick(v.id === picked ? null : v.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
