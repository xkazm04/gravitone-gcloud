import { ok, type Result } from "@gt/domain/errors";
import type { Estimate } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { MediaFacts } from "@gt/domain/library";
import type { Actor } from "@gt/domain/event";
import type { BlobStore } from "@gt/kernel/blob";
import { enqueueIn } from "@gt/kernel/job";
import type { Producer } from "@gt/kernel/job-core";
import { factsMissing, putMediaFacts } from "@gt/kernel/library/write";
import type { Store } from "@gt/kernel/store";
import { MODEL_MIME } from "@gt/domain/library";
import { factsOf, lumaOf, meshFactsOf, type ProbeRead } from "./core.ts";
import { readGlb } from "./glb.ts";

// MEDIA FACTS, THE DRIVER - for each blob a Library item points at that has no
// facts yet: ffprobe it, cut a poster from a video (a blob of its own), average
// the image or the poster to one gray pixel, and write the row. Free and local
// (lane box.render): ffprobe/ffmpeg on this box, no vendor, no meter.
//
// The facts are written in batches through kernel library `putMediaFacts`, one
// transaction each, and the index's triggers move each item's attention in that
// same transaction. A blob that cannot be read at all is not skipped: it is a
// fact (`decodable: false`, the probe's words), so it sinks and is flagged
// instead of being probed again on every sync.

/** The three things a box must do; lib/producers/media-facts.ts binds them to ffprobe/ffmpeg. */
export type MediaProbe = {
  probe(file: string): Promise<ProbeRead>;
  /** A keyframe of a video as JPEG bytes. */
  poster(file: string): Promise<Result<Uint8Array>>;
  /** The 1x1 gray average of an image, raw (one byte). */
  luma(file: string): Promise<Result<Uint8Array>>;
};

export type FactsRun = { readonly probed: number; readonly undecodable: number; readonly failed: readonly string[] };

const BATCH = 50;

/** Probe up to `limit` blobs that lack facts. `now` is the clock (a parameter, so tests pin it). */
export async function probeMissing(store: Store, blobs: BlobStore, probe: MediaProbe, opts: { readonly limit: number; readonly now: () => Date }): Promise<Result<FactsRun>> {
  const wanted = factsMissing(store, opts.limit);
  if (!wanted.ok) return wanted;
  const out: MediaFacts[] = [];
  const failed: string[] = [];
  let undecodable = 0;
  for (const w of wanted.value) {
    const file = blobs.pathOf({ sha256: w.sha, bytes: 0, mime: w.mime });
    if (!file.ok) {
      failed.push(`${w.sha.slice(0, 12)}: ${file.error.message}`);
      continue;
    }
    if (w.mime === MODEL_MIME) {
      // A glb is read by its own header, not ffprobe; an unreadable blob is a fact like any other.
      const bytes = await blobs.read({ sha256: w.sha, bytes: 0, mime: w.mime });
      const facts = meshFactsOf({ sha: w.sha, mime: w.mime, read: bytes.ok ? readGlb(bytes.value) : { ok: false, error: bytes.error.message }, at: opts.now().toISOString() });
      if (!facts.decodable) undecodable++;
      out.push(facts);
      if (out.length >= BATCH) {
        const put = putMediaFacts(store, out.splice(0));
        if (!put.ok) return put;
      }
      continue;
    }
    const read = await probe.probe(file.value);
    let posterSha: string | null = null;
    let lumaFrom = file.value;
    if (read.ok && w.mime.startsWith("video/")) {
      const poster = await probe.poster(file.value);
      if (poster.ok) {
        const ref = await blobs.put(poster.value, "image/jpeg");
        if (ref.ok) {
          posterSha = ref.value.sha256;
          const p = blobs.pathOf(ref.value);
          if (p.ok) lumaFrom = p.value;
        }
      }
    }
    const measurable = read.ok && (w.mime.startsWith("image/") || posterSha !== null);
    const raw = measurable ? await probe.luma(lumaFrom) : null;
    const facts = factsOf({ sha: w.sha, mime: w.mime, probe: read, luma: raw !== null && raw.ok ? lumaOf(raw.value) : null, posterSha, at: opts.now().toISOString() });
    if (!facts.decodable) undecodable++;
    out.push(facts);
    if (out.length >= BATCH) {
      const put = putMediaFacts(store, out.splice(0));
      if (!put.ok) return put;
    }
  }
  if (out.length > 0) {
    const put = putMediaFacts(store, out);
    if (!put.ok) return put;
  }
  return ok({ probed: wanted.value.length - failed.length, undecodable, failed });
}

