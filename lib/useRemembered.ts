"use client";

// A REMEMBERED CHOICE — which section was left open, which tab was last in front,
// which kind was picked — kept across reloads, and the one place that does so.
//
// Every surface that wants "open where I left it" would otherwise write its own
// localStorage key, and each new key is a writer the identity-eviction owner has
// to be told about (lib/identityEviction.ts, held by the walk in
// tests/golden-path/identity-and-writes.probe.spec.ts). So there is ONE record,
// `gravitone.ui.v1`, a flat map of short string values, and it is on the
// eviction list: cleared wholesale on any identity flip, like the job tray. A
// remembered key may name a project id, and a project id is the previous
// account's. Over-wiping costs a section that re-opens closed; under-wiping is a
// disclosure. Same asymmetry the owner's header writes down.
//
// HYDRATION-SAFE by construction: `useSyncExternalStore` with a server snapshot
// of "nothing remembered", so the server and the first client render agree on
// the fallback, and the remembered value lands in the commit after — no
// setState-in-an-effect, no mismatch warning.
//
// STORAGE MAY BE ABSENT OR FULL (a private window, a blocked site, a quota). Every
// touch is wrapped; when a write fails the map is kept in memory for this tab so
// the control still works, it just does not survive the reload. A choice is a
// convenience, never data: nothing here may throw into a render.

import { useCallback, useState, useSyncExternalStore } from "react";

/** The one localStorage key. Listed by name in lib/identityEviction.ts. */
export const REMEMBERED_KEY = "gravitone.ui.v1";

type Bag = Record<string, string>;

/** Set once a write has failed: from then on this tab reads its own memory. */
let memory: Bag | null = null;
const listeners = new Set<() => void>();

function parse(raw: string | null): Bag {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Bag) : {};
  } catch {
    return {};
  }
}

function readBag(): Bag {
  if (memory) return memory;
  try {
    return parse(localStorage.getItem(REMEMBERED_KEY));
  } catch {
    return {};
  }
}

function emit() {
  for (const l of listeners) l();
}

function writeValue(key: string, value: string | null) {
  const next = { ...readBag() };
  if (value === null) delete next[key];
  else next[key] = value;
  if (memory) memory = next;
  else {
    try {
      localStorage.setItem(REMEMBERED_KEY, JSON.stringify(next));
    } catch {
      memory = next;
    }
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab of this profile wrote or cleared the record (an eviction in a
  // second tab is the case that matters).
  const onStorage = (e: StorageEvent) => {
    if (e.key === REMEMBERED_KEY || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Drop every remembered choice, stored and in memory. The eviction owner calls
 *  this beside removing the key, so a tab whose storage had failed does not
 *  carry the previous account's choices in memory. */
export function forgetRemembered(): void {
  memory = null;
  try {
    localStorage.removeItem(REMEMBERED_KEY);
  } catch {
    /* nothing stored to remove */
  }
  emit();
}

const serverSnapshot = () => undefined;

/**
 * `const [tab, setTab] = useRemembered("library.module", "styles", MODULE_IDS)`.
 *
 * With `key` undefined it is a plain `useState(fallback)` — so a caller can make
 * remembering optional without a second code path. `allowed`, when given, is
 * the set of values the caller can render: a remembered value from an older
 * build that is no longer one of them reads as the fallback instead of a tab
 * that does not exist.
 */
export function useRemembered<T extends string>(
  key: string | undefined,
  fallback: T,
  allowed?: readonly T[],
): [T, (next: T) => void] {
  const [local, setLocal] = useState<T>(fallback);
  const stored = useSyncExternalStore(
    subscribe,
    () => (key ? readBag()[key] : undefined),
    serverSnapshot,
  );
  const valid = stored !== undefined && (!allowed || (allowed as readonly string[]).includes(stored));
  const value = key ? (valid ? (stored as T) : fallback) : local;
  const set = useCallback(
    (next: T) => {
      if (key) writeValue(key, next);
      else setLocal(next);
    },
    [key],
  );
  return [value, set];
}
