// THE SHELF'S NOTICES, keyed by what failed — a pure model so a write that
// succeeds can only retire the notice of ITS OWN failure. One shared slot let
// the next keypress's success erase "the last judgment was not saved" while
// that take still read 'kept' locally and would lose it on reload.
//
// Keys: 'read' | 'migrate' | `patch:${takeId}` | 'upload' | 'clear'.

export type ShelfErrors = Readonly<Record<string, string>>;

export const NO_ERRORS: ShelfErrors = {};

export const patchKey = (id: string) => `patch:${id}`;

/** Record a failure under its key; null/empty message retires the key. */
export function setNotice(errors: ShelfErrors, key: string, message: string | null): ShelfErrors {
  if (message) return errors[key] === message ? errors : { ...errors, [key]: message };
  if (!(key in errors)) return errors;
  const { [key]: _gone, ...rest } = errors;
  return rest;
}

const ORDER = ["read", "migrate"];

/** The one message to show: shelf-level reports first, then unsaved verdicts
 *  in the order they failed, then upload/clear. Null when nothing is pending. */
export function pickNotice(errors: ShelfErrors): string | null {
  const keys = Object.keys(errors);
  const rank = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : k.startsWith("patch:") ? 2 : 3);
  keys.sort((a, b) => rank(a) - rank(b));
  return keys.length ? errors[keys[0]] : null;
}
