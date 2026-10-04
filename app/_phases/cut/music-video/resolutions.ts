// THE RESOLUTION LADDER, client-safe. `lib/musicVideoExport.ts#EXPORT_RESOLUTIONS`
// is the SERVER's authority on pixel dimensions (it decides what the render
// canvas is actually sized to) and that module pulls in `playwright`,
// `typescript` and Node builtins — none of which may reach a client bundle.
// This file duplicates only the three ids and their labels, which is the one
// slice of that table a browser surface needs, and keeps the id list itself as
// the single compile-time link between the two: a resolution added to one and
// not the other is a type error at the route's own `asResolution` validator,
// not a silent drift.

export const EXPORT_RESOLUTION_IDS = ["1080p", "1440p", "4k"] as const;
export type ExportResolutionId = (typeof EXPORT_RESOLUTION_IDS)[number];

/** `4k`'s label states the idea note's locked decision plainly: the poster's
 *  own generator (agy / the cloud fallback) tops out at 1376px wide
 *  (`.vault/Spark/ideas/music-video-project-type.md`'s own measurement), so a
 *  "4K" export is that content scaled up by the browser's own `drawImage`,
 *  never a native 4K render — and the UI must not imply otherwise. */
export const EXPORT_RESOLUTION_LABEL: Record<ExportResolutionId, string> = {
  "1080p": "1080p",
  "1440p": "1440p",
  "4k": "4K (upscaled from the poster's native resolution)",
};
