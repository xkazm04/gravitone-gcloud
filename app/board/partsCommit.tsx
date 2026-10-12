"use client";

// The per-run commit line for the foundry sources: how many of a run's items
// are decided, and the link to commit on the Foundry. Split out of parts.tsx
// along its own banner.

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { BoardSourceId } from "@/lib/board/types";
import type { BoardApi } from "./useBoard";

/* ── per-run commit line (foundry sources) ────────────────────────────────── */

/** "decided 7/18 · commit on Foundry ↗" for a foundry run. The commit itself
 *  is destructive and confirmed on the Foundry; the Board only counts. */
export function CommitLine({ api, source, group, className = "" }: { api: BoardApi; source: BoardSourceId; group: string | null; className?: string }) {
  const on = api.commitsOn(source);
  if (!on || !group) return null;
  const s = api.states[source];
  if (s.kind !== "loaded") return null;
  const rows = s.entries.filter((e) => e.item.group === group);
  const decided = rows.filter((e) => e.item.verdict !== null).length;
  const done = decided === rows.length;
  return (
    <span className={`font-jetbrains inline-flex items-center gap-2 text-label ${className}`}>
      <span className={`tabular-nums ${done ? "text-emerald-200" : "text-white/55"}`}>
        <span className="sr-only">decided </span>
        {decided}/{rows.length}
      </span>
      <Link href={on.href} className="inline-flex items-center gap-1 text-cyan-200/80 underline-offset-4 hover:text-cyan-100 hover:underline">
        {on.label}
        <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
      </Link>
    </span>
  );
}
