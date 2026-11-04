// THE KNOCKOUT BOOTH'S KEYS (the contest winner's bindings, kept as the owner chose them): 1 and 2
// play an arm, F flips to the other arm at the same position, the arrows seek two seconds, A / B / N
// answer the question in focus, Enter sends the vote (or, after a reveal, opens the next match).
//
// THE KEYS LIVE IN THE ONE REGISTRY (packages/ui/src/keymap/bindings.ts) - these rows are what the
// song lab adds there, and the booth registers its handlers by verb (`useKeys("audio.songlab")`).
// Until the rows are in the registry the dispatcher matches none of them; the legend reads this
// table, so the caps it draws are the caps the registry will hold.
import { compile, type Binding } from "../../keymap/keymap.ts";

export const SONGLAB_MODE = "audio.songlab" as const;

export const SONGLAB_BINDINGS: readonly Binding[] = [
  { mode: SONGLAB_MODE, keys: ["1"], verb: "play-a", does: "play A", when: "match" },
  { mode: SONGLAB_MODE, keys: ["2"], verb: "play-b", does: "play B", when: "match" },
  { mode: SONGLAB_MODE, keys: ["F"], verb: "flip", does: "flip", when: "match" },
  { mode: SONGLAB_MODE, keys: ["Space"], verb: "toggle", does: "play", when: "match" },
  { mode: SONGLAB_MODE, keys: ["←", "→"], verb: "seek", does: "2 s", when: "match", repeat: true },
  { mode: SONGLAB_MODE, keys: ["A", "B", "N"], verb: "answer", does: "answer", when: "blind" },
  { mode: SONGLAB_MODE, keys: ["⏎"], verb: "send", does: "send vote", when: "match" },
];

export const SONGLAB_KEYMAP = compile(SONGLAB_BINDINGS);
