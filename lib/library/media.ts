// WHERE A LIBRARY ITEM'S BYTES ARE SERVED - pure, so the route's presenter (L50
// present.ts) and the server agree. A blob is fetched from L39's content-addressed
// route (app/api/blob/[sha]) with its type in `?type=`: the same address as
// lib/parts/gates.ts `blobRouteUrl`, which is server-only; this is its client twin.

import type { LibraryCover, LibraryRow } from "@gt/domain/library";

/** A blob's route address, or null when there is no blob. */
export function blobRoute(sha: string | null, mime: string | null): string | null {
  if (sha === null || !/^[0-9a-f]{64}$/.test(sha)) return null;
  return mime === null ? `/api/blob/${sha}` : `/api/blob/${sha}?type=${encodeURIComponent(mime)}`;
}

/** The tile's image: the item's own picture, or a video's keyframe. */
export const coverUrl = (cover: LibraryCover): string | null => blobRoute(cover.blobSha, cover.mime);

/** Does the row draw a designed face (a waveform, a swatch) rather than a picture? */
export const drawsFace = (row: Pick<LibraryRow, "cover" | "peaks" | "palette">): boolean => row.cover.blobSha === null && (row.peaks !== undefined || row.palette !== undefined);
