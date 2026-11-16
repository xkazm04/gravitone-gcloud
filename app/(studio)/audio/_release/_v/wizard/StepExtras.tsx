"use client";

// Step 7, extras: what the release looks like away from the stores, drawn from the sleeve and the
// metadata already in the draft - the smart-link page (a door per picked channel), an eight-second
// 9:16 loop of the sleeve in the shape of a Spotify Canvas, the promo cards - and the splits sheet.
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { CHANNEL_NAMES, releaseKind, type Release } from "@gt/domain/release";

import { day, KIND_LABEL } from "./fmt.ts";
import { Splits } from "./Splits.tsx";
import type { StepProps } from "./steps.ts";
import s from "./extras.module.css";

const titleOf = (r: Release): string => (r.title.trim() === "" ? "untitled" : r.title);
const outLine = (r: Release): string => (r.releaseDate === null ? "Out soon" : `Out ${day(r.releaseDate)}`);

function Art({ r, className, width }: { readonly r: Release; readonly className: string; readonly width: number }) {
  return r.sleeve !== null && r.sleeve.href !== null ? <Plate src={r.sleeve.href} alt="" className={className} width={width} /> : <PlateMissing label="no sleeve" className={className} />;
}

function SmartLink({ r }: { readonly r: Release }) {
  return (
    <figure className={s.preview}>
      <div className={s.phone} role="img" aria-label={`smart link page for ${titleOf(r)}: ${r.channels.length} channels`}>
        <div className={s.linkHead}>
          <Art r={r} className={s.linkArt} width={220} />
          <span className={s.linkTitle}>{titleOf(r)}</span>
          <span className={s.linkArtist}>
            {r.artist} · {KIND_LABEL[releaseKind(r.tracks)]}
          </span>
        </div>
        <ul className={s.linkDoors}>
          {r.channels.map((c) => (
            <li key={c} className={s.door}>
              <span>{CHANNEL_NAMES[c]}</span>
              <span className={s.doorAct}>Play</span>
            </li>
          ))}
        </ul>
        {r.channels.length === 0 && <Chip label="no channel picked" ghost />}
      </div>
      <figcaption className={s.cap}>smart link</figcaption>
    </figure>
  );
}

function Canvas({ r }: { readonly r: Release }) {
  return (
    <figure className={s.preview}>
      <div className={s.canvas} role="img" aria-label={`eight-second vertical loop of the sleeve of ${titleOf(r)}`}>
        <div className={s.canvasMove}>
          <Art r={r} className={s.canvasArt} width={360} />
        </div>
      </div>
      <figcaption className={s.cap}>canvas · 9:16 · 8 s loop</figcaption>
    </figure>
  );
}

function Promo({ r, shape }: { readonly r: Release; readonly shape: "square" | "story" }) {
  return (
    <figure className={s.preview}>
      <div className={shape === "square" ? s.promoSquare : s.promoStory} role="img" aria-label={`${shape === "square" ? "square" : "vertical"} promo card: ${titleOf(r)}, ${r.artist}, ${outLine(r)}`}>
        <Art r={r} className={s.promoArt} width={shape === "square" ? 240 : 200} />
        <div className={s.promoText}>
          <span className={s.promoOut}>{outLine(r)}</span>
          <span className={s.promoTitle}>{titleOf(r)}</span>
          <span className={s.promoArtist}>{r.artist}</span>
        </div>
      </div>
      <figcaption className={s.cap}>promo · {shape === "square" ? "1:1" : "9:16"}</figcaption>
    </figure>
  );
}

export function StepExtras({ release: r, problems, dispatch }: StepProps) {
  return (
    <div className={s.extras}>
      <section aria-label="previews">
        <CapsHeading text="Around the release" variant="section" />
        <div className={s.previews}>
          <SmartLink r={r} />
          <Canvas r={r} />
          <Promo r={r} shape="square" />
          <Promo r={r} shape="story" />
        </div>
      </section>
      <Splits release={r} problems={problems} dispatch={dispatch} />
    </div>
  );
}
