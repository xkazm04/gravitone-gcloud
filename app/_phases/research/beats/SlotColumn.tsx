"use client";

// One part of the spine, drawn as a column the way the triage board draws a
// research dimension: the column is the unit of attention, and an unpicked
// column is the finding.

import { CHIP_CLASS, Hint, PipRow, TALLY_TONE } from "@/components/ui/signal";

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
        {/* One pip: this part has a beat, or it does not. It carried a
            sentence lower down — "nothing picked here — the spine has a hole at
            {role} until one is" — over a column that is already ringed amber
            for exactly that state, under a header that already names the role. */}
        <span className="flex shrink-0 items-center gap-2">
          <PipRow
            states={[picked ? "filled" : "hollow"]}
            label={readOnly ? "frozen" : picked ? "picked" : "not picked"}
          />
          <span className="font-jetbrains text-label text-white/30">
            {readOnly ? "frozen" : picked ? "picked" : `${slot.variants.length} to choose from`}
          </span>
        </span>
      </div>
      <p className="font-jetbrains mt-1 text-label tracking-[0.12em] text-white/35 uppercase">
        {m.role} · ordinal {m.ordinal}
      </p>
      {/* WHERE THIS PART SITS ON THE CUE — a key and a value, not "sits on the
          cue's X". The boundary is a fact about the cue and tints the chip
          rather than trailing the sentence as "— a boundary". */}
      <div className="mt-1.5">
        <span
          className={`${CHIP_CLASS} ${cueSection ? (cueSection.isBoundary ? TALLY_TONE.amber : TALLY_TONE.neutral) : TALLY_TONE.amber}`}
        >
          <span aria-hidden className="opacity-50">cue</span>
          <span className="sr-only">cue section:</span>
          {cueSection ? `${cueSection.label}${cueSection.isBoundary ? " · boundary" : ""}` : "none"}
          {!cueSection && (
            <Hint variant="warn" tone="amber" label="Why there is no cue section">
              this act boundary is unmeasured
            </Hint>
          )}
        </span>
      </div>

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
