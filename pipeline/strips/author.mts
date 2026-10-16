// AUTHOR ONE STRIP lives in lib/foundry/strips/author.ts since Phase 4 (L33): the strip
// job prepares the workspace, runs the turn through its meter (live on the seat, or the dry
// stand-in) and collects what it left, so the three halves of v1's `authorStrip` are three
// calls there. This file keeps the old import path for anything that still names it.

export { assetRequest, collectTurn, makeAsset, prepareTurn, standInTurn, type AuthorInput, type Collected, type StripTurn } from "../../lib/foundry/strips/author.ts";
