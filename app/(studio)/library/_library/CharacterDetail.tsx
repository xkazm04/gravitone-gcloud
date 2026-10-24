"use client";

// A CHARACTER ITEM'S OWN BLOCKS in the detail (spark scout-use-aim): her card (age, build and the
// applications her stills served as chips, the line a scene plays her by), the looks she was kept
// in as a row of thumbnails - each a door to the Library filtered by that look - and the core prompt
// that draws her: the card block, then the look block of her newest kept still.

import type { CharacterExtras } from "@gt/domain/library";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import type { FacetLine } from "@gt/ui/components/library/DetailPanel.tsx";
import { DetailSection } from "@gt/ui/components/library/DetailPanel.tsx";
import { LookStrip, type LookThumb } from "@gt/ui/components/library/LookStrip.tsx";

import s from "./library.module.css";

/** The thumbnails of her looks: a look slug is the door's value and its caption, a night with no look only a caption. */
export function lookThumbs(looks: CharacterExtras["looks"], pressed: readonly string[]): LookThumb[] {
  return looks.map((l) => ({
    key: l.look ?? l.night,
    image: l.image,
    label: l.look ?? l.night,
    ...(l.genre === undefined ? {} : { sub: l.genre }),
    ...(l.look !== undefined && pressed.includes(l.look) ? { pressed: true } : {}),
    ...(l.look === undefined ? { inert: true } : {}),
  }));
}

const valuesOf = (lines: readonly FacetLine[], group: string): FacetLine["values"] => lines.find((l) => l.group === group)?.values ?? [];

export function CharacterFacts({ character, lines, onFacet }: { readonly character: CharacterExtras; readonly lines: readonly FacetLine[]; readonly onFacet: (group: string, value: string) => void }) {
  const { card, looks, prompt } = character;
  const pressed = valuesOf(lines, "look").filter((v) => v.pressed).map((v) => v.value);
  return (
    <>
      <DetailSection title="Card">
        <div className={s.ev}>
          <Chip label="age" value={card.age} casing="lower" />
          {valuesOf(lines, "build").map((b) => (
            <Chip key={b.value} label={b.label} casing="lower" />
          ))}
          {valuesOf(lines, "application").map((a) => (
            <Chip key={a.value} label={a.label} tone="cyan" casing="lower" />
          ))}
        </div>
        <p className={s.recipe}>{card.personality}</p>
      </DetailSection>
      {looks.length > 0 && (
        <DetailSection title="Looks" tally={{ value: looks.length }}>
          <LookStrip looks={lookThumbs(looks, pressed)} onPress={(k) => onFacet("look", k)} />
        </DetailSection>
      )}
      <DetailSection title="Prompt">
        {prompt.split("\n\n").map((p, i) => (
          <p key={i} className={s.recipe}>
            {p}
          </p>
        ))}
      </DetailSection>
    </>
  );
}
