// EVERY KEY THE APPROVED DESIGN BINDS, as rows. Read off the fused prototype
// (docs/next/prototype/app: index.html's floor/board/calendar handler, projects.js,
// library.js, ledger.js, and the <Keycaps> each desk draws), with the verb each
// row runs. Wave 2 screens register handlers BY VERB; the keys live only here.
//
// Where the prototype's behaviour is kept but re-expressed:
//   · Escape that closes a sheet, the zoom, the compose dialog or the calendar
//     month is the LAYER ROUTER's (layers/stack.ts), not a row. A row on Escape is
//     an inner back-out the owner of the top layer declares first (the calendar's
//     selected day) or a page's own cascade (Library, Ledger).
//   · The prototype's inline field handlers (the search box's Esc/⏎/↓, the note
//     editor's Tab/⏎/Esc, the composer's ⏎) are `field` rows.
//   · "keys change meaning per page" (plan §9.1) is legal now because each page is
//     a MODE; `conflicts()` over this table is a unit test.
//
// One key, two verbs: kept as the prototype has them, by owner ruling
// (migration plan §8.7, 2026-10-15). A `when` or a mode separates the verbs, so
// `conflicts()` still proves no two rows fire on one press.

import { compile, type Binding } from "./keymap.ts";

const floor: Binding[] = [
  { mode: "floor", keys: ["1", "2", "3", "4"], verb: "open-lane", does: "lane" },
  { mode: "floor", keys: ["⇧1", "⇧2", "⇧3", "⇧4"], verb: "focus-lane", does: "focus lane" },
  { mode: "floor", keys: ["⏎"], verb: "open-next", does: "next decision" },
  { mode: "floor", keys: ["C"], verb: "calendar", does: "calendar" },
  { mode: "floor", keys: ["B"], verb: "board", does: "board" },
  { mode: "floor", keys: ["Esc"], verb: "unfocus", does: "all lanes", when: "lane-focused" },
  { mode: "floor", keys: ["⏎"], verb: "launch", does: "launch", field: "composer", onControl: true },
  { mode: "floor", keys: ["Esc"], verb: "leave-field", does: "leave", field: "*" },
];

const calendar: Binding[] = [
  { mode: "calendar", keys: ["←", "→"], verb: "day", does: "day", repeat: true },
  { mode: "calendar", keys: ["↑", "↓"], verb: "week", does: "week", repeat: true },
  { mode: "calendar", keys: ["[", "]"], verb: "month", does: "month" },
  { mode: "calendar", keys: ["⏎"], verb: "open-day", does: "open", when: "day" },
  { mode: "calendar", keys: ["Esc"], verb: "clear-day", does: "month", when: "day" },
  { mode: "calendar", keys: ["C"], verb: "rail", does: "rail" },
  { mode: "calendar", keys: ["B"], verb: "board", does: "board" },
];

