"use client";

// THE LAB'S CHIPS — what a take IS, at rest, in one spelling for all three
// modules: its provider (and the engine's state when the registry is at hand,
// ../engines.ts), its origin, its verdict, its prompt techniques, its terms,
// and its defects. Plus the one chip control that is not at rest: the defect
// picker, keyed so a judge can reject without leaving the number row.

import type { DefectCode, ProviderId, SoundKind, SoundTake, SoundTerms, TakeOrigin } from "@/lib/sound/types";

import { statusWord, type EngineDef } from "../engines";
import { DEFECT_ORDER, ORIGIN_WORD, PROVIDER_NAME, defectWord, readVerdict } from "./format";
import { VERDICT_TONE, pill } from "./ui";

const PROVIDER_TONE: Record<ProviderId, string> = {
  elevenlabs: "text-cyan-200/85",
  suno: "text-amber-200/85",
  local: "text-white/55",
};

const ENGINE_DOT: Record<string, string> = {
  emerald: "bg-emerald-300 shadow-[0_0_8px] shadow-emerald-300/60",
  amber: "bg-amber-300",
  neutral: "border border-white/30",
  rose: "bg-rose-400",
};

/** The provider's name in its tone. With `engine` (../engines.ts registry row)
 *  a dot for the engine's state rides in front: live · round trip · off · not installed. */
export function ProviderChip({ provider, engine, className = "" }: { provider: ProviderId; engine?: EngineDef; className?: string }) {
  const s = engine ? statusWord(engine) : null;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-jetbrains text-label ${PROVIDER_TONE[provider]} ${className}`}>
      {s && <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${ENGINE_DOT[s.tone]}`} />}
      {PROVIDER_NAME[provider]}
      {s && <span className="sr-only">({s.word})</span>}
    </span>
  );
}

/** Where a take came from. `agent` is cyan — it is the main inflow
 *  (pipeline/sound.mts generate); `demo` is the fixture chip /projects uses. */
export function OriginChip({ origin }: { origin: TakeOrigin }) {
  const tone =
    origin === "agent"
      ? "border-cyan-400/30 text-cyan-200/85"
      : origin === "fixture"
        ? "border-white/12 text-white/45"
        : origin === "suno-return"
          ? "border-amber-400/30 text-amber-200/80"
          : "border-white/12 text-white/60";
  return <span className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-px font-jetbrains text-label ${tone}`}>{ORIGIN_WORD[origin]}</span>;
}

export function VerdictChip({ take, className = "" }: { take: Pick<SoundTake, "verdict" | "ratings">; className?: string }) {
  const t = VERDICT_TONE[readVerdict(take)];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 font-jetbrains text-label ${t.ring} ${t.text} ${className}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {t.word}
    </span>
  );
}

/** The prompt techniques a take was briefed with — the axis lessons are learned along. */
export function TechniqueChips({ technique, empty = "no technique tagged" }: { technique: readonly string[]; empty?: string | null }) {
  if (technique.length === 0) return empty ? <span className="font-jetbrains text-label text-white/30">{empty}</span> : null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {technique.map((t) => (
        <span key={t} className="rounded-md border border-violet-300/25 bg-violet-300/[0.06] px-2 py-px font-jetbrains text-label text-violet-100/85">
          {t}
        </span>
      ))}
    </span>
  );
}

/** Genre · mood · instrument (or the sfx category) as one row of chips. */
export function TermChips({ terms, kind }: { terms: SoundTerms; kind: SoundKind }) {
  const bits =
    kind === "sfx"
      ? [...(terms.sfxCategory ? [terms.sfxCategory] : []), ...terms.mood]
      : [...terms.genre, ...terms.mood, ...terms.instrument];
  if (bits.length === 0) return <span className="font-jetbrains text-label text-white/30">no terms</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {bits.map((b, i) => (
        <span key={`${b}-${i}`} className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-0.5 font-hanken text-label text-white/75">
          {b}
        </span>
      ))}
    </span>
  );
}

/** A take's defects at rest, rose. */
export function DefectChips({ reasons }: { reasons: readonly DefectCode[] }) {
  if (reasons.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {reasons.map((r) => (
        <span key={r} className="rounded-full border border-rose-400/30 bg-rose-400/[0.06] px-2.5 py-0.5 font-hanken text-label text-rose-100/90">
          {defectWord(r)}
        </span>
      ))}
    </span>
  );
}

/** The key that toggles the i-th defect in the picker: 1–9, 0, then −. */
export const DEFECT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-"] as const;

/** Multi-select over the registry's defect taxonomy (lib/sound/types.ts#DEFECTS),
 *  ordered per kind (./format.ts#DEFECT_ORDER), each with its key. */
export function DefectPicker({
  kind,
  value,
  onChange,
  keyed = true,
}: {
  kind: SoundKind;
  value: readonly DefectCode[];
  onChange: (next: DefectCode[]) => void;
  /** Show the key each chip answers to. */
  keyed?: boolean;
}) {
  const order = DEFECT_ORDER[kind];
  return (
    <div role="group" aria-label="Defects" className="flex flex-wrap gap-1.5">
      {order.map((d, i) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d])}
            className={pill(on, "rose")}
          >
            {keyed && DEFECT_KEYS[i] && (
              <kbd aria-hidden className={`font-jetbrains text-label ${on ? "text-rose-200/80" : "text-white/30"}`}>
                {DEFECT_KEYS[i]}
              </kbd>
            )}
            {defectWord(d)}
          </button>
        );
      })}
    </div>
  );
}
