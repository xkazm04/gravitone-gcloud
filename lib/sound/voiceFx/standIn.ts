import { FX_CHAIN_VERSION, type FxChain } from "@gt/domain/audio.fx";

// THE DRY STAND-IN CHAIN - what a DRY `fx-line` job renders instead of asking the text router:
// one room, the same for every description, so a dry run exercises the whole act (the ask, the
// render over real bytes, the new take, its landing) and costs nothing. Pure and zod-free, so the
// fixture side's dry landing (app/(studio)/projects/[id]/_part/fixtureExplainer.ts) and the bound
// producer (lib/producers/voiceFx.ts) land the same chain. A dry job's take says what it is by its
// engine (`mode: "dry"`); the chain is not the operator's words read by a model, and nothing here
// pretends it is.

export const FX_STAND_IN: FxChain = {
  v: FX_CHAIN_VERSION,
  stages: [{ kind: "reverb", roomSize: 0.6, damping: 0.5, wet: 0.35, dry: 0.8, width: 1 }],
};
