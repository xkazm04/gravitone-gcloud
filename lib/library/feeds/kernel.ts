import "server-only";

import type { LibraryItemInput } from "@gt/domain/libraryItem";

import { isoOf, type Feed, type FeedItem, type FeedRead } from "./types.ts";

// THE KERNEL'S OWN MEDIA, AS LIBRARY ITEMS (L53) - every blob a studio part made: a frames
// plate, an alternative, a motion clip, a cut, wherever a part record or a job's step output
// holds a BlobRef (`{sha256, bytes, mime}`, @gt/domain/blob). Those are already blobs in the
// store's own blob directory, so nothing is ingested: the item points at the ref it found.
//
// FOUND BY SHAPE, NOT BY A LIST OF RECORD KEYS. The part records are each step's own JSON
// (lib/producers/frames.ts writes `plate.blob`, motion `clip.blob`), and a key list here would be
// a second copy of every step's layout that drifts from it the first time a step adds a field.
// SQLite's `json_tree` walks each document once and the statement keeps the objects that carry
// a 64-hex `sha256` and a `mime` - the ref's own shape - so a new step's media arrives without a
// line here.
//
// ONE ITEM PER BLOB. The same plate is in the frames record AND the job output that landed it;
// both are its lineage (the project it is in, the job that made it), and it is one item.
// Audio is left to the takes feed (a take's audio enters the sound store, where its measured
// length lives - an audio item without a length is not an item the Library can draw).

/** The most blobs one sync reads from the kernel (bounded-enumeration: say the bound). */
export const KERNEL_BLOB_CAP = 5000;

const REFS = `
  SELECT 'part' AS src, p.project_id AS owner, p.key AS rec, json_extract(t.value, '$.sha256') AS sha, json_extract(t.value, '$.mime') AS mime, json_extract(t.value, '$.bytes') AS bytes, NULL AS at
    FROM part_records p, json_tree(p.data) t
   WHERE t.type = 'object' AND length(json_extract(t.value, '$.sha256')) = 64 AND json_extract(t.value, '$.mime') IS NOT NULL
  UNION ALL
  SELECT 'job' AS src, o.job_id AS owner, o.step AS rec, json_extract(t.value, '$.sha256'), json_extract(t.value, '$.mime'), json_extract(t.value, '$.bytes'), o.at
    FROM job_outputs o, json_tree(o.output) t
   WHERE json_valid(o.output) AND t.type = 'object' AND length(json_extract(t.value, '$.sha256')) = 64 AND json_extract(t.value, '$.mime') IS NOT NULL
  LIMIT ?`;

type Found = { project?: string; jobs: Set<string>; recs: Set<string>; mime: string; bytes: number; at?: string };

const HEX = /^[0-9a-f]{64}$/;

export const kernelFeed: Feed = {
  id: "kernel",
  async read(ctx): Promise<FeedRead> {
    if (ctx.store === undefined) return { items: [], skipped: [{ id: "kernel", reason: "no kernel store in this sync" }] };
    const rows = ctx.store.read((r) => r.all(REFS, KERNEL_BLOB_CAP + 1));
    if (!rows.ok) throw rows.error;
    const skipped: { id: string; reason: string }[] = rows.value.length > KERNEL_BLOB_CAP ? [{ id: "kernel", reason: `more than ${KERNEL_BLOB_CAP} blob refs; the newest beyond the cap wait for the next sync` }] : [];
    const bySha = new Map<string, Found>();
    for (const row of rows.value.slice(0, KERNEL_BLOB_CAP)) {
      const sha = String(row["sha"]);
      const mime = String(row["mime"]);
      if (!HEX.test(sha) || !(mime.startsWith("image/") || mime.startsWith("video/"))) continue;
      const f = bySha.get(sha) ?? { jobs: new Set<string>(), recs: new Set<string>(), mime, bytes: typeof row["bytes"] === "number" && Number.isInteger(row["bytes"]) && row["bytes"] >= 0 ? row["bytes"] : 0 };
      if (row["src"] === "part") f.project ??= String(row["owner"]);
      else {
        f.jobs.add(String(row["owner"]));
        const at = isoOf(typeof row["at"] === "string" ? row["at"] : undefined);
        if (at !== undefined) f.at ??= at;
      }
      f.recs.add(String(row["rec"]));
      bySha.set(sha, f);
    }
    const items: FeedItem[] = [];
    for (const [sha, f] of bySha) {
      const project = f.project === undefined ? [] : [{ kind: "project" as const, id: f.project }];
      const lineage = [...[...f.jobs].map((id) => ({ kind: "job" as const, id })), ...project];
      const rec = [...f.recs].sort().join(" · ");
      const shared = {
        id: `${f.mime.startsWith("video/") ? "video" : "image"}:kernel:${sha}`,
        title: `${rec} · ${sha.slice(0, 8)}`,
        state: "unjudged" as const,
        collections: project,
        origin: "studio" as const,
        rights: { use: "publishable" as const },
        source: ctx.universe,
        lineage,
        media: { sha256: sha, bytes: f.bytes, mime: f.mime },
        ...(f.at === undefined ? {} : { at: f.at }),
      };
      const item: LibraryItemInput = f.mime.startsWith("video/") ? { ...shared, kind: "video", vocabulary: { format: "film", captions: "none" } } : { ...shared, kind: "image", vocabulary: { set: rec, styles: [] } };
      items.push({ item, meta: `${rec} · ${f.mime}`, extras: {} });
    }
    return { items, skipped };
  },
};
