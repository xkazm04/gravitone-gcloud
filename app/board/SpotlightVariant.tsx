"use client";

// V2 · SPOTLIGHT — one item at a time, as large as the window allows, lit by
// its own picture: the stage's ambient glow is the item's cover, blurred, so a
// noir plate and a paper-relief plate each set their own room. Built for the
// hand on the keys — A / X / U decide and the next item arrives, J / K walk the
// glowing filmstrip, Enter is the loupe.
//
// REASONS AFTER THE FACT. Under the Pending filter a rejected item leaves the
// stage on the keystroke that rejected it, so the reject axes (dojo technique /
// execution, cull style / subject) cannot wait on the stage for it. They
// appear BESIDE the dock for the item just rejected, and pressing one
// re-decides that item with the axis — the same write ReasonChips makes
// anywhere (./parts.tsx). The next decision retires them.

import { Maximize2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

import { usePrefersReducedMotion } from "@/components/ui/motionPreference";
import { EASE } from "@/components/ui/tokens";
import { Hint } from "@/components/ui/signal";
import { SOURCE_LABEL } from "@/lib/board/registry";
import type { BoardEntry } from "@/lib/board/source";
import type { BoardVerdict } from "@/lib/board/types";

import { coverOf, picturesOf, plateOwnsTitle, roleOf, SOURCE_ICON, splitTitle, wordsOf } from "./look";
import {
  AbsencePill,
  Art,
  CommitLine,
  EmptyShape,
  FactGrid,
  MachinePick,
  NativeLink,
  Picture,
  ReasonChips,
  RejectedStamp,
  SourceAbsence,
  TextPlate,
  VerdictDot,
} from "./parts";
import { BoardBar, defaultHandlers, scopeOf, SourceSelect, type VariantProps } from "./shared";
import type { BoardApi } from "./useBoard";
import { useBoardKeys } from "./useBoardKeys";

const STRIP = 40;

export default function SpotlightVariant(props: VariantProps) {
  const { api } = props;
  const sel = api.selected;
  const [lastRejected, setLastRejected] = useState<string | null>(null);
  const live = api.query.st !== "rejected";

  const decide = (entry: BoardEntry, v: BoardVerdict) => {
    setLastRejected(v === "reject" && api.reasonAxes(entry.item.source).length && !entry.refuse.reject ? entry.item.id : null);
    void api.decide(entry, v);
  };
  const base = defaultHandlers(props);
  useBoardKeys({
    ...base,
    approve: () => live && sel && decide(sel, "approve"),
    reject: () => live && sel && decide(sel, "reject"),
    clear: () => live && sel && decide(sel, null),
  });

  const at = sel ? api.visible.findIndex((e) => e.item.id === sel.item.id) : -1;
  // The strip is a window around the current item, not the whole queue: a
  // thousand thumbnails is a thousand decoded pictures for one decision.
  const from = Math.max(0, Math.min(at - STRIP / 2, api.visible.length - STRIP));
  const strip = api.visible.slice(from, from + STRIP);
  const { settling, absent } = scopeOf(api);
  const rejectedEntry = lastRejected ? (api.inView.find((e) => e.item.id === lastRejected) ?? null) : null;

  useEffect(() => {
    if (!sel) return;
    document.getElementById(`spot-${sel.item.id}`)?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [sel]);

  return (
    <div>
      <BoardBar
        api={api}
        lead={<SourceSelect api={api} />}
        tail={
          <span className="font-jetbrains text-label tabular-nums text-white/50">
            <span className="text-white/85">{at >= 0 ? at + 1 : 0}</span> / {api.visible.length}
          </span>
        }
      />

      {sel ? (
        <>
          <Stage key={sel.item.id} entry={sel} onOpen={props.openLoupe} />
          <div className="mt-4 grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              {absent.map((id) => (
                <AbsencePill key={id} id={id} state={api.states[id]} api={api} />
              ))}
              <MachinePick item={sel.item} />
              {sel.item.verdict === "reject" && live && <ReasonChips entry={sel} api={api} />}
              {rejectedEntry && rejectedEntry.item.id !== sel.item.id && rejectedEntry.item.verdict === "reject" && (
                <span className="gt-rise inline-flex min-w-0 items-center gap-2 rounded-full border border-rose-400/20 bg-rose-400/[0.05] py-1 pr-1 pl-1">
                  <Art entry={rejectedEntry} size="thumb" className="h-7 w-10 shrink-0 rounded-full opacity-70" />
                  <span className="sr-only">Reasons for {rejectedEntry.item.title}</span>
                  <ReasonChips entry={rejectedEntry} api={api} />
                </span>
              )}
            </div>
            {live ? <Dock entry={sel} api={api} onDecide={decide} /> : <RejectedStamp entry={sel} api={api} className="min-w-[24rem]" />}
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
              <CommitLine api={api} source={sel.item.source} group={sel.item.group} />
              <NativeLink entry={sel} />
            </div>
          </div>
        </>
      ) : settling ? (
        <div aria-hidden className="h-[calc(100vh-31rem)] min-h-[420px] animate-pulse rounded-[1.75rem] border border-white/6 bg-white/[0.025]" />
      ) : (
        !absent.length && (
          <EmptyShape
            icon={api.query.src}
            title={api.query.st === "pending" && api.inView.length ? "All decided" : api.query.st === "rejected" ? "Nothing rejected" : "Nothing waiting"}
            label="nothing to decide"
            native={api.query.src ? api.nativeOf(api.query.src) : null}
          />
        )
      )}

      {/* With an item on stage an unreadable source is a pill beside the
          dock; with nothing to show it is the stage. */}
      {absent.length > 0 && !sel && (
        <div className={`grid gap-3 ${absent.length > 1 ? "md:grid-cols-2" : ""}`}>
          {absent.map((id) => (
            <SourceAbsence key={id} id={id} state={api.states[id]} api={api} />
          ))}
        </div>
      )}

      {strip.length > 0 && <Filmstrip api={api} strip={strip} selectedId={sel?.item.id ?? null} />}
    </div>
  );
}

