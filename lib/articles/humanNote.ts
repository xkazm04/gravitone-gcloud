// A human's note at the gate: the one place its rule lives. It is trimmed, and refused
// when nothing is left. Its own file so that reject (humanActs.ts) and rework (rework.ts)
// share the rule without rework importing the human-acts module.

import { ArticleError } from "./store";

/** A human's note at the gate: trimmed, and refused when there is nothing in it. The one place
 *  the rule lives, so a reject and a rework cannot disagree about what an empty note is. */
export function trimmedNote(note: unknown, act: string): string {
  const text = typeof note === "string" ? note.trim() : "";
  if (!text) throw new ArticleError(`${act} needs a note`, 400, "bad-note");
  return text;
}
