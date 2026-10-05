"use client";

// A DECK CARD IN THE ALMANAC WORLD.
//
// DeckCard reads the world (components/ui/world.tsx) and hands the whole card to
// this when it is `almanac`, the way Button hands itself to `k-btn`. The pick
// contract is DeckCard's, unchanged: the WHOLE CARD is one overlay <button>, a
// container never carries role="button", and anything a consumer layers on top of
// a card sits at z-index 2, above the target.
//
// What differs is the skin, and each difference is the world's law rather than a
// taste:
//
//  · the picked card is ringed in Aldebaran (a person kept this), not tinted;
//  · a disabled card takes a dashed edge, never a lower opacity;
//  · every hue an emblem or a chip used to take from Tailwind is a gold or a
//    `--al-*` token; the emblem is drawn in gold on the deep field;
//  · the title is upright Instrument Serif at the display size, the body is white,
//    the facts are vellum, and a card has no grey text;
//  · the hover lift is the kit's (2px, --al-ease), not a spring with a rotation.
//
// The deal-in stays a spring: it is the deck's one physical gesture.

import { useState } from "react";
import { motion } from "motion/react";

import { DeckEmblem } from "./emblems";
import { useDeckReducedMotion } from "./motionGuard";
import type { DeckArt, DeckCardSpec } from "./DeckCard";
import { dealTransition, faceOf, pickTarget } from "./cardModel";

function Art({ art }: { art: DeckArt }) {
  const face = faceOf(art);
  if (face.face === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- a committed /presets or /deck-art file, or a data: URL out of a proof sheet
    return <img src={face.src} alt={face.alt ?? ""} className="k-dcard__img" />;
  }
  if (face.face === "emblem") {
    return (
      <span className="k-dcard__emblem">
        <DeckEmblem emblemKey={face.key} />
      </span>
    );
  }
  return null;
}

export default function DeckCardAlmanac({
  spec,
  picked,
  onPick,
  dealDelay,
  noUnpick,
  children,
}: {
  spec: DeckCardSpec;
  picked: boolean;
  onPick: (id: string | null) => void;
  dealDelay: number;
  noUnpick: boolean;
  children?: React.ReactNode;
}) {
  const reduced = useDeckReducedMotion();
  const [open, setOpen] = useState(false);
  const pickable = spec.pickable !== false;
  const interactive = !spec.disabled && pickable;
  const density = spec.density ?? "showcase";
  const hero = density === "hero";
  const dense = density === "dense";

  const chips = spec.chips && spec.chips.length > 0 && (
    <div className="k-chips">
      {spec.chips.map((c) => (
        <span key={c.label} className="k-chip">
          {c.label}
        </span>
      ))}
    </div>
  );

  const target = pickTarget(spec, { picked, noUnpick });

  return (
    <motion.article
      data-testid={`deck-card-${spec.id}`}
      data-world-card="almanac"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.94 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={dealTransition({ reduced, delay: dealDelay })}
      className={`k-dcard k-dcard--${density}${picked ? " is-picked" : ""}${spec.disabled ? " is-off" : ""}${
        interactive ? " is-live" : ""
      }`}
    >
      {!dense && (
        <div className="k-dcard__art">
          <Art art={spec.art} />
        </div>
      )}

      {children ?? (
        <div className="k-dcard__bd">
          {(spec.eyebrow || (dense && spec.icon)) && (
            <div className="k-dcard__eb k-caps">
              {dense && spec.icon && (
                <span aria-hidden className="k-dcard__icon">
                  {spec.icon}
                </span>
              )}
              {spec.eyebrow && <span>{spec.eyebrow}</span>}
            </div>
          )}
          <h3 className="k-dcard__t">{spec.title}</h3>
          {hero ? (
            spec.footnote && <span className="k-dcard__fn">{spec.footnote}</span>
          ) : (
            <>
              {spec.body && <p className="k-dcard__body">{spec.body}</p>}
              {chips}
              {spec.risk && (
                <p className="k-dcard__risk">
                  <b>risk</b> {spec.risk}
                </p>
              )}
              {spec.detail && open && (
                <div data-testid={`deck-detail-${spec.id}`} className="k-dcard__detail">
                  {spec.detail}
                </div>
              )}
              {spec.footnote && <span className="k-dcard__fn">{spec.footnote}</span>}
              {spec.detail && (
                <div className="k-dcard__more">
                  <button
                    type="button"
                    data-testid={`deck-more-${spec.id}`}
                    aria-expanded={open}
                    onClick={() => setOpen((o) => !o)}
                    className="k-btn k-btn--line k-btn--sm"
                  >
                    {open ? "less" : "details"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {target && (
        <button
          type="button"
          disabled={spec.disabled}
          onClick={() => onPick(target.next)}
          aria-pressed={target.pressed}
          aria-label={target.label}
          className="k-dcard__pick"
        />
      )}
    </motion.article>
  );
}
