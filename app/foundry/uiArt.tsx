"use client";

// The picture frame: Art, and the absent states it draws in place of a picture
// (ABSENT). Split out of ui.tsx (which re-exports Art) so the door stays under
// the 200-line cap.

import { AlertTriangle, Hourglass, ImageOff, Loader2, X } from "lucide-react";
import { useState } from "react";

/* ── Pictures ─────────────────────────────────────────────────────────────── */

export type ArtState = "ready" | "queued" | "generating" | "failed" | "deleted" | "missing" | "blank";

const ABSENT: Record<Exclude<ArtState, "ready" | "blank">, { icon: typeof Hourglass; word: string; tone: string }> = {
  queued: { icon: Hourglass, word: "queued", tone: "text-white/45" },
  generating: { icon: Loader2, word: "generating", tone: "text-cyan-200/90" },
  failed: { icon: AlertTriangle, word: "failed", tone: "text-rose-300/90" },
  deleted: { icon: X, word: "culled", tone: "text-white/40" },
  missing: { icon: ImageOff, word: "no image", tone: "text-white/40" },
};

/**
 * A picture in a rounded frame, or the honest absence of one.
 *
 * Absence is a WASH, not a hole: the diagonal `--gt-wash` the frames step draws
 * behind an ungenerated plate, a glyph, and the one word for why — queued,
 * failed, culled. A dashed rectangle with nothing in it was the old drawing of
 * the same fact, and it read as a page nobody had finished.
 */
export function Art({
  src,
  alt,
  state = src ? "ready" : "missing",
  className = "aspect-video",
  rounded = "rounded-xl",
  fit = "cover",
  absentWord,
  children,
}: {
  src?: string | null;
  alt: string;
  state?: ArtState;
  className?: string;
  rounded?: string;
  fit?: "cover" | "contain";
  /** The one word for an absence, when the default ("no image") is not the
   *  work's own — a style with no render yet says so. */
  absentWord?: string;
  /** Overlays — stamps, chips, controls — positioned by the caller. */
  children?: React.ReactNode;
}) {
  // `blank` is the wash alone — a slot in a mosaic that has nothing to show
  // yet, where a glyph and a word in every cell would be noise.
  // A src that 404s is an absence too. styles.json names kept renders by the
  // path they had on the machine that forged them; on another checkout the
  // file is not there, and the browser's broken-image glyph is the one drawing
  // of absence this frame must never fall back to. Keyed by the src that
  // failed, so a new src gets its own chance.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const broken = Boolean(src) && failedSrc === src;
  // Glyph only, no word: a broken file is most often a 60px mosaic slot,
  // where "NO IMAGE" cannot fit and the glyph alone says it.
  const shown: ArtState = broken ? "missing" : state;
  const a = shown === "ready" || shown === "blank" ? null : ABSENT[shown];
  const wordless = broken && !absentWord;
  return (
    <div className={`relative overflow-hidden bg-white/[0.03] ${rounded} ${className}`}>
      {src && shown === "ready" ? (
        // eslint-disable-next-line @next/next/no-img-element -- served off local disk through /api/foundry/file; nothing for next/image to optimise
        <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailedSrc(src)} className={`absolute inset-0 h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`} />
      ) : (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5"
          style={{ backgroundImage: "linear-gradient(135deg, var(--gt-wash), transparent 70%)" }}
        >
          {a && (
            <>
              <a.icon aria-hidden className={`h-5 w-5 ${a.tone} ${state === "generating" ? "animate-spin" : ""}`} />
              {!wordless && (
                <span className={`font-jetbrains text-label tracking-[0.12em] uppercase ${a.tone}`}>{absentWord ?? a.word}</span>
              )}
              <span className="sr-only">{alt}</span>
            </>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
