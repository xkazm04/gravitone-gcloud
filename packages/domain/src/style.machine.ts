// THE STYLE MACHINE, zod-free: the transition table and its state union, apart from
// the record schema in ./style.ts (which re-exports both, so every existing import path holds).
// A client draws states from this table (@gt/ui status vocabulary); importing the schema
// file for it would carry zod into the browser bundle, so the table lives where only
// ./transitions.ts follows it in. tests/next-gates/client-closure.test.ts holds that line.

import { defineMachine } from "./transitions.ts";

/**
 * THE RATCHET. v1 promotes `candidate -> proven` inside the commit, and only
 * on an operator's keeps in two distinct run/scene cells (lib/foundry/store.ts:
 * "`proven` is a human's claim: a keep by:"model" is evidence, not a vote").
 * Nothing in v1 ever demotes. `locked` is the theme's lock (lib/themes.ts
 * `ratchetBlocker`: "a lock is one-way"), now on the same record: the operator
 * pins a proven look so a later write cannot change what projects render with.
 * BOTH edges are one-way (Phase 5 decision 2). The `locked -> proven` edge this
 * table carried until Phase 5 contradicted the plan's "the proven and locked
 * ratchets are kept" and v1's own lock; it is gone, so `locked` has no way out
 * and changing a locked look is a duplicate (./style.ratchet.ts says where the
 * write enforces it).
 */
export const styleMachine = defineMachine({
  candidate: ["proven"],
  proven: ["locked"],
  locked: [],
});
export type StyleStatus = (typeof styleMachine.states)[number];
