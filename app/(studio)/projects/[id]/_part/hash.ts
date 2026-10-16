import "server-only";

import { createHash } from "node:crypto";

/** A short stable digest: receipt tokens, a brief's identity, a spine's key. */
export function digest(x: unknown): string {
  return createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 24);
}
