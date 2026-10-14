import { z } from "zod";

/**
 * Branded ids. Convention: an id is minted ONLY at a schema door, through the
 * `.brand()` of `idSchema`. A branded id is assignable to `string` (it can be
 * logged, keyed, compared) but a plain `string` is never assignable to it, so
 * two kinds of id cannot be swapped by accident.
 */
export type Brand<T, B extends string> = T & z.$brand<B>;

/** Schema that accepts a non-empty string and mints it as the branded id `B`. */
export function idSchema<const B extends string>(brand: B) {
  void brand;
  return z.string().min(1).brand<B>();
}

/* ── The record ids (plan §2.2) ───────────────────────────────────────────── */
//
// One brand per record, so a JobId handed where a PartId is wanted is a type
// error rather than a lookup that quietly finds nothing. v1 had none of this:
// every id was a bare `string`, and `lib/board/source.ts` had to prefix keys
// with their source (`cull:...`) at runtime to keep them apart.

export const runIdSchema = idSchema("RunId");
export type RunId = z.output<typeof runIdSchema>;

export const projectIdSchema = idSchema("ProjectId");
export type ProjectId = z.output<typeof projectIdSchema>;

export const partIdSchema = idSchema("PartId");
export type PartId = z.output<typeof partIdSchema>;

export const jobIdSchema = idSchema("JobId");
export type JobId = z.output<typeof jobIdSchema>;

export const packetIdSchema = idSchema("PacketId");
export type PacketId = z.output<typeof packetIdSchema>;

export const candidateIdSchema = idSchema("CandidateId");
export type CandidateId = z.output<typeof candidateIdSchema>;

export const libraryItemIdSchema = idSchema("LibraryItemId");
export type LibraryItemId = z.output<typeof libraryItemIdSchema>;

export const styleIdSchema = idSchema("StyleId");
export type StyleId = z.output<typeof styleIdSchema>;

export const slotIdSchema = idSchema("SlotId");
export type SlotId = z.output<typeof slotIdSchema>;
