// THE RECORD VERSION stamped on every write (SCHEMA_VERSION), with the policy that
// governs it. Split out of the stepStore.ts door, which re-exports the constant.

/** The shape version stamped on every record this build writes.
 *
 *  WHAT THE DATABASE VERSION DOES NOT COVER. `DB_VERSION` in lib/studioDb.ts
 *  versions the database — which stores exist, which indexes they carry — and its
 *  upgrade path has never rewritten a record. The records INSIDE the stores had
 *  no version of any kind, so a blob written by any earlier build was
 *  indistinguishable from a current one and nothing could have noticed. The
 *  compensation for that is already spread through the tree: three readers
 *  optional-chain through fields their own interface declares REQUIRED, and
 *  frames/frames.ts says it plainly — "there is no migration seam to hang this
 *  off".
 *
 *  THE POLICY, in full at
 *  .vault/Architect/decisions/2026-08-29-persisted-payload-versioning.md:
 *
 *   1. ABSENT MEANS v1, permanently. A record with no `v` is version 1, and v1 is
 *      the shape as of 2026-08-29 WITH EVERY FIELD OPTIONAL — the only honest
 *      description, since records predating a field genuinely lack it. This is
 *      what guarantees no stored work is ever stranded: the absent case has a
 *      meaning rather than being an error deferred to whoever hits it.
 *   2. New writes carry `v` — this constant, stamped below. Additive, and safe
 *      against every existing reader, which destructures what it knows.
 *   3. A record from the FUTURE is refused, never downgraded. The dangerous
 *      direction is new data meeting OLD code, which is real here: `e242b89`
 *      documents two tabs on different builds sharing one database. Applying v2
 *      assumptions to a v3 payload and then SAVING the result destroys work,
 *      where refusing merely fails to show it.
 *   4. Migrations are pure vN→vN+1 functions applied at the read seam, and each
 *      one ships in the same commit as the shape change that needs it.
 *
 *  Rules 3 and 4 are built at the RECORD seam, not here (2026-10-05):
 *  `app/_phases/_shared/records/registry.ts` reads `v` (absent = 1), refuses a
 *  record from the future, chains a def's migrations, and parses. A record with
 *  a def is written with ITS version through the `v` option below; this constant
 *  stays the stamp for every write that has no def yet, and both are 1 today.
 *
 *  Deleting it as unused would silently restore the ambiguity it exists to end. */
export const SCHEMA_VERSION = 1;
