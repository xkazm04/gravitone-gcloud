// The decided desk's redrive, as the Board runs it (../_port/actions.ts `redrive`). Pure over its
// four seams so the answers are asserted without a DOM (tests/next-server/board-redrive.test.ts).
// A refusal says the kernel's sentence; a Server Action that never answers (the server gone, the
// network dropped) rejects, and that is said too, never left as an unhandled rejection with the
// desk still showing `stuck` as if nothing had been tried.
import type { PortResult } from "@gt/ui/board/port";

export type Redrive = (input: { readonly id: string }) => Promise<PortResult<{ readonly id: string }>>;

export function redriveAndSay(redrive: Redrive, id: string, say: (m: string) => void, after: () => void): Promise<void> {
  return redrive({ id })
    .then(
      (r) => say(r.ok ? "v1 apply · redriven" : r.error.error),
      (e: unknown) => say(e instanceof Error ? e.message : "the redrive did not land"),
    )
    .then(after);
}
