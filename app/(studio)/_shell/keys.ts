// EVERY BROWSER-STORAGE KEY THE NEW WORLD WRITES. The list IS the store (@gt/ui/storage
// store.ts): a key not registered here cannot be written, so `evict("identity")` cannot miss
// one. A screen that needs a remembered choice adds its KeyDef here, in the same change,
// with its scope and its reason; there is no other door to localStorage in `(studio)`.
//
// v1 kept this list by hand beside 10 raw writers and a walk probe that nagged the two into
// agreement (lib/identityEviction.ts, tests/golden-path/identity-and-writes). Here the
// registration is the only write path, so the agreement is structural.

// zod/mini, not classic zod: this file is in the shell's client bundle (see @gt/domain/door).
import { int, minLength, nonnegative, string } from "zod/mini";
import { defineKey, type KeyDef } from "@gt/ui/storage/store";

/**
 * Who this browser last saw signed in to the new world, by durable uid. Compared on every
 * shell mount (`identityFlip`), so an account switch that happened while the tab was
 * closed - another person signing in on this machine - still evicts the previous person's
 * keys before the first screen reads one.
 */
export const LAST_IDENTITY = defineKey({
  key: "gravitone.next.identity",
  scope: "device",
  schema: string().check(minLength(1)),
  why: "the eviction trigger itself: it must outlive the identity it records, or no flip could ever be seen",
});

/**
 * The ledger seq the operator last saw: the header's `ledger +N` counts the acts after it, and
 * visiting the Ledger moves it to the head (app-shell badge-and-attention: a newness badge
 * stores its mark in owned state and clears on exposure). Identity-scoped: another person on
 * this machine has not seen what this one saw.
 */
export const LEDGER_SEEN = defineKey({
  key: "gravitone.next.ledger-seen",
  scope: "identity",
  schema: int().check(nonnegative()),
  why: "the header's ledger delta counts acts after this seq; the Ledger visit moves it",
});

export const KEYS: readonly KeyDef[] = [LAST_IDENTITY, LEDGER_SEEN];
