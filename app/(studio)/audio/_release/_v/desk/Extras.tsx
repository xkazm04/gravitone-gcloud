"use client";

// The release's extras, drawn from what the draft already holds: a smart-link page (sleeve, title,
// artist, one button per picked channel), an 8-second 9:16 canvas loop moved from the sleeve, the
// promo card square and tall, and the splits sheet.
import type { Dispatch } from "react";

import { CHANNEL_NAMES, type Release } from "@gt/domain/release";
import type { ReleaseProblem } from "@gt/domain/release.problems";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";

import type { DraftEvent } from "../../draft.ts";
import { Splits } from "./Splits.tsx";
import r from "./rail.module.css";

export type ExtrasProps = {
  readonly release: Release;
  readonly problems: readonly ReleaseProblem[];
  readonly dispatch: Dispatch<DraftEvent>;
};

export function Extras({ release, problems, dispatch }: ExtrasProps) {
  const href = release.sleeve?.href ?? null;
  const art = (cls: string | undefined) => (href === null ? <PlateMissing className={cls} /> : <Plate src={href} alt="" className={cls} />);
  const title = release.title.trim() === "" ? "untitled" : release.title;
  const out = `Out ${release.releaseDate ?? "on release"}`;
  return (
    <section className={r.block} aria-label="extras">
      <CapsHeading text="extras" level={3} />
      <div className={r.extras}>
        <figure className={r.ex}>
          <div className={r.link}>
            {art(r.linkArt)}
            <span className={r.linkTitle}>{title}</span>
            <span className={r.linkArtist}>{release.artist}</span>
            <ul className={r.linkBtns}>
              {release.channels.map((c) => (
                <li key={c} className={r.linkBtn}>
                  <span>{CHANNEL_NAMES[c]}</span>
                  <span className={r.linkGo}>Play</span>
                </li>
              ))}
              {release.channels.length === 0 && <li className={r.linkNone}>—</li>}
            </ul>
          </div>
          <figcaption className={r.exCap}>smart link</figcaption>
        </figure>

        <figure className={r.ex}>
          <div className={r.canvas}>
            {art(r.canvasArt)}
            <span className={r.sweep} aria-hidden="true" />
          </div>
          <figcaption className={r.exCap}>canvas · 8 s</figcaption>
        </figure>

        <figure className={r.ex}>
          <div className={r.promoSq}>
            {art(r.promoArt)}
            <span className={r.promoText}>
              <b>{title}</b>
              <span>{release.artist}</span>
              <span className={r.promoOut}>{out}</span>
            </span>
          </div>
          <figcaption className={r.exCap}>promo 1:1</figcaption>
        </figure>

        <figure className={r.ex}>
          <div className={r.promoTall}>
            {art(r.promoArt)}
            <span className={r.promoText}>
              <b>{title}</b>
              <span>{release.artist}</span>
              <span className={r.promoOut}>{out}</span>
            </span>
          </div>
          <figcaption className={r.exCap}>promo 9:16</figcaption>
        </figure>
      </div>
      <Splits release={release} problems={problems} dispatch={dispatch} />
    </section>
  );
}
