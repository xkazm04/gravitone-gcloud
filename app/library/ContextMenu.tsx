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
//
// NOT role="menu". It claimed that role — and role="menuitem" on each button —
// while delivering none of the keyboard contract the role promises: no arrow
// keys, no Home/End, no typeahead. Worse, it moved focus onto the container it
// had blinded with `focus:outline-none`, so the one element it focused was the
// one a keyboard user could not see. It is a stack of ordinary buttons now,
// which is what it always behaved like: Tab walks it, Enter fires, Escape
// closes and puts focus back where it came from, and every stop shows the
// studio's own focus ring. Same contract as the bell tray and the user menu.

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
  const firstRef = useRef<HTMLButtonElement>(null);

  // Read onClose through a ref so the effect below runs ONCE per open. Its
  // caller passes an inline arrow (AssetsBrowser: `onClose={() => setMenu(null)}`)
  // so keying on it re-ran the whole effect on every re-render of the shelf —
  // which re-focused the first item under the user, and, worse, re-captured
  // `opener` as whatever was focused THEN, losing the tile the menu was opened
  // from and stranding focus on <body> when it closed. Same fix as Modal.tsx.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const close = () => onCloseRef.current();
    // Focus the first ITEM, not the container: it is the first thing you would
    // want to press, and it carries the focus ring so you can see you have it.
    // Where focus came from is restored on close — a dismissed menu that leaves
    // focus on <body> strands a keyboard user at the top of the document.
    const opener = document.activeElement as HTMLElement | null;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    // `capture` so the menu closes before the click lands on whatever is
    // underneath — otherwise dismissing it also activates that thing.
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  // Flip rather than clamp near an edge: a menu shoved back inside the viewport
  // covers the thing it was opened on.
  const W = 168;
  const H = items.length * 34 + 8;
  const left = typeof window !== "undefined" && x + W > window.innerWidth ? x - W : x;
  const top = typeof window !== "undefined" && y + H > window.innerHeight ? y - H : y;

  return (
    <div
      ref={ref}
      style={{ left, top, width: W }}
      className="gt-float fixed z-50 rounded-xl border border-white/12 bg-slate-950/95 p-1 backdrop-blur-md"
    >
      {items.map((item, i) => (
        <button
          key={item.label}
          ref={i === 0 ? firstRef : undefined}
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
