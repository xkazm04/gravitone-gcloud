"use client";

// The words-only stage plate: an item drawn as its own still, pull quote or
// typographic card when it has no picture. Split out of parts.tsx because
// parts.tsx's `media` section ran past the 200-line gate with it included.
// Imports its washes and pips from partsMedia.tsx.

import { SOURCE_LABEL } from "@/lib/board/registry";
import type { BoardEntry } from "@/lib/board/source";
import { coverOf, fact, KIND_ICON, SOURCE_ICON, splitTitle } from "./look";
import { Confidence, Media, TEXT_WASH } from "./partsMedia";

/**
 * Words-only items at stage size. The adoption candidate opens on its engine's
 * still with the first beat as a pull quote; a research card on its kind, its
 * confidence and its note; a publish slot on its error, verbatim, or its copy.
 */
export function TextPlate({
  entry,
  withTitle = false,
  className = "",
}: {
  entry: BoardEntry;
  withTitle?: boolean;
  className?: string;
}) {
  const { item } = entry;
  // A research card with no note carries its claim as its only words — the
  // same sentence as its title — and printing it twice is not a second fact.
  const words = item.media
    .filter((m) => m.kind === "text" && m.text && m.text.trim() !== item.title.trim())
    .map((m) => m.text as string);
  const cover = coverOf(item);
  const { kicker } = splitTitle(item);
  if (item.source === "adoption")
    return (
      <div className={`flex min-h-0 flex-col gap-5 ${className}`}>
        {cover?.src && (
          <div className="relative aspect-[21/8] w-full shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10">
            <Media media={cover} alt="" />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--gt-ink)] via-transparent to-transparent" />
            {kicker && (
              <span className="font-jetbrains absolute bottom-3 left-4 rounded-full border border-emerald-300/30 bg-black/40 px-3 py-1 text-label tracking-[0.14em] text-emerald-100 uppercase backdrop-blur">
                {kicker}
              </span>
            )}
          </div>
        )}
        {words.map((t, i) => (
          <blockquote key={i} className="relative max-w-[62ch] pl-10">
            <span aria-hidden className="font-instrument absolute top-[-0.1em] left-0 text-5xl leading-none text-emerald-300/40">
              “
            </span>
            <p className="font-hanken text-xl leading-relaxed text-white/90">{t}</p>
          </blockquote>
        ))}
      </div>
    );
  const Icon = item.source === "triage" ? (KIND_ICON[fact(entry, "kind") ?? ""] ?? SOURCE_ICON.triage) : SOURCE_ICON[item.source];
  const status = fact(entry, "status");
  const failing = item.source === "publish" && (status === "failed" || status === "missed");
  return (
    <div
      className={`relative flex min-h-0 flex-col justify-center overflow-hidden rounded-xl bg-gradient-to-br ${TEXT_WASH[item.source] ?? "from-cyan-400/[0.08] via-white/[0.02] to-violet-400/[0.06]"} ring-1 ring-white/8 px-8 py-8 ${className}`}
    >
      <Icon aria-hidden className="absolute -right-6 -bottom-8 h-56 w-56 text-white/[0.04]" strokeWidth={1} />
      <div className="relative flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
          <Icon aria-hidden className={`h-5 w-5 ${failing ? (status === "failed" ? "text-rose-300" : "text-amber-300") : "text-white/70"}`} strokeWidth={1.75} />
        </span>
        <span className="font-jetbrains text-label tracking-[0.16em] text-white/55 uppercase">
          {item.source === "triage" ? fact(entry, "kind") : (status ?? SOURCE_LABEL[item.source])}
        </span>
        {item.source === "triage" && <Confidence entry={entry} />}
      </div>
      {withTitle && <p className="font-hanken relative mt-6 max-w-[48ch] text-2xl leading-snug font-medium text-white">{item.title}</p>}
      {words.map((t, i) =>
        failing && i === 0 ? (
          <p key={i} role="status" className="relative mt-6 max-w-[64ch] rounded-xl border border-rose-400/25 bg-rose-400/[0.07] px-4 py-3 font-hanken text-content leading-relaxed text-rose-100/90">
            {t}
          </p>
        ) : (
          <p key={i} className="font-hanken relative mt-6 max-w-[64ch] text-content leading-relaxed text-white/75">
            {t}
          </p>
        ),
      )}
      {item.source === "triage" && fact(entry, "source") && (
        <p className="font-jetbrains relative mt-6 text-label text-white/50">
          <span aria-hidden>— </span>
          <span className="sr-only">source: </span>
          {fact(entry, "source")}
        </p>
      )}
    </div>
  );
}
