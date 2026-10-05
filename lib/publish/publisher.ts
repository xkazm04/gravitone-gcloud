// THE PUBLISH STEP AND THE METRICS PULL — where a claimed slot becomes a
// Publication. Server-only.
//
// PORTED FROM StatReel apps/server/src/pipeline.ts publishJob() (~410-474)
// and metricsJob(). Kept: the pinned subject (a slot publishes exactly the
// export it names, never "whatever is latest"), one upload per subject and
// mode (a second click or a slot firing after a direct publish must not make a
// second video — a dry run does not block the live upload that follows it),
// the persisted resumable session (written before the first byte, removed once
// the video is recorded), privacy private, captions when a sidecar exists, and
// "dry publications have nothing to pull". Dropped: the OPA gate and the
// provenance manifest (Gravitone has neither), and the job queue — the publish
// runs in the caller's process, which is why the claim (schedule.ts) carries
// the pid that the next sweep checks.
//
// DRY MODE (the default): the YouTube client records every request it would
// make, this module writes them to plans/<slotId>.json beside the slot and
// export they describe, and the Publication is recorded `dry: true` with
// `platformVideoId: null`. No fetch is called — the client's `send()` refuses
// outside live mode, and the probe replaces globalThis.fetch to prove it.

import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";

import { youtubeEffectiveMode } from "./channels";
import { captionSidecar, getExport } from "./exports";
import { snapshotFromStatistics } from "./metrics";
import { RefreshTokenProvider } from "./oauth";
import { claimSlot, sweep, type SweepResult } from "./schedule";
import { planPath, readPublications, readSchedule, safeId, sessionPath, withStore, writeJsonAtomic } from "./store";
import type { Publication, ScheduleSlot } from "./types";
import { sha256File, YouTubeClient, type PublishMode } from "./youtube";

/** YouTube's "Music" category — every export here is a music video. */
const CATEGORY_MUSIC = "10";

export interface PublishOutcome {
  slot: ScheduleSlot;
  publication: Publication | null;
  /** the dry-run plan, when one was written */
  planFile: string | null;
}

async function readSession(slotId: string, sha256: string): Promise<string | undefined> {
  try {
    const raw = JSON.parse(await readFile(sessionPath(slotId), "utf8")) as { sessionUri?: string; sha256?: string };
    // a session for different bytes would resume the wrong upload
    return raw.sha256 === sha256 && typeof raw.sessionUri === "string" ? raw.sessionUri : undefined;
  } catch {
    return undefined;
  }
}

async function finish(slotId: string, patch: Partial<ScheduleSlot>, publication: Publication | null): Promise<ScheduleSlot> {
  return withStore(async (tx) => {
    const file = await tx.get("schedule");
    const s = file.slots.find((x) => x.id === slotId);
    delete file.claims[slotId];
    tx.touch("schedule");
    if (publication) {
      (await tx.get("publications")).publications.push(publication);
      tx.touch("publications");
    }
    if (!s) throw new Error(`slot ${slotId} vanished while it was being published`);
    Object.assign(s, patch);
    return { ...s };
  });
}

/** Publish a slot this process has ALREADY claimed (status publishing). Never
 *  throws for a publish failure: the slot is marked failed with the reason, and
 *  the outcome says so. */
