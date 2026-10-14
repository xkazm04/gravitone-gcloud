import { z } from "zod";
import { parseAt } from "@gt/domain/door";
import { type Decision, decisionKey, decisionSchema } from "@gt/domain/decision";
import { candidateIdSchema, packetIdSchema, type CandidateId, type PacketId } from "@gt/domain/ids";
import type { Result } from "@gt/domain/errors";
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
  ],
};

/** One stored decision row, as the door reads it back. */
const decisionRow = z.object({
  seq: z.number().int().positive(),
  packet_id: packetIdSchema,
  candidate_id: candidateIdSchema,
  verdict: z.enum(["keep", "reject"]).nullable(),
  reason: z.enum(["style", "subject", "motion", "text"]).nullable(),
  rev: z.number().int().positive(),
  by: z.enum(["operator", "agent"]),
  surface: z.string(),
  at: z.string(),
  act: z.enum(["patch", "undo", "commit"]),
  undoes: z.number().int().positive().nullable(),
});
export type DecisionRow = z.output<typeof decisionRow>;

export const DECISION_COLUMNS = "seq, packet_id, candidate_id, verdict, reason, rev, by, surface, at, act, undoes";

export function readDecisionRow(row: Row): Result<DecisionRow> {
  return parseAt("decision row", decisionRow, row);
}

/** A stored row as the domain record. The domain schema re-checks the reason rule. */
export function toDecision(d: DecisionRow): Result<Decision> {
  const shaped: Record<string, unknown> = {
    key: decisionKey(d.packet_id, d.candidate_id),
    verdict: d.verdict,
    rev: d.rev,
    by: d.by,
    surface: d.surface,
    at: d.at,
  };
  if (d.reason !== null) shaped["reason"] = d.reason;
  return parseAt("decision", decisionSchema, shaped);
}

const packetHead = z.object({
  id: packetIdSchema,
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
