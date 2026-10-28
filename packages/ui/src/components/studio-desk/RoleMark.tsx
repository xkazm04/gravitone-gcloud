// A stem's role as a small mark (spark audio-agent-studio, desk): so a lane reads at a glance as
// "the drums", "the low part", "the tune" before its words are read. Each role keeps one hue across
// the desk (its lane's waveform takes the same one); the role's name is the mark's accessible name.
import type { StudioRole } from "@gt/domain/audio.studio.kinds";
import s from "./RoleMark.module.css";

/** The hue a role draws in, shared by its mark and its lane's waveform. */
export const ROLE_TONE: Readonly<Record<StudioRole, "cyan" | "violet" | "emerald" | "amber">> = {
  drums: "amber", percussion: "amber", bass: "violet", chords: "emerald", pad: "emerald", lead: "cyan", texture: "cyan",
};

/** A role in plain words ("the low part"), for a person who does not know what "bass" means here. */
export const ROLE_WORDS: Readonly<Record<StudioRole, string>> = {
  drums: "the beat", percussion: "the small beat", bass: "the low part", chords: "the harmony", pad: "the background", lead: "the tune", texture: "the sparkle",
};

const PATHS: Readonly<Record<StudioRole, string>> = {
  drums: "M3 6.5h10v5.5H3zM3 6.5l2.5-3M13 6.5l-2.5-3",
  percussion: "M4 4.5a1.4 1.4 0 1 0 0 .1M8 8a1.4 1.4 0 1 0 0 .1M12 11.5a1.4 1.4 0 1 0 0 .1",
  bass: "M1.5 9c2-4 4-4 6.5 0s4.5 4 6.5 0",
  chords: "M3 4h10M3 8h10M3 12h10",
  pad: "M2 11.5c1.5-5 10.5-5 12 0z",
  lead: "M6 12.5V3.5l6-1.5v8.5M6 12.5a1.6 1.6 0 1 1-.1 0M12 10a1.6 1.6 0 1 1-.1 0",
  texture: "M8 2v4M8 10v4M2 8h4M10 8h4M4 4l2 2M10 10l2 2M12 4l-2 2M4 12l2-2",
};

export function RoleMark({ role }: { readonly role: StudioRole }) {
  return (
    <svg className={`${s.mark} ${s[ROLE_TONE[role]] ?? ""}`} viewBox="0 0 16 16" role="img" aria-label={role}>
      <path d={PATHS[role]} />
    </svg>
  );
}
