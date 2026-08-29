"use client";

// THE PLATE OPENS.
//
// A shelf row knows what made it, what it was asked to solve, which four slots
// it was rendered from and what the vendor charged. The gallery could show a
// thumbnail and two truncated lines, so everything a plate is REUSABLE FOR —
// the technique, the palette, whether text leaked into it — was stored, paid
// for, and unreadable.
//
// The grammar is the foundry lightbox's (app/foundry/Lightbox.tsx): a Modal,
// arrow keys to walk the row already on screen, and a footer that names its own
// bindings. Escape, the focus trap and the restore-to-opener belong to Modal, so
// this file owns only the stepping.

import { useEffect, useState } from "react";
import Image from "next/image";

import Modal from "@/components/ui/Modal";
import type { Asset } from "@/lib/assets";

import { blockRows, fmtUsd, fmtWhen, readAssetFacts } from "./assetMeta";
import { PaletteDots } from "./parts";

export default function AssetLightbox({
  asset,
  index,
  total,
  onClose,
  onStep,
  onRemove,
  onRename,
  onStartStyle,
}: {
  asset: Asset;
  /** 1-based position within the folder currently on screen. */
  index: number;
  total: number;
  onClose: () => void;
  onStep: (delta: 1 | -1) => void;
  onRemove: () => void;
  onRename: (name: string) => void;
  /** Offered only for a plate that carries the block it was rendered from —
   *  absent for a trial-grid plate, whose index records what was rendered but
   *  not the four slots it came from. */
  onStartStyle?: () => void;
}) {
  // Modal owns Escape and the focus trap; only the walk is ours. Bound on
  // `window` rather than the panel, because the panel holds focus and the arrow
  // keys should work wherever inside it the user has tabbed to.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Not while the user is typing. The name field lives in this dialog, and
      // a left arrow meant to move the caret would otherwise step to the next
      // plate — remounting the field and abandoning the edit mid-word.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onStep(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onStep(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStep]);

  const facts = readAssetFacts(asset);
  const cost = fmtUsd(facts.costUsd);
  const made = fmtWhen(facts.promotedAt ?? facts.createdAt);

  return (
    <Modal
      open
      onClose={onClose}
      title={asset.name}
      eyebrow={
        <p className="font-jetbrains text-[11px] tracking-[0.14em] text-white/40 uppercase">
          {asset.path.join(" › ")}
        </p>
      }
      subtitle={<span className="font-hanken">{facts.originLine}</span>}
      className="max-w-5xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-jetbrains text-[11px] text-white/45">
            {total > 1 ? "← → step · " : ""}Esc close · {index} of {total}
          </div>
          <div className="flex items-center gap-2">
            {onStartStyle && (
              <button
                type="button"
                onClick={onStartStyle}
                className="font-jetbrains cursor-pointer rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-1.5 text-[12px] text-cyan-100 transition hover:bg-cyan-400/20"
              >
                Start a style from this
              </button>
            )}
            {/* The same act the tile affords, offered where the user is
                actually looking at the plate. It closes the viewer: the row it
                was describing does not exist afterwards. */}
            <button
              type="button"
              onClick={onRemove}
              className="font-jetbrains cursor-pointer rounded-full border border-rose-400/40 bg-rose-400/10 px-4 py-1.5 text-[12px] text-rose-200 transition hover:bg-rose-400/20"
            >
              Remove from shelf
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <figure className="min-w-0">
          {facts.unresolved ? (
            // NOT the 1x1 transparent PNG stretched to fill a frame — that
            // reads as a rendering failure. An empty frame that says why.
            <div className="grid aspect-video w-full place-items-center rounded-xl border border-dashed border-amber-400/25 bg-amber-400/[0.03] px-6 text-center">
              <p className="font-hanken max-w-xs text-sm leading-snug text-amber-200/80">
                The style holding these bytes was deleted. The row is kept so the shelf can say so,
                but there is no picture left to show.
              </p>
            </div>
          ) : (
            <span className="relative block aspect-video w-full overflow-hidden rounded-xl border border-white/8 bg-black/40">
              {/* object-contain, not cover: this is the view where the whole
                  plate matters, and cropping here would hide exactly the edge
                  artefacts somebody opens a plate full-size to check. */}
              <Image
                src={asset.src}
                alt={asset.name}
                fill
                sizes="(min-width:1024px) 60vw, 92vw"
                className="object-contain"
              />
            </span>
          )}
          {facts.hasText && (
            <figcaption className="font-jetbrains mt-2 flex items-center gap-2 text-[11px] text-amber-200/85">
              <span className="rounded bg-amber-300/90 px-1.5 py-0.5 text-[9px] font-semibold text-slate-950">
                TEXT
              </span>
              the grader found lettering in this plate — the one defect that makes one unusable
            </figcaption>
          )}
        </figure>

        <div className="min-w-0 space-y-5">
          <Section label="name">
            <NameEditor key={asset.id} initial={asset.name} onCommit={onRename} />
          </Section>

          <Facts
            rows={[
              ["filed under", asset.path.at(-1)],
              ["style", facts.styleName],
              ["provider", facts.provider],
              ["model", facts.model],
              ["render cost", cost],
              [facts.origin === "promoted" ? "kept" : "made", made],
            ]}
          />

          {(facts.problem || facts.beat) && (
            <Section label="the brief">
              {facts.problem && (
                <p className="font-hanken text-sm leading-snug text-slate-300">{facts.problem}</p>
              )}
              {facts.beat && (
                <p className="font-jetbrains mt-1.5 text-[11px] text-white/40">beat · {facts.beat}</p>
              )}
            </Section>
          )}

          {facts.block && (
            <Section label="rendered from">
              <dl className="space-y-1.5">
                {blockRows(facts.block).map((r) => (
                  <div key={r.label} className="flex gap-2">
                    <dt className="font-jetbrains w-20 shrink-0 text-[11px] text-white/35">{r.label}</dt>
                    <dd className="font-hanken min-w-0 text-[13px] leading-snug text-slate-300">{r.value}</dd>
                  </div>
                ))}
              </dl>
              {facts.block.palette.length > 0 && (
                <div className="mt-3">
                  <PaletteDots palette={facts.block.palette} withNames />
                </div>
              )}
              {/* The block is COPIED onto the asset at promotion time
                  (lib/assets.ts#assetFromProof) precisely so it can be shown
                  here after the style has moved on. Saying so is the difference
                  between a record and a claim about the present. */}
              <p className="font-jetbrains mt-3 text-[10px] leading-snug text-white/25">
                what the style said when this was rendered — editing the style since does not change
                the plate
              </p>
            </Section>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** The rows worth showing — an absent fact is dropped, never rendered as a
 *  dash. A table of dashes says the shelf lost something; a shorter table says
 *  nothing was recorded, which is what actually happened. */
function Facts({ rows }: { rows: [string, string | null | undefined][] }) {
  const present = rows.filter((r): r is [string, string] => Boolean(r[1]));
  if (!present.length) return null;
  return (
    <dl className="space-y-1.5">
      {present.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-2">
          <dt className="font-jetbrains w-24 shrink-0 text-[11px] tracking-[0.1em] text-white/35 uppercase">
            {label}
          </dt>
          <dd className="font-hanken min-w-0 truncate text-[13px] text-white/85">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The plate's name, editable in place.
 *
 * Keyed on the asset id by its caller, so stepping to the next plate with the
 * arrow keys REMOUNTS this — otherwise the field would hold the previous
 * plate's text while the picture beside it had already changed, and the next
 * blur would rename the wrong row.
 *
 * Commits on Enter and on blur, and reverts on Escape. A name is only sent up
 * when it actually differs: a user who tabs through the field should not
 * generate a write and an announcement for having looked at it.
 */
function NameEditor({ initial, onCommit }: { initial: string; onCommit: (name: string) => void }) {
  const [value, setValue] = useState(initial);

  const commit = () => {
    const next = value.trim();
    if (!next) {
      setValue(initial); // the hook refuses an empty name; the field agrees rather than arguing
      return;
    }
    if (next !== initial) onCommit(next);
  };

  return (
    <input
      value={value}
      aria-label="Plate name"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          // Stopped here, or Modal reads it as "close the dialog" and the user
          // loses the whole viewer for abandoning one edit.
          e.stopPropagation();
          setValue(initial);
        }
      }}
      className="font-hanken w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/90 outline-none transition focus:border-cyan-400/40"
    />
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <p className="font-jetbrains mb-2 text-[11px] tracking-[0.14em] text-white/40 uppercase">{label}</p>
      {children}
    </div>
  );
}
