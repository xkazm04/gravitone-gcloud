// WHAT IS LEFT OF v1's BOARD - one constant the Suno queue still files records under.
//
// The rest of lib/board (the eleven source adapters, the verdict tables, the key map and the
// pipeline axis this file used to declare) retired with the v1 Board, Foundry canvas and Sound
// lab in Phase 6 wave C: the new Board reads every gate through `lib/decision/v1/*` and the
// kernel's decision core, and none of it imported this module. The Suno queue's records
// (`lib/sound/suno/{draft,queue}.ts`) still carry "no group" as this glyph on disk, so the
// spelling stays, once, until the queue moves into the kernel and this file goes with it.

/** The ungrouped row's key. One spelling of "no group" - a second is a second bug. */
export const UNGROUPED_LANE = "∅";
