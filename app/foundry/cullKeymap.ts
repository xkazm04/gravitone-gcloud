// THE CULL'S ONE KEYMAP — pure, so the guard is asserted in the node lane.
//
// CullGrid binds it (useKeymap) and FoundryView draws it (<Keycaps map>): one
// declaration, so a key can no longer be drawn and not bound, or bound behind a
// weaker guard than the one it is drawn under. Before this, the grid's own
// `switch` ignored Ctrl (so Ctrl+K, the browser's search, stamped a keep) and
// had no repeat rule beyond `refusedKey`. The policy is the kernel's
// (components/ui/signal/keymap.ts).

import { defineKeymap } from "@/components/ui/signal/keymap";

export type CullAction = "move" | "keep" | "reject" | "clear" | "undo" | "next-undecided" | "compare";

export const CULL = defineKeymap<CullAction>({
  id: "foundry-cull",
  bindings: [
    // Holding an arrow walks the grid, which is what a held arrow means.
    { keys: ["←", "→", "↑", "↓"], does: "move", action: "move", repeat: true },
    { keys: ["K"], does: "keep", action: "keep" },
    { keys: ["X"], does: "reject", action: "reject" },
    { keys: ["U"], does: "clear", action: "clear" },
    { keys: ["Z"], does: "undo", action: "undo" },
    { keys: ["N"], does: "next undecided", action: "next-undecided" },
    { keys: ["Enter"], does: "compare", action: "compare" },
  ],
});
