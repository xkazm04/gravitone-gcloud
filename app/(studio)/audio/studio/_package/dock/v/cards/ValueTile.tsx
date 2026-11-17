"use client";

// A VALUE ON A CARD (kit candidate `ValueTile`): the field's name small, its value large, an empty value as a quiet
// dash, the problem on it as the tile's edge and the agent's pending suggestion as a violet mark. A press turns the
// tile into its editor in place (the kit's Field / Select), Done or Escape turns it back; the edit goes straight to
// the session, the tile holds only whether it is open. An accepted suggestion lands in it through the shared layoutId.
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import type { ProposalPath } from "@gt/domain/release.record";

import { SETTLE } from "./motion.ts";
import { valueId } from "./Offer.tsx";
import s from "./parts.module.css";

export interface ValueTileProps {
  readonly label: string;
  readonly value: string | null;
  /** The proposal path this tile shows: its suggestion lands here. */
  readonly path?: ProposalPath;
  /** The agent has a suggestion pending on this field. */
  readonly suggested?: boolean;
  readonly issue?: "block" | "warn" | null;
  readonly size?: "hero" | "md";
  readonly span?: 1 | 2;
  /** The editor drawn in place while the tile is open. */
  readonly editor: ReactNode;
}

export function ValueTile({ label, value, path, suggested = false, issue = null, size = "md", span = 1, editor }: ValueTileProps) {
  const reduce = useReducedMotion() === true;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) box.current?.querySelector<HTMLElement>("input,select,textarea")?.focus();
  }, [open]);

  const shared = path !== undefined && !suggested && !reduce ? { layoutId: valueId(path) } : {};
  return (
    <div
      ref={box}
      className={s.tile}
      data-size={size}
      data-span={span}
      data-issue={issue ?? undefined}
      data-open={open ? "" : undefined}
      onKeyDown={(e) => {
        if (open && e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      {open ? (
        <div className={s.tileEdit}>
          <span className={s.tileLabel}>{label}</span>
          <div className={s.tileEditor}>{editor}</div>
          <Button label="Done" size="sm" onPress={() => setOpen(false)} />
        </div>
      ) : (
        <button type="button" className={s.tileFace} aria-label={`${label}: ${value ?? "empty"}${issue === null ? "" : `, ${issue}`}${suggested ? ", suggested" : ""}. Edit`} onClick={() => setOpen(true)}>
          <span className={s.tileLabel} aria-hidden="true">
            {label}
            {suggested && <span className={s.tileSuggested} />}
          </span>
          {value === null ? (
            <span className={s.tileEmpty} aria-hidden="true">
              —
            </span>
          ) : (
            <motion.span key={value} className={s.tileValue} aria-hidden="true" initial={reduce || path !== undefined ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={SETTLE} {...shared}>
              {value}
            </motion.span>
          )}
        </button>
      )}
    </div>
  );
}
