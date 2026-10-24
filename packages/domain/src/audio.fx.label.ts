import type { FxChain, FxStage } from "./audio.fx.ts";

// A chain as a short line a take can carry beside its description - "pitch -5 · reverb ·
// delay 0.35 s". Pure and zod-free, so a client component can import it without dragging
// classic zod into the first-load bundle (door.ts says why that matters).

function stageLabel(s: FxStage): string {
  switch (s.kind) {
    case "pitch":
      return `pitch ${s.semitones > 0 ? "+" : ""}${s.semitones}`;
    case "delay":
      return `delay ${s.delayS} s`;
    case "highpass":
    case "lowpass":
      return `${s.kind} ${s.hz} Hz`;
    case "ringmod":
      return `ringmod ${s.hz} Hz`;
    case "gain":
      return `gain ${s.db} dB`;
    default:
      return s.kind;
  }
}

export function chainLabel(chain: FxChain): string {
  return chain.stages.map(stageLabel).join(" · ");
}
