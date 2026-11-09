// A BLOB'S PICTURE AT A GRID'S SIZE - the string contract of `/api/blob/<sha>?w=<width>`.
//
// A Library block draws 120 tiles and every one of them fetched the original plate (a 4096
// square is megabytes for a 200-pixel cell). The blob route answers a resized WebP when asked
// for one of THREE widths; an open width would let any caller fill the server's disk with one
// variant per integer, so the list is closed, and the route and every caller read it here.
// Pure and dependency-free so a "use client" component can import it without pulling sharp or
// node: into a bundle.

/** The widths the blob route resizes to, in pixels. A caller multiplies CSS width by device ratio and picks one. */
export const THUMB_WIDTHS = [320, 640, 1280] as const;
export type ThumbWidth = (typeof THUMB_WIDTHS)[number];

/** Is `s` exactly one of the widths, as a query value spells it (no sign, no leading zero, no fraction)? */
export const thumbWidthOf = (s: string): ThumbWidth | undefined => THUMB_WIDTHS.find((w) => String(w) === s);

// `/api/blob/<64 hex>`, then a query or nothing. A fragment never reaches a blob address.
const BLOB = /^\/api\/blob\/[0-9a-f]{64}(?:\?(.*))?$/;

/**
 * `url` asking for its `w`-pixel-wide variant when it is a blob address; any other URL (another
 * file door, a data: URL, a fixture path) comes back UNCHANGED, so a caller may wrap blindly.
 * A `w` already on the address is replaced, never doubled.
 */
export function thumbUrl(url: string, w: ThumbWidth): string {
  const m = BLOB.exec(url);
  if (m === null) return url;
  const path = url.slice(0, url.length - (m[1] === undefined ? 0 : m[1].length + 1));
  const kept = (m[1] ?? "").split("&").filter((p) => p !== "" && !p.startsWith("w=") && p !== "w");
  return `${path}?${[...kept, `w=${w}`].join("&")}`;
}
