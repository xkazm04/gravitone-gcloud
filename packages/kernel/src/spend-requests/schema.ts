import { z } from "zod";
import { ACTOR_KINDS } from "@gt/domain/event";
import { MEDIA_LANES, RESOURCE_LANES } from "@gt/domain/lane";
import { SPEND_REQUEST_ID_RE, SPEND_REQUEST_STATES } from "@gt/domain/mcp";
import { FIGURE_SOURCES } from "@gt/domain/produce";
import { composerInputSchema } from "@gt/domain/produce.schema";

import type { ModuleMigrations } from "../migrate.ts";

// THE SPEND-REQUEST TABLE (spark athena-control-mcp) and the door its rows come back through.
//
// One row per request, updated in place as it moves (requested -> confirmed | refused, confirmed ->
// launched | failed): the HISTORY is the ledger's (`spend.*` events, one per move), the row is the
// current word the Board and the agent read. The schema holds what the store's code holds, so a hand
// edit cannot make a request the code would never have written:
//   - who asked, what for, the receipt it was asked on, its day and its filing instant are fixed;
//   - a request is never deleted (a refusal is an answer the agent reads back);
//   - the state moves only along @gt/domain/mcp SPEND_TRANSITIONS (spelled here as SQL, held to the
//     table by test/spend-requests.test.ts);
//   - each state carries exactly its fields: reasons (and only then a note) when refused, a decision
//     instant once decided, job ids when launched, a failure when failed.

export const spendRequestMigrations: ModuleMigrations = {
  module: "spend-requests",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE spend_requests (
  id TEXT PRIMARY KEY CHECK (length(id) = 15 AND substr(id, 1, 3) = 'sr_'),
  day TEXT NOT NULL CHECK (length(day) = 10),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('operator', 'agent', 'machine')),
  actor_id TEXT NOT NULL CHECK (length(actor_id) > 0),
  subject TEXT NOT NULL CHECK (json_valid(subject) AND json_type(subject) = 'object'),
  receipt TEXT NOT NULL CHECK (json_valid(receipt) AND json_type(receipt) = 'object'),
  state TEXT NOT NULL CHECK (state IN ('requested', 'confirmed', 'refused', 'launched', 'failed')),
  reasons TEXT CHECK (reasons IS NULL OR (json_valid(reasons) AND json_type(reasons) = 'array' AND json_array_length(reasons) > 0)),
  note TEXT,
  failure TEXT CHECK (failure IS NULL OR length(failure) > 0),
  job_ids TEXT CHECK (job_ids IS NULL OR (json_valid(job_ids) AND json_type(job_ids) = 'array')),
  filed_at TEXT NOT NULL,
  decided_at TEXT CHECK (decided_at IS NULL OR decided_at >= filed_at),
  CHECK ((state = 'refused') = (reasons IS NOT NULL)),
  CHECK (note IS NULL OR state = 'refused'),
  CHECK ((state = 'requested') = (decided_at IS NULL)),
  CHECK ((state = 'launched') = (job_ids IS NOT NULL)),
  CHECK ((state = 'failed') = (failure IS NOT NULL))
);
CREATE INDEX spend_requests_day_state ON spend_requests (day, state);
CREATE TRIGGER spend_requests_fixed_at_filing BEFORE UPDATE OF id, day, actor_kind, actor_id, subject, receipt, filed_at ON spend_requests
BEGIN SELECT RAISE(ABORT, 'a spend request''s asker, subject, receipt and filing are fixed when it is filed'); END;
CREATE TRIGGER spend_requests_moves BEFORE UPDATE OF state ON spend_requests
WHEN NOT ((OLD.state = 'requested' AND NEW.state IN ('confirmed', 'refused')) OR (OLD.state = 'confirmed' AND NEW.state IN ('launched', 'failed')))
BEGIN SELECT RAISE(ABORT, 'a spend request moves requested -> confirmed|refused -> launched|failed, once each'); END;
CREATE TRIGGER spend_requests_never_deleted BEFORE DELETE ON spend_requests
BEGIN SELECT RAISE(ABORT, 'spend requests are answered, never deleted'); END;`,
    },
  ],
};

/* ── the door ────────────────────────────────────────────────────────────── */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** What a request asks the operator to pay for (@gt/domain/mcp SpendSubject). */
export const spendSubjectSchema = z.union([
  z.object({ kind: z.literal("run"), input: composerInputSchema }).strict(),
  z.object({ kind: z.literal("project"), id: z.string().min(1), rev: z.number().int().positive() }).strict(),
]);

const usdRange = z.tuple([z.number(), z.number()]);

const receiptLineSchema = z.object({
  key: z.string(),
  label: z.string(),
  lane: z.enum(RESOURCE_LANES),
  provider: z.string(),
  model: z.string(),
  units: z.number(),
  seconds: z.number(),
  usd: z.number().nullable(),
  usdRange: usdRange.optional(),
  unpricedReason: z.string().optional(),
  src: z.enum(FIGURE_SOURCES),
  queuePos: z.number(),
  start: z.string(),
  end: z.string(),
});

/** The receipt a request was filed on (@gt/domain/produce Receipt): the money the operator is asked
 *  for, so a row whose figures do not parse refuses rather than reads as a smaller ask. */
export const receiptSchema = z.object({
  token: z.string(),
  subject: z.union([
    z.object({ kind: z.literal("run"), lane: z.enum(MEDIA_LANES) }),
    z.object({ kind: z.literal("project"), id: z.string(), rev: z.number() }),
  ]),
  mode: z.enum(["dry", "live"]),
  lines: z.array(receiptLineSchema),
  totals: z.object({ seconds: z.number(), usd: z.number(), usdRange: usdRange.optional(), unpriced: z.number().int().nonnegative(), src: z.enum(FIGURE_SOURCES) }),
  queuePos: z.number(),
  etaAt: z.string(),
  ceilingUsd: z.number().optional(),
  overCeiling: z.boolean(),
  readAt: z.string(),
});

/** One stored row; the JSON columns are text here and parse through their own schemas (./store.ts). */
export const rowSchema = z.object({
  id: z.string().regex(SPEND_REQUEST_ID_RE),
  day: z.string().regex(DAY_RE),
  actor_kind: z.enum(ACTOR_KINDS),
  actor_id: z.string().min(1),
  subject: z.string(),
  receipt: z.string(),
  state: z.enum(SPEND_REQUEST_STATES),
  reasons: z.string().nullable(),
  note: z.string().nullable(),
  failure: z.string().nullable(),
  job_ids: z.string().nullable(),
  filed_at: z.string(),
  decided_at: z.string().nullable(),
});

export const reasonsSchema = z.array(z.string().min(1)).min(1);
export const jobIdsSchema = z.array(z.string().min(1));

export const COLUMNS = "id, day, actor_kind, actor_id, subject, receipt, state, reasons, note, failure, job_ids, filed_at, decided_at";
