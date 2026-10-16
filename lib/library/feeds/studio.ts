import "server-only";

import path from "node:path";

import type { LibraryItemInput } from "@gt/domain/libraryItem";

import { adExportRoot } from "../../adExports.ts";
import { clipFileStat, listClipRecords } from "../../imaging/video/store.ts";
import { captionSidecar, listExports } from "../../publish/exports.ts";
import { words, type Feed, type FeedItem, type FeedRead } from "./types.ts";

// WHAT THE STUDIO MADE, AS LIBRARY ITEMS (L53) - the three sources L49 named and left:
//
//   clips     v1's image-to-video clips (lib/imaging/video: one key image animated by a vendor,
//             `<clipId>.json` + `.mp4`). A finished clip is a video of its project; one still
//             rendering, failed or refused has no file and is not an item yet - it is a job, and
//             the job's own record says why.
//   exports   finished cuts waiting to be published (lib/publish/exports.ts `listExports`: the
//             music-video and animatic exports and the ads Finish step's), each a video over its
//             mp4. The format is read from where it sits and what its sidecar says, not guessed
//             from its name: the ads root holds ads; a sidecar naming a project is a cut of that
//             project (a film); a bare mp4 in the music-video root is a music video.
//
// Each reads through v1's own lister and writes nothing of v1's. A lister that throws fails the
// feed, and a failed feed is not pruned (lib/library/project.ts): a directory that could not be
// read is never read as empty.

const rights = { use: "publishable" as const };

export const clipsFeed: Feed = {
  id: "clips",
  async read(ctx): Promise<FeedRead> {
    const { clips, unreadable } = await listClipRecords();
    const items: FeedItem[] = [];
    const skipped: { id: string; reason: string }[] = unreadable > 0 ? [{ id: "clips", reason: `${unreadable} clip record(s) could not be read` }] : [];
    for (const c of clips) {
      if (c.status !== "done") continue;
      const file = await clipFileStat(c.clipId);
      if (file === null) {
        skipped.push({ id: c.clipId, reason: "done, but its mp4 is not on disk" });
        continue;
      }
      const motion = c.motion.trim();
      items.push({
        item: {
          kind: "video",
          id: `video:clip:${c.clipId}`,
          title: motion === "" ? c.clipId : motion.length > 80 ? `${motion.slice(0, 79)}…` : motion,
          state: "unjudged",
          collections: [{ kind: "project", id: c.projectId }],
          origin: "studio",
          rights,
          source: ctx.universe,
          lineage: [{ kind: "project", id: c.projectId }],
          vocabulary: { format: "film", captions: "none" },
          at: new Date(c.finishedAt ?? c.createdAt).toISOString(),
        },
        meta: `${c.model} · ${c.durationS} s · ${c.aspect}`,
        extras: { prompt: c.motion },
        file: { abs: file.abs, mime: "video/mp4" },
      });
    }
    return { items, skipped };
  },
};

export const exportsFeed: Feed = {
  id: "exports",
  async read(ctx): Promise<FeedRead> {
    const ads = path.resolve(adExportRoot());
    const items: FeedItem[] = [];
    for (const x of await listExports()) {
      const format: "ad" | "film" | "music-video" = path.resolve(path.dirname(x.path)) === ads ? "ad" : x.projectId !== null ? "film" : "music-video";
      const caption = await captionSidecar(x.id);
      const captions = caption === null ? "none" : caption.toLowerCase().endsWith(".vtt") ? "vtt" : "srt";
      const project = x.projectId === null ? [] : [{ kind: "project" as const, id: x.projectId }];
      const item: LibraryItemInput = {
        kind: "video",
        id: `video:export:${x.id}`,
        title: `${words(format)} export · ${x.id.slice(0, 8)}`,
        state: "ratified",
        collections: project,
        origin: "studio",
        rights,
        source: ctx.universe,
        lineage: project,
        vocabulary: { format, captions },
        at: x.createdAt,
      };
      items.push({ item, meta: `${words(format)} · ${(x.bytes / 1_048_576).toFixed(1)} MB`, extras: {}, file: { abs: x.path, mime: "video/mp4" } });
    }
    return { items, skipped: [] };
  },
};
