import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { ok, type Result } from "@gt/domain/errors";
import type { Reader, Store } from "../store.ts";

// AUDIO MEASURES, BESIDE THE MEDIA FACTS (Phase 6, L60) - what an audio blob IS, measured once
// when it enters: 120 waveform peaks, the decoded length, RMS energy, and for music a tempo and a
// key. One row per blob sha, like `media_facts`, written by the same free media-facts job
// (lib/producers/media-facts.ts runs the measure pass after the probe pass).
//
// v1 measured in the browser on first open and PATCHed the take (app/playground/shared/
// measure.ts), so a take nobody opened drew a ghost waveform in the Library forever, and the
// brief-vs-measured comparison had no input. Here the measure is a fact of the bytes, and the
// Library detail (./detail.ts) and the Arrange board read it from this table.
//
// A blob the decoder could not read is a ROW too (`error` set, figures null), so it is not
// decoded again on every run - the media_facts rule.
//
// THE MIGRATION ALSO CLEARS EVERY AUDIO ROW OF media_facts: the job is queued only for blobs with
// no facts (packages/producers/src/media-facts/run.ts `queueFacts`), so the audio already probed
// would never be measured. Facts are derived and the job is free and local; the next sync
// re-probes them and measures them in the same run.

export const MEASURES_DDL = `
CREATE TABLE audio_measures (
  sha TEXT PRIMARY KEY,
  peaks TEXT NOT NULL,
  energy REAL CHECK (energy IS NULL OR (energy >= 0 AND energy <= 1)),
  duration_s REAL CHECK (duration_s IS NULL OR duration_s >= 0),
  tempo_bpm REAL,
  music_key TEXT,
  measured_at TEXT NOT NULL,
  error TEXT
) WITHOUT ROWID;
DELETE FROM media_facts WHERE mime LIKE 'audio/%';`;

// v4: THE SIDECAR'S FIVE (lib/audio/sidecar.ts `measureFile`, pipeline/audio/sidecar.py) - BS.1770
// integrated loudness, 4x-oversampled true peak, EBU Tech 3342 loudness range, clipped frames and
// the trailing silence. NULL is "the sidecar has not measured these bytes" (no Python on the box,
// a module missing, a row from before v4), never a figure: `clipped_samples` is the marker,
// because a measured file always has a count while a silent one has no loudness and no peak.
export const LOUDNESS_DDL = `
ALTER TABLE audio_measures ADD COLUMN lufs REAL;
ALTER TABLE audio_measures ADD COLUMN true_peak_db REAL;
ALTER TABLE audio_measures ADD COLUMN lra REAL CHECK (lra IS NULL OR lra >= 0);
ALTER TABLE audio_measures ADD COLUMN clipped_samples INTEGER CHECK (clipped_samples IS NULL OR clipped_samples >= 0);
ALTER TABLE audio_measures ADD COLUMN tail_silence_s REAL CHECK (tail_silence_s IS NULL OR tail_silence_s >= 0);`;

const peaksSchema = z.array(z.number().min(0).max(1)).max(4096);

export const audioMeasureSchema = z.object({
  sha: z.string().regex(/^[0-9a-f]{64}$/),
  peaks: peaksSchema,
  energy: z.number().min(0).max(1).nullable(),
  durationS: z.number().nonnegative().nullable(),
  tempoBpm: z.number().positive().nullable(),
  key: z.string().min(1).max(40).nullable(),
  measuredAt: z.string().min(1),
  /** The decoder's words when the blob could not be measured; every figure is then null. */
  error: z.string().min(1).nullable(),
  // v4, the sidecar's figures; absent or null = not measured by the sidecar.
  lufs: z.number().nullable().optional(),
  truePeakDb: z.number().nullable().optional(),
  lra: z.number().nonnegative().nullable().optional(),
  clippedSamples: z.number().int().nonnegative().nullable().optional(),
  tailSilenceS: z.number().nonnegative().nullable().optional(),
});
export type AudioMeasureRow = z.output<typeof audioMeasureSchema>;

