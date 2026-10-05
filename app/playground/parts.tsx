"use client";

// THE SOUND LAB'S LEAVES — drawn in the app's own idiom (the glass of
// /projects and /library: SURFACE panels, rounded-xl cards on white/8
// hairlines, cyan for what is selected or playing, emerald / amber / rose for
// a verdict), shared by the three directions. The waveform keeps the kit
// Player's BEHAVIOUR (components/kit/Player.tsx#Waveform: a role=slider that
// seeks on press, drag and arrows) and none of its print look.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Check, Coins, Copy, Lock, Pause, Play, Plus, Upload, X } from "lucide-react";

import { Select } from "@/components/ui/Select";
import { Ghost, PipRow } from "@/components/ui/signal";
import {
  FACETS,
  RUBRIC,
  dimsFor,
  dur,
  peaksOf,
  reasons as reasonsOf,
  score,
  verdict,
  type Facet,
  type RatingKey,
  type Seed,
  type Take,
  type TermEntry,
  type Verdict,
} from "@/app/library/audio/book";
import type { Engine, PlayState } from "@/app/library/audio/engine";
import type { WirePlan } from "@/lib/music/types";

import { statusWord, type EngineDef } from "./engines";
import { sunoDraftText, sunoFields } from "./labModel";
import type { Flash, Lab } from "./useLab";

/* ── type and surface, once ────────────────────────────────────────────── */

export const CAPS = "font-jetbrains text-label uppercase tracking-[0.14em] text-white/40";
export const CARD = "rounded-xl border border-white/8 bg-white/[0.025]";
export const FIELD =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-hanken text-label text-slate-200 placeholder:text-white/25 focus:border-cyan-400/40";
const BTN_BASE =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border px-4 py-1.5 font-jetbrains text-label transition disabled:cursor-not-allowed disabled:opacity-40";
export const BTN = `${BTN_BASE} border-white/12 text-white/75 hover:border-white/25 hover:bg-white/[0.05] hover:text-white`;
export const BTN_CYAN = `${BTN_BASE} border-cyan-400/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20`;

export const VERDICT_TONE: Record<Verdict, { word: string; text: string; dot: string; ring: string }> = {
  proven: { word: "proven", text: "text-emerald-300", dot: "bg-emerald-300", ring: "border-emerald-400/40" },
  kept: { word: "kept", text: "text-emerald-200/80", dot: "bg-emerald-400/70", ring: "border-emerald-400/30" },
  unjudged: { word: "unjudged", text: "text-amber-300", dot: "bg-amber-400", ring: "border-amber-400/35" },
  rejected: { word: "rejected", text: "text-rose-300", dot: "bg-rose-400", ring: "border-rose-400/35" },
};

const ENGINE_DOT: Record<string, string> = {
  emerald: "bg-emerald-300 shadow-[0_0_8px] shadow-emerald-300/60",
  amber: "bg-amber-300",
  neutral: "border border-white/30",
  rose: "bg-rose-400",
};

/* ── the transport, read ───────────────────────────────────────────────── */

export function usePlay(engine: Engine): PlayState | null {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, () => null);
}

export function PlayToggle({ lab, take, size = "md" }: { lab: Lab; take: Take; size?: "md" | "lg" }) {
  const st = usePlay(lab.engine);
  const on = st?.id === take.id && st.playing;
  const gone = !!take.upload_id && !lab.urlFor(take);
  const box = size === "lg" ? "h-11 w-11" : "h-9 w-9";
  return (
    <button
      type="button"
      disabled={gone}
      onClick={() => lab.engine.toggle(take, lab.urlFor(take))}
      aria-label={gone ? `${take.title}: file missing` : `${on ? "Pause" : "Play"} ${take.title}`}
      aria-pressed={on}
      className={`grid ${box} shrink-0 cursor-pointer place-items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-30 ${
        on
          ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100 shadow-[0_0_14px] shadow-cyan-400/25"
          : "border-white/15 bg-white/[0.04] text-white/80 hover:border-cyan-300/40 hover:text-cyan-100"
      }`}
    >
      {on ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="ml-0.5 h-4 w-4" aria-hidden />}
    </button>
  );
}

