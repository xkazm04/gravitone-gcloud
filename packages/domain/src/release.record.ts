// THE RELEASE RECORD (spark studio-to-release): a release as the kernel store keeps it - the release itself, its
// version for compare-and-swap, the studio session it was born in, and the agent's PENDING proposals. The agent and
// the operator work on one record: the agent only ever adds proposals (a field, a value, where it came from); nothing
// reaches the release until the operator accepts it, and a write carrying a stale version is refused, so neither
// author overwrites the other (registry schema-driven-ui / emitter-registry-sync: one spec, two writers, CAS).
//
// Zod-free on purpose: client components import these types and the field list, and zod costs ~93 KB gzip on a
// client chunk. The door - parsing a record, applying a proposal and re-checking the whole release - is
// ./release.record.schema.ts, server side.
import type { Release } from "./release.ts";

/** `rel-` + 12 hex, as Release.id. */
export const RELEASE_ID_RE = /^rel-[0-9a-f]{12}$/;

/** One event per thing that happened to a release, appended in the same transaction as the row. */
export const RELEASE_EVENTS = [
  "release.created",
  "release.edited",
  "release.proposed",
  "release.accepted",
  "release.dismissed",
  "release.scheduled",
] as const;
export type ReleaseEventType = (typeof RELEASE_EVENTS)[number];

/** Release-level fields a proposal may set. */
export const RELEASE_PROPOSAL_FIELDS = ["title", "version", "artist", "label", "releaseDate", "language", "genre.primary", "genre.secondary", "upc", "sleevePrompt"] as const;
/** Per-track fields a proposal may set, addressed `track:<n>.<field>` with n 1-based in release order (as ProblemAt). */
export const TRACK_PROPOSAL_FIELDS = ["title", "version", "isrc", "explicit", "lyrics", "songwriters", "credits", "ai", "rights"] as const;
export type ReleaseProposalField = (typeof RELEASE_PROPOSAL_FIELDS)[number];
export type TrackProposalField = (typeof TRACK_PROPOSAL_FIELDS)[number];
/** `title` | `genre.primary` | `track:2.lyrics` ... */
export type ProposalPath = ReleaseProposalField | `track:${number}.${TrackProposalField}`;

/** Parse a proposal path; null when it names no field a proposal may set. */
export function parseProposalPath(path: string): { readonly track: number | null; readonly field: string } | null {
  if ((RELEASE_PROPOSAL_FIELDS as readonly string[]).includes(path)) return { track: null, field: path };
  const m = /^track:([1-9]\d{0,2})\.([a-z]+)$/.exec(path);
  if (m === null || !(TRACK_PROPOSAL_FIELDS as readonly string[]).includes(m[2] ?? "")) return null;
  return { track: Number(m[1]), field: m[2] ?? "" };
}

/** One value the agent suggests for one field, and where it came from - shown on the field until accepted or dismissed. */
export interface ReleaseProposal {
  /** Unique within the record. */
  readonly id: string;
  readonly path: ProposalPath;
  /** JSON: the value the field would take (a string, a boolean, a list, an object - whatever the field holds). */
  readonly value: unknown;
  /** Where the value came from, in the agent's words - "the Suno style", "turn 7", "the take's measured tempo". */
  readonly source: string;
  /** The studio turn the proposal answered, or null. */
  readonly turnId: string | null;
  readonly at: string;
}

export interface ReleaseRecord {
  readonly release: Release;
  /** Starts at 1; every accepted write adds 1. A write naming another version is refused (stale). */
  readonly version: number;
  /** The studio session the release was made from, or null (made from the shelf or an import). */
  readonly sessionId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly pending: readonly ReleaseProposal[];
}

/** Where a pending proposal for a field sits, so a step can show the suggestions for its own fields. */
export const proposalsFor = (r: ReleaseRecord, path: ProposalPath): readonly ReleaseProposal[] => r.pending.filter((p) => p.path === path);