export function putAudioMeasures(store: Store, rows: readonly AudioMeasureRow[]): Result<number> {
  const checked: AudioMeasureRow[] = [];
  for (const r of rows) {
    const p = parseAt("audio measure", audioMeasureSchema, r);
    if (!p.ok) return p;
    checked.push(p.value);
  }
  return store.tx((t) => {
    for (const m of checked) {
      t.run(
        `INSERT INTO audio_measures (sha, peaks, energy, duration_s, tempo_bpm, music_key, measured_at, error, lufs, true_peak_db, lra, clipped_samples, tail_silence_s)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (sha) DO UPDATE SET peaks = excluded.peaks, energy = excluded.energy, duration_s = excluded.duration_s, tempo_bpm = excluded.tempo_bpm,
           music_key = excluded.music_key, measured_at = excluded.measured_at, error = excluded.error, lufs = excluded.lufs, true_peak_db = excluded.true_peak_db,
           lra = excluded.lra, clipped_samples = excluded.clipped_samples, tail_silence_s = excluded.tail_silence_s`,
        m.sha,
        JSON.stringify(m.peaks),
        m.energy,
        m.durationS,
        m.tempoBpm,
        m.key,
        m.measuredAt,
        m.error,
        m.lufs ?? null,
        m.truePeakDb ?? null,
        m.lra ?? null,
        m.clippedSamples ?? null,
        m.tailSilenceS ?? null,
      );
    }
    return checked.length;
  });
}

export type MeasureWanted = { readonly sha: string; readonly mime: string; readonly music: boolean };

/**
 * Audio blobs an item points at, that decode (their media facts say so) and have no measure yet.
 * `music` is true when any item over the blob is a music take: tempo and key are measured for
 * music only.
 */
export function measuresMissing(store: Store, limit: number): Result<MeasureWanted[]> {
  return store.read((r) =>
    r
      .all(
        `SELECT d.media_sha AS sha, max(d.media_mime) AS mime, max(coalesce(json_extract(d.record, '$.item.vocabulary.type'), '') = 'music') AS music
           FROM library_docs d JOIN media_facts f ON f.sha = d.media_sha AND f.decodable = 1
          WHERE d.media_mime LIKE 'audio/%' AND NOT EXISTS (SELECT 1 FROM audio_measures m WHERE m.sha = d.media_sha)
          GROUP BY d.media_sha LIMIT ?`,
        limit,
      )
      .map((row) => ({ sha: String(row["sha"]), mime: String(row["mime"] ?? "audio/*"), music: Number(row["music"]) === 1 })),
  );
}

/** The sidecar's five for one blob, as `putLoudness` writes them over an existing measure row. */
export type AudioLoudness = {
  readonly sha: string;
  readonly lufs: number | null;
  readonly truePeakDb: number | null;
  readonly lra: number | null;
  readonly clippedSamples: number;
  readonly tailSilenceS: number;
};

const loudnessSchema = z.object({
  sha: z.string().regex(/^[0-9a-f]{64}$/),
  lufs: z.number().nullable(),
  truePeakDb: z.number().nullable(),
  lra: z.number().nonnegative().nullable(),
  clippedSamples: z.number().int().nonnegative(),
  tailSilenceS: z.number().nonnegative(),
});

/**
 * Measured rows the sidecar has not: decoded without error, `clipped_samples` NULL (a row from
 * before v4, or one landed while the sidecar was unavailable). The measure pass backfills them,
 * so installing the sidecar's requirements is enough for the shelf to gain its loudness.
 */
export function loudnessMissing(store: Store, limit: number): Result<{ readonly sha: string; readonly mime: string }[]> {
  return store.read((r) =>
    r
      .all(
        `SELECT m.sha AS sha, max(d.media_mime) AS mime FROM audio_measures m JOIN library_docs d ON d.media_sha = m.sha
          WHERE m.error IS NULL AND m.clipped_samples IS NULL GROUP BY m.sha LIMIT ?`,
        limit,
      )
      .map((row) => ({ sha: String(row["sha"]), mime: String(row["mime"] ?? "audio/*") })),
  );
}

/** Write the sidecar's five over measure rows that exist; a sha with no row is not invented. */
export function putLoudness(store: Store, rows: readonly AudioLoudness[]): Result<number> {
  const checked: AudioLoudness[] = [];
  for (const r of rows) {
    const p = parseAt("audio loudness", loudnessSchema, r);
    if (!p.ok) return p;
    checked.push(p.value);
  }
  return store.tx((t) => {
    let n = 0;
    for (const m of checked)
      n += t.run("UPDATE audio_measures SET lufs = ?, true_peak_db = ?, lra = ?, clipped_samples = ?, tail_silence_s = ? WHERE sha = ?", m.lufs, m.truePeakDb, m.lra, m.clippedSamples, m.tailSilenceS, m.sha).changes;
    return n;
  });
}

