// Split out of bindings.ts (its 400-line cap) when the canvas joined the keymap; compiled with the rest there.
import type { Binding } from "./keymap.ts";

// THE SCOUT CANVAS (docs/scout-canvas-port.md; contest scout-canvas-v2-r2 A/1, "Watershed · Weirs"): the winner's
// keys, kept as it bound them. The map is `canvas`; the desk docked under it is `canvas.desk`, so a map key still
// works while the desk is open (the winner's fallthrough); the fullscreen gallery is its own mode and hears no map key.
export const canvas: Binding[] = [
  { mode: "canvas", keys: ["1", "2", "3", "4"], verb: "level", does: "continent · basin · town · street" },
  { mode: "canvas", keys: ["+"], alias: ["="], verb: "zoom-in", does: "zoom in", repeat: true },
  { mode: "canvas", keys: ["-"], alias: ["_"], verb: "zoom-out", does: "zoom out", repeat: true },
  { mode: "canvas", keys: ["0"], alias: ["Home"], verb: "home", does: "whole studio" },
  { mode: "canvas", keys: ["←", "→", "↑", "↓"], verb: "pan", does: "pan", repeat: true },
  { mode: "canvas", keys: ["W"], verb: "next-block", does: "next blocking point" },
  { mode: "canvas", keys: ["⇧W"], verb: "prev-block", does: "previous blocking point" },
  { mode: "canvas", keys: ["G"], verb: "triage", does: "triage what waits here" },
  { mode: "canvas", keys: ["A"], verb: "audio", does: "audio → calendar" },
  { mode: "canvas", keys: ["N"], verb: "note", does: "note for the next scouting" },
  { mode: "canvas", keys: ["P"], verb: "pause", does: "pause · resume branch" },
  { mode: "canvas", keys: ["B"], verb: "brief", does: "next night brief" },
  { mode: "canvas", keys: ["/"], verb: "find", does: "find" },
  // The production street (spark character-cores S1): the cores for its cast. (V, which cycled the street's three
  // drawings, was freed when the timeline street became the only one, 2026-11-20.)
  { mode: "canvas", keys: ["C"], verb: "cores", does: "cores for the cast" },
  { mode: "canvas", keys: ["?"], verb: "keys", does: "keys" },
  { mode: "canvas", keys: ["Esc"], verb: "up", does: "close · one level up" },
  { mode: "canvas", keys: ["Esc"], verb: "leave-field", does: "leave", field: "*" },
  { mode: "canvas.desk", keys: ["⏎"], verb: "run", does: "run the next step" },
  { mode: "canvas.desk", keys: ["Esc"], verb: "close", does: "close", shadows: true },
  { mode: "canvas-gallery", keys: ["K"], verb: "keep", does: "keep" },
  { mode: "canvas-gallery", keys: ["X"], verb: "reject", does: "reject" },
  { mode: "canvas-gallery", keys: ["1", "2", "3", "4", "5", "6"], verb: "reason", does: "reason" },
  { mode: "canvas-gallery", keys: ["→"], alias: ["J"], verb: "next", does: "next", repeat: true },
  { mode: "canvas-gallery", keys: ["←"], alias: ["H"], verb: "prev", does: "previous", repeat: true },
  { mode: "canvas-gallery", keys: ["↓"], verb: "row-down", does: "row down", repeat: true },
  { mode: "canvas-gallery", keys: ["↑"], verb: "row-up", does: "row up", repeat: true },
  { mode: "canvas-gallery", keys: ["⏎"], verb: "open", does: "open · frames" },
  { mode: "canvas-gallery", keys: ["N"], verb: "note", does: "note on the verdict" },
  { mode: "canvas-gallery", keys: ["Z"], verb: "undo", does: "undo" },
  { mode: "canvas-gallery", keys: ["C"], verb: "commit", does: "commit" },
  { mode: "canvas-gallery", keys: ["Space"], verb: "play", does: "play · pause" },
  { mode: "canvas-gallery", keys: ["Esc"], verb: "up", does: "up · close" },
  { mode: "canvas-gallery", keys: ["Esc"], verb: "leave-field", does: "leave", field: "*" },
];
