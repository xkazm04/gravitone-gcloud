// THE RECIPE BOOK'S MODEL — every number the audio module draws, read off the
// takes on each render. Pure: no React, no storage, no clock except where a
// caller passes one.
//
// Ported from the contest entry's core.js (the WB object) and app.js's derived
// half. The shape of the argument is unchanged: a take's verdict is the
// person's (kept / rejected / not yet); "proven" is a kept take that also
// SCORES — kept-but-weak is its own state (core.js#verdict). A term's evidence
// is read off the ledger every time and never stored; only the team's hand
// (prefer / avoid, and the phrasing a term becomes in a prompt) persists.

// The door. Everything this module offered before is still importable from
// here; the implementation lives in the files beside this one.
export * from "./take";
export * from "./takeFromAsset";
export * from "./derived";
export * from "./vocabulary";
export * from "./prompts";
export * from "./variations";
export * from "./drafts";
export * from "./referenceTracks";
export * from "./grouping";
export * from "./format";
export * from "./waveform";