/* ── the waveform ──────────────────────────────────────────────────────── */

/**
 * A take's magnitude as strokes, played ones lit, with its JOINTS drawn where
 * sections meet (`seams`) and the regenerated spans of an edit tinted
 * (`tints`). The seek control: press or drag seeks, arrows step.
 *
 * Real peaks when the bytes were measured (book.ts#peaksOf prefers them); a
 * fixture row's shape is drawn from its id, as the Library draws it.
 */
export function Wave({
  label,
  peaks,
  position,
  duration,
  playing = false,
  seams = [],
  tints = [],
  onSeek,
  height = "h-12",
  dim = false,
  tone = "cyan",
  seamTone = "cyan",
}: {
  label: string;
  peaks: readonly number[];
  position: number;
  duration: number;
  playing?: boolean;
  seams?: readonly number[];
  tints?: readonly [number, number][];
  onSeek?: (s: number) => void;
  height?: string;
  dim?: boolean;
  tone?: "cyan" | "amber";
  /** `quiet` for a list, where a cyan rule per joint on every row is noise. */
  seamTone?: "cyan" | "quiet";
}) {
  const box = useRef<HTMLDivElement>(null);
  const n = Math.max(1, peaks.length);
  const frac = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const seek = (x: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width || duration <= 0 || !onSeek) return;
    onSeek(Math.min(duration, Math.max(0, ((x - r.left) / r.width) * duration)));
  };
  const lit = tone === "amber" ? "bg-amber-200/90" : "bg-cyan-200";
  const stride = Math.max(1, duration / 40);
  return (
    <div
      ref={box}
      role="slider"
      tabIndex={onSeek ? 0 : -1}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position)}
      aria-valuetext={`${dur(position)} of ${dur(duration)}`}
      onPointerDown={(e) => {
        if (!onSeek) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        seek(e.clientX);
      }}
      onPointerMove={(e) => {
        if (onSeek && e.currentTarget.hasPointerCapture(e.pointerId)) seek(e.clientX);
      }}
      onKeyDown={(e) => {
        if (!onSeek) return;
        const d = e.shiftKey ? stride * 3 : stride;
        if (e.key === "ArrowRight") onSeek(Math.min(duration, position + d));
        else if (e.key === "ArrowLeft") onSeek(Math.max(0, position - d));
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`relative ${height} w-full touch-none select-none ${onSeek ? "cursor-pointer" : ""} ${dim ? "opacity-35" : ""}`}
    >
      {tints.map(([a, b], i) => (
        <span
          key={`t${i}`}
          aria-hidden
          style={{ left: `${a * 100}%`, width: `${(b - a) * 100}%` }}
          className="absolute inset-y-0 rounded-md bg-cyan-400/[0.09] ring-1 ring-inset ring-cyan-300/15"
        />
      ))}
      <span aria-hidden className="absolute inset-0 flex items-center gap-[2px] px-0.5">
        {peaks.map((p, i) => (
          <span
            key={i}
            style={{ height: `${Math.max(6, p * 100)}%` }}
            className={`min-w-0 flex-1 rounded-full ${(i + 0.5) / n <= frac ? lit : "bg-white/30"}`}
          />
        ))}
      </span>
      {seams.map((s, i) => (
        <span
          key={`s${i}`}
          aria-hidden
          style={{ left: `${s * 100}%` }}
          className={`absolute w-px ${seamTone === "quiet" ? "inset-y-1 bg-white/25" : "-inset-y-1 bg-cyan-300/80"}`}
        />
      ))}
      {(playing || frac > 0) && (
        <span
          aria-hidden
          style={{ left: `${frac * 100}%` }}
          className="absolute -inset-y-1.5 w-0.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_8px] shadow-cyan-300/70"
        />
      )}
    </div>
  );
}

/** The SHAPE of a take that does not exist yet — a waveform's silhouette at
 *  the faintest ink, so an empty cell reads as "a take goes here", never as a
 *  hole. Deterministic per `seed` so it does not shimmer between renders. */
