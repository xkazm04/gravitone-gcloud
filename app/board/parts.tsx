"use client";

// The pieces the sheet and the loupe draw the same way: an item's art, its
// verdict control, its reject reasons, the sealed machine pick, a source's
// state, the per-run commit line, the read-only rejected stamp, the toasts. A
// surface that needs a different SHAPE of one of these is a finding against
// this file, not a licence for a second spelling.
//
// Drawn in the app's own idiom (app/_projects/parts.tsx, app/library/parts.tsx):
// glass, `rounded-xl` nested in `rounded-2xl`, white/8 hairlines, cyan for
// where you are, emerald / rose / amber for kept / cut / waiting. Round 1 drew
// these through the kit's Almanac parts remapped to Obsidian colours — square
// corners, dashed edges, flat fields — and on this ground they read as
// wireframes (.vault/Spark/briefs/platform-consolidation/10-r2-ui-pass.md).

import Link from "next/link";
import { ArrowUpRight, Check, CircleDashed, Lock, LockKeyhole, RotateCcw, RotateCw, Sparkles, Undo2, X } from "lucide-react";

import { Hint, Keycaps, PipRow, type KeyBinding, type PipState } from "@/components/ui/signal";
import type { SourceState } from "@/lib/board/registry";
import { SOURCE_LABEL } from "@/lib/board/registry";
import type { BoardEntry } from "@/lib/board/source";
import type { BoardItem, BoardMedia, BoardSourceId, BoardVerdict } from "@/lib/board/types";

import { coverOf, fact, KIND_ICON, SOURCE_ICON, splitTitle } from "./look";
import type { BoardApi } from "./useBoard";

/* ── media ────────────────────────────────────────────────────────────────── */

export function Media({ media, alt, fit = "cover", className = "" }: { media: BoardMedia; alt: string; fit?: "cover" | "contain"; className?: string }) {
  const fitClass = fit === "contain" ? "object-contain" : "object-cover";
  if (media.kind === "image" && media.src)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam, or a data: proof
      <img src={media.src} alt={alt} loading="lazy" draggable={false} className={`block h-full w-full ${fitClass} ${className}`} />
    );
  if (media.kind === "video" && media.src)
    return <video src={media.src} controls muted playsInline className={`block h-full w-full ${fitClass} ${className}`} aria-label={alt} />;
  if (media.kind === "audio" && media.src) return <audio src={media.src} controls className="w-full" aria-label={alt} />;
  return null;
}

/**
 * A picture at stage size, at its own aspect: the image itself is rounded and
 * lifted, rather than letterboxed inside a grey box the size of the stage. A
 * role caption (baseline · challenger) sits under it, never on it.
 */
export function Picture({ media, alt, role, lifted = false }: { media: BoardMedia; alt: string; role?: string | null; lifted?: boolean }) {
  const cls = `block max-h-full max-w-full min-h-0 rounded-xl object-contain ring-1 ring-white/10 ${lifted ? "shadow-2xl shadow-black/60" : ""}`;
  return (
    <figure className="flex h-full min-h-0 w-full min-w-0 flex-col items-center justify-center gap-2">
      {media.kind === "video" && media.src ? (
        <video src={media.src} controls muted playsInline aria-label={alt} className={cls} />
      ) : media.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam, or a data: proof
        <img src={media.src} alt={alt} draggable={false} className={cls} />
      ) : null}
      {role && <figcaption className="font-jetbrains shrink-0 text-label tracking-[0.16em] text-white/55 uppercase">{role}</figcaption>}
    </figure>
  );
}

/** The washes a words-only card is drawn on — one per source family, so a
 *  research card and a publish slot are told apart before they are read.
 *  Tailwind palette alphas, the rendered form of tokens.ts ACCENT. */
const TEXT_WASH: Partial<Record<BoardSourceId, string>> = {
  triage: "from-violet-400/[0.16] via-white/[0.03] to-cyan-400/[0.08]",
  publish: "from-amber-400/[0.14] via-white/[0.03] to-rose-400/[0.08]",
  adoption: "from-emerald-400/[0.12] via-white/[0.03] to-cyan-400/[0.08]",
  articles: "from-cyan-400/[0.12] via-white/[0.03] to-amber-400/[0.08]",
};

