"use client";

// COMPOSE (prototype projects.js `renderCompose`, `composeRecipe`, projects.css `.compose-pop`,
// `.cp`, `.recipe`, `.cp-src`): the three recipes on keys 1-3, the rest below them, and what a
// recipe is made from - a proven style, a kept music take, a registry topic. Picking a recipe
// composes a draft and the caller opens its Plan.
//
// Non-modal, as the prototype drew it (aria-modal false): a POPOVER on the layer stack, so it
// owns the `compose` keys while it is on top, an outside press closes it, and Escape is the
// router's (keymap/route.ts) - no private listener. Focus enters on the first recipe, so 1/2/3
// and ⏎ work from the moment it opens; focus returns to the opener on close (useLayer).
//
// The choices arrive from the port (proven styles only, kept takes only), never a hand list.
import { useEffect, useRef, type RefObject } from "react";

import type { MediaLane } from "@gt/domain/lane";

import { useKeys } from "../../keymap/dispatch.ts";
import { useLayer } from "../../layers/useLayer.ts";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { FloorGlyph } from "../floor/FloorGlyph.tsx";
import { Ghost } from "../ghost/Ghost.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { capsFor } from "../keycaps/caps.ts";
import kc from "../keycaps/Keycaps.module.css";
import s from "./Compose.module.css";

export type RecipeChoice = { readonly id: string; readonly label: string; readonly sub: string; readonly icon: MediaLane };
export type Choice = { readonly value: string; readonly label: string };

export type ComposeSources = { readonly styleId: string; readonly takeId: string; readonly topic: string };

export type ComposeDialogProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly recipes: readonly RecipeChoice[];
  readonly styles: readonly Choice[];
  readonly takes: readonly Choice[];
  readonly topics: readonly Choice[];
  readonly value: ComposeSources;
  readonly onValue: (v: ComposeSources) => void;
  readonly onRecipe: (id: string) => void;
  readonly busy: boolean;
  readonly error?: string;
  readonly anchorRef?: RefObject<HTMLElement | null>;
  /** A /kit specimen: drawn in place, never on the stack, keys unbound. */
  readonly specimen?: boolean;
};

/** How many recipes get a digit (the keymap's `compose` row binds 1-3). */
export const KEYED_RECIPES = 3;

function Src({ label, value, options, onChange }: { readonly label: string; readonly value: string; readonly options: readonly Choice[]; readonly onChange: (v: string) => void }) {
  return (
    <label className={s.src}>
      <span>{label}</span>
      {options.length === 0 ? (
        <Ghost label={`no ${label}`} />
      ) : (
        <select className={s.field} aria-label={label} value={value} onChange={(e) => onChange(e.currentTarget.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}

export function ComposeDialog({ open, onClose, recipes, styles, takes, topics, value, onValue, onRecipe, busy, error, anchorRef, specimen = false }: ComposeDialogProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  const first = useRef<HTMLButtonElement | null>(null);
  useLayer(open && !specimen, { kind: "popover", mode: "compose", panelRef: panel, onClose, ...(anchorRef === undefined ? {} : { anchorRef }) });
  const caps = capsFor("compose", "recipe");
  const pick = (id: string | undefined): void | false => {
    if (id === undefined || busy) return false;
    onRecipe(id);
  };
  useKeys("compose", { recipe: ({ index }) => pick(recipes[index]?.id) }, { enabled: open && !specimen });
  useEffect(() => {
    if (open && !specimen) first.current?.focus({ preventScroll: true });
  }, [open, specimen]);
  if (!open) return null;
  return (
    <div ref={panel} className={specimen ? s.inPlace : s.pop} role="dialog" aria-modal="false" aria-label="compose" aria-busy={busy ? true : undefined} data-component="ComposeDialog">
      <div className={s.head}>
        <CapsHeading text="compose" />
        <kbd className={kc.cap}>Esc</kbd>
      </div>
      <div className={s.recipes}>
        {recipes.map((r, i) => (
          <button key={r.id} ref={i === 0 ? first : undefined} type="button" className={i < KEYED_RECIPES ? s.recipe : s.more} aria-disabled={busy ? true : undefined} onClick={() => pick(r.id)} data-recipe={r.id}>
            {i < KEYED_RECIPES && (
              <span className={s.ri}>
                <FloorGlyph name={r.icon} />
              </span>
            )}
            <span className={s.rt}>
              <b>{r.label}</b>
              <span className={s.sub}>{r.sub}</span>
            </span>
            {i < KEYED_RECIPES && caps[i] !== undefined && <kbd className={kc.cap}>{caps[i]}</kbd>}
          </button>
        ))}
      </div>
      <div className={s.srcs}>
        <Src label="style" value={value.styleId} options={styles} onChange={(styleId) => onValue({ ...value, styleId })} />
        <Src label="take" value={value.takeId} options={takes} onChange={(takeId) => onValue({ ...value, takeId })} />
        <Src label="topic" value={value.topic} options={topics} onChange={(topic) => onValue({ ...value, topic })} />
      </div>
      {error !== undefined && <ErrorLine message={error} live />}
    </div>
  );
}