const board: Binding[] = [
  { mode: "board", keys: ["[", "]"], verb: "packet", does: "packet" },
  { mode: "board", keys: ["⏎"], verb: "open-next", does: "next packet", when: "!desk" },

  { mode: "board.cull", keys: ["K"], verb: "keep", does: "keep" },
  { mode: "board.cull", keys: ["X"], verb: "reject", does: "reject" },
  { mode: "board.cull", keys: ["U"], verb: "undecide", does: "undecide" },
  { mode: "board.cull", keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-"], verb: "reason", does: "reason" },
  { mode: "board.cull", keys: ["←"], alias: ["J"], verb: "prev", does: "move", repeat: true },
  { mode: "board.cull", keys: ["→"], alias: ["L"], verb: "next", does: "move", repeat: true },
  { mode: "board.cull", keys: [], alias: ["↑"], verb: "row-up", does: "move", repeat: true },
  { mode: "board.cull", keys: [], alias: ["↓"], verb: "row-down", does: "move", repeat: true },
  { mode: "board.cull", keys: ["⇧K"], verb: "keep-row", does: "row" },
  { mode: "board.cull", keys: ["⇧X"], verb: "reject-row", does: "row" },
  { mode: "board.cull", keys: ["Z"], verb: "zoom", does: "zoom" },
  { mode: "board.cull", keys: ["⌫"], alias: ["⌘Z"], verb: "undo", does: "undo" },
  { mode: "board.cull", keys: ["Space"], verb: "play", does: "play", when: "audio" },
  { mode: "board.cull", keys: ["M"], verb: "spawn-mv", does: "spawn MV", when: "audio" },
  { mode: "board.cull", keys: ["⏎"], verb: "commit", does: "commit", shadows: true },

  { mode: "board.pair", keys: ["1"], verb: "left", does: "left" },
  { mode: "board.pair", keys: ["2"], verb: "right", does: "right" },
  { mode: "board.pair", keys: ["0"], verb: "tie", does: "tie" },
  { mode: "board.pair", keys: ["X"], verb: "both-bad", does: "both bad" },
  { mode: "board.pair", keys: ["⌫"], alias: ["⌘Z"], verb: "undo", does: "undo" },
  { mode: "board.pair", keys: ["⏎"], verb: "commit", does: "commit", shadows: true },

  { mode: "board.review", keys: ["↑"], alias: ["K"], verb: "prev-section", does: "section", repeat: true },
  { mode: "board.review", keys: ["↓"], alias: ["J"], verb: "next-section", does: "section", repeat: true },
  { mode: "board.review", keys: ["E"], verb: "note", does: "note", when: "draft" },
  { mode: "board.review", keys: ["⇧E"], verb: "send-edit-plan", does: "send edit plan" },
  { mode: "board.review", keys: ["A"], verb: "approve", does: "approve" },
  { mode: "board.review", keys: ["R"], verb: "reject", does: "reject" },
  { mode: "board.review", keys: ["Tab"], alias: ["⇧Tab"], verb: "directive", does: "directive", field: "note" },
  { mode: "board.review", keys: ["⏎"], verb: "attach", does: "attach", field: "note", onControl: true },
  { mode: "board.review", keys: ["Esc"], verb: "cancel-note", does: "cancel", field: "note" },

  { mode: "board.cut", keys: ["Space"], verb: "play", does: "play" },
  { mode: "board.cut", keys: ["↑"], alias: ["K"], verb: "prev-beat", does: "beat", repeat: true },
  { mode: "board.cut", keys: ["↓"], alias: ["J"], verb: "next-beat", does: "beat", repeat: true },
  { mode: "board.cut", keys: ["E"], verb: "note", does: "note", when: "beats" },
  { mode: "board.cut", keys: ["A"], verb: "approve", does: "approve" },
  { mode: "board.cut", keys: ["R"], verb: "reject", does: "reject" },
  { mode: "board.cut", keys: ["⏎"], verb: "attach", does: "attach", field: "note", onControl: true },
  { mode: "board.cut", keys: ["Esc"], verb: "cancel-note", does: "cancel", field: "note" },
];

const projects: Binding[] = [
  { mode: "projects", keys: ["N"], verb: "compose", does: "compose" },
  { mode: "projects", keys: ["P"], alias: ["⇧P"], verb: "plan", does: "plan" },
  { mode: "projects", keys: ["R"], alias: ["⇧R"], verb: "runs", does: "runs" },
  { mode: "projects", keys: ["J", "K"], alias: ["⇧↓", "⇧↑"], verb: "job", does: "job", repeat: true },
  { mode: "projects", keys: ["↑", "↓"], verb: "project", does: "project" },
  { mode: "projects", keys: ["⏎"], verb: "launch", does: "launch plan", when: "unlaunched" },
  { mode: "projects", keys: ["T"], verb: "retry", does: "retry", when: "job" },
  { mode: "projects", keys: ["[", "]"], verb: "move", does: "earlier · later", when: "job" },
  { mode: "projects", keys: ["Esc"], verb: "deselect", does: "deselect", when: "job" },
  { mode: "projects", keys: ["⏎"], verb: "rename", does: "rename", field: "title", onControl: true },
  { mode: "projects", keys: ["Esc"], verb: "leave-field", does: "leave", field: "*" },
  // Phase 4 wave C (L38): the selected Plan row opens its part's editor.
  { mode: "projects", keys: ["E"], verb: "open-part", does: "open part", when: "editor" },
  // In Runs with a job selected, lower-case P pauses or resumes it; ⇧P (and P
  // anywhere else) opens Plan. Ruled §8.7: the selection is the context.
  { mode: "projects.runs", keys: ["P"], verb: "pause", does: "pause · resume", when: "job", shadows: true },
  // Phase 4 (L28). The prototype re-routed by mouse only (projects.js Inspector `.alt`); O
  // ("options") moves focus to the selected job's first alternative, whose ⏎ opens its receipt.
  // A lane HOLD (COMMON decision 6) is lifted only by an operator's look: A acknowledges it.
  { mode: "projects.runs", keys: ["O"], verb: "reroute", does: "re-route", when: "reroutable" },
  { mode: "projects.runs", keys: ["A"], verb: "ack-lane", does: "acknowledge hold", when: "hold" },
];

const compose: Binding[] = [
  { mode: "compose", keys: ["1", "2", "3"], verb: "recipe", does: "recipe" },
];

// THE RECEIPT (Phase 4, COMMON decision 3): every launch is read before it is confirmed. The
// receipt is a sheet layer with this mode; ⏎ confirms from the sheet and from its ceiling field
// alike (a dollar typed and ⏎ is the natural end of the act). Escape is the layer router's - it
// closes the sheet and launches nothing - so it is not a row (see the header).
//
// A field's ⏎ row says `onControl` (L28): a text field is a CONTROL to the target reader (v1's
// enterBelongsToTarget), so without it the composer's ⏎, the title's ⏎ and the ceiling's ⏎ were
// rows that could never fire - the composer's had been in the table since Phase 1 unanswered.
const receipt: Binding[] = [
  { mode: "receipt", keys: ["⏎"], verb: "confirm", does: "confirm" },
  { mode: "receipt", keys: ["⏎"], verb: "confirm", does: "confirm", field: "ceiling", onControl: true },
];

const library: Binding[] = [
  { mode: "library", keys: ["/"], verb: "search", does: "search" },
  { mode: "library", keys: ["←", "→", "↑", "↓"], verb: "move", does: "move", when: "in-results", repeat: true },
  { mode: "library", keys: ["PgUp", "PgDn"], verb: "page", does: "page", when: "in-results", repeat: true },
  { mode: "library", keys: ["Home", "End"], verb: "edge", does: "first · last", when: "in-results" },
  { mode: "library", keys: ["⏎"], alias: ["Space"], verb: "open", does: "open", when: "in-results" },
  { mode: "library", keys: ["]"], verb: "detail", does: "detail" },
  { mode: "library", keys: ["Esc"], verb: "back", does: "back" },
  { mode: "library", keys: ["Esc"], verb: "clear-search", does: "clear", field: "search" },
  { mode: "library", keys: ["↓"], alias: ["⏎"], verb: "to-results", does: "results", field: "search" },
];

const ledger: Binding[] = [
  { mode: "ledger", keys: ["/"], verb: "search", does: "search" },
  { mode: "ledger", keys: ["↓"], alias: ["J"], verb: "next", does: "event", repeat: true },
  { mode: "ledger", keys: ["↑"], alias: ["K"], verb: "prev", does: "event", repeat: true },
  { mode: "ledger", keys: ["PgUp", "PgDn"], verb: "page", does: "page", repeat: true },
  { mode: "ledger", keys: ["Home", "End"], verb: "edge", does: "first · last", when: "list-focused" },
  { mode: "ledger", keys: ["⏎"], verb: "open-subject", does: "subject" },
  { mode: "ledger", keys: ["V"], verb: "view", does: "table · jsonl" },
  { mode: "ledger", keys: ["Esc"], verb: "back", does: "back" },
  { mode: "ledger", keys: ["Esc"], verb: "clear-search", does: "clear", field: "search" },
  { mode: "ledger", keys: ["↓"], alias: ["⏎"], verb: "to-rows", does: "events", field: "search" },
];

// THE PART EDITORS (Phase 4 wave C, L38; STEPS-DESIGN §0.7 and §2). v1 bound every editor with raw
// window listeners and its shared keymap was used nowhere in app/studio (INVENTORY §0); J/K meant
// rows in Frames and shuttle in Cut. Here `part` is the workspace frame (parts, undo, leaving a
// field) and each editor kind is a mode beneath it. J/K walk ITEMS in both editors - there is no
// transport in research or script, so nothing here is a shuttle - and H/L walk columns (a
// notebook's dimensions, a beat board's slots). ⌫ undoes the last op of THIS part, server-side.
const part: Binding[] = [
  { mode: "part", keys: ["[", "]"], verb: "tab", does: "part" },
  { mode: "part", keys: ["⌫"], alias: ["⌘Z"], verb: "undo", does: "undo" },
  { mode: "part", keys: ["⏎"], verb: "commit-field", does: "save", field: "part-field", onControl: true },
  { mode: "part", keys: ["Esc"], verb: "leave-field", does: "leave", field: "*" },

  { mode: "part.research", keys: ["J", "K"], verb: "item", does: "card", repeat: true },
  { mode: "part.research", keys: ["H", "L"], verb: "column", does: "column", repeat: true },
  { mode: "part.research", keys: ["X"], verb: "descope", does: "descope · restore", when: "card" },
  { mode: "part.research", keys: ["F"], verb: "like", does: "like", when: "card" },
  { mode: "part.research", keys: ["D"], verb: "deepen", does: "deepen", when: "card" },
  { mode: "part.research", keys: ["⏎"], verb: "open", does: "open · pick", when: "item" },
  { mode: "part.research", keys: ["Esc"], verb: "deselect", does: "deselect", when: "item" },

  { mode: "part.script", keys: ["J", "K"], verb: "item", does: "item", repeat: true },
  { mode: "part.script", keys: ["A"], verb: "adopt", does: "adopt · pick", when: "item" },
  { mode: "part.script", keys: ["V"], verb: "view", does: "inspector view" },
  { mode: "part.script", keys: ["Esc"], verb: "deselect", does: "deselect", when: "item" },
];

export const BINDINGS: readonly Binding[] = [...floor, ...calendar, ...board, ...projects, ...compose, ...receipt, ...library, ...ledger, ...part];

/** The app's one compiled keymap. */
export const KEYMAP = compile(BINDINGS);