/**
 * An item's art at card size: its own picture when it has one, and a
 * typographic card when it is words — the research card's kind and claim, a
 * slot's channel and status. Never a grey box with a letter in it.
 */
export function Art({ entry, className = "" }: { entry: BoardEntry; className?: string }) {
  const { item } = entry;
  const cover = coverOf(item);
  if (cover)
    return (
      <span className={`relative block overflow-hidden bg-white/[0.03] ${className}`} aria-hidden="true">
        {cover.kind === "video" ? (
          <video src={cover.src} muted preload="metadata" className="block h-full w-full object-cover" />
        ) : (
          <Media media={cover} alt="" />
        )}
      </span>
    );
  const Icon = item.source === "triage" ? (KIND_ICON[fact(entry, "kind") ?? ""] ?? SOURCE_ICON.triage) : SOURCE_ICON[item.source];
  const wash = TEXT_WASH[item.source] ?? "from-cyan-400/[0.10] via-white/[0.03] to-violet-400/[0.08]";
  const kind = item.source === "triage" ? fact(entry, "kind") : item.source === "publish" ? fact(entry, "status") : SOURCE_LABEL[item.source];
  const status = item.source === "publish" ? fact(entry, "status") : null;
  return (
    <span className={`relative flex flex-col overflow-hidden bg-gradient-to-br ${wash} p-4 ${className}`} aria-hidden="true">
      <Icon className="absolute -right-3 -bottom-3 h-28 w-28 text-white/[0.05]" strokeWidth={1} />
      {/* pr-9 keeps the header clear of the batch tick a contact-sheet frame
          puts in this corner. */}
      <span className="flex items-center gap-2 pr-9">
        <Icon className={`h-4 w-4 shrink-0 ${status === "failed" ? "text-rose-300" : status === "missed" ? "text-amber-300" : "text-white/60"}`} strokeWidth={1.75} />
        <span className="font-jetbrains truncate text-label tracking-[0.14em] text-white/55 uppercase">{kind}</span>
        {item.source === "triage" && <Confidence entry={entry} />}
      </span>
      {/* A claim is READ, so it is set in the body face. The display face
          (font-instrument) stays on the headings that name a place — a roll,
          an empty sheet — where a condensed serif is a signature, not a
          paragraph to get through (the operator's call, 2026-10-05). */}
      <span className="font-hanken mt-2.5 line-clamp-4 text-content leading-snug font-medium text-white/90">{item.title}</span>
    </span>
  );
}

/** A research card's confidence, as three pips — high · medium · low. */
export function Confidence({ entry, className = "" }: { entry: BoardEntry; className?: string }) {
  const c = fact(entry, "confidence");
  if (!c) return null;
  const n = c === "high" ? 3 : c === "medium" ? 2 : c === "low" ? 1 : 0;
  const tone: PipState = c === "low" ? "amber" : "filled";
  return <PipRow className={className} states={Array.from({ length: n }, () => tone)} max={3} label={`confidence ${c}`} />;
}

/**
 * Words-only items at stage size. The adoption candidate opens on its engine's
 * still with the first beat as a pull quote; a research card on its kind, its
 * confidence and its note; a publish slot on its error, verbatim, or its copy.
 */
