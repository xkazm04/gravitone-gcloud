// THE AGENT DOOR'S WIRE WORDS (spark athena-control-mcp) - what /api/mcp publishes and what an agent's
// spend request is. zod-free like ./source.ts: the tool registry (app/_server/mcp/) holds the schemas,
// the kernel's spend-request store (@gt/kernel/spend-requests/store) holds the rows, and both read
// these types so a field renamed on one side is a compile error on the other.
//
// THE INVARIANT THE SURFACE HOLDS (registry mcp-tools / caller-differentiated-capability): an agent
// never spends. It runs dry, or live when the recomputed receipt is free (`isFreeReceipt`); any other
// live launch becomes a SpendRequest the operator confirms on the Board (`pkt:spend:<day>`).

import type { Actor } from "./event.ts";
import { SEAT_UNPRICED_REASONS } from "@gt/catalog/partOptions";

import type { ComposerInput, Receipt } from "./produce.ts";

/** The four tool families the default projection publishes, one routing tool each. */
export const MCP_FAMILIES = ["read", "launch", "job", "spend"] as const;
export type McpFamily = (typeof MCP_FAMILIES)[number];

/** `family`: one tool per family (`gt_read` + `op`). `operation`: one tool per op (`gt_read_projects`). */
export const PROJECTION_MODES = ["family", "operation"] as const;
export type ProjectionMode = (typeof PROJECTION_MODES)[number];

/** MCP tool annotations (spec 2025-06-18 ToolAnnotations); a family tool carries the most severe of its ops'. */
export type McpAnnotations = {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
};

/* ── spend requests ──────────────────────────────────────────────────────── */

export const SPEND_REQUEST_STATES = ["requested", "confirmed", "refused", "launched", "failed"] as const;
export type SpendRequestState = (typeof SPEND_REQUEST_STATES)[number];

/** The moves a request may make; every other one is refused by name (kernel spend-requests store). */
export const SPEND_TRANSITIONS: { readonly [S in SpendRequestState]: readonly SpendRequestState[] } = {
  requested: ["confirmed", "refused"],
  confirmed: ["launched", "failed"],
  refused: [],
  launched: [],
  failed: [],
};

/** What the operator is asked to pay for: a Floor run on a lane, or a project plan at one revision. */
export type SpendSubject = { readonly kind: "run"; readonly input: ComposerInput } | { readonly kind: "project"; readonly id: string; readonly rev: number };

export type SpendRequest = {
  /** `sr_` + 12 hex. */
  readonly id: string;
  /** The UTC day it was filed, `YYYY-MM-DD`: the Board packet is `pkt:spend:<day>`. */
  readonly day: string;
  /** Who asked (an agent's token name, `{kind:"agent", id:"athena"}`). */
  readonly actor: Actor;
  readonly subject: SpendSubject;
  /** The live receipt as it read when the agent asked; the Board re-prices beside it. */
  readonly receipt: Receipt;
  readonly state: SpendRequestState;
  readonly filedAt: string;
  /** The operator's reject reasons (`SOURCES.spend.reasons`) and note; present once refused. */
  readonly reasons?: readonly string[];
  readonly note?: string;
  readonly decidedAt?: string;
  /** The jobs a confirmed request launched. */
  readonly jobIds?: readonly string[];
  /** Why a confirmed request did not launch (a ceiling stop, a stale plan). */
  readonly failure?: string;
};

export const SPEND_REQUEST_ID_RE = /^sr_[0-9a-f]{12}$/;

/** The packet a day's requests are decided in. */
export const spendPacketId = (day: string): string => `pkt:spend:${day}`;

/* ── free ────────────────────────────────────────────────────────────────── */

// A seat line is the operator's subscription, not money (operator, wave 3): it counts as free. Every
// other unpriced line - Suno credits, Leonardo credits, local TTS - counts as spend (Director,
// 2026-10-24). The seat's sentences are the catalog's own (@gt/catalog/partOptions SEAT_UNPRICED_REASONS).

/** True when a live launch on this receipt costs nothing: no priced dollar, no range above zero,
 *  and every unpriced line is the Claude seat. */
export function isFreeReceipt(r: Receipt): boolean {
  if (r.totals.usd !== 0) return false;
  if ((r.totals.usdRange?.[1] ?? 0) !== 0) return false;
  return r.lines.every((l) => l.usd === 0 || (l.usd === null && l.unpricedReason !== undefined && SEAT_UNPRICED_REASONS.includes(l.unpricedReason)));
}
