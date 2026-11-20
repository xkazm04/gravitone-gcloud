"use client";

// THE STAGE - one candidate's pictures or its film. A film plays muted with its stills beside it; a set of stills is
// a grid (a storyboard's beat under each frame); a seed is its sentence. The frame view is one file, large. The
// stamp is the verdict's word, played over the stage before the next candidate comes up.

import type { CSSProperties, RefObject } from "react";

import type { CanvasFile } from "../../../_port/contract.ts";
import type { Item } from "../../scene/types.ts";
import type { Tone } from "../../tables.ts";
import s from "../gallery.module.css";
import { cx, Gl } from "../kit.tsx";
import { colsOf, images, video, type G } from "./model.tsx";

export type Stamp = { readonly text: string; readonly tone: Tone; readonly n: number } | null;

type Vars = CSSProperties & Record<`--${string}`, number>;

function Film({ f, poster, label, vref }: { readonly f: CanvasFile; readonly poster?: string; readonly label: string; readonly vref: RefObject<HTMLVideoElement | null> }) {
  return (
    <div className={s.vwrap}>
      <video ref={vref} src={f.src} poster={poster} autoPlay muted loop playsInline controls aria-label={label} />
      {f.audio === false && (
        <span className={s.silent} data-role="no-audio">
          <Gl name="mute" size={13} />
          no audio stream
        </span>
      )}
    </div>
  );
}

export function Stage({ g, it, beats, stamp, vref, onFrame, onOne }: { readonly g: G; readonly it: Item; readonly beats: readonly string[] | null; readonly stamp: Stamp; readonly vref: RefObject<HTMLVideoElement | null>; readonly onFrame: (i: number) => void; readonly onOne: () => void }) {
  const files = it.media?.files ?? [];
  if (g.mode === "frame") {
    const fl = files[g.frame] ?? files[0];
    return (
      <div className={s.stage} data-role="gallery-stage" data-frame={g.frame}>
        {fl === undefined ? null : fl.type === "video" ? (
          <Film f={fl} label={it.label} vref={vref} />
        ) : (
          <img src={fl.src} alt={`${it.label} · ${g.frame + 1} / ${files.length}`} onClick={onOne} />
        )}
      </div>
    );
  }
  const ims = images(it);
  const vid = video(it);
  const frameOf = (f: CanvasFile): number => files.indexOf(f);
  const cols = colsOf(ims.length);
  const style: Vars = { "--cols": cols, "--rows": cols === 0 ? 0 : Math.ceil(ims.length / cols) };
  const storyboard = it.node !== null && it.node.kind === "storyboard";
  return (
    <div className={cx(s.stage, vid === null && ims.length > 1 && s.frames)} style={style} data-role="gallery-stage">
      {vid !== null ? (
        <>
          <Film f={vid} poster={ims[0]?.src} label={it.label} vref={vref} />
          {ims.length > 0 && (
            <div className={s.side}>
              {ims.map((f, i) => (
                <img key={f.src} src={f.src} alt={`${it.label} · ${i + 1}`} onClick={() => onFrame(frameOf(f))} />
              ))}
            </div>
          )}
        </>
      ) : ims.length > 0 ? (
        ims.map((f, i) => {
          const beat = storyboard && beats !== null ? beats[i] : undefined;
          return (
            <figure key={f.src}>
              <img src={f.src} alt={`${it.label} · ${i + 1}`} onClick={() => onFrame(frameOf(f))} />
              {beat !== undefined && (
                <figcaption data-role="gallery-caption">
                  <i>{i + 1}</i>
                  <span>{beat}</span>
                </figcaption>
              )}
            </figure>
          );
        })
      ) : (
        <div className={s.seedcard}>{it.label}</div>
      )}
      <div key={stamp?.n ?? 0} className={cx(s.stamp, stamp !== null && s.on)} style={stamp === null ? undefined : { color: `var(--${stamp.tone})` }} aria-hidden="true">
        {stamp?.text}
      </div>
    </div>
  );
}
