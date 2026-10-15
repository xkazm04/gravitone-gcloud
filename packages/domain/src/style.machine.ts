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
 * Nothing in v1 ever demotes. `locked` is new: the operator pins a proven
 * recipe so a later commit cannot rewrite what projects already render with
 * (the prototype shows proven styles on the shelf as "locked"); unlocking
 * returns it to proven, never below.
 */
export const styleMachine = defineMachine({
  candidate: ["proven"],
  proven: ["locked"],
  locked: ["proven"],
});
export type StyleStatus = (typeof styleMachine.states)[number];
