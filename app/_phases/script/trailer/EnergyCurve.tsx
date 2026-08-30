"use client";

// The energy curve the author can see — PATTERNS.md § 9.6.
//
// It is drawn from `energyPoints`, which is a SHAPE derived from the roles the
// cut declares, not a measurement of anything (see cut.ts). The caption says so
// on the surface itself, because a curve without that sentence reads as data.
// Tokens and currentColor only; the entrance is the shared CSS `gt-rise`, which
// globals.css switches off under prefers-reduced-motion.

import { useMemo } from "react";

import { energyPoints } from "./cut";
import type { TrailerCut } from "./types";

const W = 640;
const H = 140;
const PAD_X = 16;
const PAD_TOP = 12;
const PAD_BOTTOM = 34;

export default function EnergyCurve({ cut }: { cut: TrailerCut }) {
  const points = useMemo(() => energyPoints(cut), [cut]);
  const labelOf = new Map(cut.movements.map((m) => [m.id, m.label]));

  const px = (x: number) => PAD_X + x * (W - PAD_X * 2);
  const py = (y: number) => PAD_TOP + (1 - y) * (H - PAD_TOP - PAD_BOTTOM);
  const line = points.map((p) => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ");

  // One label per movement, at the mean x of its beats. A label with a " · "
  // keeps only its tail ("escalation · rung 2" → "rung 2"): three full labels
  // in a row overlap at this width, and the role is already in the section.
  const short = (label: string) => label.split(" · ").pop() ?? label;
  const labels = cut.movements
    .map((m) => {
      const mine = points.filter((p) => p.movement === m.id);
      if (!mine.length) return null;
      const x = mine.reduce((s, p) => s + p.x, 0) / mine.length;
      return { id: m.id, x, label: short(labelOf.get(m.id) ?? m.id) };
    })
    .filter((l): l is { id: string; x: number; label: string } => l !== null);

  return (
    <figure data-testid="energy-curve" className="gt-rise rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <figcaption className="font-jetbrains flex items-baseline justify-between text-[11px] tracking-[0.14em] uppercase">
        <span className="text-white/35">energy curve</span>
        <span className="text-white/30 normal-case tracking-normal">
          a shape read from the parts — not a measurement
        </span>
      </figcaption>
      <div className="mt-2 overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`energy shape across ${points.length} beats: ${points.map((p) => p.y.toFixed(2)).join(", ")}`}
          className="block h-auto w-full min-w-[420px] text-cyan-200"
        >
          <line x1={PAD_X} x2={W - PAD_X} y1={py(0)} y2={py(0)} stroke="currentColor" strokeOpacity={0.15} />
          {points.length > 1 && (
            <polyline
              points={line}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {points.map((p) => (
            <circle
              key={p.beatId}
              cx={px(p.x)}
              cy={py(p.y)}
              r={3}
              fill="currentColor"
              fillOpacity={cut.beats.find((b) => b.id === p.beatId)?.kind === "reset" ? 1 : 0.7}
            />
          ))}
          {labels.map((l) => (
            <text
              key={l.id}
              x={px(l.x)}
              y={H - 10}
              textAnchor="middle"
              fill="currentColor"
              fillOpacity={0.45}
              className="font-jetbrains"
              fontSize={9}
            >
              {l.label}
            </text>
          ))}
        </svg>
      </div>
    </figure>
  );
}
