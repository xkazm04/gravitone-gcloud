import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { type Decision, decisionKey, decisionSchema, pickOutcomeSchema } from "@gt/domain/decision";
import { candidateIdSchema, packetIdSchema, type CandidateId, type PacketId } from "@gt/domain/ids";
import { ok, type Result } from "@gt/domain/errors";
import { packetSourceSchema } from "@gt/domain/packet";
import type { ModuleMigrations } from "../migrate.ts";
import type { Row } from "../store.ts";

// THE DECISION TABLES - v1's three files per run, made rows.
//
// lib/foundry/verdictLog.ts kept a gate in three places beside the run's media:
// verdicts.json (the current map), verdicts.rev.json (the revision) and
// verdicts.log.jsonl (one line per CHANGED key, never rewritten). The current
// map was a second copy of what the log already said, kept in step by writing
// the log first. Here the log IS the record: `decisions` is append-only (the
// triggers refuse UPDATE and DELETE), and "the current verdict of a key" is the
// newest row for it - a query, not a second file that can disagree.
//
// HISTORY OUTLIVES THE MEDIA. A decision names its candidate by id and holds no
// foreign key to any media or blob: v1's forge commit deleted rejected plates
// and the log still had to read. The one key it does hold is to its packet,
// and packets are never deleted.
//
// THE MACHINE'S PICK HAS ITS OWN TABLE (`packet_picks`) and exactly one reader
// (read.ts `revealPicks`), whose SQL carries the blind-first guard. The domain
// Packet has no field for it, on purpose: a pick that rode on the record would
// be one serialisation away from the screen it must not reach.

export const decisionMigrations: ModuleMigrations = {
  module: "decision",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE packets (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('matrix-cull', 'blind-pair', 'packet-review')),
  state TEXT NOT NULL CHECK (state IN ('open', 'committed', 'returned')),
  rev INTEGER NOT NULL DEFAULT 0 CHECK (rev >= 0),
  body TEXT NOT NULL,
  opened_at TEXT NOT NULL
);
CREATE TABLE packet_items (
  packet_id TEXT NOT NULL REFERENCES packets (id),
  candidate_id TEXT NOT NULL,
  row TEXT,
  ord INTEGER NOT NULL,
  PRIMARY KEY (packet_id, candidate_id)
) WITHOUT ROWID;
CREATE TABLE packet_picks (
  packet_id TEXT NOT NULL REFERENCES packets (id),
  row TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  PRIMARY KEY (packet_id, row),
  FOREIGN KEY (packet_id, candidate_id) REFERENCES packet_items (packet_id, candidate_id)
) WITHOUT ROWID;
CREATE TABLE decisions (
  seq INTEGER PRIMARY KEY,
  packet_id TEXT NOT NULL REFERENCES packets (id),
  candidate_id TEXT NOT NULL,
  verdict TEXT CHECK (verdict IN ('keep', 'reject')),
  reason TEXT CHECK (reason IN ('style', 'subject', 'motion', 'text')),
  rev INTEGER NOT NULL CHECK (rev >= 1),
  by TEXT NOT NULL CHECK (by IN ('operator', 'agent')),
  surface TEXT NOT NULL,
  at TEXT NOT NULL,
  act TEXT NOT NULL CHECK (act IN ('patch', 'undo', 'commit')),
  undoes INTEGER,
  CHECK (reason IS NULL OR verdict = 'reject'),
  CHECK ((act = 'undo') = (undoes IS NOT NULL))
);
CREATE INDEX decisions_key ON decisions (packet_id, candidate_id, seq);
CREATE INDEX decisions_rev ON decisions (packet_id, rev);
CREATE INDEX decisions_undoes ON decisions (packet_id, undoes) WHERE undoes IS NOT NULL;
CREATE TRIGGER decisions_no_update BEFORE UPDATE ON decisions BEGIN SELECT RAISE(ABORT, 'decisions are append-only'); END;
CREATE TRIGGER decisions_no_delete BEFORE DELETE ON decisions BEGIN SELECT RAISE(ABORT, 'decisions are append-only'); END;
CREATE TABLE packet_commits (
  packet_id TEXT PRIMARY KEY REFERENCES packets (id),
  ticket TEXT NOT NULL,
  result TEXT NOT NULL,
  at TEXT NOT NULL
) WITHOUT ROWID;
CREATE TRIGGER packet_commits_no_update BEFORE UPDATE ON packet_commits BEGIN SELECT RAISE(ABORT, 'a commit is final'); END;
CREATE TRIGGER packet_commits_no_delete BEFORE DELETE ON packet_commits BEGIN SELECT RAISE(ABORT, 'a commit is final'); END;`,
    },
    {
      // DECISION v2 (Phase 3). Three changes, one step:
      //   - reasons are the SOURCE's (@gt/domain/source SOURCES), so the
      //     column's CHECK against the image cull's four goes; a verdict
      //     carries a list (`reasons`, a JSON array), and the vocabulary is
      //     the driver's door, which knows the packet's source. A row written
      //     by v1 of this table reads back as `[reason]`, or `[]`: the rewrite
      //     is lossless, so the escrow is the pre-migration snapshot alone
      //     (migrations: data-migrations, "lossy transforms need escrow").
      //   - a verdict may carry a `note`; a blind pick's rows carry its
      //     `outcome`; the acts gain `open` (v1's verdicts imported when a
      //     packet is opened, not undoable) and `pick`.
      //   - two new tables: what a returned review was sent back with, and the
      //     apply outbox (Phase 3 decision 2) - one row per committed or
      //     returned packet, written in that act's transaction.
      // SQLite cannot drop a CHECK, so `decisions` is rebuilt and renamed;
      // nothing holds a foreign key to it, and DROP TABLE fires no DELETE
      // trigger, so the append-only triggers are recreated on the new table.
      version: 2,
      sql: `
