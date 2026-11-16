// THE PAGE'S COPY OF AN ACCEPT (spark studio-to-release): a pending proposal's value set on the release the page
// shows, at once, before the store answers. Zod-free so the session can run it in the client - the store re-checks the
// whole release through the door (`applyProposal`, @gt/domain/release.record.schema) and its answer replaces this copy.
// The two must set the SAME field the same way; tests/next-server/release-session.test.ts holds them together on every
// proposal path.
import type { Release, ReleaseTrack } from "@gt/domain/release";
import { parseProposalPath, type ProposalPath } from "@gt/domain/release.record";

/** The release with `value` at `path`, unchecked; null when the path names no field of this release. */
export function applyLocal(release: Release, path: ProposalPath, value: unknown): Release | null {
  const p = parseProposalPath(path);
  if (p === null) return null;
  if (p.track === null) {
    if (p.field === "genre.primary") return { ...release, genre: { ...release.genre, primary: value as Release["genre"]["primary"] } };
    if (p.field === "genre.secondary") return { ...release, genre: { ...release.genre, secondary: value as Release["genre"]["secondary"] } };
    return { ...release, [p.field]: value } as Release;
  }
  const i = p.track - 1;
  if (i >= release.tracks.length) return null;
  return { ...release, tracks: release.tracks.map((t, k): ReleaseTrack => (k === i ? ({ ...t, [p.field]: value } as ReleaseTrack) : t)) };
}
