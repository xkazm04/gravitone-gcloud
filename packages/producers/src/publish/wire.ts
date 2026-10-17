import type { Publication } from "@gt/domain/publication";
import { exportIdOf, type SlotDrift } from "@gt/domain/slot";
import type { SlotRow } from "@gt/kernel/slots/schema";

// THE CLI'S WIRE SHAPE (plan §5.1: verbs, `--json` keys and exit codes stay). `pipeline/publish.mts
// --json` printed v1's records (lib/publish/types.ts ScheduleSlot, Publication) and an agent reading
// them keys on `status`, `publishAt`, `channelId`, `exportId`, `error`; the kernel's record renamed
// every one of those. A rename an agent cannot see breaks it silently, so the CLI keeps speaking
// v1's keys, mapped here once, with the new facts ADDED beside them (`libraryItemId`, `drift`,
// `partId`, `url`) - an added key breaks no reader.
//
// TWO v1 SEMANTICS ARE KEPT ON THE WIRE THAT THE RECORD DROPPED, on purpose:
//   error on a drifted slot   v1 carried drift as a sentence in `error` (its wire type had no field);
//                             the record has `drift`. The wire says both: `error` the v1 sentence,
//                             `drift` the token.
//   projectId                 not a slot field any more (the importer kept it on its event); null,
//                             which a v1 reader already handled for an export with no sidecar.

/** v1 lib/publish/schedule.ts DRIFT_TEXT, word for word: what a v1 reader matched on. */
export const DRIFT_TEXT: Readonly<Record<SlotDrift, string>> = {
  export_missing: "the export this slot publishes no longer exists",
  channel_not_wired: "this channel is not wired",
};

export type WireSlot = {
  readonly id: string;
  readonly projectId: null;
  readonly exportId: string | null;
  readonly libraryItemId: string;
  readonly channelId: string;
  readonly publishAt: string;
  readonly status: string;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly publicationId: string | null;
  readonly error: string | null;
  readonly drift: SlotDrift | null;
  readonly missedAt: string | null;
  readonly createdAt: string;
  readonly partId: string | null;
};

export function wireSlot(row: SlotRow): WireSlot {
  const s = row.slot;
  return {
    id: s.id,
    projectId: null,
    exportId: exportIdOf(s.libraryItemId) ?? null,
    libraryItemId: s.libraryItemId,
    channelId: s.channel,
    publishAt: s.at,
    status: s.state,
    title: s.title,
    description: s.description,
    tags: s.tags,
    publicationId: s.publicationId ?? null,
    error: s.error ?? (s.drift === undefined ? null : DRIFT_TEXT[s.drift]),
    drift: s.drift ?? null,
    missedAt: s.missedAt ?? null,
    createdAt: row.createdAt,
    partId: s.partId ?? null,
  };
}

export type WirePublication = {
  readonly id: string;
  readonly slotId: string;
  readonly channelId: string;
  readonly platformVideoId: string | null;
  readonly url: string | null;
  readonly visibility: "private" | null;
  readonly dry: boolean;
  readonly publishedAt: string;
};

export function wirePublication(p: Publication): WirePublication {
  return { id: p.id, slotId: p.slotId, channelId: p.channel, platformVideoId: p.platformId, url: p.url ?? null, visibility: p.visibility ?? null, dry: p.dry, publishedAt: p.publishedAt };
}
