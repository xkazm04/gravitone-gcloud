import { ok, type Result } from "@gt/domain/errors";
import type { Estimate } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { MediaFacts } from "@gt/domain/library";
import type { BlobStore } from "@gt/kernel/blob";
import type { Producer } from "@gt/kernel/job-core";
import { factsMissing, putMediaFacts } from "@gt/kernel/library/write";
import type { Store } from "@gt/kernel/store";
import { factsOf, lumaOf, type ProbeRead } from "./core.ts";

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

/**
 * The same work as a job (plan §4): one step, `probe`, that drains up to `limit`
 * blobs on the free render lane. Registered by lib/producers/registry.ts once
 * `media-facts` is a producer name the domain knows (the Director has the lines);
 * until then the Library sync calls `probeMissing` itself, in process.
 */
export function mediaFactsProducer(deps: { readonly store: Store; readonly blobs: BlobStore; readonly probe: MediaProbe; readonly limit?: number }): Producer {
  return {
    lane: "box.render",
    plan: (_job: Job, outputs) => (outputs.has("probe") ? [] : [{ name: "probe", estimate: FREE }]),
    async perform() {
      const r = await probeMissing(deps.store, deps.blobs, deps.probe, { limit: deps.limit ?? 500, now: () => new Date() });
      if (!r.ok) return { kind: "fatal", code: r.error.code, message: r.error.message };
      return { kind: "produced", output: { probed: r.value.probed, undecodable: r.value.undecodable, failed: [...r.value.failed] }, costUsd: 0 };
    },
  };
}