export function TextPlate({
  entry,
  withTitle = false,
  className = "",
}: {
  entry: BoardEntry;
  withTitle?: boolean;
  className?: string;
}) {
  const { item } = entry;
  // A research card with no note carries its claim as its only words — the
  // same sentence as its title — and printing it twice is not a second fact.
  const words = item.media
    .filter((m) => m.kind === "text" && m.text && m.text.trim() !== item.title.trim())
    .map((m) => m.text as string);
  const cover = coverOf(item);
  const { kicker } = splitTitle(item);
  if (item.source === "adoption")
    return (
      <div className={`flex min-h-0 flex-col gap-5 ${className}`}>
        {cover?.src && (
          <div className="relative aspect-[21/8] w-full shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10">
            <Media media={cover} alt="" />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--gt-ink)] via-transparent to-transparent" />
            {kicker && (
              <span className="font-jetbrains absolute bottom-3 left-4 rounded-full border border-emerald-300/30 bg-black/40 px-3 py-1 text-label tracking-[0.14em] text-emerald-100 uppercase backdrop-blur">
                {kicker}
              </span>
            )}
          </div>
        )}
        {words.map((t, i) => (
          <blockquote key={i} className="relative max-w-[62ch] pl-10">
            <span aria-hidden className="font-instrument absolute top-[-0.1em] left-0 text-5xl leading-none text-emerald-300/40">
              “
            </span>
            <p className="font-hanken text-xl leading-relaxed text-white/90">{t}</p>
          </blockquote>
        ))}
      </div>
    );
  const Icon = item.source === "triage" ? (KIND_ICON[fact(entry, "kind") ?? ""] ?? SOURCE_ICON.triage) : SOURCE_ICON[item.source];
  const status = fact(entry, "status");
  const failing = item.source === "publish" && (status === "failed" || status === "missed");
  return (
    <div
      className={`relative flex min-h-0 flex-col justify-center overflow-hidden rounded-xl bg-gradient-to-br ${TEXT_WASH[item.source] ?? "from-cyan-400/[0.08] via-white/[0.02] to-violet-400/[0.06]"} ring-1 ring-white/8 px-8 py-8 ${className}`}
    >
      <Icon aria-hidden className="absolute -right-6 -bottom-8 h-56 w-56 text-white/[0.04]" strokeWidth={1} />
      <div className="relative flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
          <Icon aria-hidden className={`h-5 w-5 ${failing ? (status === "failed" ? "text-rose-300" : "text-amber-300") : "text-white/70"}`} strokeWidth={1.75} />
        </span>
        <span className="font-jetbrains text-label tracking-[0.16em] text-white/55 uppercase">
          {item.source === "triage" ? fact(entry, "kind") : (status ?? SOURCE_LABEL[item.source])}
        </span>
        {item.source === "triage" && <Confidence entry={entry} />}
      </div>
      {withTitle && <p className="font-hanken relative mt-6 max-w-[48ch] text-2xl leading-snug font-medium text-white">{item.title}</p>}
      {words.map((t, i) =>
        failing && i === 0 ? (
          <p key={i} role="status" className="relative mt-6 max-w-[64ch] rounded-xl border border-rose-400/25 bg-rose-400/[0.07] px-4 py-3 font-hanken text-content leading-relaxed text-rose-100/90">
            {t}
          </p>
        ) : (
          <p key={i} className="font-hanken relative mt-6 max-w-[64ch] text-content leading-relaxed text-white/75">
            {t}
          </p>
        ),
      )}
      {item.source === "triage" && fact(entry, "source") && (
        <p className="font-jetbrains relative mt-6 text-label text-white/50">
          <span aria-hidden>— </span>
          <span className="sr-only">source: </span>
          {fact(entry, "source")}
        </p>
      )}
    </div>
  );
}

/* ── verdict ──────────────────────────────────────────────────────────────── */

