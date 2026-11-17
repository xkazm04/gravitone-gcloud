"use client";

// THE RELEASE AWAY FROM THE STORES, drawn from the sleeve and the metadata already in the draft: a smart-link page (a
// door per picked channel), a 9:16 canvas of the sleeve, and the promo cards. One face per preview at two sizes - a
// thumbnail on the card, large in its dialog.
import type { ComponentType } from "react";

import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { CHANNEL_NAMES, releaseKind, type Release } from "@gt/domain/release";

import { day, KIND_LABEL } from "../../../../../../_release/wizard/fmt.ts";
import { titleOf } from "../model.ts";
import s from "./previews.module.css";

type Size = "sm" | "lg";
interface FaceProps {
  readonly r: Release;
  readonly size: Size;
}

const outLine = (r: Release): string => (r.releaseDate === null ? "Out soon" : `Out ${day(r.releaseDate)}`);

export function Art({ r, size }: FaceProps) {
  return r.sleeve !== null && r.sleeve.href !== null ? <Plate src={r.sleeve.href} alt="" className={s.art} width={size === "sm" ? 120 : 360} aspect={1} /> : <PlateMissing className={s.art} aspect={1} />;
}

function SmartLink({ r, size }: FaceProps) {
  return (
    <div className={s.link} data-size={size} role="img" aria-label={`smart link page for ${titleOf(r)}: ${r.channels.length} channels`}>
      <Art r={r} size={size} />
      <span className={s.title}>{titleOf(r)}</span>
      <span className={s.meta}>
        {r.artist} · {KIND_LABEL[releaseKind(r.tracks)]}
      </span>
      <span className={s.doors}>
        {r.channels.map((c) => (
          <span key={c} className={s.door}>
            <span>{CHANNEL_NAMES[c]}</span>
            <b>Play</b>
          </span>
        ))}
      </span>
    </div>
  );
}

function Canvas({ r, size }: FaceProps) {
  return (
    <div className={s.canvas} data-size={size} role="img" aria-label={`vertical loop of the sleeve of ${titleOf(r)}`}>
      <Art r={r} size={size} />
    </div>
  );
}

function Promo({ r, size, story }: FaceProps & { readonly story: boolean }) {
  return (
    <div className={story ? s.story : s.square} data-size={size} role="img" aria-label={`${story ? "vertical" : "square"} promo card: ${titleOf(r)}, ${r.artist}, ${outLine(r)}`}>
      <Art r={r} size={size} />
      <span className={s.promoText}>
        <span className={s.out}>{outLine(r)}</span>
        <span className={s.title}>{titleOf(r)}</span>
        <span className={s.meta}>{r.artist}</span>
      </span>
    </div>
  );
}

export type PreviewId = "link" | "canvas" | "square" | "story";

export const PREVIEWS: Readonly<Record<PreviewId, { readonly label: string; readonly shape: "tall" | "square"; readonly Face: ComponentType<FaceProps> }>> = {
  link: { label: "smart link", shape: "tall", Face: SmartLink },
  canvas: { label: "canvas · 9:16", shape: "tall", Face: Canvas },
  square: { label: "promo · 1:1", shape: "square", Face: (p) => <Promo {...p} story={false} /> },
  story: { label: "promo · 9:16", shape: "tall", Face: (p) => <Promo {...p} story /> },
};
