import type { Decision } from "@gt/domain/decision";
import { canonical, sha256Hex } from "../canonical.ts";

// THE PREVIEW TOKEN - what pins a commit to the blast radius the operator saw.
//
// v1's token was the verdict revision (lib/foundry/store.ts commitRun's
// `expectRev`, compared before the plan ran). It caught a verdict that moved
// after the preview; it could not catch v1's side moving under an unchanged
// map - a plate deleted by another commit, a catalogue row another run
// promoted - and then the commit did something the preview never showed.
// Here the token covers both halves: the decisions the commit will apply, and
// a digest of the v1 state the adapter planned from (its own reads, hashed by
// the adapter; the kernel never reads v1).
//
// What it deliberately does NOT cover: `rev`, `at`, `by`, `surface`. An undo
// and a redo that land on the same verdicts leave the blast radius the same,
// so they leave the token the same; a token over the revision would refuse a
// commit whose preview is still exactly true.

/** The decisions as they bear on what a commit does, key-sorted. */
function bearing(decisions: readonly Decision[]): unknown[] {
  return [...decisions]
    .filter((d) => d.verdict !== null)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((d) => (d.note === undefined ? { key: d.key, verdict: d.verdict, reasons: d.reasons } : { key: d.key, verdict: d.verdict, reasons: d.reasons, note: d.note }));
}

/** sha-256 over the canonical JSON (RFC 8785, canonical.ts) of the bearing decisions and the v1 digest. */
export function consequenceToken(decisions: readonly Decision[], v1Digest: string): string {
  return sha256Hex(canonical({ decisions: bearing(decisions), v1: v1Digest }));
}
