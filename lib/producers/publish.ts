import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Holder } from "@gt/domain/job";
import { exportIdOf, type Channel, type Slot } from "@gt/domain/slot";
import { blobStore } from "@gt/kernel/blob";
import { canonical } from "@gt/kernel/canonical";
import { dryOnlyFrom } from "@gt/kernel/dryrun";
import { liveEffects } from "@gt/kernel/effects";
import { actorOf, pidAlive, processHolder } from "@gt/kernel/lease";
import type { Store } from "@gt/kernel/store";
import type { ChannelAdapter, LifetimeStats, PublishPlan } from "@gt/producers/publish/adapter";
import { refreshMetrics } from "@gt/producers/publish/metrics";
import { publishMode } from "@gt/producers/publish/mode";
import { publishTick, type TickDeps } from "@gt/producers/publish/tick";
import { METRICS_REFRESH, PUBLISH_TICK } from "@gt/producers/publish/timers";

import type { TimerEntry } from "../../workers/timers.ts";
import { blobRootOf } from "../kernelProcess.ts";
import { missedWindowMs, WIRED_CHANNELS } from "../publish/channels.ts";
import { captionSidecar, getExport, listExports } from "../publish/exports.ts";
import { RefreshTokenProvider, YOUTUBE_ENV_VARS } from "../publish/oauth.ts";
import { readSession, removeSession, writeSession } from "../publish/sessions.ts";
import { sha256File, YouTubeClient, type UploadVideoRequest } from "../publish/youtube.ts";

// THE PUBLISH PRODUCER, BOUND TO THIS BOX (Phase 6, L62): @gt/producers/publish's channel seam
// given its one real adapter - YouTube, over v1's client (lib/publish/youtube.ts), refresh-token
// provider (oauth.ts), export lister (exports.ts) and resumable sessions (sessions.ts) - and the
// sweep given its facts (the missed window, the wired channels, which exports exist). The worker's
// timers (workers/runner.mts) and `pipeline/publish.mts` both build their ticks here, so the CLI
// and the worker publish through the same adapter with the same mode.
//
// THE MODE is decided once per deps from the environment: PUBLISH_MODE, the YouTube variables'
// presence and GRAVITONE_DRY_ONLY, folded into a kernel RunMode (@gt/producers/publish/mode).
// Dry by default; the YouTube client is only ever constructed live inside `upload`, which the
// DryRun port never enters in a dry run.

/** YouTube's "Music" category: every export here is a music video (v1 publisher.ts). */
const CATEGORY_MUSIC = "10";
/** The channels whose publication is an act elsewhere: always able to fire (owner ruling 4). */
const ACT_CHANNELS: readonly Channel[] = ["blog"];

export type Env = Readonly<Record<string, string | undefined>>;

const present = (env: Env, name: string): boolean => (env[name]?.trim() ?? "") !== "";

function request(slot: Slot, file: string): UploadVideoRequest {
  return {
    file,
    title: slot.title,
    description: slot.description,
    tags: [...slot.tags],
    privacyStatus: "private",
    // every export is generated imagery over generated or licensed music: the altered-or-synthetic
    // disclosure is true by construction (v1 publisher.ts)
    containsSyntheticMedia: true,
    categoryId: CATEGORY_MUSIC,
  };
}

const pinnedSchema = z.object({ export: z.object({ id: z.string().min(1), path: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/) }), captions: z.string().nullable() });

/** The YouTube adapter. `fetchImpl` reaches the wire only in `upload` and `stats`, both live-only. */
export function youtubeAdapter(env: Env, fetchImpl?: typeof fetch): ChannelAdapter {
  return {
    channel: "youtube",
    async plan(slot, publicationId, at): Promise<Result<PublishPlan>> {
      const exportId = exportIdOf(slot.libraryItemId);
      if (exportId === undefined) return err("refused", `${slot.libraryItemId} is not an export; youtube publishes exports`);
      const exp = await getExport(exportId);
      if (exp === null) return err("not-found", `export ${exportId} no longer exists`);
      try {
        const sha256 = await sha256File(exp.path);
        const yt = new YouTubeClient({ mode: "dry" });
        const up = await yt.uploadVideo(request(slot, exp.path), { expectedSha256: sha256 });
        const captions = await captionSidecar(exp.id);
        if (captions !== null) await yt.insertCaptions(up.id, captions, "en", "English");
        const doc = { writtenAt: at, slot, export: { id: exp.id, path: exp.path, bytes: exp.bytes, sha256 }, captions, dryVideoId: up.id, publicationId, requests: yt.plan };
        // Plain JSON or nothing: the plan is a payload digest and a blob, both canonical.
        canonical(doc);
        return ok({ doc, dryId: up.id });
      } catch (e) {
        return err("refused", errorMessage(e));
      }
    },
    async upload(slot, plan, hooks) {
      const pin = parseAt("publish plan", pinnedSchema, plan.doc);
      if (!pin.ok) return pin;
      const provider = RefreshTokenProvider.fromEnv({ ...env }, fetchImpl);
      if (provider === null) return err("unauthenticated", `YouTube credentials are not set (${YOUTUBE_ENV_VARS.join(", ")})`);
      const { path: file, sha256 } = pin.value.export;
      const resume = await readSession(slot.id, sha256);
      if (!resume.ok) return resume;
      try {
        const yt = new YouTubeClient({ mode: "live", tokenProvider: provider, ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }) });
        const up = await yt.uploadVideo(request(slot, file), {
          ...(resume.value === undefined ? {} : { resumeSessionUri: resume.value }),
          expectedSha256: sha256,
          onSession: (uri) => writeSession(slot.id, uri, sha256),
          onProgress: () => hooks.progress(),
        });
        if (pin.value.captions !== null) await yt.insertCaptions(up.id, pin.value.captions, "en", "English");
        return ok({ platformId: up.id, url: `https://www.youtube.com/watch?v=${encodeURIComponent(up.id)}` });
      } catch (e) {
        return err("unavailable", errorMessage(e));
      }
    },
    forget: (slotId) => removeSession(slotId),
    async stats(ids): Promise<Result<readonly LifetimeStats[]>> {
      const provider = RefreshTokenProvider.fromEnv({ ...env }, fetchImpl);
      if (provider === null) return err("unauthenticated", `YouTube credentials are not set (${YOUTUBE_ENV_VARS.join(", ")})`);
      try {
        const yt = new YouTubeClient({ mode: "live", tokenProvider: provider, ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }) });
        const stats = await yt.fetchStats([...ids]);
        return ok(stats.map((s) => ({ platformId: s.videoId, views: s.viewCount, likes: s.likeCount, comments: s.commentCount })));
      } catch (e) {
        return err("unavailable", errorMessage(e));
      }
    },
  };
}

