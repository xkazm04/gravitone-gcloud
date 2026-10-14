// The pure half of the scope hook: the digest a stored scope was decided on, and
// whether a scope is orphaned from the notebook now being dealt.

import { fixtureSource } from "@/lib/notebook/source";
import type { ScopeStepData } from "@/lib/steps";

import type { Scope } from "./scope";

/** The record as this hook holds it: the decisions, and the digest of the
 *  notebook they were made on (`undefined` until something is stored). */
export interface Held {
  scope: Scope;
  confirmed: Scope | null;
  digest: string | undefined;
}

/** A scope decided on a notebook other than the one being dealt. */
export interface Orphan {
  /** The digest it was decided on. */
  digest: string;
  /** Cards it holds a decision for. */
  decisions: number;
}

/** The digest a stored scope was decided on. A scope with none was written
 *  before the stamp existed, and every one of those was written against the
 *  fixture — so it carries the fixture's, and keeps applying on the replay. */
export function digestOf(saved: ScopeStepData | undefined): string | undefined {
  if (!saved) return undefined;
  return saved.digest ?? fixtureSource().digest;
}

/** Is this scope ORPHANED from `digest` — decided on another notebook? A scope
 *  with nothing in it is nobody's orphan: applying it and not applying it are
 *  the same board. */
export function orphanOf(held: Held, digest: string): Orphan | null {
  if (held.digest === undefined || held.digest === digest) return null;
  const decisions = Object.keys(held.scope).length;
  if (decisions === 0 && held.confirmed === null) return null;
  return { digest: held.digest, decisions };
}

