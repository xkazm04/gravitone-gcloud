// WHERE A PRESS LANDED, read once into plain data so the resolver never touches the DOM.
//
// The text-entry guard is v1's (components/ui/signal/keymap.ts `typing`, promoted
// from the Board's lib/board/keys.ts and copied a third time into
// app/foundry/keyGuard.ts's callers): a letter typed into a field is text, not a
// verdict, and an OPEN combobox takes printable keys as type-ahead. The control
// rule is v1's `enterBelongsToTarget`: Enter (and Space) on a focused button, link,
// tab or checkbox is that control's, never the grid's - the cull learned it after
// Enter stopped working on every button of the page.
//
// Upgraded: a field may NAME itself (`data-keyfield="search"`), so a binding can opt
// into firing inside that one field (the Library's Esc-clears-search, the review
// note's Tab-cycles-directive) without the field growing a private keydown handler.
// The prototype had four of those inline handlers; here they are rows in the table.

/** Anything a test can stand in for a DOM element with. An HTMLElement satisfies it. */
export type ElementLike = {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
  getAttribute?(name: string): string | null;
  closest?(selector: string): ElementLike | null;
};

export type TargetInfo = {
  /** Focus is somewhere text goes: an input, a textarea, a select, contenteditable, an open combobox. */
  readonly editable: boolean;
  /** The editable field's `data-keyfield` name; "" for an unnamed field or no field. */
  readonly field: string;
  /** Focus is on a control that owns Enter and Space itself. */
  readonly control: boolean;
};

export const FIELD_ATTR = "data-keyfield";

const EDITABLE = "input, textarea, select, [contenteditable='true'], [role='combobox'][aria-expanded='true']";
const CONTROL_TAGS: ReadonlySet<string> = new Set(["BUTTON", "A", "SUMMARY", "SELECT", "INPUT", "TEXTAREA"]);
const CONTROL_ROLES: ReadonlySet<string> = new Set(["button", "link", "tab", "menuitem", "checkbox", "radio", "switch", "option"]);

export const NO_TARGET: TargetInfo = { editable: false, field: "", control: false };

export function targetInfo(el: ElementLike | null): TargetInfo {
  if (el === null) return NO_TARGET;
  const tag = (el.tagName ?? "").toUpperCase();
  const editable =
    el.isContentEditable === true || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el.closest?.(EDITABLE) ?? null) !== null;
  const named = editable ? (el.closest?.(`[${FIELD_ATTR}]`) ?? null) : null;
  const field = named?.getAttribute?.(FIELD_ATTR) ?? "";
  const role = el.getAttribute?.("role") ?? "";
  return { editable, field, control: CONTROL_TAGS.has(tag) || CONTROL_ROLES.has(role) };
}
