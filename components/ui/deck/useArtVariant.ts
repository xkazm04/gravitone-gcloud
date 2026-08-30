"use client";

// Which art the deck draws on its cards — a PROTOTYPE control for the art
// bake-off (WP2 decides the winner; this is how the operator compares).
//
// The choice is global and persisted per browser, because comparing variants
// means flipping one switch and walking the same wizard again — a per-card or
// per-stage setting would make the comparison the user's bookkeeping problem.
//
// Held in a module-level store read through useSyncExternalStore rather than
// useState + effect, for two reasons that are both this repo's:
//  · every DeckCard on screen reads the variant, and they must all flip on the
//    same commit — a per-component useState seeded from localStorage would
//    leave already-mounted cards on the old value;
//  · the lint ratchet froze the `react-hooks/set-state-in-effect` bucket, and
//    "read localStorage in an effect, then setState" is exactly that shape.
//    A snapshot store needs no effect at all.
//
// localStorage is guarded try/catch both ways: storage off (private mode) means
// the default stands for this session, silently — the switcher still works, it
// just does not survive a reload, which is the honest degradation.

import { useSyncExternalStore } from "react";

export type ArtVariant = "gradient" | "illustrated" | "emblem";

export const ART_VARIANTS: readonly ArtVariant[] = ["gradient", "illustrated", "emblem"];

const KEY = "gravitone.deck.art";
const DEFAULT: ArtVariant = "gradient";

function isVariant(v: unknown): v is ArtVariant {
  return (ART_VARIANTS as readonly unknown[]).includes(v);
}

/** null until first read — the store is lazy so importing this module never
 *  touches localStorage during SSR/module evaluation. */
let cached: ArtVariant | null = null;
const listeners = new Set<() => void>();

function snapshot(): ArtVariant {
  if (cached === null) {
    cached = DEFAULT;
    try {
      const stored = localStorage.getItem(KEY);
      if (isVariant(stored)) cached = stored;
    } catch {
      /* storage off — the default stands */
    }
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setVariant(next: ArtVariant): void {
  if (cached === next) return;
  cached = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* storage off — the choice lives for this session only */
  }
  listeners.forEach((l) => l());
}

/** The current art variant and its setter. Server snapshot is the default, so
 *  a stored non-default value applies in the post-hydration render — the
 *  standard useSyncExternalStore contract, no mismatch. */
export function useArtVariant(): readonly [ArtVariant, (v: ArtVariant) => void] {
  const variant = useSyncExternalStore(subscribe, snapshot, () => DEFAULT);
  return [variant, setVariant] as const;
}
