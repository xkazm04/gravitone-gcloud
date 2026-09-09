"use client";

// CLIP — the app's short looping video, everywhere it appears.
//
// One component because a <video> that plays itself is four decisions, and each
// one is a bug if a surface makes it alone:
//
//   MUTED, and muted before anything else. An unmuted autoplay is refused by
//   every browser, and the refusal is silent — the surface shows a frozen
//   poster and nobody knows why. These clips have no audio track at all
//   (pipeline/video/transcode.mjs strips it), so this costs nothing.
//
//   PLAYS INLINE. Without it iOS Safari takes the video fullscreen the moment
//   it plays, which on a preset showcase is an ambush.
//
//   ONLY WHEN SEEN. `preload="none"` plus an IntersectionObserver: a clip
//   scrolled past is never fetched, and one scrolled away from stops decoding.
//   Six of these on one page is otherwise six decoders running for one
//   viewer's attention.
//
//   ONLY WHEN WANTED. `prefers-reduced-motion: reduce` is a request this
//   component must honour itself — the blanket CSS rule in globals.css reaches
//   `animation`, and a playing video is not an animation. It degrades to its
//   poster with a real play control, so the clip is still REACHABLE; deleting
//   the content is not what the preference asks for.
//
// The poster is the clip's own first frame, so the still on screen before the
// video decodes is the frame it starts on and nothing jumps — and it is also
// the FALLBACK. A browser that can play none of the sources leaves the poster
// up, which is a correct still picture rather than a hole; that is what makes
// shipping one codec rather than two an honest saving and not a bug.

import { useEffect, useRef, useState } from "react";

import { Play } from "lucide-react";

import { usePrefersReducedMotion } from "./motionPreference";

export interface ClipSource {
  src: string;
  /** Full MIME with codecs, so the browser can refuse without fetching. */
  type: string;
}

export default function Clip({
  sources,
  poster,
  label,
  active = true,
  className = "",
}: {
  /** Best format first — the browser takes the first it can play and fetches
   *  nothing else. */
  sources: ClipSource[];
  poster: string;
  /** What the clip shows, for the non-visual channel. A <video> has no alt. */
  label: string;
  /** False parks it on its poster: the surface has something else in view.
   *  Used by a showcase where one of several clips plays at a time. */
  active?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = usePrefersReducedMotion();
  /** Overridden to true when the user presses play under reduced motion. */
  const [asked, setAsked] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => setSeen(entries[0]?.isIntersecting ?? false), {
      threshold: 0.25,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const wanted = seen && active && (!reduced || asked);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (wanted) {
      // A rejected play() is a promise rejection, and an unhandled one is a
      // console error on a surface that is working correctly — an autoplay
      // refusal leaves the poster up, which is the right picture anyway.
      void el.play().catch(() => {});
    } else {
      el.pause();
      // Back to the first frame: a paused clip parked mid-motion reads as a
      // stall, and the poster it returns to is that frame.
      if (!Number.isNaN(el.duration)) el.currentTime = 0;
    }
  }, [wanted]);

  return (
    <span className={`relative block overflow-hidden ${className}`}>
      <video
        ref={ref}
        poster={poster}
        muted
        loop
        playsInline
        preload="none"
        aria-label={label}
        className="block h-full w-full object-cover"
      >
        {sources.map((s) => (
          <source key={s.src} src={s.src} type={s.type} />
        ))}
      </video>

      {reduced && !asked && (
        <button
          type="button"
          onClick={() => setAsked(true)}
          aria-label={`Play: ${label}`}
          className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/25 transition hover:bg-black/10"
        >
          <span className="rounded-full border border-white/25 bg-black/50 p-3 text-white/90">
            <Play className="h-5 w-5" aria-hidden />
          </span>
        </button>
      )}
    </span>
  );
}
