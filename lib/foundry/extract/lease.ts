// THE DRIVER LEASE — which driver could act on a run, BEFORE PHASE 4.
//
// Since L29 a run is driven by its kernel job, whose slot lease is fenced
// (lib/producers/extract.ts), and nothing stamps `m.lease` any more. These
// functions remain for the manifests stamped before that: the ledger's v1
// reader (lib/ledger/v1/sources/extract.ts) reads a run with no `job` by them.
//
// Its own file so the expiry rule is readable on its own. The client reads the
// same pure functions (see the comment on activeLease), which is why they take
// the manifest and a clock and touch nothing else.

import type { ExtractManifest } from "./types";

/* ── The driver lease ─────────────────────────────────────────────────────── */

/** How long a driver's stamp is trusted. A unit is at most one generate
 *  (≤180 s) plus one recognise (≤120 s); a stamp older than this belongs to a
 *  driver that died mid-unit, and the run may be taken over. */
export const LEASE_TTL_MS = 6 * 60_000;

/** The lease currently in force, or null when there is none, it has expired,
 *  or the run is finished. Pure; the client reads it too. */
export function activeLease(m: ExtractManifest, nowMs: number): { owner: string; at: string } | null {
  if (!m.lease) return null;
  if (m.status === "done" || m.status === "failed" || m.status === "committed") return null;
  const at = Date.parse(m.lease.at);
  if (!Number.isFinite(at) || nowMs - at > LEASE_TTL_MS) return null;
  return m.lease;
}

/** Is someone ELSE driving this run right now? */
export function foreignLease(m: ExtractManifest, owner: string, nowMs: number): { owner: string; at: string } | null {
  const l = activeLease(m, nowMs);
  return l && l.owner !== owner ? l : null;
}
