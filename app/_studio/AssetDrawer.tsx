"use client";

// The asset detail drawer — preview at the top, honest caption, tags, and
// the provenance chain the user can walk. Scrim + Escape close.
//
// It covers the page, so it carries Modal's overlay guarantees (components/ui/
// Modal.tsx): a named modal dialog, focus moved in and held by a Tab trap, focus
// handed back on close, and a scrim that is an aria-hidden div - a focusable
// full-screen button is the ARIA violation Modal retired.

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

import type { Asset } from "./types";
import { CaptionBlock, KindGlyph, MockPreview, ProvenanceBlock, fmtBytes, fmtDur } from "./assetParts";

export function AssetDrawer({
  asset,
  onClose,
  onSelect,
}: {
  asset: Asset;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Once per open: focus in, and hand it back to the card (or <main>, as
  // Modal.restoreFocus does) when the drawer unmounts.
  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      const landed = document.activeElement;
      if (landed && landed !== document.body) return;
      const main = document.querySelector("main");
      if (!main) return;
      if (!main.hasAttribute("tabindex")) main.tabIndex = -1;
      main.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),' +
          'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden="true" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-white/10 bg-[var(--gt-ink)]/95 backdrop-blur"
      >
        <MockPreview asset={asset} className="h-52 shrink-0" />
        <div className="scroll-y flex-1 space-y-5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-jetbrains flex items-center gap-2 text-content tracking-[0.14em] text-white/40 uppercase">
                <KindGlyph kind={asset.kind} /> {asset.kind}
                {asset.dims && <span className="normal-case">· {asset.dims}</span>}
                {asset.durationS != null && <span>· {fmtDur(asset.durationS)}</span>}
                <span>· {fmtBytes(asset.bytes)}</span>
              </p>
              <h3 id={titleId} className="font-instrument mt-1.5 text-2xl text-white">{asset.title}</h3>
            </div>
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Close details"
              className="rounded-lg border border-white/10 p-1.5 text-white/60 transition hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <CaptionBlock asset={asset} />

          <div className="flex flex-wrap gap-1.5">
            {asset.tags.map((t) => (
              <span
                key={t}
                className="font-jetbrains rounded-full border border-white/10 px-2 py-0.5 text-label text-white/60"
              >
                {t}
              </span>
            ))}
            <span className="font-jetbrains rounded-full border border-cyan-400/25 bg-cyan-400/5 px-2 py-0.5 text-label text-cyan-300">
              {asset.collection}
            </span>
          </div>

          <ProvenanceBlock asset={asset} onSelect={onSelect} />
        </div>
      </aside>
    </div>
  );
}
