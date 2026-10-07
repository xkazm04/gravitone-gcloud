// THE BOARD'S SKIN — one, now.
//
// Round 1 built four directions behind `?v=1|2|3|4` (Dense ledger, Spatial
// field, Transit map, Workbench) so the look could be judged by flipping between
// them on live data rather than by reading a description. The operator flipped
// them and answered: "Dense ledger is the winner with couple of adjustments."
// The other three are deleted rather than left behind a query parameter — a
// direction nobody will choose again is three files of taste that every future
// change to the card contract has to be kept compiling.
//
// What the exercise proved is kept where it belongs: the four bets, what each
// won and lost, and the measurements that killed them are in
// `.vault/Masterpiece/exercises/01-pipeline-canvas.md`, and the engine's side of
// it is unchanged — a skin still draws a card's FACE and, optionally, a WORLD
// layer behind the cards (../types.ts), and still cannot reach the camera, add a
// column or move a card. The seam survives the cull, so a second direction is a
// new file and an import, not a re-architecture.
//
// ONE LESSON FROM THE REGISTRY ITSELF, worth keeping because it cost a round: a
// bet must be REACHABLE FROM A SKIN. v1 was first advertised as "no card chrome
// at all", which no skin can deliver — the engine owns the card's border, its
// rounded corner and its stage tint, and the shell is `overflow-hidden`, so a
// face is clipped at the padding box and cannot paint over them. A direction
// advertised on a claim its layer cannot satisfy is judged for the engine's
// decision, not its own.

export { ledger } from "./ledger";
