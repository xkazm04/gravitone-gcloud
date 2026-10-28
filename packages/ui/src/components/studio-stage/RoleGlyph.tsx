// One mark per band role (spark audio-agent-studio, variant "stage"): a drum, a shaker, a bass
// guitar, a keyboard, a swell, a note, a sparkle. Line art in the caller's colour, decorative: the
// role's words always travel beside it, so the mark is aria-hidden.
import type { StudioRole } from "@gt/domain/audio.studio.kinds";
import { cx } from "../cx.ts";
import s from "./RoleGlyph.module.css";

const PATHS: Readonly<Record<StudioRole, readonly string[]>> = {
  drums: ["M4 10a8 3 0 1 0 16 0a8 3 0 1 0 -16 0", "M4 10v6a8 3 0 0 0 16 0v-6", "M6 3l4 5", "M18 3l-4 5"],
  percussion: ["M8 13a4 6 0 1 0 8 0a4 6 0 1 0 -8 0", "M12 3v4", "M4 7l2 2", "M20 7l-2 2"],
  bass: ["M5 16a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M11 13l9 -9", "M18 3l3 3", "M8 16h2"],
  chords: ["M3 7h18v10h-18z", "M8 7v6", "M12 7v6", "M16 7v6"],
  pad: ["M3 13c3 -6 6 -6 9 0s6 6 9 0", "M3 18c3 -3 6 -3 9 0s6 3 9 0"],
  lead: ["M4 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M10 17v-13l9 2v4l-9 -2"],
  texture: ["M12 3v5", "M12 16v5", "M3 12h5", "M16 12h5", "M7 7l2 2", "M15 15l2 2", "M17 7l-2 2", "M9 15l-2 2"],
};

export function RoleGlyph({ role, className }: { readonly role: StudioRole; readonly className?: string | undefined }) {
  return (
    <svg className={cx(s.glyph, className)} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[role].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
