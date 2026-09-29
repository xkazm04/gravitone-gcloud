// A STATE AS A PILL: the mark and its word, ruled in the state's colour.
// The pill's word is the one thing on the surface that says "ready to cull";
// the mark inside it is therefore decorative.

import { StatusGlyph, type StatusKind } from "./StatusGlyph";

export function StatusPill({ kind, children }: { kind: StatusKind; children: React.ReactNode }) {
  return (
    <span className={`k-pill k-pill--${kind}`}>
      <StatusGlyph kind={kind} decorative />
      {children}
    </span>
  );
}