CREATE TABLE decisions_v2 (
  seq INTEGER PRIMARY KEY,
  packet_id TEXT NOT NULL REFERENCES packets (id),
  candidate_id TEXT NOT NULL,
  verdict TEXT CHECK (verdict IN ('keep', 'reject')),
  reasons TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reasons) AND json_type(reasons) = 'array'),
  note TEXT,
  rev INTEGER NOT NULL CHECK (rev >= 1),
  by TEXT NOT NULL CHECK (by IN ('operator', 'agent')),
  surface TEXT NOT NULL,
  at TEXT NOT NULL,
  act TEXT NOT NULL CHECK (act IN ('open', 'patch', 'pick', 'undo', 'commit')),
  undoes INTEGER,
  outcome TEXT CHECK (outcome IN ('a', 'b', 'tie', 'both-bad')),
  CHECK (reasons = '[]' OR verdict = 'reject'),
  CHECK (note IS NULL OR verdict IS NOT NULL),
  CHECK ((act = 'undo') = (undoes IS NOT NULL)),
  CHECK ((act = 'pick') = (outcome IS NOT NULL))
);
INSERT INTO decisions_v2 (seq, packet_id, candidate_id, verdict, reasons, note, rev, by, surface, at, act, undoes, outcome)
  SELECT seq, packet_id, candidate_id, verdict, CASE WHEN reason IS NULL THEN '[]' ELSE json_array(reason) END, NULL, rev, by, surface, at, act, undoes, NULL
    FROM decisions ORDER BY seq;