export function GhostWave({ seed = 1, bars = 48, height = "h-8", className = "" }: { seed?: number; bars?: number; height?: string; className?: string }) {
  return (
    <span aria-hidden className={`flex ${height} items-center gap-[2px] ${className}`}>
      {Array.from({ length: bars }, (_, i) => {
        const x = i / bars;
        const h = 18 + 55 * Math.abs(Math.sin(x * 9 + seed)) * (0.55 + 0.45 * Math.sin(x * 3.1 + seed * 2));
        return <span key={i} style={{ height: `${Math.max(10, h)}%` }} className="min-w-0 flex-1 rounded-full bg-white/[0.07]" />;
      })}
    </span>
  );
}

/** A take's waveform wired to the shared transport. */
export function TakeWave({
  lab,
  take,
  height,
  seams,
  tints,
  n = 96,
  dim,
  seamTone,
}: {
  lab: Lab;
  take: Take;
  height?: string;
  seams?: readonly number[];
  tints?: readonly [number, number][];
  n?: number;
  dim?: boolean;
  seamTone?: "cyan" | "quiet";
}) {
  const st = usePlay(lab.engine);
  const mine = st?.id === take.id ? st : null;
  const duration = mine?.duration || take.duration_s || 0;
  return (
    <Wave
      label={`${take.title} position`}
      peaks={peaksOf(take, n)}
      position={mine?.position ?? 0}
      duration={duration}
      playing={!!mine?.playing}
      seams={seams}
      tints={tints}
      height={height}
      dim={dim}
      seamTone={seamTone}
      onSeek={(s) => lab.engine.seek(take, s, lab.urlFor(take))}
    />
  );
}

/* ── verdicts and the rubric ───────────────────────────────────────────── */

