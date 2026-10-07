"use client";

// THE VERB MENU — a right-click menu that keeps the promise its role makes.
//
// Copied from app/library/ContextMenu.tsx and extended, rather than imported:
// the library's copy deliberately has no `role="menu"` because it delivered none
// of the keyboard contract the role promises, and this one is the verb list for
// a surface where the keyboard IS the other way in. So it claims the role and
// delivers the contract: Up/Down walk the items (wrapping), Home/End jump,
// Escape closes, Tab closes (a menu is not a tab stop to walk out of), and
// Enter/Space activate through the button they are on.
//
// What it inherits unchanged, because each was a measured defect upstream:
//   · it focuses the FIRST ITEM on open — which is why the first item a caller
//     passes must be the safe act, never a destructive one;
//   · it restores focus to where it came from on close, falling back to a
//     caller-named element when the opener did not survive;
//   · it reads `onClose` through a ref so the effect runs once per open;
//   · it closes on a captured outside mousedown, scroll and resize, and flips
//     (rather than clamps) at a viewport edge so it never covers its opener.

import { useEffect, useRef } from "react";

import { refusedKey } from "../keyGuard";

export interface MenuItem {
  id: string;
  label: string;
  /** Shown beside the label — a key, a count; never a sentence. */
  detail?: string;
  destructive?: boolean;
}

const W = 232;
const ROW = 40;

export default function ContextMenu({
  x,
  y,
  items,
  onPick,
  onClose,
  label,
  restoreTo,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onPick: (id: string) => void;
  onClose: () => void;
  label: string;
  /** Where focus goes if the opener is gone when the menu closes. */
  restoreTo?: () => HTMLElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const restoreRef = useRef(restoreTo);
  useEffect(() => {
    onCloseRef.current = onClose;
    restoreRef.current = restoreTo;
  });

  useEffect(() => {
    const close = () => onCloseRef.current();
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (refusedKey(e)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      if (opener && document.contains(opener)) opener.focus();
      else restoreRef.current?.()?.focus();
    };
  }, []);

  const walk = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (refusedKey(e)) return;
    const list = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = list.indexOf(document.activeElement as HTMLElement);
    let to = -1;
    if (e.key === "ArrowDown") to = (at + 1) % list.length;
    else if (e.key === "ArrowUp") to = (at - 1 + list.length) % list.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = list.length - 1;
    else if (e.key === "Tab") {
      e.preventDefault();
      onCloseRef.current();
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
    list[to]?.focus();
  };

  const H = items.length * ROW + 8;
  const left = typeof window !== "undefined" && x + W > window.innerWidth ? Math.max(8, x - W) : x;
  const top = typeof window !== "undefined" && y + H > window.innerHeight ? Math.max(8, y - H) : y;

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={walk}
      style={{ left, top, width: W }}
      className="gt-float fixed z-50 rounded-xl border border-white/12 bg-slate-950/95 p-1 backdrop-blur-md"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => {
            onPick(item.id);
            onClose();
          }}
          className={`font-hanken flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-left text-label transition focus-visible:outline-2 focus-visible:-outline-offset-2 ${
            item.destructive ? "text-rose-200 hover:bg-rose-400/15" : "text-slate-200 hover:bg-white/10"
          }`}
          style={{ height: ROW }}
        >
          <span className="truncate">{item.label}</span>
          {item.detail && <span className="font-jetbrains shrink-0 text-white/40">{item.detail}</span>}
        </button>
      ))}
    </div>
  );
}
