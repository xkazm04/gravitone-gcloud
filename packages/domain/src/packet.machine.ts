// THE PACKET MACHINE, zod-free: the transition table and its state union, apart from
// the record schema in ./packet.ts (which re-exports both, so every existing import path holds).
// A client draws states from this table (@gt/ui status vocabulary); importing the schema
// file for it would carry zod into the browser bundle, so the table lives where only
// ./transitions.ts follows it in. tests/next-gates/client-closure.test.ts holds that line.

import { defineMachine } from "./transitions.ts";

/**
 * Verdicts are cast while the packet is `open` (v1 lib/foundry/verdictLog.ts:
 * keyed revisioned patches, refused once the run is committed). The commit is
 * ONE act per packet and it is final — v1 deleted rejected plates and wrote
 * the catalogue in it, so there is nothing to reopen. A packet-review may
 * instead be `returned`: sent back for another turn with the operator's notes
 * (v1 articles, `awaiting-approval -> drafting`), and the next turn arrives as
 * a new packet. There is no `committing` state: v1's commit runs under one
 * lock with a write-ahead journal line, and a crash mid-commit leaves the
 * packet `open` for an idempotent retry (lib/foundry/catalogue.ts), which a
 * durable half-state would only make harder to reason about.
 */
export const packetMachine = defineMachine({
  open: ["committed", "returned"],
  committed: [],
  returned: [],
});
export type PacketState = (typeof packetMachine.states)[number];
