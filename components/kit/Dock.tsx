// THE DOCK: the bar fixed to the bottom of a working surface. Counts as marks,
// the save state, the keys, and at the right the one action with — beside it,
// when it is locked — the one clause that says why.

import { StatusGlyph, type StatusKind } from "./StatusGlyph";
import type { KeyBinding } from "@/components/ui/signal";

export function Dock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="k-dock" role="region" aria-label={label}>
      <div className="k-dock__in">{children}</div>
    </div>
  );
}

/** A tally in the dock: a mark, a big number, its word. */
export function Count({ kind, n, label, of }: { kind?: StatusKind; n: number; label: string; of?: number }) {
  return (
    <span className={`k-count${kind === "keep" ? " k-count--k" : ""}`}>
      {kind && <StatusGlyph kind={kind} decorative />}
      <b>{n}</b>
      {of !== undefined && <span>/{of}</span>}
      {label}
    </span>
  );
}

export type SaveKind = "idle" | "saving" | "saved" | "error";

/** The autosave state. A live region, present while empty so a change is announced. */
export function SaveState({ state, final = false }: { state: SaveKind; final?: boolean }) {
  return (
    <span className={`k-save${state === "error" ? " k-save--bad" : ""}`} role="status">
      {final ? "committed · verdicts are final" : state === "saving" ? "saving…" : state === "saved" ? "saved" : state === "error" ? "save failed — retry a verdict" : ""}
    </span>
  );
}

/** The keymap, inline: a key and a verb per binding. */
export function KeyRow({ map, label }: { map: KeyBinding[]; label: string }) {
  return (
    <div className="k-keys" aria-label={label} role="group">
      {map.map((b, i) => (
        <span key={i}>
          {b.keys.map((k, j) => (
            <kbd key={j}>{k}</kbd>
          ))}
          {b.does}
        </span>
      ))}
    </div>
  );
}

/** Why the action will not go, in one clause, with a padlock. */
export function LockNote({ children }: { children: React.ReactNode }) {
  return (
    <span className="k-lock" role="note">
      <StatusGlyph kind="lock" label="Locked" />
      <span>{children}</span>
    </span>
  );
}

/** A committed run's place where the action was: charted, final. */
export function Final({ children }: { children: React.ReactNode }) {
  return (
    <span className="k-final k-caps">
      <StatusGlyph kind="committed" decorative />
      {children}
    </span>
  );
}

export function DockAction({ children }: { children: React.ReactNode }) {
  return <div className="k-dock__r">{children}</div>;
}