export type BindOptions = {
  readonly store: Store;
  readonly env?: Env;
  readonly clock?: () => Date;
  readonly holder?: Holder;
  readonly alive?: (pid: number) => boolean;
  /** A test's network stub; production leaves it to globalThis.fetch. */
  readonly fetch?: typeof fetch;
  /** Replace the adapters (a test's throwing channel); the default is YouTube. */
  readonly adapters?: ReadonlyMap<Channel, ChannelAdapter>;
};

/** The tick's dependencies over `store`. `invalid` for a malformed PUBLISH_MODE. */
export function publishDeps(o: BindOptions): Result<TickDeps> {
  const env = o.env ?? process.env;
  const clock = o.clock ?? (() => new Date());
  const holder = o.holder ?? processHolder();
  const mode = publishMode({
    requested: env["PUBLISH_MODE"],
    credentials: YOUTUBE_ENV_VARS.every((v) => present(env, v)),
    dryOnly: dryOnlyFrom(env),
    by: actorOf(holder),
    at: clock().toISOString(),
  });
  if (!mode.ok) return mode;
  const blobs = blobStore(blobRootOf(o.store));
  const wired = new Set<Channel>([...WIRED_CHANNELS, ...ACT_CHANNELS]);
  return ok({
    store: o.store,
    fx: liveEffects(o.store, blobs),
    adapters: o.adapters ?? new Map<Channel, ChannelAdapter>([["youtube", youtubeAdapter(env, o.fetch)]]),
    mode: mode.value,
    holder,
    alive: o.alive ?? pidAlive,
    clock,
    pathOf: (ref) => {
      const p = blobs.pathOf(ref);
      return p.ok ? p.value : undefined;
    },
    async facts(now) {
      const exports = await listExports();
      const ids = new Set(exports.map((e) => e.id));
      return ok({
        now,
        windowMs: missedWindowMs({ ...env }),
        wired,
        // An export is judged by its file; any other item (a blog slot's article run) is vouched
        // for by the act that publishes it, not by this sweep.
        itemExists: (item: string) => {
          const id = exportIdOf(item);
          return id === undefined || ids.has(id);
        },
      });
    },
  });
}

/** The worker's two publish timers over `deps` (workers/timers.ts runs them). */
export function publishTimers(deps: TickDeps): TimerEntry[] {
  return [
    {
      spec: PUBLISH_TICK,
      async tick(ctx) {
        const r = await publishTick(deps, ctx.now, { beat: ctx.beat, signal: ctx.signal, ...(ctx.gap === undefined ? {} : { gap: ctx.gap }) });
        if (!r.ok) return r;
        const v = r.value;
        const n = (k: string) => v.outcomes.filter((o) => o.kind === k).length;
        const acted = v.outcomes.length + v.missed.length + v.interrupted.length;
        const wake = v.next === undefined ? {} : { wakeInMs: Math.max(0, Date.parse(v.next) - ctx.now.getTime()) };
        return ok({
          count: acted,
          what: "slot(s) published, failed, missed or interrupted",
          ...wake,
          detail: {
            published: n("published"),
            failed: n("failed"),
            lost: n("lost"),
            missed: v.missed.length,
            interrupted: v.interrupted.length,
            drifted: v.drifted.length,
            ...(v.downtime === undefined ? {} : { downtimeMissed: [...v.downtime.missed] }),
          },
        });
      },
    },
    {
      spec: METRICS_REFRESH,
      async tick(ctx) {
        const r = await refreshMetrics(deps, ctx.now);
        if (!r.ok) return r;
        return ok({ count: r.value.refreshed, what: "publication(s) refreshed", ...(r.value.note === null ? {} : { detail: { note: r.value.note } }) });
      },
    },
  ];
}