export function VerdictChip({ take, className = "" }: { take: Take; className?: string }) {
  const v = verdict(take);
  const t = VERDICT_TONE[v];
  return (
    <span className={`inline-flex items-center gap-1.5 font-jetbrains text-label ${t.text} ${className}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {t.word}
    </span>
  );
}

/** The three scores as a meter of three bars, with the mean beside it — what
 *  a row says at rest. An unscored dimension is a hollow stub, never a 0. */
export function Scores({ take }: { take: Take }) {
  const s = score(take);
  return (
    <span
      role="img"
      className="inline-flex items-center gap-2"
      aria-label={
        take.ratings
          ? RUBRIC.map((r) => `${r.label} ${take.ratings![r.key] ?? "unscored"}`).join(", ")
          : "not scored"
      }
    >
      <span aria-hidden className="flex h-5 items-end gap-[3px]">
        {RUBRIC.map((r) => {
          const v = take.ratings?.[r.key] ?? null;
          return v == null ? (
            <span key={r.key} className="h-1.5 w-1.5 rounded-[2px] border border-white/20" />
          ) : (
            <span
              key={r.key}
              style={{ height: `${Math.max(15, v * 10)}%` }}
              className={`w-1.5 rounded-[2px] ${v >= 7 ? "bg-emerald-300/85" : v >= 4 ? "bg-white/55" : "bg-rose-300/70"}`}
            />
          );
        })}
      </span>
      <span
        aria-hidden
        className={`w-7 font-jetbrains text-label tabular-nums ${s == null ? "text-white/20" : s >= 7 ? "text-emerald-200" : "text-white/65"}`}
      >
        {s == null ? "–" : s.toFixed(1)}
      </span>
    </span>
  );
}

/**
 * The rubric, scored: one row of ten cells per dimension. The dimension under
 * the keyboard (1–9, 0 = 10) is ringed; a looping effect has no melody
 * (book.ts#dimsFor), so its melody row is not drawn.
 */
export function Rubric({
  take,
  dim,
  onDim,
  onRate,
}: {
  take: Take;
  dim: number;
  onDim: (d: number) => void;
  onRate: (key: RatingKey, v: number) => void;
}) {
  const dims = dimsFor(take);
  return (
    <div className="grid gap-1.5" role="group" aria-label={`Score ${take.title}`}>
      {dims.map((i) => {
        const r = RUBRIC[i];
        const v = take.ratings?.[r.key] ?? null;
        const on = i === dim;
        return (
          <div key={r.key} className="grid grid-cols-[3.25rem_minmax(0,1fr)_1.75rem] items-center gap-2">
            <button
              type="button"
              onClick={() => onDim(i)}
              aria-pressed={on}
              aria-label={`Score ${r.label} with the number keys`}
              className={`cursor-pointer rounded-md px-1 text-left font-jetbrains text-label tracking-[0.12em] transition ${
                on ? "text-cyan-200" : "text-white/40 hover:text-white/70"
              }`}
            >
              {r.short}
            </button>
            <span className="flex gap-[3px]">
              {Array.from({ length: 10 }, (_, k) => {
                const n = k + 1;
                const filled = v != null && n <= v;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onRate(r.key, n)}
                    aria-label={`${r.label} ${n}`}
                    aria-pressed={v === n}
                    className={`h-5 min-w-0 flex-1 cursor-pointer rounded-[3px] transition ${
                      filled
                        ? v! >= 7
                          ? "bg-emerald-300/80"
                          : "bg-cyan-300/60"
                        : on
                          ? "bg-white/[0.09] hover:bg-white/20"
                          : "bg-white/[0.05] hover:bg-white/15"
                    }`}
                  />
                );
              })}
            </span>
            <span className={`text-right font-jetbrains text-label tabular-nums ${v == null ? "text-white/25" : "text-white/85"}`}>
              {v ?? "–"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The rubric and the three calls, before there is a take to judge: the
 *  same grid at the faintest ink, so the panel keeps its shape. */
export function GhostRubric({ label }: { label: string }) {
  return (
    <div className="grid gap-3">
      <span className="sr-only">{label}</span>
      <div aria-hidden className="grid gap-1.5">
        {RUBRIC.map((r) => (
          <div key={r.key} className="grid grid-cols-[3.25rem_minmax(0,1fr)_1.75rem] items-center gap-2">
            <span className="px-1 font-jetbrains text-label tracking-[0.12em] text-white/20">{r.short}</span>
            <span className="flex gap-[3px]">
              {Array.from({ length: 10 }, (_, k) => (
                <span key={k} className="h-5 min-w-0 flex-1 rounded-[3px] bg-white/[0.035]" />
              ))}
            </span>
            <span />
          </div>
        ))}
      </div>
      <div aria-hidden className="flex gap-2">
        <span className="h-9 w-20 rounded-full border border-white/8" />
        <span className="h-9 w-28 rounded-full border border-white/8" />
      </div>
    </div>
  );
}

/** Reasons in use on the shelf first (book.ts#reasons), then the craft's
 *  standing ones, so a first rejection still has words to pick from. */
const STANDING_REASONS = [
  "generic progression, no hook",
  "mix is harsh above 4kHz",
  "wrong energy for the cut",
  "seam audible",
  "drifts off tempo",
];

export function reasonOptions(takes: readonly Take[]): string[] {
  const used = reasonsOf(takes).map(([r]) => r);
  return [...new Set([...used, ...STANDING_REASONS])].slice(0, 9);
}

/** Keep / reject-with-a-reason / clear: the three calls, at full strength. */
export function JudgeBar({ lab, take, onJudged }: { lab: Lab; take: Take; onJudged?: () => void }) {
  const v = verdict(take);
  const options = reasonOptions(lab.takes).map((r) => ({ value: r, label: r }));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          lab.keep(take.id);
          onJudged?.();
        }}
        aria-pressed={v === "kept" || v === "proven"}
        className={`${BTN_BASE} ${
          v === "kept" || v === "proven"
            ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-100"
            : "border-emerald-400/30 text-emerald-200/90 hover:bg-emerald-400/10"
        }`}
      >
        <Check className="h-4 w-4" aria-hidden />
        keep
      </button>
      <Select<string>
        label="reject"
        value={take.reject_reason ?? ""}
        placeholder="reject"
        icon={<X className="h-4 w-4" />}
        options={options}
        minWidth={300}
        onChange={(r) => {
          lab.reject(take.id, r);
          onJudged?.();
        }}
        className={`[&>button]:h-9 [&>button]:rounded-full [&_.truncate]:font-jetbrains [&_.truncate]:text-label ${
          v === "rejected" ? "[&>button]:border-rose-400/45 [&_.truncate]:text-rose-200" : "[&_.truncate]:text-white/60"
        }`}
      />
      {v !== "unjudged" && (
        <button type="button" onClick={() => lab.clear(take.id)} className={BTN}>
          clear
        </button>
      )}
    </div>
  );
}

/* ── spending ──────────────────────────────────────────────────────────── */

/** A button that spends, with the coin on it and the price under the label —
 *  "20s of audio · unpriced" is strictly more than the click knew before
 *  (lib/musicClient.ts#costLabel). */
export function SpendButton({
  lab,
  seconds,
  children,
  onClick,
  busy,
  disabled,
  wide,
}: {
  lab: Lab;
  seconds: number;
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  wide?: boolean;
}) {
  const c = lab.cost(seconds);
  return (
    <span className={`inline-flex flex-col gap-1 ${wide ? "w-full" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy || disabled}
        className={`${BTN_CYAN} ${wide ? "w-full py-2" : ""} ${busy ? "animate-pulse" : ""}`}
      >
        <Coins className="h-4 w-4 opacity-80" aria-label="spends credits" />
        {children}
      </button>
      <span className="pl-1 font-jetbrains text-label text-white/35">{c.text}</span>
    </span>
  );
}

export function FreeTag() {
  return (
    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-px font-jetbrains text-label text-emerald-200/90">
      free
    </span>
  );
}

/* ── engines ───────────────────────────────────────────────────────────── */

export function EngineDot({ engine }: { engine: EngineDef }) {
  const s = statusWord(engine);
  return <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${ENGINE_DOT[s.tone]}`} />;
}

export function EngineStatus({ engine }: { engine: EngineDef }) {
  const s = statusWord(engine);
  const text =
    s.tone === "emerald"
      ? "text-emerald-200/90"
      : s.tone === "amber"
        ? "text-amber-200/90"
        : s.tone === "rose"
          ? "text-rose-200/90"
          : "text-white/45";
  return (
    <span className={`inline-flex items-center gap-2 font-jetbrains text-label ${text}`}>
      <EngineDot engine={engine} />
      {s.word}
    </span>
  );
}

/** A deployment that withholds an operation: the place stays, the controls go,
 *  and ABSENCE_REASON says why, verbatim — that sentence is the work (it names
 *  the missing vendor capability and the remedy), not the app narrating. */
export function Withheld({ title, reason }: { title: string; reason: string }) {
  return (
    <div className={`${CARD} p-4`}>
      <p className="flex items-center gap-2 font-instrument text-lg text-white/70">
        <Lock className="h-4 w-4 text-white/40" aria-hidden />
        {title}
      </p>
      <p className="mt-1.5 font-hanken text-label leading-snug text-slate-400">{reason}</p>
    </div>
  );
}

/** The local lane: declared, nothing installed, what it would take. */
export function LocalLane({ engine }: { engine: EngineDef }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <EngineStatus engine={engine} />
        <PipRow
          states={(engine.needs ?? []).map(() => "hollow" as const)}
          label={`0 of ${(engine.needs ?? []).length} prerequisites in place`}
        />
      </div>
      <ul className="grid gap-1.5">
        {(engine.needs ?? []).map((n) => (
          <li key={n} className="flex items-center gap-2.5 font-hanken text-label text-white/60">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/25" />
            {n}
          </li>
        ))}
      </ul>
      <div className="grid gap-1.5">
        {(engine.candidates ?? []).map((c) => (
          <div key={c.name} className="flex items-baseline justify-between gap-3 rounded-lg border border-white/6 px-3 py-1.5">
            <span className="font-instrument text-content text-white/75">{c.name}</span>
            <span className="truncate font-jetbrains text-label text-white/35">{c.licence}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── the Suno round trip ───────────────────────────────────────────────── */

/**
 * SUNO, BY HAND, AS A FIRST-CLASS LANE. Three boxes because Suno's custom mode
 * has three (style, exclude, lyrics); each copies on its own. The first copy
 * files a DRAFT in the recipe book (app/library/audio/bookStore.ts), and a file
 * dropped back attaches to the draft it answers — here or in the Library,
 * whichever the person is looking at when the file arrives.
 */
export function SunoLane({
  lab,
  seed,
  plan,
  parent,
  extra,
  compact = false,
}: {
  lab: Lab;
  seed: Seed;
  plan?: WirePlan | null;
  parent?: Take | null;
  extra?: { hunt_id?: string; variation?: { axis: string; diff: string[] } };
  compact?: boolean;
}) {
  const f = sunoFields(seed, lab.book.hands, plan);
  const text = sunoDraftText(f);
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const live = draft && draft.text === text ? draft.id : null;

  const copy = async (which: string, value: string) => {
    const id = live ?? lab.recordDraft(seed, text, parent?.id ?? null, extra);
    if (!live) setDraft({ id, text });
    const ok = await lab.copyField(id, value);
    setCopied(ok ? which : null);
    lab.say(ok ? `copied ${which} for Suno · awaiting return` : "clipboard blocked · draft kept", ok ? "ok" : "info");
  };

  const rows: { k: string; v: string; mono?: boolean }[] = [
    { k: "style", v: f.style },
    ...(f.exclude ? [{ k: "exclude", v: f.exclude }] : []),
    { k: "lyrics", v: f.lyrics, mono: true },
  ];

  return (
    <div className="grid gap-2">
      {rows.map((r) => (
        <div key={r.k} className={`${CARD} group relative px-3 py-2`}>
          <div className="flex items-center justify-between gap-2">
            <span className={CAPS}>{r.k}</span>
            <button
              type="button"
              onClick={() => void copy(r.k, r.v)}
              aria-label={`Copy the ${r.k} field for Suno`}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-jetbrains text-label transition ${
                copied === r.k && live
                  ? "border-emerald-400/40 text-emerald-200"
                  : "border-white/12 text-white/60 hover:border-amber-300/40 hover:text-amber-100"
              }`}
            >
              {copied === r.k && live ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied === r.k && live ? "copied" : "copy"}
            </button>
          </div>
          <p
            className={`mt-1 ${r.mono ? "whitespace-pre-line font-jetbrains text-label leading-relaxed text-white/60" : "font-hanken text-label leading-snug text-white/85"} ${
              compact && r.mono ? "line-clamp-3" : ""
            }`}
          >
            {r.v || "—"}
          </p>
        </div>
      ))}
      <ReturnDrop lab={lab} preferDraft={live} />
    </div>
  );
}

