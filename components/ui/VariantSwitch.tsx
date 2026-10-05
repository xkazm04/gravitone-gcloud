"use client";

// PROTOTYPE-ONLY. The bake-off seam for the platform-consolidation spark
// (2026-10-04): each rebuilt surface ships three directional variants on its
// real route, and the operator flips between them with `?v=1|2|3`. The
// variant lives in the URL so a pick can be linked and survives a reload.
// Delete this file, and every call site, when the round's winners are
// consolidated — a switcher left in production is a decision nobody made.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export type Variant = 1 | 2 | 3;

export function useVariant(): [Variant, (v: Variant) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = Number(params.get("v"));
  const v: Variant = raw === 2 || raw === 3 ? raw : 1;
  const set = useCallback(
    (next: Variant) => {
      const p = new URLSearchParams(params.toString());
      if (next === 1) p.delete("v");
      else p.set("v", String(next));
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  return [v, set];
}

/** A fixed chip in the lower-right corner (clear of the Next dev badge) naming the variant directions. */
export function VariantSwitch({ labels }: { labels: [string, string, string] }) {
  const [v, set] = useVariant();
  return (
    <div
      role="radiogroup"
      aria-label="Prototype variant"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-1 rounded-full border border-[var(--gt-hairline)] bg-[var(--gt-ink)]/95 backdrop-blur-xl p-1 font-jetbrains text-label shadow-[var(--gt-shadow-float)]"
    >
      {labels.map((label, i) => {
        const n = (i + 1) as Variant;
        const on = n === v;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => set(n)}
            className={`rounded-full px-3 py-1 transition-colors ${
              on ? "bg-[var(--gt-wash)] text-[var(--gt-ink-bright)]" : "text-[var(--gt-ink-bright)]/60 hover:text-[var(--gt-ink-bright)]"
            }`}
          >
            {n} · {label}
          </button>
        );
      })}
    </div>
  );
}
