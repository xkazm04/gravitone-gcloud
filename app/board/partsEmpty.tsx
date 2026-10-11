"use client";

// Absence drawn as the shape of what will be there: three hollow cards and the
// source's glyph. Split out of parts.tsx from its source-state banner to keep
// each file under the 200-line gate; partsSource.tsx renders it.

import Link from "next/link";
import { ArrowUpRight, CircleDashed } from "lucide-react";
import type { BoardSourceId } from "@/lib/board/types";
import { SOURCE_ICON } from "./look";

/**
 * Absence drawn as the SHAPE of what will be there: three hollow cards in the
 * board's own proportions, the source's glyph, one line naming what is empty.
 */
export function EmptyShape({
  icon,
  title,
  label,
  native,
  compact = false,
  medallion,
  role,
  children,
}: {
  icon: BoardSourceId | null;
  title: string;
  label: string;
  native?: { href: string; label: string } | null;
  compact?: boolean;
  /** Replaces the plain glyph — the unreadable state's lock or cross. */
  medallion?: React.ReactNode;
  role?: "status" | "alert";
  children?: React.ReactNode;
}) {
  const Icon = icon ? SOURCE_ICON[icon] : CircleDashed;
  return (
    <div role={role} className={`gt-rise relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.015] ${compact ? "p-5" : "px-8 py-10"}`}>
      <p className="sr-only">{label}</p>
      <div aria-hidden className={`mx-auto grid max-w-2xl grid-cols-3 gap-3 ${compact || medallion ? "opacity-50" : ""}`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent" style={{ opacity: 1 - i * 0.25 }}>
            <div className="aspect-[4/3] bg-gradient-to-br from-white/[0.05] to-transparent" />
            <div className="space-y-1.5 p-2.5">
              <div className="h-2 w-3/4 rounded-full bg-white/10" />
              <div className="h-2 w-1/2 rounded-full bg-white/[0.06]" />
            </div>
          </div>
        ))}
      </div>
      <div className="relative mt-6 flex flex-col items-center gap-3 text-center">
        {medallion ?? (
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
            <Icon aria-hidden className="h-5 w-5 text-white/50" strokeWidth={1.75} />
          </span>
        )}
        <p className="font-instrument text-2xl text-white/80">{title}</p>
        {children}
        {native && (
          <Link
            href={native.href}
            className="font-jetbrains inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-label text-white/60 transition hover:border-cyan-400/40 hover:text-cyan-100"
          >
            {native.label}
            <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
