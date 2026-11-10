"use client";

// Plate's twin for a clip: one <video> drawn in a grid or a detail, with the same three states
// (./settle.ts) - waiting on the ink ground in its reserved box, loaded, failed as the hatched
// "not loaded" ground - so a clip that will not play is a drawn absence, never a black rectangle
// that might still be buffering.
//
// The browser's own player, never a custom one: controls are the native ones where the site asks
// for them. `preload="metadata"` by default, as every site had it: a grid of clips fetches each
// one's head, not its body. A poster that is a blob is asked for at the variant its box needs
// (./sources.ts posterSource); a poster takes one URL, so the device ratio is assumed.
//
// The fade is for a clip with no poster: a poster paints before the metadata lands, and fading
// in what is already on screen would be a flicker.
import type { Ref } from "react";

import { cx } from "../cx.ts";
import { PlateMissing } from "./Plate.tsx";
import { enter, useSettle, videoDone } from "./settle.ts";
import { posterSource } from "./sources.ts";
import p from "./Plate.module.css";
import s from "./Clip.module.css";

export type ClipProps = {
  readonly src: string | undefined;
  /** The clip's accessible name, from the work (its title or take); "" where the box around it is already named. */
  readonly label: string;
  readonly poster?: string | undefined;
  /** CSS pixels the clip is drawn at: a blob poster is fetched at the variant that covers it. */
  readonly width?: number | undefined;
  /** Width over height, when the caller knows it: the box is reserved before a byte arrives. */
  readonly aspect?: number | undefined;
  readonly className?: string | undefined;
  readonly controls?: boolean;
  readonly muted?: boolean;
  readonly loop?: boolean;
  readonly autoPlay?: boolean;
  readonly preload?: "none" | "metadata" | "auto";
  readonly ref?: Ref<HTMLVideoElement> | undefined;
  readonly onLoadedMetadata?: ((el: HTMLVideoElement) => void) | undefined;
};

function assign(ref: Ref<HTMLVideoElement> | undefined, el: HTMLVideoElement | null): void {
  if (typeof ref === "function") ref(el);
  else if (ref !== undefined && ref !== null) ref.current = el;
}

export function Clip({ src, label, poster, width, aspect, className, controls = false, muted = false, loop = false, autoPlay = false, preload = "metadata", ref, onLoadedMetadata }: ClipProps) {
  const { phase, settle } = useSettle(src);
  const box = aspect === undefined ? undefined : { aspectRatio: aspect };
  const name = label === "" ? undefined : label;
  if (src === undefined || src === "") return <span className={cx(className, p.plate, p.blank)} style={box} data-state="waiting" aria-hidden="true" />;
  if (phase === "failed") return <PlateMissing label={label} className={className} aspect={aspect} />;
  return (
    <video
      className={cx(className, s.clip)}
      src={src}
      poster={poster === undefined ? undefined : posterSource(poster, width)}
      controls={controls}
      muted={muted}
      loop={loop}
      autoPlay={autoPlay}
      playsInline
      preload={preload}
      aria-label={name}
      style={box}
      data-state={phase === "waiting" ? "waiting" : "loaded"}
      data-enter={phase === "entered" ? "" : undefined}
      onLoadedMetadata={(e) => {
        const el = e.currentTarget;
        onLoadedMetadata?.(el);
        if (phase !== "waiting") return;
        if (poster === undefined) {
          enter(el);
          settle("entered");
        } else settle("loaded");
      }}
      onError={() => settle("failed")}
      ref={(el) => {
        assign(ref, el);
        // Metadata or an error that landed before the handlers were attached.
        const done = el === null || phase !== "waiting" ? undefined : videoDone(el);
        if (done !== undefined) settle(done);
      }}
    />
  );
}