/** The state of an item at a glance: an open ring, a kept check, a cut cross. */
export function VerdictDot({ verdict, className = "" }: { verdict: BoardVerdict; className?: string }) {
  if (verdict === "approve")
    return (
      <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/90 text-slate-950 ${className}`}>
        <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
        <span className="sr-only">approved</span>
      </span>
    );
  if (verdict === "reject")
    return (
      <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-400/90 text-slate-950 ${className}`}>
        <X aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
        <span className="sr-only">rejected</span>
      </span>
    );
  return (
    <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 ${className}`}>
      <span className="sr-only">undecided</span>
    </span>
  );
}

type VerdictSize = "lg" | "icon";

const KEY_CAP = "font-jetbrains rounded-md border px-1.5 text-label leading-snug";

/**
 * Approve · Reject · Clear — the one control every decision goes through.
 *
 * A verdict the source cannot take is drawn LOCKED with the source's own
 * reason beside it (lib/board/source.ts `refuse`), never hidden: a missing
 * Reject button reads as a bug, a locked one reads as a rule.
 */
export function VerdictBar({ entry, api, size = "lg", className = "" }: { entry: BoardEntry; api: BoardApi; size?: VerdictSize; className?: string }) {
  const { item, refuse } = entry;
  const busy = api.busy.has(item.id);
  const v = item.verdict;
  const go = (next: BoardVerdict) => void api.decide(entry, next);
  const refusal = refuse.reject ?? null;

  if (size === "icon")
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`} aria-busy={busy}>
        <IconVerdict tone="approve" on={v === "approve"} locked={Boolean(refuse.approve)} label={`Approve ${item.title}`} onClick={() => go("approve")} />
        <IconVerdict tone="reject" on={v === "reject"} locked={Boolean(refuse.reject)} label={`Reject ${item.title}`} onClick={() => go("reject")} />
      </span>
    );

  const base =
    "group inline-flex h-14 flex-1 items-center gap-3 rounded-2xl border px-5 font-hanken text-content transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed";
  const approveCls =
    v === "approve"
      ? "border-emerald-300/70 bg-emerald-400/20 text-white ring-2 ring-emerald-300/25 shadow-lg shadow-emerald-500/10"
      : "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-100 hover:border-emerald-300/50 hover:bg-emerald-400/[0.12]";
  const rejectCls = refuse.reject
    ? "border-white/8 bg-white/[0.02] text-white/35"
    : v === "reject"
      ? "border-rose-300/70 bg-rose-400/20 text-white ring-2 ring-rose-300/25 shadow-lg shadow-rose-500/10"
      : "border-rose-400/25 bg-rose-400/[0.06] text-rose-100 hover:border-rose-300/50 hover:bg-rose-400/[0.12]";
  const clearable = v !== null && !refuse.clear;

  return (
    <div className={`flex w-full items-center gap-2.5 ${className}`} role="group" aria-label={`Verdict on ${item.title}`} aria-busy={busy}>
      <button
        type="button"
        aria-pressed={v === "approve"}
        aria-label={`Approve ${item.title} (A)`}
        disabled={busy || Boolean(refuse.approve)}
        onClick={() => go("approve")}
        className={`${base} ${approveCls}`}
      >
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${v === "approve" ? "bg-emerald-300 text-slate-950" : "bg-emerald-400/15 text-emerald-200"}`}>
          <Check aria-hidden className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <span>{v === "approve" ? "Approved" : "Approve"}</span>
        <kbd aria-hidden className={`${KEY_CAP} ml-auto border-emerald-300/25 text-emerald-200/70`}>
          A
        </kbd>
      </button>
      <button
        type="button"
        aria-pressed={v === "reject"}
        aria-label={refuse.reject ? `Reject is refused: ${refuse.reject}` : `Reject ${item.title} (X)`}
        disabled={busy || Boolean(refuse.reject)}
        onClick={() => go("reject")}
        className={`${base} ${rejectCls}`}
      >
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full ${
            refuse.reject ? "bg-white/[0.05] text-white/40" : v === "reject" ? "bg-rose-300 text-slate-950" : "bg-rose-400/15 text-rose-200"
          }`}
        >
          {refuse.reject ? <LockKeyhole aria-hidden className="h-3.5 w-3.5" /> : <X aria-hidden className="h-4 w-4" strokeWidth={2.5} />}
        </span>
        <span>{v === "reject" ? "Rejected" : "Reject"}</span>
        <kbd aria-hidden className={`${KEY_CAP} ml-auto ${refuse.reject ? "border-white/10 text-white/25" : "border-rose-300/25 text-rose-200/70"}`}>
          X
        </kbd>
      </button>
      <button
        type="button"
        aria-label={refuse.clear ? `Clear is refused: ${refuse.clear}` : `Clear the verdict on ${item.title} (U)`}
        disabled={busy || !clearable}
        onClick={() => go(null)}
        className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/55 transition hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-35"
      >
        <RotateCcw aria-hidden className="h-4 w-4" />
      </button>
      {refusal && (
        <Hint variant="lock" tone="amber" label="Why reject is refused">
          {refusal}
        </Hint>
      )}
    </div>
  );
}

