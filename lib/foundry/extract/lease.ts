// THE DRIVER LEASE — which driver could act on a run, BEFORE PHASE 4.
//
// Since L29 a run is driven by its kernel job, whose slot lease is fenced
// (lib/producers/extract.ts), and nothing stamps `m.lease` any more. These
// remain for the manifests stamped before that: the ledger's v1 reader
// (lib/ledger/v1/sources/extract.ts leaseState) reads a run with no `job` by
// LEASE_TTL_MS, and tests/next-server/v1-extract.test.ts holds its reading equal
// to activeLease on every edge. `foreignLease` (the app-vs-CLI refusal) went with
// the stamp: no driver asks who else holds a manifest any more.

import type { ExtractManifest } from "./types";

/* ── The driver lease ─────────────────────────────────────────────────────── */

/** How long a driver's stamp is trusted. A unit is at most one generate
 *  (≤180 s) plus one recognise (≤120 s); a stamp older than this belongs to a
 *  driver that died mid-unit, and the run may be taken over. */
export const LEASE_TTL_MS = 6 * 60_000;

/** The lease currently in force, or null when there is none, it has expired,
 *  or the run is finished. Pure. */
export function activeLease(m: ExtractManifest, nowMs: number): { owner: string; at: string } | null {
  if (!m.lease) return null;
  if (m.status === "done" || m.status === "failed" || m.status === "committed") return null;
  const at = Date.parse(m.lease.at);
  if (!Number.isFinite(at) || nowMs - at > LEASE_TTL_MS) return null;
  return m.lease;
}

