"use client";

// The board's picture-level pieces: the media element, a picture at stage size,
// an item's card art, and the research confidence pips. Split out of parts.tsx
// along its own `media` banner to keep each file under the 200-line gate.
// Re-exported from parts.tsx, which stays the import path.

import { PipRow, type PipState } from "@/components/ui/signal";
import { SOURCE_LABEL } from "@/lib/board/registry";
import type { BoardEntry } from "@/lib/board/source";
import type { BoardMedia, BoardSourceId } from "@/lib/board/types";
import { coverOf, fact, KIND_ICON, SOURCE_ICON } from "./look";

/* ── media ────────────────────────────────────────────────────────────────── */

export function Media({ media, alt, fit = "cover", className = "" }: { media: BoardMedia; alt: string; fit?: "cover" | "contain"; className?: string }) {
  const fitClass = fit === "contain" ? "object-contain" : "object-cover";
  if (media.kind === "image" && media.src)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam, or a data: proof
      <img src={media.src} alt={alt} loading="lazy" draggable={false} className={`block h-full w-full ${fitClass} ${className}`} />
    );
  if (media.kind === "video" && media.src)
    return <video src={media.src} controls muted playsInline className={`block h-full w-full ${fitClass} ${className}`} aria-label={alt} />;
  if (media.kind === "audio" && media.src) return <audio src={media.src} controls className="w-full" aria-label={alt} />;
  return null;
}

/**
 * A picture at stage size, at its own aspect: the image itself is rounded and
 * lifted, rather than letterboxed inside a grey box the size of the stage. A
 * role caption (baseline · challenger) sits under it, never on it.
 */
export function Picture({ media, alt, role, lifted = false }: { media: BoardMedia; alt: string; role?: string | null; lifted?: boolean }) {
  const cls = `block max-h-full max-w-full min-h-0 rounded-xl object-contain ring-1 ring-white/10 ${lifted ? "shadow-2xl shadow-black/60" : ""}`;
  return (
    <figure className="flex h-full min-h-0 w-full min-w-0 flex-col items-center justify-center gap-2">
      {media.kind === "video" && media.src ? (
        <video src={media.src} controls muted playsInline aria-label={alt} className={cls} />
      ) : media.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam, or a data: proof
        <img src={media.src} alt={alt} draggable={false} className={cls} />
      ) : null}
      {role && <figcaption className="font-jetbrains shrink-0 text-label tracking-[0.16em] text-white/55 uppercase">{role}</figcaption>}
    </figure>
  );
}

/** The washes a words-only card is drawn on — one per source family, so a
 *  research card and a publish slot are told apart before they are read.
 *  Tailwind palette alphas, the rendered form of tokens.ts ACCENT. */
export const TEXT_WASH: Partial<Record<BoardSourceId, string>> = {
  triage: "from-violet-400/[0.16] via-white/[0.03] to-cyan-400/[0.08]",
  publish: "from-amber-400/[0.14] via-white/[0.03] to-rose-400/[0.08]",
  adoption: "from-emerald-400/[0.12] via-white/[0.03] to-cyan-400/[0.08]",
  articles: "from-cyan-400/[0.12] via-white/[0.03] to-amber-400/[0.08]",
};

/**
 * An item's art at card size: its own picture when it has one, and a
 * typographic card when it is words — the research card's kind and claim, a
 * slot's channel and status. Never a grey box with a letter in it.
 */
export function Art({ entry, className = "" }: { entry: BoardEntry; className?: string }) {
  const { item } = entry;
  const cover = coverOf(item);
  if (cover)
    return (
      <span className={`relative block overflow-hidden bg-white/[0.03] ${className}`} aria-hidden="true">
        {cover.kind === "video" ? (
          <video src={cover.src} muted preload="metadata" className="block h-full w-full object-cover" />
        ) : (
          <Media media={cover} alt="" />
        )}
      </span>
    );
  const Icon = item.source === "triage" ? (KIND_ICON[fact(entry, "kind") ?? ""] ?? SOURCE_ICON.triage) : SOURCE_ICON[item.source];
  const wash = TEXT_WASH[item.source] ?? "from-cyan-400/[0.10] via-white/[0.03] to-violet-400/[0.08]";
  const kind = item.source === "triage" ? fact(entry, "kind") : item.source === "publish" ? fact(entry, "status") : SOURCE_LABEL[item.source];
  const status = item.source === "publish" ? fact(entry, "status") : null;
  return (
    <span className={`relative flex flex-col overflow-hidden bg-gradient-to-br ${wash} p-4 ${className}`} aria-hidden="true">
      <Icon className="absolute -right-3 -bottom-3 h-28 w-28 text-white/[0.05]" strokeWidth={1} />
      {/* pr-9 keeps the header clear of the batch tick a contact-sheet frame
          puts in this corner. */}
      <span className="flex items-center gap-2 pr-9">
        <Icon className={`h-4 w-4 shrink-0 ${status === "failed" ? "text-rose-300" : status === "missed" ? "text-amber-300" : "text-white/60"}`} strokeWidth={1.75} />
        <span className="font-jetbrains truncate text-label tracking-[0.14em] text-white/55 uppercase">{kind}</span>
        {item.source === "triage" && <Confidence entry={entry} />}
      </span>
      {/* A claim is READ, so it is set in the body face. The display face
          (font-instrument) stays on the headings that name a place — a roll,
          an empty sheet — where a condensed serif is a signature, not a
          paragraph to get through (the operator's call, 2026-10-05). */}
      <span className="font-hanken mt-2.5 line-clamp-4 text-content leading-snug font-medium text-white/90">{item.title}</span>
    </span>
  );
}

/** A research card's confidence, as three pips — high · medium · low. */
export function Confidence({ entry, className = "" }: { entry: BoardEntry; className?: string }) {
  const c = fact(entry, "confidence");
  if (!c) return null;
  const n = c === "high" ? 3 : c === "medium" ? 2 : c === "low" ? 1 : 0;
  const tone: PipState = c === "low" ? "amber" : "filled";
  return <PipRow className={className} states={Array.from({ length: n }, () => tone)} max={3} label={`confidence ${c}`} />;
}
