// THE ANNEX — the Library facts the sound store has no field for, kept per
// account in this browser (./soundAdapter.ts says which seven, and why).
//
// One localStorage key per account, `gravitone.audio-annex.${uid}`. It is on
// lib/identityEviction.ts#userScopedLocalKeys, and the identity probe holds
// this file to that list: a reference link or a draft link is one account's
// work and does not survive into the next account on a shared machine.
//
// Absent or unreadable is an empty annex — the takes still list, play and
// judge; only the reference / round / draft facts are missing, and the Library
// already draws each of those as absent.

import type { Annex, AnnexMap } from "./soundAdapter";

const annexKey = (uid: string) => `gravitone.audio-annex.${uid}`;

export function loadAnnex(uid: string): AnnexMap {
  try {
    const raw = localStorage.getItem(annexKey(uid));
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as AnnexMap) : {};
  } catch {
    return {};
  }
}

/** Merge entries into the stored annex. Returns null on success, or the
 *  sentence the page shows when the browser refused. Empty entries are not
 *  written — most takes have nothing to annex. */
export function mergeAnnex(uid: string, entries: Record<string, Annex>): string | null {
  const next = loadAnnex(uid);
  let changed = false;
  for (const [id, a] of Object.entries(entries)) {
    if (!Object.keys(a).length) continue;
    next[id] = { ...(next[id] ?? {}), ...a };
    changed = true;
  }
  if (!changed) return null;
  try {
    localStorage.setItem(annexKey(uid), JSON.stringify(next));
    return null;
  } catch {
    return "This browser's storage is full; a reference or draft link is held in memory only and a reload would lose it.";
  }
}
