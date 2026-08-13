"use client";

// A right-click menu, positioned at the pointer.
//
// Three things it has to get right, all of them the sort that are invisible
// when done and obvious when not:
//
//   · it must close on Escape, on outward click, and on scroll — a menu that
//     survives the page moving under it ends up pointing at the wrong thing
//   · it must not fall off the viewport near the right or bottom edge
//   · it must be reachable without a mouse, so the trigger also answers to the
//     keyboard and the menu takes focus when it opens
//
// Rendered inline rather than through a portal: the page has no stacking
// contexts above it, and a portal would buy z-index safety we do not yet need
// at the cost of a ref dance.

import { useEffect, useRef } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

export default function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    // `capture` so the menu closes before the click lands on whatever is
    // underneath — otherwise dismissing it also activates that thing.
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  // Flip rather than clamp near an edge: a menu shoved back inside the viewport
  // covers the thing it was opened on.
  const W = 168;
  const H = items.length * 34 + 8;
  const left = typeof window !== "undefined" && x + W > window.innerWidth ? x - W : x;
  const top = typeof window !== "undefined" && y + H > window.innerHeight ? y - H : y;

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      style={{ left, top, width: W }}
      className="fixed z-50 rounded-xl border border-white/12 bg-slate-950/95 p-1 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)] backdrop-blur-md focus:outline-none"
    >
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className={`font-hanken block w-full rounded-lg px-3 py-2 text-left text-[13px] transition ${
            item.destructive
              ? "text-rose-200 hover:bg-rose-400/15"
              : "text-slate-200 hover:bg-white/10"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
