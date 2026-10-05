// THE BOARD'S ONE KEYMAP — pure, so the suppression rules are asserted in the
// node lane rather than discovered by a mis-decided item.
//
// A approve · X reject · U clear · J/K next/prev · Enter loupe · Esc close ·
// Z undo. K is PREV here, while the kit's VerdictKeys draws its approve key as
// "K" (components/kit/VerdictKeys.tsx, the foundry cull's keymap). The two
// cannot both hold, so the Board binds A and the drawn letter mismatch is
// reported as a kit request rather than resolved by a second spelling of the
// verdict buttons.
//
// The guard is StatReel's (apps/studio/src/board/keys.ts), carried over with
// the reasons it gives:
//   · TYPING — a letter in a text field is text, not a verdict.
//   · AN OVERLAY — a dialog owns the keyboard, EXCEPT the Board's own loupe,
//     which is where decisions are made and must keep its keys.
//   · REPEAT — a held key decides ONE item, never the next ones the view
//     advances to while the key is still down. Navigation may repeat.
//   · A MODIFIER — Ctrl/Cmd/Alt+letter belongs to the browser and the OS.

export type BoardAction = "approve" | "reject" | "clear" | "next" | "prev" | "loupe" | "close" | "undo";

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
  target: EventTarget | null;
}

/** Anything a test can stand in for a DOM node with. */
interface ElementLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

/** Is the event aimed at something the owner types into? */
export function typing(target: EventTarget | null): boolean {
  const el = target as ElementLike | null;
  if (!el || typeof el !== "object") return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return typeof el.closest === "function" && Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
}

/** Marks the Board's own loupe; an aria-modal containing it does not block. */
export const LOUPE_MARK = "data-board-loupe";
const BLOCKERS = '[data-keys-block], dialog[open], [aria-modal="true"]';

interface RootLike {
  querySelectorAll(selector: string): ArrayLike<{ querySelector(selector: string): unknown; hasAttribute?(n: string): boolean }>;
}

/** Is a dialog open that is not the Board's loupe? `root` is a seam for tests. */
export function overlayOpen(root: RootLike | null = typeof document === "undefined" ? null : document): boolean {
  if (!root) return false;
  const list = root.querySelectorAll(BLOCKERS);
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    if (el.hasAttribute?.(LOUPE_MARK)) continue;
    if (el.querySelector(`[${LOUPE_MARK}]`)) continue;
    return true;
  }
  return false;
}

const DECISIONS: Record<string, BoardAction> = { a: "approve", x: "reject", u: "clear", z: "undo" };
const MOVES: Record<string, BoardAction> = { j: "next", k: "prev" };

/**
 * What a key press means on the Board, or null when it is not the Board's.
 * `overlay` is the result of `overlayOpen()` — passed in so this stays pure.
 */
export function boardKeyAction(e: KeyLike, overlay: boolean): BoardAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (typing(e.target)) return null;
  // Escape is honoured even with an overlay up: closing is never a decision,
  // and the overlay's own Escape handling will run as well.
  if (e.key === "Escape") return "close";
  if (overlay) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k in DECISIONS) return e.repeat ? null : DECISIONS[k];
  if (k in MOVES) return MOVES[k];
  if (k === "Enter") return e.repeat ? null : "loupe";
  return null;
}

/** Enter on a focused control is the control's (a button, a link, a tab), not
 *  the loupe's — the lesson app/foundry/CullGrid.tsx's `activatesOnEnter`
 *  records after Enter stopped working on every button of the cull. */
export function enterBelongsToTarget(target: EventTarget | null): boolean {
  const el = target as (ElementLike & { getAttribute?: (n: string) => string | null }) | null;
  if (!el || typeof el !== "object") return false;
  const tag = (el.tagName ?? "").toUpperCase();
  if (["BUTTON", "A", "SUMMARY", "SELECT", "INPUT", "TEXTAREA"].includes(tag)) return true;
  const role = el.getAttribute?.("role");
  return role === "button" || role === "link" || role === "tab" || role === "menuitem" || role === "checkbox" || role === "radio";
}
