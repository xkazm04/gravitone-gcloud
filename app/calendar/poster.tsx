"use client";

// AN EXPORT'S POSTER — a real frame of the film, not a placeholder.
//
// The publishing engine stores no thumbnail (lib/publish/exports.ts lists an
// id, a path and a size), and the one route that serves an export's bytes is
// the Cut step's download, /api/music-video/export/file (its own header: the
// mp4 lives outside public/, and that route is the only way to it). So the
// poster is grabbed here, ONCE per export per page: one off-screen <video>
// seeks a beat into the file, one canvas draws that frame at 480px, and every
// card that shows the export reads the same data URL. A week with nine slots
// of one export costs one download, not nine.
//
// THE ABSENCE IS DRAWN, NOT FAKED. An export the file route cannot serve (a
// non-uuid id, an exports directory the route does not read, a file deleted
// since it was listed) answers `null`, and the card draws a composed plate —
// a slate with the film glyph — rather than borrowing someone else's picture.
// Requested of lib/publish's owner: a poster route of its own, so this grab
// can retire (reported with this change).
//
// A GRAB IS A VIDEO DOWNLOAD, so it is spent on what is on screen and two at a
// time (Wave 5). A <Poster> asks for its frame when it scrolls within reach of
// the viewport — the composer's export strip and the hours of the week below
// the fold no longer start a read each on first paint — and the asks queue
// behind MAX_GRABS reads in flight rather than all opening at once.

import { Film } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

import { withAccess } from "@/lib/imagingClient";

export interface PosterInfo {
  src: string;
  /** the video's own pixel size — what says 9:16 or 16:9 */
  w: number;
  h: number;
  durationS: number | null;
}

const UUID = /^[0-9a-f-]{36}$/i;
const done = new Map<string, PosterInfo | null>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const settle = (id: string, info: PosterInfo | null) => {
  done.set(id, info);
  pending.delete(id);
  for (const fn of listeners) fn();
};

/** The file route's address, with the access credential as `k=` (`withAccess`):
 *  a <video src> cannot carry an Authorization header. */
function fileUrl(id: string): string {
  return withAccess(`/api/music-video/export/file?id=${encodeURIComponent(id)}`);
}

const MAX_GRABS = 2;
const queue: string[] = [];
let running = 0;

/** Ask for an export's frame: answered from the cache, else queued. */
function request(id: string) {
  if (done.has(id) || pending.has(id)) return;
  if (!UUID.test(id)) {
    settle(id, null);
    return;
  }
  pending.add(id);
  queue.push(id);
  pump();
}

function pump() {
  while (running < MAX_GRABS && queue.length) {
    const id = queue.shift()!;
    running++;
    grab(id, () => {
      running--;
      pump();
    });
  }
}

function grab(id: string, after: () => void) {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  let over = false;
  const finish = (info: PosterInfo | null) => {
    if (over) return;
    over = true;
    clearTimeout(timer);
    v.removeAttribute("src");
    v.load();
    settle(id, info);
    after();
  };
  const timer = setTimeout(() => finish(null), 20_000);
  v.onloadeddata = () => {
    const d = Number.isFinite(v.duration) ? v.duration : 2;
    // a beat in, not frame zero: a fade from black is the commonest first frame
    v.currentTime = Math.min(1.2, d * 0.3);
  };
  v.onseeked = () => {
    try {
      const W = 480;
      const H = Math.max(1, Math.round((v.videoHeight / Math.max(1, v.videoWidth)) * W));
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      c.getContext("2d")?.drawImage(v, 0, 0, W, H);
      finish({
        src: c.toDataURL("image/jpeg", 0.84),
        w: v.videoWidth,
        h: v.videoHeight,
        durationS: Number.isFinite(v.duration) ? v.duration : null,
      });
    } catch {
      finish(null);
    }
  };
  v.onerror = () => finish(null);
  v.src = fileUrl(id);
}

/** undefined while the frame is being read; null when there is none to read.
 *  With `near`, the read waits until that element is within reach of the
 *  viewport; without it, it is asked for at once (the opened slot's sheet). */
export function usePoster(exportId: string | null, near?: RefObject<Element | null>): PosterInfo | null | undefined {
  const info = useSyncExternalStore(
    subscribe,
    () => (exportId ? done.get(exportId) : null),
    () => undefined,
  );
  useEffect(() => {
    if (!exportId || done.has(exportId)) return;
    const el = near?.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      request(exportId);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          request(exportId);
        }
      },
      { rootMargin: "320px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [exportId, near]);
  return info;
}

/** "9:16" / "16:9" / "1:1" from a poster's pixel size, or null. */
export function aspectWord(p: PosterInfo | null | undefined): string | null {
  if (!p) return null;
  const r = p.w / p.h;
  if (r < 0.75) return "9:16";
  if (r > 1.4) return "16:9";
  return "1:1";
}

/**
 * The poster, filling its box (`className` sizes it). A vertical film inside a
 * landscape box sits on a blurred copy of itself rather than on black bars.
 */
export function Poster({
  exportId,
  className = "",
  dim = false,
  fit = "cover",
}: {
  exportId: string | null;
  className?: string;
  /** a cancelled slot's poster: desaturated, faded */
  dim?: boolean;
  /** `contain` keeps a vertical film whole inside a landscape box */
  fit?: "cover" | "contain";
}) {
  const box = useRef<HTMLSpanElement | null>(null);
  const p = usePoster(exportId, box);
  const tone = dim ? "grayscale opacity-45" : "";
  // the layers inside need a positioned box; a caller that already placed this
  // one absolutely has given it one, and a second `relative` would undo that
  const pos = /\babsolute\b/.test(className) ? "" : "relative";
  if (p === undefined) {
    return <span ref={box} aria-hidden className={`block animate-pulse bg-white/[0.04] ${className}`} />;
  }
  if (p === null) {
    return (
      <span
        aria-hidden
        className={`${pos} flex items-center justify-center overflow-hidden bg-gradient-to-br from-cyan-400/[0.12] via-violet-400/[0.07] to-white/[0.02] ${tone} ${className}`}
      >
        <span className="absolute inset-x-0 top-0 h-2 bg-[repeating-linear-gradient(90deg,var(--gt-wash)_0_10px,transparent_10px_18px)]" />
        <span className="absolute inset-x-0 bottom-0 h-2 bg-[repeating-linear-gradient(90deg,var(--gt-wash)_0_10px,transparent_10px_18px)]" />
        <Film className="h-1/4 max-h-8 w-auto text-white/25" />
      </span>
    );
  }
  const vertical = p.h > p.w * 1.1;
  if (fit === "contain" && vertical) {
    return (
      <span aria-hidden className={`${pos} block overflow-hidden bg-[var(--gt-ink)] ${tone} ${className}`}>
        <span
          className="absolute inset-0 scale-125 bg-cover bg-center opacity-45 blur-2xl"
          style={{ backgroundImage: `url(${p.src})` }}
        />
        <span className="absolute inset-0 flex justify-center">
          <span
            className="aspect-[9/16] h-full bg-cover bg-center shadow-[var(--gt-shadow-float)]"
            style={{ backgroundImage: `url(${p.src})` }}
          />
        </span>
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`block bg-cover bg-center ${tone} ${className}`}
      style={{ backgroundImage: `url(${p.src})` }}
    />
  );
}
