import "server-only";

import { err } from "@gt/domain/errors";

import type { DecisionAdapter } from "../types.ts";

// ONE DAY'S SPEND REQUESTS AS A PACKET (spark athena-control-mcp WP3) - `pkt:spend:<day>`, a row per
// request an agent filed when its live launch would spend (@gt/kernel/spend-requests/store). WP0 STUB:
// every verb refuses until WP3 builds the read, the packet, the consequence and the apply.

const STUB = "the spend packet is not built yet (spark athena-control-mcp WP3)";

export const spendAdapter: DecisionAdapter<unknown> = {
  source: "spend",
  read: async () => err("unavailable", STUB),
  packet: () => err("unavailable", STUB),
  consequence: () => err("unavailable", STUB),
  apply: async () => err("unavailable", STUB),
};