/* ── the stage ────────────────────────────────────────────────────────────── */

function Stage({ entry, onOpen }: { entry: BoardEntry; onOpen: () => void }) {
  const reduced = usePrefersReducedMotion();
  const { item } = entry;
  const pictures = picturesOf(item);
  const cover = coverOf(item);
  const Icon = SOURCE_ICON[item.source];
  const { kicker, title } = splitTitle(item);
  const words = wordsOf(item).filter((m) => m.text !== item.title);
  // An adoption is words with an engine still: drawn as a poster — the still
  // full bleed, the first beat set over it — rather than a card in a void.
  const poster = !pictures.length && cover?.src ? cover : null;
  const ownsTitle = plateOwnsTitle(item);
  const enter = { initial: reduced ? false : ({ opacity: 0, scale: 0.985 } as const), animate: { opacity: 1, scale: 1 }, transition: { duration: 0.24, ease: EASE } };
  return (
    <section
      aria-label={item.title}
      data-board-selected={item.id}
      onDoubleClick={onOpen}
      className="relative isolate flex h-[calc(100vh-31rem)] min-h-[420px] flex-col overflow-hidden rounded-[1.75rem] border border-white/8 bg-black/30"
    >
      {/* The room light: the item's own cover, blurred far past legibility —
          or, for a poster, the still itself, held back behind the words. */}
      {cover?.kind === "image" && cover.src && (
        // eslint-disable-next-line @next/next/no-img-element -- ambient copy of the cover, decorative
        <img
          aria-hidden
          alt=""
          src={cover.src}
          className={`absolute inset-0 -z-10 h-full w-full object-cover ${poster ? "opacity-70" : "scale-125 opacity-45 blur-3xl saturate-150"}`}
        />
      )}
      {!cover && <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-br from-violet-400/[0.14] via-transparent to-cyan-400/[0.10]" />}
      <div
        aria-hidden
        className={`absolute inset-0 -z-10 ${
          poster ? "bg-gradient-to-r from-[var(--gt-ink)] via-[var(--gt-ink)]/75 to-transparent" : "bg-gradient-to-b from-[var(--gt-ink)]/20 via-transparent to-[var(--gt-ink)]/85"
        }`}
      />

      <div className="flex shrink-0 items-center gap-3 px-5 pt-4">
        <span className="font-jetbrains inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/40 px-3 py-1 text-label tracking-[0.12em] text-white/75 uppercase backdrop-blur">
          <Icon aria-hidden className="h-3.5 w-3.5 text-cyan-200" />
          {SOURCE_LABEL[item.source]}
          {item.group && <span className="max-w-[28rem] truncate normal-case tracking-normal text-white/55">{item.group}</span>}
        </span>
        <button
          type="button"
          onClick={onOpen}
          aria-label="Open in the loupe (Enter)"
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-black/40 text-white/70 backdrop-blur transition hover:border-cyan-400/40 hover:text-cyan-100"
        >
          <Maximize2 aria-hidden className="h-4 w-4" />
        </button>
      </div>

      <motion.div className="flex min-h-0 flex-1 items-center justify-center px-16 py-4" {...enter}>
        {pictures.length ? (
          <div className={`grid h-full w-full gap-8 ${pictures.length > 1 ? "grid-cols-2" : ""}`}>
            {pictures.map((m, i) => (
              <Picture key={i} media={m} alt={`${item.title}, ${i + 1} of ${pictures.length}`} role={roleOf(item, i, pictures.length)} lifted />
            ))}
          </div>
        ) : poster ? (
          <div className="flex w-full flex-col items-start">
            {kicker && (
              <span className="font-jetbrains inline-flex rounded-full border border-emerald-300/30 bg-black/40 px-3 py-1 text-label tracking-[0.16em] text-emerald-100 uppercase backdrop-blur">
                {kicker}
              </span>
            )}
            {wordsOf(item).map((m, i) => (
              <blockquote key={i} className="relative mt-6 pl-12">
                <span aria-hidden className="font-instrument absolute top-[-0.3em] left-0 text-7xl leading-none text-emerald-300/50">
                  “
                </span>
                <p className="font-instrument max-w-[24ch] text-5xl leading-[1.15] text-white">{m.text}</p>
              </blockquote>
            ))}
          </div>
        ) : (
          <TextPlate entry={entry} withTitle big className="gt-float w-full max-w-5xl bg-[var(--gt-ink)]/55 backdrop-blur-xl" />
        )}
      </motion.div>

      <div className="flex shrink-0 items-end gap-8 bg-gradient-to-t from-[var(--gt-ink)]/70 to-transparent px-6 pt-6 pb-5">
        <div className="min-w-0 flex-1">
          {kicker && !poster && <p className="font-jetbrains text-label tracking-[0.14em] text-emerald-200/80 uppercase">{kicker}</p>}
          <h2 className={ownsTitle ? "sr-only" : "font-instrument line-clamp-2 text-4xl leading-tight text-white"}>{title}</h2>
          {pictures.length > 0 &&
            words.map((m, i) => (
              <p key={i} className="font-hanken mt-1 line-clamp-2 max-w-[80ch] text-content leading-snug text-white/70">
                {m.text}
              </p>
            ))}
        </div>
        <FactGrid entry={entry} columns={3} skip={["run", "kind", "confidence", "source"]} className="max-w-[46%] shrink-0 gap-y-1" />
      </div>
    </section>
  );
}

/* ── the dock ─────────────────────────────────────────────────────────────── */

/** The verdict as three physical keys: reject and approve large, clear small
 *  between them. A key the source refuses is drawn locked, with its reason. */
function Dock({ entry, api, onDecide }: { entry: BoardEntry; api: BoardApi; onDecide: (e: BoardEntry, v: BoardVerdict) => void }) {
  const { item, refuse } = entry;
  const busy = api.busy.has(item.id);
  const v = item.verdict;
  return (
    <div role="group" aria-label={`Verdict on ${item.title}`} aria-busy={busy} className="flex items-end justify-center gap-5">
      <DockKey
        tone="reject"
        on={v === "reject"}
        disabled={busy || Boolean(refuse.reject)}
        label={refuse.reject ? `Reject is refused: ${refuse.reject}` : `Reject ${item.title} (X)`}
        word="Reject"
        cap="X"
        onClick={() => onDecide(entry, "reject")}
        refusal={refuse.reject}
      />
      <DockKey
        tone="clear"
        on={false}
        disabled={busy || v === null || Boolean(refuse.clear)}
        label={refuse.clear ? `Clear is refused: ${refuse.clear}` : `Clear the verdict on ${item.title} (U)`}
        word="Clear"
        cap="U"
        onClick={() => onDecide(entry, null)}
      />
      <DockKey
        tone="approve"
        on={v === "approve"}
        disabled={busy || Boolean(refuse.approve)}
        label={`Approve ${item.title} (A)`}
        word="Approve"
        cap="A"
        onClick={() => onDecide(entry, "approve")}
      />
    </div>
  );
}

function DockKey({
  tone,
  on,
  disabled,
  label,
  word,
  cap,
  onClick,
  refusal,
}: {
  tone: "approve" | "reject" | "clear";
  on: boolean;
  disabled: boolean;
  label: string;
  word: string;
  cap: string;
  onClick: () => void;
  refusal?: string;
}) {
  const big = tone !== "clear";
  const locked = Boolean(refusal);
  const face =
    tone === "approve"
      ? on
        ? "border-emerald-200 bg-emerald-300 text-slate-950 shadow-xl shadow-emerald-400/30"
        : "border-emerald-300/40 bg-emerald-400/[0.10] text-emerald-100 hover:bg-emerald-400/20 hover:shadow-lg hover:shadow-emerald-400/20"
      : tone === "reject"
        ? locked
          ? "border-white/10 bg-white/[0.03] text-white/30"
          : on
            ? "border-rose-200 bg-rose-300 text-slate-950 shadow-xl shadow-rose-400/30"
            : "border-rose-300/40 bg-rose-400/[0.10] text-rose-100 hover:bg-rose-400/20 hover:shadow-lg hover:shadow-rose-400/20"
        : "border-white/12 bg-white/[0.03] text-white/60 hover:border-white/30 hover:text-white";
  return (
    <span className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        aria-pressed={tone === "clear" ? undefined : on}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={`flex items-center justify-center rounded-full border transition duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-not-allowed ${
          tone === "clear" ? "disabled:opacity-35" : ""
        } ${big ? "h-[4.5rem] w-[4.5rem]" : "mb-3 h-12 w-12"} ${face}`}
      >
        <DockGlyph tone={tone} locked={locked} />
      </button>
      <span className="font-jetbrains flex items-center gap-1.5 text-label text-white/50">
        {word}
        <kbd aria-hidden className="rounded-md border border-white/15 px-1.5 leading-snug text-white/45">
          {cap}
        </kbd>
        {refusal && (
          <Hint variant="lock" tone="amber" label="Why reject is refused">
            {refusal}
          </Hint>
        )}
      </span>
    </span>
  );
}

function DockGlyph({ tone, locked }: { tone: "approve" | "reject" | "clear"; locked: boolean }) {
  // Drawn rather than imported so the stroke can be heavier than lucide's at
  // this size; the shapes are the same check / cross / back-arrow.
  if (locked)
    return (
      <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    );
  if (tone === "approve")
    return (
      <svg aria-hidden viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    );
  if (tone === "reject")
    return (
      <svg aria-hidden viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
      </svg>
    );
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

/* ── the filmstrip ────────────────────────────────────────────────────────── */

function Filmstrip({ api, strip, selectedId }: { api: BoardApi; strip: BoardEntry[]; selectedId: string | null }) {
  return (
    <div className="relative mt-5 rounded-2xl border border-white/8 bg-white/[0.02] px-2 pt-3 pb-2">
      <div aria-hidden className="absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
      <ol aria-label="Queue" className="scroll-x scroll-rail flex items-center gap-2 px-1 pb-1.5">
        {strip.map((e) => {
          const on = e.item.id === selectedId;
          return (
            <li key={e.item.id} id={`spot-${e.item.id}`} className="shrink-0 py-1.5">
              <button
                type="button"
                aria-current={on ? "true" : undefined}
                aria-label={`${e.item.title}${e.item.verdict ? `, ${e.item.verdict === "approve" ? "approved" : "rejected"}` : ""}`}
                onClick={() => api.select(e.item.id)}
                className={`relative block overflow-hidden rounded-lg transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  on ? "ring-2 ring-cyan-300 shadow-lg shadow-cyan-400/40" : "opacity-70 ring-1 ring-white/10 hover:opacity-100 hover:ring-white/30"
                }`}
              >
                <Art entry={e} size="thumb" className={`h-[4.25rem] w-[7.5rem] ${e.item.verdict === "reject" ? "grayscale" : ""}`} />
                {e.item.verdict && <VerdictDot verdict={e.item.verdict} className="absolute right-1 bottom-1 h-5 w-5" />}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
