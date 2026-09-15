"use client";

// THE PLATE OPENS.
//
// A shelf row knows what made it, what it was asked to solve, which four slots
// it was rendered from and what the vendor charged. The gallery could show a
// thumbnail and two truncated lines, so everything a plate is REUSABLE FOR —
// the technique, the palette, whether text leaked into it — was stored, paid
// for, and unreadable.
//
// The grammar is the foundry lightbox's (app/foundry/Lightbox.tsx): a Modal and
// arrow keys to walk the row already on screen. Escape, the focus trap and the
// restore-to-opener belong to Modal, so this file owns only the stepping — and
// the footer draws that stepping as ‹ › controls rather than printing the
// keymap, which is one disclosure away for the reader who wants it.

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Unlink } from "lucide-react";

import Modal from "@/components/ui/Modal";
import { Hint, Keycaps } from "@/components/ui/signal";
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
  siblings,
  onPickSibling,
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
  /** Other plates from the same style, wherever they are filed. */
  siblings: Asset[];
  onPickSibling: (asset: Asset) => void;
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
        <p className="font-jetbrains text-label tracking-[0.14em] text-white/40 uppercase">
          {asset.path.join(" › ")}
        </p>
      }
      subtitle={<span className="font-hanken">{facts.originLine}</span>}
      className="max-w-5xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* THE STEPPING, AS CONTROLS. The row used to read "← → step · Esc
              close · 3 of 24" — a keymap printed permanently beside a position
              that is the only part of it anybody reads twice. The arrows are
              real buttons now, which also gives the walk to a pointer and to a
              touch screen; the keys ride behind the disclosure. */}
          <div className="font-jetbrains flex items-center gap-2 text-label text-white/45">
            {total > 1 && (
              <button
                type="button"
                onClick={() => onStep(-1)}
                aria-label="Previous plate"
                className="cursor-pointer rounded-full border border-white/12 p-1 text-white/60 transition hover:border-white/30 hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
            )}
            <span aria-hidden>
              {index} / {total}
            </span>
            <span className="sr-only">
              Plate {index} of {total}
            </span>
            {total > 1 && (
              <button
                type="button"
                onClick={() => onStep(1)}
                aria-label="Next plate"
                className="cursor-pointer rounded-full border border-white/12 p-1 text-white/60 transition hover:border-white/30 hover:text-white"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            )}
            <Keycaps
              label="Viewer shortcuts"
              map={[
                ...(total > 1 ? [{ keys: ["←", "→"], does: "step" }] : []),
                { keys: ["Esc"], does: "close" },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            {onStartStyle && (
              <button
                type="button"
                onClick={onStartStyle}
                className="font-jetbrains cursor-pointer rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-1.5 text-label text-cyan-100 transition hover:bg-cyan-400/20"
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
              className="font-jetbrains cursor-pointer rounded-full border border-rose-400/40 bg-rose-400/10 px-4 py-1.5 text-label text-rose-200 transition hover:bg-rose-400/20"
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
            // reads as a rendering failure. A broken link, drawn: the row still
            // exists, the bytes it addressed went with the style that held them.
            // The two sentences that used to say so also explained WHY the row
            // is kept, which is the app accounting for its own bookkeeping.
            <div className="grid aspect-video w-full place-items-center gap-2 rounded-xl border border-dashed border-amber-400/25 bg-amber-400/[0.03] px-6 text-center">
              <Unlink className="h-8 w-8 text-amber-300/50" aria-hidden />
              <p className="font-jetbrains text-label tracking-[0.14em] text-amber-200/70 uppercase">
                unresolved
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
            <figcaption className="font-jetbrains mt-2 flex items-center gap-2 text-label text-amber-200/85">
              {/* The badge is the finding; the tile carries the same one. What
                  followed it was a sentence restating the badge plus a lesson
                  about why lettering matters — behind the disclosure now, at a
                  length that is a rule rather than a paragraph. */}
              <span className="rounded bg-amber-300/90 px-1.5 py-0.5 text-label font-semibold text-slate-950">
                TEXT
              </span>
              <Hint variant="warn" tone="amber" label="Why TEXT is flagged">
                lettering makes a plate unusable as a reference
              </Hint>
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
                <p className="font-jetbrains mt-1.5 text-label text-white/40">beat · {facts.beat}</p>
              )}
            </Section>
          )}

          {siblings.length > 0 && (
            <Section
              label={
                facts.styleName ? `others from ${facts.styleName}` : "others from this style"
              }
            >
              {/* A style is scattered across folders by design — the seed files
                  trials under presets and promotions under proofs — so this
                  walks the STYLE, which the arrow keys deliberately do not.
                  They stay bound to the folder on screen; this is the other
                  axis, and it is the one the rail cannot express. */}
              <div className="scroll-x -mx-1 flex gap-2 px-1 pb-1">
                {siblings.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onPickSibling(s)}
                    title={s.name}
                    className="group relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg border border-white/10 transition hover:border-cyan-400/50"
                  >
                    <Image
                      src={s.src}
                      alt={s.name}
                      fill
                      draggable={false}
                      sizes="96px"
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            </Section>
          )}

          {facts.block && (
            // "rendered from" is past tense, and the render date two rows up in
            // Facts dates it. The sentence that used to close this section —
            // "what the style said when this was rendered — editing the style
            // since does not change the plate" — was the app explaining that
            // lib/assets.ts#assetFromProof COPIES the block onto the asset at
            // promotion time. True, and a note for whoever reads that file: the
            // label and the date already say it to whoever reads this screen.
            <Section label="rendered from">
              <dl className="space-y-1.5">
                {blockRows(facts.block).map((r) => (
                  <div key={r.label} className="flex gap-2">
                    <dt className="font-jetbrains w-20 shrink-0 text-label text-white/35">{r.label}</dt>
                    <dd className="font-hanken min-w-0 text-content leading-snug text-slate-300">{r.value}</dd>
                  </div>
                ))}
              </dl>
              {facts.block.palette.length > 0 && (
                <div className="mt-3">
                  <PaletteDots palette={facts.block.palette} withNames />
                </div>
              )}
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
          <dt className="font-jetbrains w-24 shrink-0 text-label tracking-[0.1em] text-white/35 uppercase">
            {label}
          </dt>
          <dd className="font-hanken min-w-0 truncate text-content text-white/85">{value}</dd>
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
      className="font-hanken w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-content text-white/90 outline-none transition focus:border-cyan-400/40"
    />
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <p className="font-jetbrains mb-2 text-label tracking-[0.14em] text-white/40 uppercase">{label}</p>
      {children}
    </div>
  );
}
