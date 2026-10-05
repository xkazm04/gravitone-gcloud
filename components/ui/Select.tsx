"use client";

// THE APP'S DROPDOWN. A native <select> draws its popup in the operating
// system's chrome — white, square, system font — the one control on an
// Obsidian page that cannot be styled, and on /projects four of them sat in a
// row looking like a form from another app. This is the replacement: a button
// that names the current value, and a glass listbox under it.
//
// ── Semantics ──────────────────────────────────────────────────────────────
// The WAI-ARIA "select-only combobox" pattern: the trigger is `role=combobox`
// with `aria-expanded` / `aria-controls` / `aria-activedescendant`, the popup
// `role=listbox`, each option `role=option` + `aria-selected`. Focus never
// leaves the trigger; the active option is announced through
// aria-activedescendant. Keys: ArrowUp/Down move, Home/End jump, Enter/Space
// pick, Escape/Tab close, a printable key types ahead by label prefix.
// Opening with ArrowDown/Enter/Space lands on the selected option.
//
// Groups render as labelled sections (`role=group` + `aria-labelledby`); the
// option ORDER is the caller's — sort before passing in (the projects shelf
// sorts its types by name, ascending).

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Check, ChevronDown } from "lucide-react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** A count or short figure drawn right-aligned in the row, e.g. 45. */
  meta?: string | number;
  /** A small coloured dot before the label — a tone class like `bg-rose-400`. */
  dot?: string;
  disabled?: boolean;
  /** What the CLOSED trigger says when this option is picked, if the label
   *  leans on its group heading to be read. Under a "Frames" heading the
   *  option is "needs a call"; on the trigger, with no heading above it, it has
   *  to be "Frames · needs a call". Defaults to `label`. */
  trigger?: string;
}

export interface SelectGroup<T extends string> {
  label: string;
  options: SelectOption<T>[];
}

type Items<T extends string> = SelectOption<T>[] | SelectGroup<T>[];

const isGrouped = <T extends string>(items: Items<T>): items is SelectGroup<T>[] =>
  items.length > 0 && "options" in items[0];

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  placeholder,
  className = "",
  align = "left",
  minWidth = 200,
  testId,
  icon,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Items<T>;
  /** The accessible name, and the small caps prefix inside the trigger. */
  label: string;
  /** Shown when `value` matches no option. */
  placeholder?: string;
  className?: string;
  align?: "left" | "right";
  /** Popup min width in px; it is never narrower than the trigger. */
  minWidth?: number;
  testId?: string;
  /** Drawn in place of the caps prefix, for a toolbar where the prefix costs
   *  more width than it buys (a sort, a grouping). `label` stays the accessible
   *  name and the listbox's, so nothing is lost to a screen reader. */
  icon?: React.ReactNode;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const groups: SelectGroup<T>[] = useMemo(
    () => (isGrouped(options) ? options : [{ label: "", options: options as SelectOption<T>[] }]),
    [options],
  );
  const flat = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const selectedIndex = flat.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? flat[selectedIndex] : null;
  const shown = selected ? (selected.trigger ?? selected.label) : null;

  const enabled = useCallback((i: number) => i >= 0 && i < flat.length && !flat[i].disabled, [flat]);
  const step = useCallback(
    (from: number, dir: 1 | -1) => {
      for (let i = from + dir, n = 0; n < flat.length; i += dir, n++) {
        const j = (i + flat.length) % flat.length;
        if (enabled(j)) return j;
      }
      return from;
    },
    [flat.length, enabled],
  );

  const openAt = (i: number) => {
    setOpen(true);
    setActive(enabled(i) ? i : step(-1, 1));
  };
  const close = () => setOpen(false);
  const pick = (i: number) => {
    if (!enabled(i)) return;
    onChange(flat[i].value);
    close();
  };

  // Close on a press outside; the trigger keeps focus throughout.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Keep the active option in view while the keyboard walks a long list.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const k = e.key;
    if (!open) {
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") {
        e.preventDefault();
        openAt(selectedIndex);
      }
      return;
    }
    const nav: Record<string, () => void> = {
      ArrowDown: () => setActive((a) => step(a, 1)),
      ArrowUp: () => setActive((a) => step(a, -1)),
      Home: () => setActive(step(-1, 1)),
      End: () => setActive(step(flat.length, -1)),
      Enter: () => pick(active),
      " ": () => pick(active),
      Escape: close,
    };
    if (nav[k]) {
      e.preventDefault();
      nav[k]();
    } else if (k === "Tab") close();
    else if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : "") + k.toLowerCase(), at: now };
      const q = typed.current.text;
      const hit = flat.findIndex((o, i) => enabled(i) && o.label.toLowerCase().startsWith(q));
      if (hit >= 0) setActive(hit);
    }
  };

  let index = -1;
  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${id}-o${active}` : undefined}
        aria-label={`${label}: ${shown ?? placeholder ?? "none"}`}
        data-testid={testId}
        onClick={() => (open ? close() : openAt(selectedIndex))}
        onKeyDown={onKey}
        className={`group flex h-10 w-full items-center gap-2 rounded-xl border px-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${
          open
            ? "border-cyan-400/40 bg-cyan-400/[0.06]"
            : "border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]"
        }`}
      >
        {icon ? (
          <span aria-hidden className="flex shrink-0 text-white/45">
            {icon}
          </span>
        ) : (
          <span className="font-jetbrains shrink-0 text-label uppercase tracking-[0.14em] text-white/45">{label}</span>
        )}
        <span className="flex min-w-0 flex-1 items-center gap-2 font-hanken text-content text-white/90">
          {selected?.dot && <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${selected.dot}`} />}
          <span className="truncate">{shown ?? placeholder ?? "—"}</span>
        </span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 group-hover:text-white/70 ${open ? "rotate-180 text-cyan-300" : ""}`}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          style={{ minWidth }}
          className={`gt-float absolute top-[calc(100%+6px)] z-50 max-h-[min(60vh,420px)] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[var(--gt-ink)]/95 p-1.5 shadow-[var(--gt-shadow-float)] backdrop-blur-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {groups.map((g, gi) => {
            const gid = `${id}-g${gi}`;
            return (
              <div key={gid} role={g.label ? "group" : undefined} aria-labelledby={g.label ? gid : undefined}>
                {g.label && (
                  <div
                    id={gid}
                    className={`px-2.5 pb-1 font-jetbrains text-label uppercase tracking-[0.16em] text-white/40 ${gi > 0 ? "mt-1.5 border-t border-white/6 pt-2.5" : "pt-1.5"}`}
                  >
                    {g.label}
                  </div>
                )}
                {g.options.map((o) => {
                  index += 1;
                  const i = index;
                  const isSel = o.value === value;
                  const isAct = i === active;
                  return (
                    <div
                      key={`${gi}-${o.value}`}
                      id={`${id}-o${i}`}
                      data-i={i}
                      role="option"
                      aria-selected={isSel}
                      aria-disabled={o.disabled || undefined}
                      onPointerEnter={() => enabled(i) && setActive(i)}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => pick(i)}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 font-hanken text-content ${
                        o.disabled
                          ? "cursor-not-allowed text-white/30"
                          : isAct
                            ? "bg-cyan-400/10 text-white"
                            : "text-white/80"
                      }`}
                    >
                      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${o.dot ?? "bg-transparent"}`} />
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {o.meta !== undefined && (
                        <span className="font-jetbrains text-label tabular-nums text-white/45">{o.meta}</span>
                      )}
                      <Check aria-hidden className={`h-4 w-4 shrink-0 text-cyan-300 ${isSel ? "" : "invisible"}`} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