const FREE: Estimate = { seconds: 1, usd: 0 };

/** One step, `probe`, until it has an output. */
export const factsPlan: Producer["plan"] = (_job: Job, outputs) => (outputs.has("probe") ? [] : [{ name: "probe", estimate: FREE }]);

/** The producer's name, as `PRODUCERS` (@gt/domain/run) and the worker's table know it. */
export const MEDIA_FACTS = "media-facts";
/** Free and local: ffprobe/ffmpeg on this box. */
export const MEDIA_FACTS_LANE = "box.render";

/** A job that is still the operator's to see through: not done, not cancelled. A failed one
 *  waits for its retry on Runs instead of being shadowed by a fresh copy every sync. */
const OPEN = ["planned", "queued", "running", "paused", "failed", "interrupted"] as const;

export type FactsQueued =
  /** Every blob an item points at has its facts. */
  | { readonly kind: "none-missing" }
  /** A media-facts job is already open; it drains whatever is missing when it runs. */
  | { readonly kind: "open"; readonly jobId: string; readonly state: string }
  | { readonly kind: "queued"; readonly jobId: string };

/**
 * Queue the probe as a job when some item's blob has no facts and no media-facts job is open
 * (L53: the projection no longer probes inside a render request). The check and the enqueue
 * are ONE transaction, so two processes syncing at once queue one job, not two. The job runs
 * DRY: it calls no vendor, so dry and live are the same act for it, and a dry-only process
 * (every test lane) can drive it.
 */
export function queueFacts(store: Store, actor: Actor, now: () => Date): Result<FactsQueued> {
  return store.tx((t): FactsQueued => {
    const missing = t.get("SELECT 1 AS x FROM library_docs d WHERE d.media_sha IS NOT NULL AND NOT EXISTS (SELECT 1 FROM media_facts f WHERE f.sha = d.media_sha) LIMIT 1");
    if (missing === undefined) return { kind: "none-missing" };
    const open = t.get(
      `SELECT id, state FROM jobs WHERE lane = ? AND state IN (${OPEN.map(() => "?").join(", ")}) AND json_extract(record, '$.producer') = ? ORDER BY ord LIMIT 1`,
      MEDIA_FACTS_LANE,
      ...OPEN,
      MEDIA_FACTS,
    );
    if (open !== undefined) return { kind: "open", jobId: String(open["id"]), state: String(open["state"]) };
    const run = `library-facts-${now().toISOString().replace(/[^0-9]/g, "").slice(0, 17)}`;
    const job = enqueueIn(t, { id: `job:run:${run}`, of: { kind: "run", id: run }, producer: MEDIA_FACTS, lane: MEDIA_FACTS_LANE }, actor);
    return { kind: "queued", jobId: job.id };
  });
}

/**
 * The same work as a job (plan §4): one step, `probe`, that drains up to `limit`
 * blobs on the free render lane. Bound by lib/producers/registry.ts (`media-facts`
 * in BOUND) and queued by the projection (`queueFacts`); `probeMissing` in process
 * is left to the CLI's `--inline` and to tests.
 */
export function mediaFactsProducer(deps: { readonly store: Store; readonly blobs: BlobStore; readonly probe: MediaProbe; readonly limit?: number }): Producer {
  return {
    lane: MEDIA_FACTS_LANE,
    plan: factsPlan,
    async perform() {
      const r = await probeMissing(deps.store, deps.blobs, deps.probe, { limit: deps.limit ?? 500, now: () => new Date() });
      if (!r.ok) return { kind: "fatal", code: r.error.code, message: r.error.message };
      return { kind: "produced", output: { probed: r.value.probed, undecodable: r.value.undecodable, failed: [...r.value.failed] }, costUsd: 0 };
    },
  };
}
