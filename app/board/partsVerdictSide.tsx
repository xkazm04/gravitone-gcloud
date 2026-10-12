"use client";

// What sits beside the verdict control: the two-axis reject chips, the sealed
// machine pick, the fact grid and the native-surface link. Split out of
// parts.tsx's `verdict` section along its own component boundaries to keep
// each file under the 200-line gate.

import Link from "next/link";
import { ArrowUpRight, Lock, Sparkles } from "lucide-react";
import type { BoardEntry } from "@/lib/board/source";
import type { BoardItem } from "@/lib/board/types";
import type { BoardApi } from "./useBoard";

/** Two-axis reject, where a source has axes (dojo, cull). Pressing an axis on a
 *  rejected item re-decides it with that axis toggled; on an undecided item it
 *  rejects with that axis. */
export function ReasonChips({ entry, api, className = "" }: { entry: BoardEntry; api: BoardApi; className?: string }) {
  const axes = api.reasonAxes(entry.item.source);
  if (!axes.length || entry.refuse.reject) return null;
  const on = new Set(entry.item.verdict === "reject" ? entry.item.reasons : []);
  return (
    <span role="group" aria-label="Reject reasons" className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="font-jetbrains mr-1 text-label tracking-[0.14em] text-white/40 uppercase">reject on</span>
      {axes.map((axis) => {
        const pressed = on.has(axis);
        return (
          <button
            key={axis}
            type="button"
            aria-pressed={pressed}
            onClick={() => {
              const next = new Set(on);
              if (pressed) next.delete(axis);
              else next.add(axis);
              void api.decide(entry, "reject", [...next]);
            }}
            className={`font-jetbrains rounded-full border px-3 py-0.5 text-label transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
              pressed ? "border-rose-300/60 bg-rose-400/15 text-rose-100" : "border-white/12 text-white/60 hover:border-rose-300/40 hover:text-rose-100"
            }`}
          >
            {axis}
          </button>
        );
      })}
    </span>
  );
}

/** The machine's own answer — SEALED until the human has decided, so the
 *  human verdict stays an independent measurement of the machine. */
export function MachinePick({ item }: { item: BoardItem }) {
  if (!item.machinePick) return null;
  if (item.verdict === null)
    return (
      <span className="font-jetbrains inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-label text-white/45">
        <Lock aria-hidden className="h-3.5 w-3.5" />
        machine pick
        <span className="sr-only">sealed until you decide</span>
      </span>
    );
  return (
    <span className="gt-rise font-jetbrains inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/[0.07] px-3 py-1 text-label text-cyan-100">
      <Sparkles aria-hidden className="h-3.5 w-3.5 text-cyan-300" />
      <span className="sr-only">machine pick:</span>
      {item.machinePick}
    </span>
  );
}

/** The work's own facts — a model, a score, a scene, a date. Verbatim. */
export function FactGrid({ entry, skip = [], columns = 1, className = "" }: { entry: BoardEntry; skip?: string[]; columns?: 1 | 2 | 3; className?: string }) {
  const rows = entry.facts.filter((f) => !skip.includes(f.name));
  if (!rows.length) return null;
  const cols = columns === 3 ? "lg:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : "";
  return (
    <dl className={`grid gap-x-6 gap-y-3 ${cols} ${className}`}>
      {rows.map((f) => (
        <div key={f.name} className="min-w-0">
          <dt className="font-jetbrains text-label tracking-[0.14em] text-white/40 uppercase">{f.name}</dt>
          <dd className="font-hanken mt-0.5 text-content leading-snug break-words text-white/85">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function NativeLink({ entry, label = "open" }: { entry: BoardEntry; label?: string }) {
  return (
    <Link
      href={entry.href}
      className="font-jetbrains inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-label text-white/60 transition hover:border-cyan-400/40 hover:text-cyan-100"
    >
      {label}
      <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
    </Link>
  );
}
