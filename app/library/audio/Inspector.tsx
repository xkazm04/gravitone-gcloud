"use client";

// THE INSPECTOR — the right column's "Take · Compose" tab. Top to bottom:
//
//   Take        title, kind, verdict, vendor, id, age, score; the player; the
//               three-dimension rubric (1-10 each); keep / reject / clear; the
//               reject reason quoted; the take's terms, each a filter.
//   Recipe      the take's lineage as a path: ancestors, the reference and what
//               librosa measured on it, the parent take, the concept, the draft
//               that asked for it (or the prompt re-composed from its terms,
//               drawn as a ghost), the take itself, its returns, and drafts
//               still awaiting a return.
//   Variations  one axis each, so a verdict on the result says which mattered.
//   Composer    the seed as term chips, the team's preferred terms floating in,
//               tempo and key, the prompt for the chosen vendor, Copy.
//   Drafts      every copied prompt, with a drop zone for the file it returned.
//
// Ported from the contest entry's app.js#takeHTML/#lineageHTML/#composerHTML.

// The panels live in the Inspector* files beside this one. This file re-exports
// them, so every existing importer keeps its path and its names.

export { TakePanel } from "./InspectorTake";
export { Recipe } from "./InspectorRecipe";
export { Variations } from "./InspectorVariations";
export { Composer, type ComposerState } from "./InspectorComposer";
export { Drafts } from "./InspectorDrafts";