/** Drop the file Suno gave back. It answers the newest waiting draft unless
 *  another is picked; a file with no draft is filed as a bare return. */
export function ReturnDrop({ lab, preferDraft }: { lab: Lab; preferDraft?: string | null }) {
  const [over, setOver] = useState(false);
  const [pick, setPick] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const waiting = lab.awaiting;
  const target = pick || preferDraft || waiting[0]?.id || "";

  const file = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    const t = await lab.fileReturn(f, target || null);
    setBusy(false);
    if (t) lab.say(`returned · ${t.title}`);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void file(e.dataTransfer.files[0]);
      }}
      className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
        over ? "border-amber-300/50 bg-amber-300/[0.07]" : "border-white/10 bg-white/[0.015]"
      }`}
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className={`${BTN} ${busy ? "animate-pulse" : ""}`}
      >
        <Upload className="h-4 w-4" aria-hidden />
        {busy ? "filing…" : "drop the return"}
      </button>
      <input
        ref={input}
        type="file"
        accept="audio/*"
        className="sr-only"
        aria-label="Choose the audio file Suno returned"
        onChange={(e) => {
          void file(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {waiting.length > 0 ? (
        <Select<string>
          label="answers"
          value={target}
          minWidth={340}
          options={waiting.slice(0, 12).map((d, i) => ({
            value: d.id,
            label: d.text.split("\n")[0].replace(/^Style:\s*/, "").slice(0, 44) || d.id,
            meta: i === 0 ? "newest" : undefined,
          }))}
          onChange={setPick}
        />
      ) : (
        <span className="font-jetbrains text-label text-white/30">no draft waiting</span>
      )}
    </div>
  );
}

/* ── the recipe ────────────────────────────────────────────────────────── */

const FACET_OF_SEED: Record<Facet, keyof Pick<Seed, "genres" | "moods" | "instruments">> = {
  genre_tags: "genres",
  mood_tags: "moods",
  instrumentation: "instruments",
};

const KEYS = [
  "C major", "C minor", "D major", "D minor", "Eb major", "E minor", "F major", "F minor",
  "G major", "G minor", "Ab major", "A minor", "Bb major", "B minor",
];

/** The add-a-term trigger, sized down to sit in a row of chips. */
const ADD_SELECT =
  "[&>button]:h-7 [&>button]:w-auto [&>button]:gap-1.5 [&>button]:rounded-full [&>button]:border-dashed [&>button]:border-white/15 [&>button]:px-2.5 [&_.truncate]:font-jetbrains [&_.truncate]:text-label [&_.truncate]:text-white/45";

const pct = (e: TermEntry | undefined) => (e && e.keepRate != null ? `${Math.round(e.keepRate * 100)}%` : null);

/**
 * The recipe: the Library's vocabulary, with each term's keep-rate beside it.
 * Terms come only from the vocabulary — the evidence is the point of picking
 * from it — and a term the team marked "avoid" is drawn rose wherever it sits.
 */
export function RecipeEditor({
  seed,
  onChange,
  voc,
  dense = false,
}: {
  seed: Seed;
  onChange: (s: Seed) => void;
  voc: readonly TermEntry[];
  dense?: boolean;
}) {
  const entry = (facet: Facet, term: string) => voc.find((v) => v.facet === facet && v.term === term);
  return (
    <div className={`grid ${dense ? "gap-2.5" : "gap-3.5"}`}>
      {FACETS.map((f) => {
        const key = FACET_OF_SEED[f.key];
        const have = seed[key];
        const options = voc
          .filter((v) => v.facet === f.key && !have.includes(v.term))
          .sort((a, b) => (b.keepRate ?? -1) - (a.keepRate ?? -1) || b.n - a.n)
          .map((v) => ({ value: v.term, label: v.term, meta: pct(v) ?? `${v.n}` }));
        return (
          <div key={f.key} className="grid gap-1.5">
            <span className={CAPS}>{f.label}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {have.map((t) => {
                const e = entry(f.key, t);
                const avoid = e?.stance === "avoid";
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onChange({ ...seed, [key]: have.filter((x) => x !== t) })}
                    aria-label={`Remove ${t}`}
                    className={`group inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-hanken text-label transition ${
                      avoid
                        ? "border-rose-400/40 bg-rose-400/[0.08] text-rose-100"
                        : "border-white/12 bg-white/[0.04] text-white/85 hover:border-rose-300/40"
                    }`}
                  >
                    {t}
                    {pct(e) && <span className="font-jetbrains text-label text-white/35 group-hover:hidden">{pct(e)}</span>}
                    <span aria-hidden className="hidden font-jetbrains text-label text-rose-200/80 group-hover:inline">
                      ×
                    </span>
                  </button>
                );
              })}
              <Select<string>
                label={`add ${f.label.toLowerCase()}`}
                value=""
                placeholder={f.label.toLowerCase()}
                icon={<Plus className="h-3.5 w-3.5" />}
                options={options}
                minWidth={280}
                onChange={(t) => onChange({ ...seed, [key]: [...have, t] })}
                className={ADD_SELECT}
              />
            </div>
          </div>
        );
      })}
      <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
        <label className="flex h-10 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 focus-within:border-cyan-400/40">
          <input
            type="number"
            min={40}
            max={220}
            value={seed.bpm ?? ""}
            placeholder="—"
            aria-label="Tempo in BPM"
            onChange={(e) => onChange({ ...seed, bpm: e.target.value ? Number(e.target.value) : null })}
            className="w-full min-w-0 bg-transparent font-jetbrains text-content text-white/90 tabular-nums placeholder:text-white/25"
          />
          <span className="font-jetbrains text-label tracking-[0.14em] text-white/40">BPM</span>
        </label>
        <Select<string>
          label="key"
          value={seed.key ?? ""}
          placeholder="any"
          options={[{ value: "", label: "any key" }, ...KEYS.map((k) => ({ value: k, label: k }))]}
          onChange={(k) => onChange({ ...seed, key: k || null })}
        />
      </div>
      {seed.avoid.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={CAPS}>no</span>
          {seed.avoid.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onChange({ ...seed, avoid: seed.avoid.filter((x) => x !== a) })}
              aria-label={`Allow ${a} again`}
              className="cursor-pointer rounded-full border border-rose-400/35 bg-rose-400/[0.07] px-2.5 py-0.5 font-hanken text-label text-rose-100/90"
            >
              {a}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The seed as one line of chips — what a recipe IS, at rest. */
export function SeedLine({ seed, className = "" }: { seed: Seed; className?: string }) {
  const bits = [
    ...seed.genres,
    ...seed.moods,
    ...seed.instruments,
    ...(seed.bpm ? [`${Math.round(seed.bpm)} BPM`] : []),
    ...(seed.key ? [seed.key] : []),
  ];
  return (
    <span className={`flex flex-wrap gap-1.5 ${className}`}>
      {bits.map((b) => (
        <span key={b} className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-0.5 font-hanken text-label text-white/75">
          {b}
        </span>
      ))}
      {seed.avoid.map((a) => (
        <span key={`no-${a}`} className="rounded-full border border-rose-400/30 px-2.5 py-0.5 font-hanken text-label text-rose-200/85">
          no {a}
        </span>
      ))}
      {bits.length === 0 && seed.avoid.length === 0 && <span className="font-jetbrains text-label text-white/30">empty recipe</span>}
    </span>
  );
}

/* ── chrome ────────────────────────────────────────────────────────────── */

export function FlashLine({ flash }: { flash: Flash | null }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
      {flash && (
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-jetbrains text-label backdrop-blur-xl ${
            flash.tone === "error"
              ? "border-rose-400/40 bg-rose-950/60 text-rose-100"
              : flash.tone === "info"
                ? "border-amber-400/35 bg-amber-950/50 text-amber-100"
                : "border-emerald-400/30 bg-emerald-950/50 text-emerald-100"
          }`}
        >
          {flash.text}
        </span>
      )}
    </div>
  );
}

