"use client";

// WHAT THE BOARD HOLDS BEFORE ITS FIRST LOAD ANSWERS — card-sized placeholders
// on the grid the cards will land on, inside the board rather than above it.
//
// The load line used to sit in the controls row, so the row shrank when the
// load answered and the whole board jumped up by its height (measured
// 2026-10-12: 84px at 1920x1080) right as the first cards mounted. Here it
// reserves nothing outside the board and moves nothing when it goes.
//
// Pure decoration: aria-hidden, no pointer events. The status line the shell
// draws beside it is the accessible half.

import { BAND_W, CARD_H, CARD_W, COL_PAD, FRAME, GAP, LANE_PAD, STAGE_GAP } from "./grid";

const COLS = 4;
const ROWS = 3;

export function BoardSkeleton({ children }: { children?: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" data-board-skeleton>
      <div aria-hidden className="absolute" style={{ left: FRAME.left + FRAME.insetX, top: FRAME.top + FRAME.insetY + LANE_PAD }}>
        {Array.from({ length: COLS * ROWS }, (_, i) => {
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          return (
            <div
              key={i}
              className="absolute rounded-xl border border-white/[0.06] bg-white/[0.03] motion-safe:animate-pulse"
              style={{
                width: CARD_W,
                height: CARD_H,
                left: col * (BAND_W + STAGE_GAP) + COL_PAD,
                top: row * (CARD_H + GAP),
                animationDelay: `${(col + row) * 120}ms`,
              }}
            />
          );
        })}
      </div>
      {children && <div className="absolute bottom-3 left-4">{children}</div>}
    </div>
  );
}
