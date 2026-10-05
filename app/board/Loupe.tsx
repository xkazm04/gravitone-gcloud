"use client";

// THE LOUPE — one item, as large as the screen, decided where it is seen.
// Enter opens it from the sheet, Esc closes it, J/K walk the queue inside it,
// and the decision keys KEEP WORKING: it is an aria-modal dialog, which the
// Board's key guard treats as an overlay that owns the keyboard, so the dialog
// carries the loupe mark (lib/board/keys.ts LOUPE_MARK) that exempts this one
// dialog — the same exemption StatReel's `.bd-lb` lightbox has
// (apps/studio/src/board/keys.ts).
//
// Its own dialog rather than the kit's Sheet: the Sheet is the Almanac print
// idiom (square corners, a ruled header) and on this ground it read as a form.
// What it must keep from a dialog it keeps by hand — focus moves in on open and
// back to where it was on close, Tab cycles inside.

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { LOUPE_MARK } from "@/lib/board/keys";
import { SOURCE_LABEL } from "@/lib/board/registry";
import type { BoardEntry } from "@/lib/board/source";

import { picturesOf, plateOwnsTitle, roleOf, SOURCE_ICON, splitTitle, wordsOf } from "./look";
import { CommitLine, FactGrid, MachinePick, NativeLink, Picture, ReasonChips, RejectedStamp, TextPlate, VerdictBar } from "./parts";
import type { BoardApi } from "./useBoard";

export function Loupe({ api, entry, onClose }: { api: BoardApi; entry: BoardEntry | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => back?.focus?.();
  }, []);

  if (!entry) return null;
  const { item } = entry;
  const at = api.visible.findIndex((e) => e.item.id === item.id);
  const pictures = picturesOf(item);
  const Icon = SOURCE_ICON[item.source];
  const { kicker, title } = splitTitle(item);
  const rejectedLane = api.query.st === "rejected";

  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !ref.current) return;
    const f = ref.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])");
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      data-board-loupe-item={item.id}
      {...{ [LOUPE_MARK]: "" }}
      onKeyDown={trap}
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--gt-ink)]/90 backdrop-blur-2xl"
    >
      <div aria-hidden className="aurora pointer-events-none absolute inset-0 opacity-60" />
      <header className="relative mx-auto flex w-full max-w-shell items-start gap-4 px-6 pt-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
          <Icon aria-hidden className="h-5 w-5 text-cyan-200/80" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-jetbrains text-label tracking-[0.14em] text-white/45 uppercase">
            {SOURCE_LABEL[item.source]}
            {item.group ? ` · ${item.group}` : ""}
            {kicker ? ` · ${kicker}` : ""}
          </p>
          <h2 className={plateOwnsTitle(item) ? "sr-only" : "font-hanken mt-1 line-clamp-2 text-2xl leading-snug font-medium text-white"}>{title}</h2>
        </div>
        <span className="font-jetbrains shrink-0 pt-2 text-label tabular-nums text-white/45">
          {at + 1} / {api.visible.length}
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close the loupe (Esc)"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 text-white/70 transition hover:border-white/30 hover:text-white"
        >
          <X aria-hidden className="h-5 w-5" />
        </button>
      </header>

      <div className="relative mx-auto flex min-h-0 w-full max-w-shell flex-1 items-center gap-4 px-6 py-5">
        <StepButton dir="prev" disabled={at <= 0} onClick={() => api.move(-1)} />
        <div className="flex h-full min-h-0 min-w-0 flex-1 items-center justify-center">
          {pictures.length ? (
            <div key={item.id} className={`gt-rise grid h-full w-full gap-6 ${pictures.length > 1 ? "grid-cols-2" : ""}`}>
              {pictures.map((m, i) => (
                <Picture key={i} media={m} alt={`${item.title}, ${i + 1} of ${pictures.length}`} role={roleOf(item, i, pictures.length)} lifted />
              ))}
            </div>
          ) : (
            <TextPlate key={item.id} entry={entry} withTitle={plateOwnsTitle(item)} className="gt-rise w-full max-w-4xl" />
          )}
        </div>
        <StepButton dir="next" disabled={at < 0 || at >= api.visible.length - 1} onClick={() => api.move(1)} />
      </div>

      <footer className="relative mx-auto w-full max-w-shell px-6 pb-6">
        <div className="glass-panel grid items-center gap-5 rounded-2xl p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
          <div className="flex min-w-0 flex-col gap-3">
            {pictures.length > 0 &&
              wordsOf(item).map((m, i) => (
                <p key={i} className="font-hanken line-clamp-3 max-w-[90ch] text-content leading-snug text-white/80">
                  {m.text}
                </p>
              ))}
            <div className="flex flex-wrap items-center gap-3">
              <MachinePick item={item} />
              {!rejectedLane && <ReasonChips entry={entry} api={api} />}
              <CommitLine api={api} source={item.source} group={item.group} />
              <NativeLink entry={entry} />
            </div>
            <FactGrid entry={entry} columns={3} skip={item.source === "triage" ? ["kind", "confidence", "source"] : []} className="xl:grid-cols-4" />
          </div>
          {rejectedLane ? <RejectedStamp entry={entry} api={api} /> : <VerdictBar entry={entry} api={api} size="lg" />}
        </div>
      </footer>
    </div>
  );
}

function StepButton({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous item (K)" : "Next item (J)"}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] text-white/70 transition hover:border-cyan-400/40 hover:text-cyan-100 disabled:opacity-25"
    >
      <Icon aria-hidden className="h-6 w-6" />
    </button>
  );
}
