"use client";

// A CONTEXT MENU: the verbs of one row, opened at the pointer (or under the row
// from the keyboard) and gone the moment they are used or ignored.
//
// It claims role="menu" and keeps the promise the role makes, which the library's
// original did not: ArrowDown / ArrowUp walk the items and wrap, Home / End jump,
// a letter goes to the next item that starts with it, Enter and Space fire,
// Escape closes and hands focus back to where it came from, Tab closes (a menu is
// not a place to Tab through). It also closes on an outward press (captured, so
// the press does not also land on whatever is underneath), on scroll and on resize.
//
// A destructive verb is ruled in Antares at its left edge AND its word is the
// lightened red: the colour never decides alone. A disabled verb takes a dashed
// edge, never a dimmer word.
//
// `inline` places the menu absolutely inside its positioned parent instead of
// fixed to the viewport, for a specimen or a menu that belongs to a panel.

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** The key that does the same thing, drawn as a keycap ("F2"). */
  keys?: string;
}

export function ContextMenu({
  label,
  x,
  y,
  items,
  onClose,
  inline = false,
}: {
  /** The menu's accessible name: "Actions for Blueprint". */
  label: string;
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  inline?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Read onClose through a ref so the effect below runs once per open; the caller
  // passes an inline arrow, and re-keying on it would re-focus the first item under
  // the user and lose the opener the focus is returned to.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Flip rather than clamp near an edge: a menu shoved back inside the viewport
  // covers the thing it was opened on. Measured, not guessed.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (inline) {
      // Inside a panel the edge is the panel's, not the viewport's: keep the menu in it.
      const box = el.offsetParent;
      const maxX = box ? Math.max(0, box.clientWidth - w) : x;
      setPos({ left: Math.min(x, maxX), top: y });
      return;
    }
    setPos({
      left: x + w > window.innerWidth ? Math.max(0, x - w) : x,
      top: y + h > window.innerHeight ? Math.max(0, y - h) : y,
    });
  }, [x, y, inline, items.length]);

  useEffect(() => {
    const close = () => onCloseRef.current();
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus({ preventScroll: true });
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("mousedown", onDown, true);
    // A pointer menu points at a spot in the viewport: when the page moves under
    // it, it points at the wrong thing, so it goes. An inline menu belongs to its
    // panel and moves with it.
    if (!inline) {
      window.addEventListener("scroll", close, true);
      window.addEventListener("resize", close);
    }
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      if (opener && document.contains(opener)) opener.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per open; `inline` does not change while open
  }, []);

  const enabled = () =>
    Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = enabled();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      list[(i + list.length) % list.length]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      onClose();
    } else if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at < 0 ? -1 : at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ch = e.key.toLowerCase();
      const next = [...list.slice(at + 1), ...list.slice(0, at + 1)].find((el) =>
        (el.textContent ?? "").trim().toLowerCase().startsWith(ch),
      );
      if (next) {
        e.preventDefault();
        next.focus();
      }
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={`k-menu${inline ? " k-menu--inline" : ""}`}
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          tabIndex={-1}
          aria-disabled={item.disabled || undefined}
          className={`k-menu__i${item.destructive ? " k-menu__i--danger" : ""}${item.disabled ? " is-off" : ""}`}
          onClick={() => {
            if (item.disabled) return;
            item.onSelect();
            onClose();
          }}
        >
          <span>{item.label}</span>
          {item.keys && <kbd>{item.keys}</kbd>}
        </button>
      ))}
    </div>
  );
}