export async function runClaimed(claimed: ScheduleSlot, opts: { fetch?: typeof fetch } = {}): Promise<PublishOutcome> {
  try {
    if (claimed.channelId !== "youtube") throw new Error(`${claimed.channelId} has no publishing adapter`);
    const exp = await getExport(claimed.exportId);
    if (!exp) throw new Error(`export ${claimed.exportId} no longer exists`);

    // one upload per export, channel and mode
    const mode: PublishMode = youtubeEffectiveMode();
    const dry = mode === "dry";
    const [pubs, sched] = await Promise.all([readPublications(), readSchedule()]);
    const slotById = new Map(sched.slots.map((s) => [s.id, s]));
    const prior = pubs.publications.find((p) => {
      const ps = slotById.get(p.slotId);
      return p.dry === dry && p.channelId === claimed.channelId && ps?.exportId === claimed.exportId;
    });
    if (prior) throw new Error(`export ${claimed.exportId} is already published on ${claimed.channelId} (publication ${prior.id}${dry ? ", dry" : ""})`);

    const yt = new YouTubeClient({
      mode,
      tokenProvider: mode === "live" ? RefreshTokenProvider.fromEnv(process.env, opts.fetch) : null,
      fetch: opts.fetch,
    });
    const fileSha = await sha256File(exp.path);
    const resumeSessionUri = dry ? undefined : await readSession(claimed.id, fileSha);
    const up = await yt.uploadVideo(
      {
        file: exp.path,
        title: claimed.title,
        description: claimed.description,
        tags: claimed.tags,
        privacyStatus: "private",
        // every export is generated imagery over generated or licensed music:
        // the altered-or-synthetic disclosure is true by construction
        containsSyntheticMedia: true,
        categoryId: CATEGORY_MUSIC,
      },
      {
        resumeSessionUri,
        expectedSha256: fileSha,
        onSession: (sessionUri) => writeJsonAtomic(sessionPath(claimed.id), { sessionUri, sha256: fileSha }),
      },
    );
    const captions = await captionSidecar(exp.id);
    if (captions) await yt.insertCaptions(up.id, captions, "en", "English");

    const publishedAt = new Date().toISOString();
    const publication: Publication = {
      id: `pub-${randomUUID().slice(0, 8)}`,
      slotId: claimed.id,
      channelId: claimed.channelId,
      platformVideoId: dry ? null : up.id,
      visibility: "private",
      dry,
      publishedAt,
    };
    let planFile: string | null = null;
    if (dry) {
      planFile = planPath(safeId(claimed.id));
      await writeJsonAtomic(planFile, {
        mode: "dry",
        writtenAt: publishedAt,
        slot: claimed,
        export: { id: exp.id, path: exp.path, bytes: exp.bytes, sha256: fileSha },
        captions,
        // what the id WOULD be keyed on; no platform issued it
        dryVideoId: up.id,
        publicationId: publication.id,
        requests: yt.plan,
      });
    }
    const slot = await finish(claimed.id, { status: "published", publicationId: publication.id, error: null }, publication);
    await rm(sessionPath(claimed.id), { force: true }); // the video exists and is recorded
    return { slot, publication, planFile };
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    const slot = await finish(claimed.id, { status: "failed", error: why }, null);
    return { slot, publication: null, planFile: null };
  }
}

/** `publish <slotId>`: claim this one slot now, then publish it. */
export async function publishNow(slotId: string, opts: { now?: Date; fetch?: typeof fetch } = {}): Promise<PublishOutcome> {
  const claimed = await claimSlot(slotId, opts.now);
  return runClaimed(claimed, opts);
}

export interface TickResult extends Omit<SweepResult, "claimed"> {
  outcomes: PublishOutcome[];
}

/** Fire every due slot at most once, sequentially. Never throws for a slot's
 *  failure — that lands on the slot. */
export async function tick(now: Date = new Date(), opts: { fetch?: typeof fetch } = {}): Promise<TickResult> {
  const { claimed, ...rest } = await sweep(now, { claim: true });
  const outcomes: PublishOutcome[] = [];
  for (const c of claimed) outcomes.push(await runClaimed(c, opts));
  return { ...rest, outcomes };
}

// ── metrics ─────────────────────────────────────────────────────────────────

/** `POST /api/publish/metrics/refresh`. Pulls lifetime statistics for LIVE
 *  publications only; a dry publication has nothing on any platform, so it gets
 *  no snapshot rather than a row of zeros. */
export async function refreshMetrics(opts: { now?: Date; fetch?: typeof fetch } = {}): Promise<{ refreshed: number; note: string | null }> {
  const pubs = (await readPublications()).publications;
  const live = pubs.filter((p) => !p.dry && p.platformVideoId && p.channelId === "youtube");
  const dryCount = pubs.filter((p) => p.dry).length;
  if (!live.length) {
    return {
      refreshed: 0,
      note: pubs.length
        ? `no live publications (${dryCount} dry): nothing was uploaded, so there are no platform metrics`
        : "no publications yet",
    };
  }
  if (youtubeEffectiveMode() !== "live") {
    return { refreshed: 0, note: `${live.length} live publication(s) not refreshed: publishing is in dry mode, which makes no network call` };
  }
  const yt = new YouTubeClient({ mode: "live", tokenProvider: RefreshTokenProvider.fromEnv(process.env, opts.fetch), fetch: opts.fetch });
  const stats = await yt.fetchStats(live.map((p) => p.platformVideoId!));
  const at = (opts.now ?? new Date()).toISOString();
  const byVideo = new Map(live.map((p) => [p.platformVideoId!, p]));
  const snaps = stats.flatMap((s) => {
    const pub = byVideo.get(s.videoId);
    return pub ? [snapshotFromStatistics(pub.id, at, s)] : [];
  });
  await withStore(async (tx) => {
    (await tx.get("metrics")).snapshots.push(...snaps);
    tx.touch("metrics");
  });
  const withheld = stats.filter((s) => s.viewCount === null).length;
  return { refreshed: snaps.length, note: withheld ? `${withheld} video(s) returned no statistics (deleted or not visible to this token)` : null };
}
