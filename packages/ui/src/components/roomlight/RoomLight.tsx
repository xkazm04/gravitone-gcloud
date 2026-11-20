// THE ROOM'S LIGHT (design baseline §1b, from the contest's Aperture design): state said by light before a word.
// The ground of a stage takes the hue of what it leads with - rose blocked, violet the agent's, amber a warning,
// emerald ready - as a soft wash from the top; a change of kind cross-fades (one layer per kind, only opacity
// moves, so nothing is repainted and nothing loops). A release with a sleeve glows with it, out of focus, behind.
// It is decoration: aria-hidden, no pointer, under the stage (the caller's box must be `position:relative` and
// `isolation:isolate`). Text never relies on it - the lead's own mark says the same thing in small.
import s from "./RoomLight.module.css";

export type RoomKind = "block" | "warn" | "agent" | "ready" | "clear" | "neutral";

const KINDS: readonly RoomKind[] = ["block", "warn", "agent", "ready", "clear", "neutral"];

export function RoomLight({ kind, sleeve = null }: { readonly kind: RoomKind; readonly sleeve?: string | null }) {
  return (
    <span className={s.room} data-room={kind} aria-hidden="true">
      {sleeve !== null && <span className={s.glow} style={{ backgroundImage: `url("${sleeve}")` }} />}
      {KINDS.map((k) => (
        <span key={k} className={s.field} data-kind={k} data-on={k === kind ? "" : undefined} />
      ))}
    </span>
  );
}
