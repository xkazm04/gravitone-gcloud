import { z } from "zod";
import { findingSchema, triageSchema, TRIAGE_VERSION, type Triage, type TriageContext } from "@gt/domain/audio.triage";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { ok, type Result } from "@gt/domain/errors";
import { canonical, sha256Hex } from "../canonical.ts";
import type { Reader, Store } from "../store.ts";

// AUDIO TRIAGE, BESIDE THE MEASURES (kernel library v5, spark audio-triage WP3) - what the audio
// sidecar's detectors found in one take's bytes (pipeline/audio/sidecar.py `triage`, the checks
// and thresholds in @gt/domain/audio.triage), kept so the Board's audio cull can name a take's
// defects before anybody listens to it.
//
// ONE ROW PER (bytes, brief, detector version). A triage is a judgement of a file IN THE CONTEXT
// OF ITS BRIEF - the same bytes briefed as a loop are checked at their seam, briefed as a one-shot
// at their ending - so the key is the blob's sha AND the digest of the TriageContext it was judged
// against AND `TRIAGE_VERSION`. A take whose brief changes, or a detector release that bumps the
// version, simply misses its row and is triaged again; an old row is never read as the new one.
// `context_digest` is sha256 over the RFC 8785 canonical JSON of the context (../canonical.ts):
// absent keys are omitted, never null, so "not committed" hashes the same everywhere.
//
// DERIVED, like media_facts and audio_measures: every row is regenerable from the blob and the
// take that owns it, by the media-facts job's triage pass (lib/sound/measureRun.ts `triageTakes`,
// run from lib/producers/media-facts.ts after the measure pass). Dropping the table loses
// nothing a run of that job cannot re-derive. A sidecar that is not installed writes NO row (the
// pass asks again next run), and neither does a file the sidecar failed on: absence is "not
// triaged", never a clean bill.

export const TRIAGE_DDL = `
-- DERIVED: regenerable from blobs + sound takes by lib/sound/measureRun.ts triageTakes (the
-- media-facts job's triage pass). Key = the bytes, the brief they were judged against, the
-- detector version.
CREATE TABLE audio_triage (
  sha TEXT NOT NULL,
  context_digest TEXT NOT NULL,
  version INTEGER NOT NULL,
  findings TEXT NOT NULL,
  flagged INTEGER NOT NULL CHECK (flagged >= 0),
  at TEXT NOT NULL,
  PRIMARY KEY (sha, context_digest, version)
) WITHOUT ROWID;`;

/** sha256 of the canonical JSON of the brief a take is triaged against. */
export function triageDigest(context: TriageContext): string {
  return sha256Hex(canonical(context));
}

export type TriageRow = { readonly sha: string; readonly contextDigest: string; readonly triage: Triage; readonly at: string };

const rowInSchema = z.object({
  sha: z.string().regex(/^[0-9a-f]{64}$/),
  contextDigest: z.string().regex(/^[0-9a-f]{64}$/),
  triage: triageSchema,
  at: z.string().min(1),
});

/** Write triages; the same (sha, digest, version) is replaced, never duplicated. */
export function putTriage(store: Store, rows: readonly TriageRow[]): Result<number> {
  const checked: z.output<typeof rowInSchema>[] = [];
  for (const r of rows) {
    const p = parseAt("audio triage", rowInSchema, r);
    if (!p.ok) return p;
    checked.push(p.value);
  }
  return store.tx((t) => {
    for (const r of checked)
      t.run(
        `INSERT INTO audio_triage (sha, context_digest, version, findings, flagged, at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (sha, context_digest, version) DO UPDATE SET findings = excluded.findings, flagged = excluded.flagged, at = excluded.at`,
        r.sha,
        r.contextDigest,
        r.triage.version,
        JSON.stringify(r.triage.findings),
        r.triage.flagged,
        r.at,
      );
    return checked.length;
  });
}

const findingsSchema = z.array(findingSchema);

/** The current detectors' triage of these bytes against this brief, or null when there is none. */
export function readTriage(r: Reader, sha: string, contextDigest: string): Triage | null {
  const row = r.get("SELECT findings, flagged FROM audio_triage WHERE sha = ? AND context_digest = ? AND version = ?", sha, contextDigest, TRIAGE_VERSION);
  if (row === undefined) return null;
  const findings = parseJsonAt(`audio triage ${sha.slice(0, 12)} findings`, findingsSchema, String(row["findings"]));
  if (!findings.ok) throw findings.error;
  return { version: TRIAGE_VERSION, findings: findings.value, flagged: Number(row["flagged"]) };
}

/** A Library item (`audio:<takeId>`) and the digest of the brief its bytes are to be judged against. */
export type TriageWanted = { readonly itemId: string; readonly contextDigest: string };
export type TriageOwed = { readonly itemId: string; readonly contextDigest: string; readonly sha: string; readonly mime: string };

/** Under SQLite's bound-parameter ceiling: two per wanted pair. */
const CHUNK = 400;

/**
 * Of `wanted`, the items whose bytes are an audio blob the probe called decodable and that have
 * no triage for (sha, digest, TRIAGE_VERSION). Two items over the same bytes and brief are owed
 * once. An item the Library does not index, or whose media is not audio, is not owed: there are
 * no bytes to triage.
 */
export function triageMissing(store: Store, wanted: readonly TriageWanted[], limit: number): Result<TriageOwed[]> {
  if (wanted.length === 0 || limit <= 0) return ok([]);
  return store.read((r) => {
    const out: TriageOwed[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < wanted.length && out.length < limit; i += CHUNK) {
      const part = wanted.slice(i, i + CHUNK);
      const rows = r.all(
        `WITH w (id, digest, ord) AS (VALUES ${part.map(() => "(?, ?, ?)").join(", ")})
         SELECT w.id AS id, w.digest AS digest, d.media_sha AS sha, d.media_mime AS mime
           FROM w JOIN library_docs d ON d.id = w.id JOIN media_facts f ON f.sha = d.media_sha AND f.decodable = 1
          WHERE d.media_mime LIKE 'audio/%'
            AND NOT EXISTS (SELECT 1 FROM audio_triage a WHERE a.sha = d.media_sha AND a.context_digest = w.digest AND a.version = ?)
          ORDER BY w.ord`,
        ...part.flatMap((w, j) => [w.itemId, w.contextDigest, i + j]),
        TRIAGE_VERSION,
      );
      for (const row of rows) {
        const owed = { itemId: String(row["id"]), contextDigest: String(row["digest"]), sha: String(row["sha"]), mime: String(row["mime"] ?? "audio/*") };
        const key = `${owed.sha}:${owed.contextDigest}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(owed);
        if (out.length >= limit) break;
      }
    }
    return out;
  });
}
