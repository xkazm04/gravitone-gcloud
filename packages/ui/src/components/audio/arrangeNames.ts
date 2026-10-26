// THE BOARD'S ROW NAMES - how two spellings of a row are one row, shared by the board
// (./arrange.ts, which draws an orphan row with the declared row it folds into) and the group
// edits (./arrangeGroups.ts, where adopting a case variant merges). A module of its own so the
// two import it in one direction and never each other.
//
// Names are compared case-folded and trimmed, so "Ambient" and " ambient" are one row.

export const fold = (s: string): string => s.trim().toLowerCase();

/** The declared spelling an orphan name folds onto when it differs only in case; else null. */
export const declaredAs = (declared: readonly string[], name: string): string | null => declared.find((x) => x !== name && fold(x) === fold(name)) ?? null;