function IconVerdict({ tone, on, locked, label, onClick }: { tone: "approve" | "reject"; on: boolean; locked: boolean; label: string; onClick: () => void }) {
  const Icon = locked ? Lock : tone === "approve" ? Check : X;
  const cls = locked
    ? "border-white/10 bg-black/50 text-white/35"
    : tone === "approve"
      ? on
        ? "border-emerald-300 bg-emerald-300 text-slate-950"
        : "border-emerald-300/40 bg-black/55 text-emerald-200 hover:bg-emerald-400/30"
      : on
        ? "border-rose-300 bg-rose-300 text-slate-950"
        : "border-rose-300/40 bg-black/55 text-rose-200 hover:bg-rose-400/30";
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      disabled={locked}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed ${cls}`}
    >
      <Icon aria-hidden className="h-4 w-4" strokeWidth={2.5} />
    </button>
  );
}

/** Two-axis reject, where a source has axes (dojo, cull). Pressing an axis on a
 *  rejected item re-decides it with that axis toggled; on an undecided item it
 *  rejects with that axis. */
export function ReasonChips({ entry, api, className = "" }: { entry: BoardEntry; api: BoardApi; className?: string }) {
  const axes = api.reasonAxes(entry.item.source);
  if (!axes.length || entry.refuse.reject) return null;
  const on = new Set(entry.item.verdict === "reject" ? entry.item.reasons : []);
  return (
    <span role="group" aria-label="Reject reasons" className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="font-jetbrains mr-1 text-label tracking-[0.14em] text-white/40 uppercase">reject on</span>
      {axes.map((axis) => {
        const pressed = on.has(axis);
        return (
          <button
            key={axis}
            type="button"
            aria-pressed={pressed}
            onClick={() => {
              const next = new Set(on);
              if (pressed) next.delete(axis);
              else next.add(axis);
              void api.decide(entry, "reject", [...next]);
            }}
            className={`font-jetbrains rounded-full border px-3 py-0.5 text-label transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
              pressed ? "border-rose-300/60 bg-rose-400/15 text-rose-100" : "border-white/12 text-white/60 hover:border-rose-300/40 hover:text-rose-100"
            }`}
          >
            {axis}
          </button>
        );
      })}
    </span>
  );
}

/** The machine's own answer — SEALED until the human has decided, so the
 *  human verdict stays an independent measurement of the machine. */
export function MachinePick({ item }: { item: BoardItem }) {
  if (!item.machinePick) return null;
  if (item.verdict === null)
    return (
      <span className="font-jetbrains inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-label text-white/45">
        <Lock aria-hidden className="h-3.5 w-3.5" />
        machine pick
        <span className="sr-only">sealed until you decide</span>
      </span>
    );
  return (
    <span className="gt-rise font-jetbrains inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/[0.07] px-3 py-1 text-label text-cyan-100">
      <Sparkles aria-hidden className="h-3.5 w-3.5 text-cyan-300" />
      <span className="sr-only">machine pick:</span>
      {item.machinePick}
    </span>
  );
}

/** The work's own facts — a model, a score, a scene, a date. Verbatim. */
export function FactGrid({ entry, skip = [], columns = 1, className = "" }: { entry: BoardEntry; skip?: string[]; columns?: 1 | 2 | 3; className?: string }) {
  const rows = entry.facts.filter((f) => !skip.includes(f.name));
  if (!rows.length) return null;
  const cols = columns === 3 ? "lg:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : "";
  return (
    <dl className={`grid gap-x-6 gap-y-3 ${cols} ${className}`}>
      {rows.map((f) => (
        <div key={f.name} className="min-w-0">
          <dt className="font-jetbrains text-label tracking-[0.14em] text-white/40 uppercase">{f.name}</dt>
          <dd className="font-hanken mt-0.5 text-content leading-snug break-words text-white/85">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function NativeLink({ entry, label = "open" }: { entry: BoardEntry; label?: string }) {
  return (
    <Link
      href={entry.href}
      className="font-jetbrains inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-label text-white/60 transition hover:border-cyan-400/40 hover:text-cyan-100"
    >
      {label}
      <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
    </Link>
  );
}

/* ── per-run commit line (foundry sources) ────────────────────────────────── */

/** "decided 7/18 · commit on Foundry ↗" for a foundry run. The commit itself
 *  is destructive and confirmed on the Foundry; the Board only counts. */
export function CommitLine({ api, source, group, className = "" }: { api: BoardApi; source: BoardSourceId; group: string | null; className?: string }) {
  const on = api.commitsOn(source);
  if (!on || !group) return null;
  const s = api.states[source];
  if (s.kind !== "loaded") return null;
  const rows = s.entries.filter((e) => e.item.group === group);
  const decided = rows.filter((e) => e.item.verdict !== null).length;
  const done = decided === rows.length;
  return (
    <span className={`font-jetbrains inline-flex items-center gap-2 text-label ${className}`}>
      <span className={`tabular-nums ${done ? "text-emerald-200" : "text-white/55"}`}>
        <span className="sr-only">decided </span>
        {decided}/{rows.length}
      </span>
      <Link href={on.href} className="inline-flex items-center gap-1 text-cyan-200/80 underline-offset-4 hover:text-cyan-100 hover:underline">
        {on.label}
        <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
      </Link>
    </span>
  );
}

/* ── a source's state ─────────────────────────────────────────────────────── */

export type SourceTone = "waiting" | "clear" | "empty" | "locked" | "failed" | "loading";

export function toneOf(state: SourceState): SourceTone {
  switch (state.kind) {
    case "idle":
    case "loading":
      return "loading";
    case "counted":
    case "loaded":
      return (state.count.pending ?? 1) > 0 ? "waiting" : "clear";
    case "empty":
      return "empty";
    case "unavailable":
      return "locked";
    case "error":
      return "failed";
  }
}

/** A dot for the Select and the rail, in the shelf's state colours. */
export const TONE_DOT: Record<SourceTone, string> = {
  waiting: "bg-amber-400",
  clear: "bg-emerald-300",
  empty: "bg-white/25",
  locked: "bg-white/40",
  failed: "bg-rose-400",
  loading: "bg-cyan-300/60",
};

/** The pending figure, or the word for why there is none. */
export function pendingWord(state: SourceState): string {
  switch (state.kind) {
    case "idle":
    case "loading":
      return "…";
    case "counted":
    case "loaded":
      return state.count.pending === null ? "—" : String(state.count.pending);
    case "empty":
      return "0";
    case "unavailable":
      return "n/a";
    case "error":
      return "!";
  }
}

/**
 * What a source shows where its items would be when it has none — composed,
 * never a blank dashed box. Unreadable: the reason verbatim, Retry, and the
 * native surface. Empty: the ghost of the cards that would be here.
 * `compact` is the one-row form a list or a sheet carries between its rolls.
 */
export function SourceAbsence({ id, state, api, compact = false }: { id: BoardSourceId; state: SourceState; api: BoardApi; compact?: boolean }) {
  const native = api.nativeOf(id);
  if (state.kind !== "unavailable" && state.kind !== "error")
    return <EmptyShape icon={id} label={`${SOURCE_LABEL[id]}: nothing waiting`} title={`Nothing in ${SOURCE_LABEL[id]}`} native={native} compact={compact} />;
  const err = state.kind === "error";
  const words = err ? state.message : state.reason;
  const actions = (
    <span className="flex shrink-0 flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => api.reload(id)}
        aria-label={`Retry ${SOURCE_LABEL[id]}`}
        className="font-jetbrains inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-label text-cyan-100 transition hover:bg-cyan-400/20"
      >
        <RotateCw aria-hidden className="h-3.5 w-3.5" />
        Retry
      </button>
      {native && (
        <Link
          href={native.href}
          className="font-jetbrains inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-label text-white/60 transition hover:border-white/25 hover:text-white"
        >
          {native.label}
          <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      )}
    </span>
  );
  if (compact)
    return (
      <div
        role={err ? "alert" : "status"}
        className={`gt-rise flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-3 py-2.5 ${err ? "border-rose-400/25 bg-rose-400/[0.05]" : "border-white/8 bg-white/[0.02]"}`}
      >
        <Medallion id={id} err={err} small />
        <span className="font-instrument text-xl text-white/85">{SOURCE_LABEL[id]}</span>
        <span className={`font-jetbrains min-w-0 flex-1 text-label break-words ${err ? "text-rose-200/85" : "text-white/50"}`}>{words}</span>
        {actions}
      </div>
    );
  return (
    <EmptyShape icon={id} label={`${SOURCE_LABEL[id]}: ${words}`} title={SOURCE_LABEL[id]} medallion={<Medallion id={id} err={err} />} role={err ? "alert" : "status"}>
      <span className={`font-jetbrains max-w-[48ch] text-label break-words ${err ? "text-rose-200/85" : "text-white/55"}`}>{words}</span>
      {actions}
    </EmptyShape>
  );
}

/** A source's glyph with what is wrong with it pinned to the corner. */
function Medallion({ id, err, small = false }: { id: BoardSourceId; err: boolean; small?: boolean }) {
  const Icon = SOURCE_ICON[id];
  return (
    <span
      aria-hidden
      className={`relative flex shrink-0 items-center justify-center rounded-xl border ${small ? "h-10 w-10" : "h-12 w-12"} ${
        err ? "border-rose-400/30 bg-rose-400/10" : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <Icon className={`h-5 w-5 ${err ? "text-rose-200" : "text-white/45"}`} strokeWidth={1.75} />
      <span
        className={`absolute -right-1.5 -bottom-1.5 flex h-5 w-5 items-center justify-center rounded-full border ${
          err ? "border-rose-300/40 bg-rose-500/80" : "border-amber-300/40 bg-[var(--gt-ink)]"
        }`}
      >
        {err ? <X className="h-3 w-3 text-white" strokeWidth={3} /> : <Lock className="h-3 w-3 text-amber-200" />}
      </span>
    </span>
  );
}