export function ErrorLine({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/[0.06] px-4 py-2 font-hanken text-label text-rose-100">
      {text}
    </p>
  );
}

/** A take's place in time and lineage, in one line of mono figures. */
export function TakeFacts({ take, parent }: { take: Take; parent?: Take }) {
  const op =
    take.lab_op === "compose"
      ? "quick"
      : take.lab_op === "plan"
        ? "plan"
        : take.lab_op === "section-edit"
          ? "edit"
          : take.lab_op === "sfx"
            ? "sfx"
            : take.draft_id
              ? "return"
              : null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 font-jetbrains text-label text-white/40">
      <span className={take.vendor === "suno" ? "text-amber-200/70" : take.vendor === "elevenlabs" ? "text-cyan-200/70" : ""}>
        {take.vendor ?? "no vendor"}
      </span>
      {op && <span>{op}</span>}
      <span className="tabular-nums">{dur(take.duration_s)}</span>
      {take.variation && <span className="text-white/60">{take.variation.diff.join(" ")}</span>}
      {parent && <span className="truncate">↳ {parent.title}</span>}
    </span>
  );
}

/** Busy state of one operation. */
export type Busy = { state: "idle" } | { state: "working"; label: string } | { state: "error"; msg: string };

export function BusyLine({ busy }: { busy: Busy }) {
  if (busy.state === "working")
    return <p className="animate-pulse font-jetbrains text-label text-cyan-200/70">{busy.label}</p>;
  if (busy.state === "error")
    return <p className="font-jetbrains text-label leading-snug text-rose-200/80">{busy.msg}</p>;
  return null;
}

/** The empty rack, shaped like what fills it. */
export function EmptyRack({ label, action }: { label: string; action?: React.ReactNode }) {
  return <Ghost shape="row" count={4} label={label} action={action} />;
}

/** Re-render on an interval only while mounted — for "made 2m ago" figures. */
export function useTick(ms = 30000): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}
