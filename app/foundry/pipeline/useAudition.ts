"use client";

// ONE AUDIO ELEMENT FOR THE WHOLE BOARD.
//
// A skin may put `data-play data-src` on a control inside a card (ledger does,
// for audio takes). Five hundred cards must not mean five hundred media
// elements, and a card may not hold a callback, so the playing is done here —
// one detached Audio, reached through the same delegated listener that already
// finds `[data-card]`, and the button's state written as ATTRIBUTES on its own
// node rather than lifted into React, because a `playing` prop would re-render a
// memoised card on every press.
//
// It is the one piece of the canvas that needs nothing else the canvas has: no
// camera, no layout, no source, no selection. That is why it is the first thing
// to leave PipelineCanvas.tsx, and it leaves with its own two refs rather than
// borrowing the component's.

import { useEffect, useRef } from "react";

/** Returns the one handler the delegated click needs: hand it the `[data-play]`
 *  element that was pressed. */
export function useAudition(): (btn: HTMLElement) => void {
  const audio = useRef<HTMLAudioElement | null>(null);
  const playBtn = useRef<HTMLElement | null>(null);

  const markPlay = (btn: HTMLElement | null) => {
    const was = playBtn.current;
    // `isConnected`: the card holding the previous button may have been culled
    // while its take played on, and an attribute written to a detached node is
    // harmless but pointless.
    if (was && was !== btn && was.isConnected) {
      was.removeAttribute("data-playing");
      was.setAttribute("aria-pressed", "false");
    }
    playBtn.current = btn;
    if (btn) {
      btn.setAttribute("data-playing", "");
      btn.setAttribute("aria-pressed", "true");
    }
  };

  const playFromCard = (btn: HTMLElement) => {
    const src = btn.dataset.src;
    if (!src) return;
    let el = audio.current;
    if (!el) {
      el = new Audio();
      el.preload = "none";
      // ONE listener, and `ended` ONLY. A `pause` listener here looked right and
      // was a race: assigning `el.src` while something is playing makes the
      // browser fire `pause`, asynchronously, AFTER this function has already
      // marked the new button — so pressing a second card's play released the
      // first (correct), marked the second, and was then cleared by the first's
      // own pause event. Nothing played, and both buttons read idle. Driven:
      // first press plays, second press used to leave silence, now it hands over.
      // Every deliberate stop marks itself below, so `pause` has no work to do.
      el.addEventListener("ended", () => markPlay(null));
      audio.current = el;
    }
    // The same source pressed again is a stop, which is what a toggle means.
    if (playBtn.current === btn && !el.paused) {
      el.pause();
      markPlay(null);
      return;
    }
    if (el.src !== new URL(src, window.location.href).href) el.src = src;
    el.currentTime = 0;
    markPlay(btn);
    // A refused play (no gesture, a 404, a codec) must leave the button honest
    // rather than stuck showing a pause glyph over silence.
    void el.play().catch(() => markPlay(null));
  };

  useEffect(
    () => () => {
      const el = audio.current;
      if (el) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
      audio.current = null;
      playBtn.current = null;
    },
    [],
  );

  return playFromCard;
}
