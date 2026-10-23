import { z } from "zod";

import { err, ok } from "@gt/domain/errors";
import { SPEND_REQUEST_ID_RE, SPEND_REQUEST_STATES, spendPacketId, type SpendRequest } from "@gt/domain/mcp";
import { listSpendRequests, readSpendRequest } from "@gt/kernel/spend-requests/store";

import { defineOp, READS, type McpToolSpec, type Obj } from "../op.ts";

// gt_spend - the spend requests this door filed, read back: what was asked, on which receipt, and
// what the operator decided on `pkt:spend:<day>` (confirmed and launched with its jobs, refused with
// its reasons and note, or failed with why). `list` is this token's own asks; `get` reads any one.

const LIST_MAX = 100;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a day is YYYY-MM-DD");

const shown = (r: SpendRequest): Obj => ({ ...r, view: `/board/${spendPacketId(r.day)}` });

export const SPEND_OPS: readonly McpToolSpec[] = [
  defineOp({
    family: "spend",
    op: "list",
    title: "My spend requests",
    description: "Spend requests filed under this token's name, newest first: state, subject, receipt, and the operator's verdict once decided. Filter by state or day; at most 100.",
    input: z.object({ state: z.enum(SPEND_REQUEST_STATES).optional(), day: day.optional(), limit: z.number().int().min(1).max(LIST_MAX).optional() }).strict(),
    annotations: READS,
    writes: false,
    run: ({ limit = 50, ...f }, { deps, agent }) => {
      const s = deps.store();
      if (!s.ok) return s;
      // One more than asked says whether the listing was cut.
      const r = s.value.read((rd) => listSpendRequests(rd, { ...f, actorId: agent.name, limit: limit + 1 }));
      if (!r.ok) return r;
      const requests = r.value.slice(0, limit).map(shown);
      return ok({ requests, truncated: r.value.length > limit });
    },
  }),
  defineOp({
    family: "spend",
    op: "get",
    title: "Spend request",
    description: "One spend request in any state: the receipt it was filed on, the operator's reasons and note, the jobs a confirm launched, or why it failed.",
    input: z.object({ id: z.string().regex(SPEND_REQUEST_ID_RE, "a spend request id is sr_ and 12 hex") }).strict(),
    annotations: READS,
    writes: false,
    run: ({ id }, { deps }) => {
      const s = deps.store();
      if (!s.ok) return s;
      const r = s.value.read((rd) => readSpendRequest(rd, id));
      if (!r.ok) return r;
      return r.value === undefined ? err("not-found", `no spend request ${id}`) : ok({ request: r.value, view: `/board/${spendPacketId(r.value.day)}` });
    },
  }),
];
