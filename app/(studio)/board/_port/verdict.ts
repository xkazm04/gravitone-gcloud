// ONE DOOR FOR A VERDICT CHANGE, shared by the two ways a verdict reaches the port: the patch
// Server Action (./actions.ts) and the pagehide beacon (../[packet]/keepalive/route.ts). They
// carry the same changes from the same gate, so a bound loosened or tightened on one and not
// the other would let a beacon write what the action refuses (or drop what it takes).
import { z } from "zod";

export const verdictChange = z.object({
  candidate: z.string().min(1).max(400),
  verdict: z.enum(["keep", "reject"]).nullable(),
  reasons: z.array(z.string().min(1).max(64)).max(11),
  note: z.string().min(1).max(2000).optional(),
});

/** A patch's changes: at least one, at most a whole packet's worth. */
export const verdictChanges = z.array(verdictChange).min(1).max(500);
