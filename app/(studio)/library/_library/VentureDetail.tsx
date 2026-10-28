"use client";

// A VENTURE ITEM'S OWN BLOCKS in the detail (spark scout-vision S2): its kind and its frame - tone, audience,
// format, look - its genres as doors to their own items, the characters it reuses once S3 names any, and the kept
// proposal it was born from, a door to that night's packet. A retired venture keeps all of it under a ghost chip.

import { genreItemId, type VentureExtras } from "@gt/domain/library";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { DetailSection } from "@gt/ui/components/library/DetailPanel.tsx";

import { Ref, Retired } from "./GenreDetail.tsx";
import s from "./library.module.css";

export function VentureFacts({ venture: v, onItem }: { readonly venture: VentureExtras; readonly onItem: (id: string) => void }) {
  return (
    <>
      <DetailSection title="Frame">
        <Retired at={v.retiredAt} />
        <div className={s.ev}>
          <Chip label={v.kind} tone="cyan" casing="lower" />
          <Chip label="tone" value={v.tone} casing="lower" />
          <Chip label="audience" value={v.audience} casing="lower" />
          <Chip label="format" value={v.format} casing="lower" />
        </div>
        <p className={s.recipe}>{v.look}</p>
      </DetailSection>
      <DetailSection title="Genres" tally={{ value: v.genres.length }}>
        <div className={s.ev}>
          {v.genres.map((g) => (
            <Chip key={g.id} label={g.name} casing="lower" onPress={() => onItem(genreItemId(g.id))} name={`genre ${g.name}`} />
          ))}
        </div>
      </DetailSection>
      {v.characters !== undefined && v.characters.length > 0 && (
        <DetailSection title="Characters" tally={{ value: v.characters.length }}>
          <div className={s.ev}>
            {v.characters.map((c) => (
              <Chip key={c} label={c} casing="lower" />
            ))}
          </div>
        </DetailSection>
      )}
      <DetailSection title="Born from">
        <div className={s.ev}>
          <Ref label="proposal" refId={v.proposal} />
        </div>
      </DetailSection>
    </>
  );
}
