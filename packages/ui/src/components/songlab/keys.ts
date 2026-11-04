// THE KNOCKOUT BOOTH'S KEYS (the contest winner's bindings, kept as the owner chose them): 1 and 2
// play an arm, F flips to the other arm at the same position, the arrows seek two seconds, A / B / N
// answer the question in focus, Enter sends the vote (or, after a reveal, opens the next match).
//
// THE KEYS LIVE IN THE ONE REGISTRY (packages/ui/src/keymap/bindings.ts, `songlab`); the booth registers
// its handlers by verb (`useKeys("audio.songlab")`) and the legend reads the same rows from there.
import { BINDINGS } from "../../keymap/bindings.ts";
import { compile, type Binding } from "../../keymap/keymap.ts";

export const SONGLAB_MODE = "audio.songlab" as const;

export const SONGLAB_BINDINGS: readonly Binding[] = BINDINGS.filter((b) => b.mode === SONGLAB_MODE);

export const SONGLAB_KEYMAP = compile(SONGLAB_BINDINGS);
