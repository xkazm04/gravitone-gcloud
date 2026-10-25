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
  { mode: "calendar", keys: ["N"], verb: "schedule", does: "schedule" },
  { mode: "calendar", keys: ["⏎"], verb: "open-day", does: "open", when: "day" },
  { mode: "calendar", keys: ["Esc"], verb: "clear-day", does: "month", when: "day" },
  { mode: "calendar", keys: ["C"], verb: "rail", does: "rail" },
  { mode: "calendar", keys: ["B"], verb: "board", does: "board" },
];

const slot: Binding[] = [
  { mode: "slot", keys: ["M"], verb: "move", does: "move", when: "movable" },
  { mode: "slot", keys: ["P"], verb: "publish-now", does: "publish now", when: "publishable" },
  { mode: "slot", keys: ["X"], verb: "cancel", does: "cancel", when: "cancellable" },
];

const board: Binding[] = [
  { mode: "board", keys: ["[", "]"], verb: "packet", does: "packet" },
  { mode: "board", keys: ["⏎"], verb: "open-next", does: "next packet", when: "!desk" },

  // THE NUMBER ROW DECIDES (spark scout-storyboards, the operator: "simplify so I can use only numerics"): 1 keeps,
  // 2-4 reject with reason 1-3 of the run's group order (@gt/domain/source REJECT_KEYS, `reasonsOf`), 5 rejects
  // with none and stays for a chip to be clicked. K and X are unbound; a source's other reasons are the chips'.
  { mode: "board.cull", keys: ["1"], verb: "keep", does: "keep" },
  { mode: "board.cull", keys: ["2", "3", "4"], verb: "reason", does: "reason" },
  { mode: "board.cull", keys: ["5"], verb: "reject", does: "reject" },
  { mode: "board.cull", keys: ["U"], verb: "undecide", does: "undecide" },
  { mode: "board.cull", keys: ["←"], alias: ["J"], verb: "prev", does: "move", repeat: true },
  { mode: "board.cull", keys: ["→"], alias: ["L"], verb: "next", does: "move", repeat: true },
  { mode: "board.cull", keys: [], alias: ["↑"], verb: "row-up", does: "move", repeat: true },
  { mode: "board.cull", keys: [], alias: ["↓"], verb: "row-down", does: "move", repeat: true },
  // ⇧ on a digit is matched by its position too (chord.ts: Shift+1 reports "!" on a US board, `code` Digit1).
  { mode: "board.cull", keys: ["⇧1"], verb: "keep-item", does: "item" },
  { mode: "board.cull", keys: ["⇧2"], verb: "reject-item", does: "item" },
  { mode: "board.cull", keys: ["Z"], verb: "zoom", does: "zoom" },
  // A note on the decision under the cursor (spark scout-decision-graph), for a source that keeps one:
  // E opens the row's one-line field, ⏎ in it saves the note with the verdict, Esc leaves it unsaved.
  { mode: "board.cull", keys: ["E"], verb: "note", does: "note", when: "notes" },
  { mode: "board.cull", keys: ["⏎"], verb: "save-note", does: "save", field: "note", onControl: true },
  { mode: "board.cull", keys: ["Esc"], verb: "cancel-note", does: "cancel", field: "note" },
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
  { mode: "board.review", keys: ["A"], verb: "approve", does: "approve → calendar" },
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

  // L39 - frames and motion (STEPS-DESIGN §2). v1 FramesAssembly bound J/K rows, N next missing
  // plate and Esc by a raw listener (:100-128) and resized by arrows on a focused handle
  // (parts.tsx:248-262); MotionStep bound Ctrl+⏎ accept the same way (:192-197). J/K walk UNITS
  // here (no transport in either editor). With a LAYER selected the arrows nudge it (⇧ 10%), H
  // hides it and [ ] move it within its group - shadowing the frame's part tabs only while a
  // layer is held, which is when a layer's order is the question. ⏎ prices the selected unit's
  // render (the receipt opens; nothing renders before its confirm).
  { mode: "part.frames", keys: ["J", "K"], verb: "item", does: "unit", repeat: true },
  { mode: "part.frames", keys: ["N"], verb: "next-missing", does: "next missing" },
  { mode: "part.frames", keys: ["⏎"], verb: "render", does: "render", when: "unit" },
  { mode: "part.frames", keys: ["←", "→", "↑", "↓"], verb: "nudge", does: "nudge", when: "layer", repeat: true },
  { mode: "part.frames", keys: ["⇧←", "⇧→", "⇧↑", "⇧↓"], verb: "nudge-far", does: "nudge 10%", when: "layer", repeat: true },
  { mode: "part.frames", keys: ["[", "]"], verb: "order", does: "back · forward", when: "layer", shadows: true },
  { mode: "part.frames", keys: ["H"], verb: "hide", does: "hide · show", when: "layer" },
  { mode: "part.frames", keys: ["V"], verb: "view", does: "inspector view" },
  { mode: "part.frames", keys: ["A"], verb: "accept", does: "accept direction", when: "proposal" },
  { mode: "part.frames", keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"], verb: "adopt", does: "adopt take", when: "takes" },
  { mode: "part.frames", keys: ["Esc"], verb: "deselect", does: "deselect", when: "layer" },

  // The editors that share a face with a board but answer a smaller set of its keys get their own
  // mode, so the legend draws what they answer: the ad's take grid (frames' walk, render and
  // adopt - no inspector views, layers or directions) and the trailer cut (script's walk and
  // deselect - no adopt, no inspector views). Named beside `part.`, not under `part.frames` or
  // `part.script`, because a mode inherits every row of the modes it is nested in.
  { mode: "part.takes", keys: ["J", "K"], verb: "item", does: "unit", repeat: true },
  { mode: "part.takes", keys: ["N"], verb: "next-missing", does: "next missing" },
  { mode: "part.takes", keys: ["⏎"], verb: "render", does: "render", when: "unit" },
  { mode: "part.takes", keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"], verb: "adopt", does: "adopt take", when: "takes" },

  { mode: "part.trailer", keys: ["J", "K"], verb: "item", does: "item", repeat: true },
  { mode: "part.trailer", keys: ["Esc"], verb: "deselect", does: "deselect", when: "item" },

  { mode: "part.motion", keys: ["J", "K"], verb: "item", does: "unit", repeat: true },
  { mode: "part.motion", keys: ["⏎"], verb: "direct", does: "direct", when: "plate" },
  { mode: "part.motion", keys: ["⌘⏎"], verb: "accept", does: "accept", when: "proposal" },
  { mode: "part.motion", keys: ["R"], verb: "render", does: "render clip", when: "moving" },
  { mode: "part.motion", keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"], verb: "adopt", does: "adopt clip", when: "clips" },
];

// L40 - score, cut, and the album and explainer parts (STEPS-DESIGN §2). J/K/L is the TRANSPORT
// here, and only here: score and cut have a clock (v1 Transport.tsx:24-35 - 1x/2x/4x), so in
// these two modes J/K/L shuttle and the arrows walk; everywhere else J/K walk items. The cut's
// keys are v1's ControlRoom set (frame and second steps, ↑/↓ edit, G/⇧G music gap, Home/End)
// moved from a window listener into the keymap; its 50-deep session ⌘Z is the frame's ⌫ now.
// The score's ⇧←/⇧→ move the selected cue by one scene (the drop the drag makes), ⏎ prices its
// render. , and . nudge the selected block ∓50 ms (v1's SyncBench buttons).
const partL40: Binding[] = [
  { mode: "part.score", keys: ["Space"], verb: "play", does: "play · pause" },
  { mode: "part.score", keys: ["J", "K", "L"], verb: "shuttle", does: "1× · 2× · 4×" },
  { mode: "part.score", keys: ["←", "→"], verb: "cue", does: "cue", repeat: true },
  { mode: "part.score", keys: ["⇧←", "⇧→"], verb: "nudge-span", does: "move cue a scene", when: "cue", repeat: true },
  { mode: "part.score", keys: ["⏎"], verb: "render", does: "render cue", when: "cue" },
  { mode: "part.score", keys: ["N"], verb: "add-cue", does: "add cue" },
  { mode: "part.score", keys: ["Z", "⇧Z"], verb: "zoom", does: "zoom in · out" },
  { mode: "part.score", keys: ["Esc"], verb: "deselect", does: "deselect", when: "cue" },

  { mode: "part.cut", keys: ["Space"], verb: "play", does: "play · pause" },
  { mode: "part.cut", keys: ["J", "K", "L"], verb: "shuttle", does: "1× · 2× · 4×" },
  { mode: "part.cut", keys: ["←", "→"], verb: "frame", does: "frame", repeat: true },
  { mode: "part.cut", keys: ["⇧←", "⇧→"], verb: "second", does: "second", repeat: true },
  { mode: "part.cut", keys: ["↑", "↓"], verb: "edit", does: "edit", repeat: true },
  { mode: "part.cut", keys: ["G", "⇧G"], verb: "gap", does: "music gap" },
  { mode: "part.cut", keys: ["Home", "End"], verb: "edge", does: "start · end" },
  { mode: "part.cut", keys: [",", "."], verb: "nudge", does: "∓50 ms", when: "clip", repeat: true },
  { mode: "part.cut", keys: ["Z", "⇧Z"], verb: "zoom", does: "zoom in · out" },
  { mode: "part.cut", keys: ["Esc"], verb: "deselect", does: "deselect", when: "clip" },

  { mode: "part.voice", keys: ["J", "K"], verb: "item", does: "line", repeat: true },
  { mode: "part.voice", keys: ["⏎"], verb: "record", does: "record line", when: "line" },
  { mode: "part.article", keys: ["J", "K"], verb: "item", does: "section", repeat: true },
  { mode: "part.strips", keys: ["J", "K"], verb: "item", does: "card", repeat: true },
];

// L51 - THE STYLE ATELIER (Phase 5). v1's atelier bound nothing: approve/reject were hover
// buttons on each plate (app/library/parts.tsx ProofThumb) and Lock a button three panes away.
// J/K walk the sheet's proofs; A/R/U judge the held one (R opens its note first: a rejection is
// kept with its reason - visual-style-locking/rejections-as-negative-evidence - and ⏎ in the note
// lands it). G prices the chosen trial columns (the receipt opens; nothing renders before its
// confirm). ⇧L locks, and only while the server's gate says it may - the shift because a lock is
// one-way. Esc in any field leaves it (a slot commits on leaving; a note is dropped undecided).
const style: Binding[] = [
  { mode: "style", keys: ["J", "K"], verb: "item", does: "proof", repeat: true },
  { mode: "style", keys: ["A"], verb: "approve", does: "approve", when: "judge" },
  { mode: "style", keys: ["R"], verb: "reject", does: "reject · note", when: "judge" },
  { mode: "style", keys: ["U"], verb: "undecide", does: "undecide", when: "judge" },
  { mode: "style", keys: ["G"], verb: "generate", does: "render chosen", when: "chosen" },
  { mode: "style", keys: ["⇧L"], verb: "lock", does: "lock", when: "lockable" },
  { mode: "style", keys: ["Esc"], verb: "deselect", does: "deselect", when: "proof" },
  { mode: "style", keys: ["⏎"], verb: "attach", does: "reject", field: "proof-note", onControl: true },
  { mode: "style", keys: ["Esc"], verb: "leave-field", does: "leave", field: "*" },
];

// L60 - THE AUDIO DESK'S ARRANGE BOARD (Phase 6). v1 app/playground/arrange/Board.tsx bound these on the card by a raw
// onKeyDown: arrows walk to the nearest card, ⇧arrows move the focused card one cell (a write the store may refuse), F
// finalizes (the label prompt opens first), V opens the versions. Esc in the label or row field leaves it.
const audio: Binding[] = [
  { mode: "audio.arrange", keys: ["←", "→", "↑", "↓"], verb: "walk", does: "card", when: "card", repeat: true },
  { mode: "audio.arrange", keys: ["⇧←", "⇧→", "⇧↑", "⇧↓"], verb: "move", does: "move card", when: "card" },
  { mode: "audio.arrange", keys: ["F"], verb: "finalize", does: "finalize", when: "card" },
  { mode: "audio.arrange", keys: ["V"], verb: "versions", does: "versions", when: "card" },
  { mode: "audio.arrange", keys: ["Esc"], verb: "leave-field", does: "leave", field: "*" },
  // L66 - the rubric desk: N/P walk the judged takes, arrows the dimensions, a digit scores it (0 = 10).
  { mode: "audio.rubric", keys: ["N"], verb: "next", does: "take", repeat: true },
  { mode: "audio.rubric", keys: ["P"], verb: "prev", does: "take", repeat: true },
  { mode: "audio.rubric", keys: ["↑", "↓"], verb: "dim", does: "dimension", when: "take", repeat: true },
  { mode: "audio.rubric", keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"], verb: "score", does: "score", when: "take" },
  { mode: "audio.rubric", keys: ["U"], verb: "clear", does: "clear", when: "take" },
  { mode: "audio.rubric", keys: ["Space"], verb: "play", does: "play", when: "take" },
];

export const BINDINGS: readonly Binding[] = [...floor, ...calendar,
  ...slot, ...board, ...projects, ...compose, ...receipt, ...library, ...ledger, ...part, ...partL40, ...style, ...audio];

/** The app's one compiled keymap. */
export const KEYMAP = compile(BINDINGS);