const rowSchema = z.object({
  sha: z.string(),
  peaks: z.string(),
  energy: z.number().nullable(),
  duration_s: z.number().nullable(),
  tempo_bpm: z.number().nullable(),
  music_key: z.string().nullable(),
  measured_at: z.string(),
  error: z.string().nullable(),
  lufs: z.number().nullable(),
  true_peak_db: z.number().nullable(),
  lra: z.number().nullable(),
  clipped_samples: z.number().nullable(),
  tail_silence_s: z.number().nullable(),
});

const COLUMNS = "m.sha, m.peaks, m.energy, m.duration_s, m.tempo_bpm, m.music_key, m.measured_at, m.error, m.lufs, m.true_peak_db, m.lra, m.clipped_samples, m.tail_silence_s";

function measureOf(row: Record<string, unknown>): AudioMeasureRow {
  const p = parseAt("audio measure row", rowSchema, row);
  if (!p.ok) throw p.error;
  const peaks = parseJsonAt(`audio measure ${p.value.sha.slice(0, 12)} peaks`, peaksSchema, p.value.peaks);
  if (!peaks.ok) throw peaks.error;
  const v = p.value;
  return {
    sha: v.sha,
    peaks: peaks.value,
    energy: v.energy,
    durationS: v.duration_s,
    tempoBpm: v.tempo_bpm,
    key: v.music_key,
    measuredAt: v.measured_at,
    error: v.error,
    lufs: v.lufs,
    truePeakDb: v.true_peak_db,
    lra: v.lra,
    clippedSamples: v.clipped_samples,
    tailSilenceS: v.tail_silence_s,
  };
}

/** A blob's measure, or null when it was never measured. */
export function readMeasure(r: Reader, sha: string): AudioMeasureRow | null {
  const row = r.get(`SELECT ${COLUMNS} FROM audio_measures m WHERE m.sha = ?`, sha);
  return row === undefined ? null : measureOf(row);
}

/** The measures of Library items by item id (`audio:<takeId>`), for the ones that have one. */
export function measuresByItem(store: Store, itemIds: readonly string[]): Result<ReadonlyMap<string, AudioMeasureRow>> {
  if (itemIds.length === 0) return ok(new Map());
  return store.read((r) => {
    const out = new Map<string, AudioMeasureRow>();
    // Chunked under SQLite's bound-parameter ceiling.
    for (let i = 0; i < itemIds.length; i += 500) {
      const ids = itemIds.slice(i, i + 500);
      const rows = r.all(`SELECT d.id AS item_id, ${COLUMNS} FROM library_docs d JOIN audio_measures m ON m.sha = d.media_sha WHERE d.id IN (${ids.map(() => "?").join(", ")})`, ...ids);
      for (const row of rows) out.set(String(row["item_id"]), measureOf(row));
    }
    return out;
  });
}

type Measured = { readonly tempoBpm: number | null; readonly key: string | null; readonly durationS: number | null; readonly lufs: number | null; readonly truePeakDb: number | null; readonly energy: number | null };
type AudioPanel = { readonly peaks: readonly number[]; readonly facts: { readonly asked: unknown; readonly measured: Measured | null } };

/**
 * The detail's audio panel with the ingest measure laid over what the take carried: the measure
 * is the bytes the Library holds, so its figures win - loudness and true peak too, once the
 * sidecar has measured them (v4); what it has not measured and what an unmeasured blob lacks
 * stay the take's own. A failed measure changes nothing.
 */
export function withMeasure<A extends AudioPanel>(audio: A, m: AudioMeasureRow | null): A {
  if (m === null || m.error !== null) return audio;
  const base = audio.facts.measured;
  const measured: Measured = {
    tempoBpm: m.tempoBpm ?? base?.tempoBpm ?? null,
    key: m.key ?? base?.key ?? null,
    durationS: m.durationS ?? base?.durationS ?? null,
    lufs: m.lufs ?? base?.lufs ?? null,
    truePeakDb: m.truePeakDb ?? base?.truePeakDb ?? null,
    energy: m.energy ?? base?.energy ?? null,
  };
  return { ...audio, peaks: m.peaks.length > 0 ? m.peaks : audio.peaks, facts: { ...audio.facts, measured } };
}