/**
 * Absence drawn as the SHAPE of what will be there: three hollow cards in the
 * board's own proportions, the source's glyph, one line naming what is empty.
 */
export function EmptyShape({
  icon,
  title,
  label,
  native,
  compact = false,
  medallion,
  role,
  children,
}: {
  icon: BoardSourceId | null;
  title: string;
  label: string;
  native?: { href: string; label: string } | null;
  compact?: boolean;
  /** Replaces the plain glyph — the unreadable state's lock or cross. */
  medallion?: React.ReactNode;
  role?: "status" | "alert";
  children?: React.ReactNode;
}) {
  const Icon = icon ? SOURCE_ICON[icon] : CircleDashed;
  return (
    <div role={role} className={`gt-rise relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.015] ${compact ? "p-5" : "px-8 py-10"}`}>
      <p className="sr-only">{label}</p>
      <div aria-hidden className={`mx-auto grid max-w-2xl grid-cols-3 gap-3 ${compact || medallion ? "opacity-50" : ""}`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent" style={{ opacity: 1 - i * 0.25 }}>
            <div className="aspect-[4/3] bg-gradient-to-br from-white/[0.05] to-transparent" />
            <div className="space-y-1.5 p-2.5">
              <div className="h-2 w-3/4 rounded-full bg-white/10" />
              <div className="h-2 w-1/2 rounded-full bg-white/[0.06]" />
            </div>
          </div>
        ))}
      </div>
      <div className="relative mt-6 flex flex-col items-center gap-3 text-center">
        {medallion ?? (
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
            <Icon aria-hidden className="h-5 w-5 text-white/50" strokeWidth={1.75} />
          </span>
        )}
        <p className="font-instrument text-2xl text-white/80">{title}</p>
        {children}
        {native && (
          <Link
            href={native.href}
            className="font-jetbrains inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-label text-white/60 transition hover:border-cyan-400/40 hover:text-cyan-100"
          >
            {native.label}
            <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

/* ── the rejected lane ────────────────────────────────────────────────────── */

/** Read-only: a rejected item is shown, not re-decided, in the Rejected lane.
 *  Undo is offered for decisions made in this session — the stack is the
 *  session's — and a rejection from an earlier one goes back to its native
 *  surface. */
export function RejectedStamp({ entry, api, className = "" }: { entry: BoardEntry; api: BoardApi; className?: string }) {
  const { item } = entry;
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] px-4 py-3 ${className}`}>
      <VerdictDot verdict="reject" />
      <span className="font-jetbrains text-label tracking-[0.14em] text-rose-100/85 uppercase">rejected</span>
      {item.reasons.length > 0 && (
        <span className="font-jetbrains text-label text-rose-100/60">
          <span className="sr-only">reasons: </span>
          {item.reasons.join(" · ")}
        </span>
      )}
      <span className="ml-auto flex items-center gap-2">
        {api.canUndo(item.id) ? (
          <button
            type="button"
            onClick={() => void api.undoItem(item.id)}
            aria-label={`Undo the rejection of ${item.title}`}
            className="font-jetbrains inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-label text-white/80 transition hover:border-white/30 hover:text-white"
          >
            <Undo2 aria-hidden className="h-3.5 w-3.5" />
            Undo
          </button>
        ) : (
          <NativeLink entry={entry} />
        )}
      </span>
    </div>
  );
}

/* ── the keymap ───────────────────────────────────────────────────────────── */

export const BOARD_KEYS: KeyBinding[] = [
  { keys: ["A"], does: "approve" },
  { keys: ["X"], does: "reject" },
  { keys: ["U"], does: "clear" },
  { keys: ["J", "K"], does: "next · previous" },
  { keys: ["Enter"], does: "loupe" },
  { keys: ["Esc"], does: "close" },
  { keys: ["Z"], does: "undo" },
];

export function BoardKeymap({ extra = [] }: { extra?: KeyBinding[] }) {
  return <Keycaps map={[...BOARD_KEYS, ...extra]} label="Board keys" />;
}

/* ── toasts ───────────────────────────────────────────────────────────────── */

/** The decide path's receipts and refusals (useBoard `push`). A refusal is the
 *  source's own sentence; a failure stays until dismissed. */
export function BoardToasts({ api }: { api: BoardApi }) {
  const { toasts, dismiss } = api.toasts;
  if (!toasts.length) return null;
  return (
    <ol aria-label="Board notices" className="pointer-events-none fixed bottom-6 left-20 z-50 flex max-w-[min(32rem,calc(100vw-10rem))] flex-col gap-2">
      {toasts.map((t) => {
        const tone =
          t.kind === "failed" ? "border-rose-400/35 text-rose-100" : t.kind === "info" ? "border-amber-400/30 text-amber-50" : "border-white/10 text-white/85";
        const Icon = t.kind === "failed" ? X : t.kind === "info" ? LockKeyhole : Check;
        return (
          <li
            key={t.id}
            className={`gt-rise gt-float pointer-events-auto flex items-start gap-3 rounded-2xl border bg-[var(--gt-ink)]/90 px-4 py-2.5 backdrop-blur-xl ${tone}`}
          >
            <Icon aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${t.kind === "failed" ? "text-rose-300" : t.kind === "info" ? "text-amber-300" : "text-emerald-300"}`} />
            <span className="font-hanken min-w-0 flex-1 text-content leading-snug">{t.text}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="shrink-0 rounded-full p-0.5 text-white/40 transition hover:text-white"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
