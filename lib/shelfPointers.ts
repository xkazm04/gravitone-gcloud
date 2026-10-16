// THE v1 SHELF'S POINTERS - the `src` grammar of the rows still in a browser's IndexedDB
// `assets` store, kept for the two readers that outlive the v1 Library: the archive export
// (lib/studioArchive.ts, which rewrites a pointer when it re-mints the row it names) and the
// sign-out eviction (lib/identityEviction.ts, which deletes an upload's bytes with its asset).
//
// Moved verbatim from lib/assets.ts when the shelf retired (Phase 5, L55): the store that wrote
// these rows is gone, the rows are not - the import (lib/import/shelf.ts) reads them off the
// archive on the server, and until a browser has been imported its rows must still export
// exactly as v1 wrote them.

const PROOF_SCHEME = "proof:";
const UPLOAD_SCHEME = "upload:";

/** A promoted proof's bytes stay inside its theme; the asset points there. */
export const proofPointer = (themeId: string, proofId: string): string => `${PROOF_SCHEME}${themeId}/${proofId}`;

/** The two ids inside a proof pointer, or null for any other kind of `src`. */
export function readProofPointer(src: string): { themeId: string; proofId: string } | null {
  if (!src.startsWith(PROOF_SCHEME)) return null;
  const [themeId, proofId] = src.slice(PROOF_SCHEME.length).split("/");
  return themeId && proofId ? { themeId, proofId } : null;
}

/** The ONE id a promoted proof's asset had (content-addressed, so a second promotion overwrote). */
export const promotedId = (themeId: string, proofId: string): string => `as-proof-${themeId}-${proofId}`;

/** An uploaded file's asset points at its bytes in the `uploads` store. */
export const uploadPointer = (uploadId: string): string => `${UPLOAD_SCHEME}${uploadId}`;

/** The upload id inside a pointer, or null for any other kind of `src`. */
export function readUploadPointer(src: string): string | null {
  if (!src.startsWith(UPLOAD_SCHEME)) return null;
  return src.slice(UPLOAD_SCHEME.length) || null;
}