DROP TABLE decisions;
ALTER TABLE decisions_v2 RENAME TO decisions;
CREATE INDEX decisions_key ON decisions (packet_id, candidate_id, seq);
CREATE INDEX decisions_rev ON decisions (packet_id, rev);
CREATE INDEX decisions_undoes ON decisions (packet_id, undoes) WHERE undoes IS NOT NULL;
CREATE TRIGGER decisions_no_update BEFORE UPDATE ON decisions BEGIN SELECT RAISE(ABORT, 'decisions are append-only'); END;
CREATE TRIGGER decisions_no_delete BEFORE DELETE ON decisions BEGIN SELECT RAISE(ABORT, 'decisions are append-only'); END;
CREATE TABLE packet_returns (
  packet_id TEXT PRIMARY KEY REFERENCES packets (id),
  ticket TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (json_valid(plan)),
  rev INTEGER NOT NULL,
  at TEXT NOT NULL
) WITHOUT ROWID;
CREATE TRIGGER packet_returns_no_update BEFORE UPDATE ON packet_returns BEGIN SELECT RAISE(ABORT, 'a return is final'); END;
CREATE TRIGGER packet_returns_no_delete BEFORE DELETE ON packet_returns BEGIN SELECT RAISE(ABORT, 'a return is final'); END;
CREATE TABLE packet_applies (
  packet_id TEXT PRIMARY KEY REFERENCES packets (id),
  act TEXT NOT NULL CHECK (act IN ('commit', 'return')),
  ticket TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'applied', 'stuck')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  next_at TEXT NOT NULL,
  holder TEXT,
  lease_until TEXT,
  created_at TEXT NOT NULL,
  done_at TEXT,
  CHECK ((holder IS NULL) = (lease_until IS NULL)),
  CHECK (state = 'pending' OR holder IS NULL),
  CHECK ((state = 'pending') = (done_at IS NULL))
) WITHOUT ROWID;
CREATE INDEX packet_applies_due ON packet_applies (state, next_at);`,
    },
  ],
};

/** One stored decision row, as the door reads it back. `reasons` is still the
 *  column's JSON text here; readDecisionRow parses it through the JSON door. */
const decisionRow = z.object({
  seq: z.number().int().positive(),
  packet_id: packetIdSchema,
  candidate_id: candidateIdSchema,
  verdict: z.enum(["keep", "reject"]).nullable(),
  reasons: z.string(),
  note: z.string().nullable(),
  rev: z.number().int().positive(),
  by: z.enum(["operator", "agent"]),
  surface: z.string(),
  at: z.string(),
  act: z.enum(["open", "patch", "pick", "undo", "commit"]),
  undoes: z.number().int().positive().nullable(),
  outcome: pickOutcomeSchema.nullable(),
});
export type DecisionRow = Omit<z.output<typeof decisionRow>, "reasons"> & { readonly reasons: readonly string[] };
export type Act = DecisionRow["act"];

export const DECISION_COLUMNS = "seq, packet_id, candidate_id, verdict, reasons, note, rev, by, surface, at, act, undoes, outcome";

const reasonsSchema = z.array(z.string().min(1));

export function readDecisionRow(row: Row): Result<DecisionRow> {
  const r = parseAt("decision row", decisionRow, row);
  if (!r.ok) return r;
  const reasons = parseJsonAt("decision reasons", reasonsSchema, r.value.reasons);
  if (!reasons.ok) return reasons;
  return ok({ ...r.value, reasons: reasons.value });
}

/** A stored row as the domain record. The domain schema re-checks the reject rule. */
export function toDecision(d: DecisionRow): Result<Decision> {
  const shaped: Record<string, unknown> = {
    key: decisionKey(d.packet_id, d.candidate_id),
    verdict: d.verdict,
    reasons: d.reasons,
    rev: d.rev,
    by: d.by,
    surface: d.surface,
    at: d.at,
  };
  if (d.note !== null) shaped["note"] = d.note;
  return parseAt("decision", decisionSchema, shaped);
}

const packetHead = z.object({
  id: packetIdSchema,
  source: packetSourceSchema,
  mode: z.enum(["matrix-cull", "blind-pair", "packet-review"]),
  state: z.enum(["open", "committed", "returned"]),
  rev: z.number().int().nonnegative(),
  body: z.string(),
});
export type PacketHead = z.output<typeof packetHead>;

export function readPacketHead(row: Row): Result<PacketHead> {
  return parseAt("packet row", packetHead, row);
}

const itemRow = z.object({ candidate_id: candidateIdSchema, row: z.string().nullable() });
export type ItemRow = z.output<typeof itemRow>;

export function readItemRow(row: Row): Result<ItemRow> {
  return parseAt("packet item row", itemRow, row);
}

/** `<packetId>::<candidateId>` split at the FIRST `::` (packet ids never carry one). */
export function splitKey(key: string): { packet: string; candidate: string } | undefined {
  const at = key.indexOf("::");
  if (at <= 0 || at + 2 >= key.length) return undefined;
  return { packet: key.slice(0, at), candidate: key.slice(at + 2) };
}

export type { CandidateId, PacketId };
