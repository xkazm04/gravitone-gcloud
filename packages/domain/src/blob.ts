import { z } from "zod";

// A REFERENCE TO BYTES BY WHAT THEY ARE, NOT WHERE THEY ARE (plan §4: blobs
// stay content-addressed on disk; @gt/kernel's blob store mints these).
//
// v1 pointed at media by path — run-relative files in a candidate record
// (lib/foundry/types.ts `Candidate.file`), a project-relative export path
// (lib/publish/types.ts `ExportRef.path`) — so a moved folder or a re-rendered
// file silently changed what a record meant. A digest cannot drift from its
// bytes; lib/studioArchive.ts already checked SHA-256 per section on import,
// and this makes that the address rather than an after-the-fact check.

/** 64 lowercase hex. Uppercase is refused, not folded: two spellings of one
 *  digest would be two keys for one blob. */
export const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, "sha256 is 64 lowercase hex");

/** `type/subtype`, lowercase, no parameters — the blob store sniffs, it does not trust a header. */
export const mimeSchema = z.string().regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/, "mime is type/subtype");

export const blobRefSchema = z.object({
  sha256: sha256Schema,
  bytes: z.number().int().nonnegative(),
  mime: mimeSchema,
});
export type BlobRef = z.output<typeof blobRefSchema>;
