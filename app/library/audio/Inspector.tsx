"use client";

// THE INSPECTOR — the Audio Workbench's right panel, ported from the contest
// winner's `takeHTML()` (`.contest/arena/library-audio-workbench/entries/
// claude-claude-opus-5-5_high/variant-3/app.js:467-507`) down through its
// Recipe section, and no further: caveat 2 (`.vault/Spark/ideas/
// library-audio-workbench-port.md`) moves Variations + Composer + Drafts off
// this panel and into the Ledger's row expansion (`./TakeExpansion.tsx`).
//
// NO PLAYABLE SOURCE IS THE COMMON CASE. The shelf starts empty and nothing in
// this build yet writes a real URL onto an audio take's `src` (no generation
// or upload path exists for this module as of WP3) — `usePeaks` below treats
// a missing/undecodable source as the expected state, not an edge case, and
// `kit/Player` already has a `disabled` reading for exactly that (a dashed
// rest line, no playhead).
//
// RECIPE IS SCOPED TO WHAT ONE ASSET CARRIES. The source's `lineageHTML()`
// walks ancestors and children by looking them up in the whole working set;
// this component's prop is `{ asset: AudioAsset | null }` only (per the brief,
// section 1), so the chain below renders reference → concept → draft → this
// take and stops — no ancestor walk, no child returns/awaiting drafts. That is
// a real gap against the source's chain, not a simplification choice; see the
// WP3 report for why it is scoped this way rather than widening this
// component's props to take the whole shelf.

import { useEffect, useRef, useState } from "react";

import { Chip, Chips, Player, StatusPill } from "@/components/kit";
import type { StatusKind } from "@/components/kit";
import { Ghost } from "@/components/ui/signal";
import type { AudioMeta } from "@/lib/assets";

import { audioMetaOf, type AudioAsset } from "./Ledger";

const VERDICT_KIND: Record<AudioMeta["verdict"], StatusKind> = {
  unjudged: "undecided",
  kept: "keep",
  proven: "keep",
  rejected: "reject",
};

type RubricDim = "melody" | "instrument_choice" | "instrument_quality";

const RUBRIC: ReadonlyArray<{ key: RubricDim; short: string; label: string }> = [
  { key: "melody", short: "MEL", label: "Melody" },
  { key: "instrument_choice", short: "CHO", label: "Instrument choice" },
  { key: "instrument_quality", short: "QUA", label: "Instrument quality" },
];

function isSfx(meta: AudioMeta): boolean {
  return meta.sfx_category !== undefined;
}

/** Melody is n/a for a loopable effect — same reading as the source's
 *  `dimsFor()` (app.js:162-164): a loop has no melodic arc to grade. */
function dimsOff(meta: AudioMeta): ReadonlySet<RubricDim> {
  return isSfx(meta) && meta.loopable ? new Set<RubricDim>(["melody"]) : new Set();
}

function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function dur(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const ROUND_INFO: Record<string, { label: string; retired: boolean }> = {
  round1: { label: "round 1 · fft autocorr", retired: false },
  round2: { label: "round 2 · librosa", retired: false },
  round3: { label: "round 3 · cloud read", retired: true },
};

/** The retired-cloud-read badge: this session separately decided to retire
 *  cloud reference-track analysis, and a round-3 take should read that way in
 *  the Recipe chain, not just in a changelog nobody here reads. */
function roundInfo(promptRound: string | undefined): { label: string; retired: boolean } | null {
  if (!promptRound) return null;
  return ROUND_INFO[promptRound.slice(0, 6)] ?? { label: promptRound, retired: false };
}

/** No real audio source exists for most takes yet (see file header) — this
 *  hook decodes one when `src` is a real, fetchable URL, and otherwise leaves
 *  `peaks` empty so the caller renders `kit/Player` in its `disabled` state
 *  rather than guessing at a waveform that was never measured. */
function usePeaks(src: string | undefined) {
  const [peaks, setPeaks] = useState<number[]>([]);
  const [playable, setPlayable] = useState(false);

  // No reset-to-empty at the top of this effect: the caller keys its whole
  // subtree by `asset.id` (see `Inspector` below), so a new asset already
  // mounts fresh `useState([])`/`useState(false)` — resetting here as well
  // would just be a second, synchronous-in-effect write the lint rule (and
  // the repo's lint-ratchet gate) correctly flags as new debt. The remaining
  // case this skips — `src` changing while `asset.id` stays the same — isn't
  // reachable from this data model (`src` is a field ON the keyed asset).
  useEffect(() => {
    if (!src || src.startsWith("proof:") || src.startsWith("upload:")) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const decoded = await ctx.decodeAudioData(buf);
        if (cancelled) return;
        const data = decoded.getChannelData(0);
        const n = 96;
        const block = Math.max(1, Math.floor(data.length / n));
        const out: number[] = [];
        for (let i = 0; i < n; i++) {
          let max = 0;
          const start = i * block;
          for (let j = start; j < Math.min(data.length, start + block); j++) {
            const v = Math.abs(data[j]);
            if (v > max) max = v;
          }
          out.push(max);
        }
        setPeaks(out);
        setPlayable(true);
        void ctx.close();
      } catch {
        if (!cancelled) {
          setPeaks([]);
          setPlayable(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  return { peaks, playable };
}

/** A controlled `<audio>` this component owns, matching `kit/Player`'s own
 *  doctrine (it holds no media element itself). Silent no-op when nothing is
 *  playable. */
function useTransport(src: string | undefined, playable: boolean) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  // Same reasoning as `usePeaks` above: no reset-to-zero here — this hook's
  // caller is already remounted fresh per `asset.id` by the time `playable`
  // can flip true, so `useState(false)`/`useState(0)`'s own initial values
  // are the reset.
  useEffect(() => {
    if (!playable || !src) {
      ref.current = null;
      return;
    }
    const el = new Audio(src);
    ref.current = el;
    const onTime = () => setPosition(el.currentTime);
    const onEnd = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    return () => {
      el.pause();
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
    };
  }, [src, playable]);

  return {
    playing,
    position,
    onToggle: () => {
      const el = ref.current;
      if (!el) return;
      if (playing) {
        el.pause();
        setPlaying(false);
      } else {
        void el.play();
        setPlaying(true);
      }
    },
    onSeek: (seconds: number) => {
      const el = ref.current;
      if (!el) return;
      el.currentTime = seconds;
      setPosition(seconds);
    },
  };
}

export interface InspectorProps {
  asset: AudioAsset | null;
  /** The ledger's one write path (lib/assets.ts#updateAssetMeta, lifted to
   *  AudioWorkbench so Ledger/Inspector read the same post-write state —
   *  see AudioWorkbench.tsx for why it owns this rather than Inspector
   *  calling the store directly). Optional only so a snapshot/story render
   *  without a backing page still mounts. */
  onPatchMeta?: (id: string, patch: Partial<AudioMeta>) => void;
}

export default function Inspector({ asset, onPatchMeta }: InspectorProps) {
  if (!asset) {
    return (
      <div aria-label="Inspector">
        <Ghost shape="card" count={1} label="no take selected" />
      </div>
    );
  }
  // Keyed by `asset.id`: switching takes remounts the body below rather than
  // resetting `rejecting`/`reason` (and the hooks' own state) via an effect —
  // fresh `useState` initial values ARE the reset. See `usePeaks`/
  // `useTransport` above for the same call.
  return <InspectorBody key={asset.id} asset={asset} onPatchMeta={onPatchMeta} />;
}

function InspectorBody({ asset, onPatchMeta }: { asset: AudioAsset; onPatchMeta?: (id: string, patch: Partial<AudioMeta>) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const { peaks, playable } = usePeaks(asset.src);
  const transport = useTransport(asset.src, playable);

  const meta = audioMetaOf(asset);
  const v = meta.verdict;
  const off = dimsOff(meta);

  const setRating = (dim: RubricDim, n: number) => {
    const ratings = { melody: null, instrument_choice: 0, instrument_quality: 0, ...meta.ratings, [dim]: n };
    onPatchMeta?.(asset.id, { ratings });
  };

  const keep = () => {
    setRejecting(false);
    onPatchMeta?.(asset.id, { verdict: "kept", reject_reason: undefined });
  };
  const clear = () => {
    setRejecting(false);
    onPatchMeta?.(asset.id, { verdict: "unjudged", reject_reason: undefined });
  };
  const commitReject = () => {
    if (!reason.trim()) return;
    onPatchMeta?.(asset.id, { verdict: "rejected", reject_reason: reason.trim() });
    setRejecting(false);
  };

  const round = roundInfo(meta.prompt_round);

  return (
    <div aria-label="Inspector" className="aw__insp">
      <h3 className="aw__insp-title">{asset.name}</h3>
      <Chips>
        <Chip>{isSfx(meta) ? "FX" : "T"}</Chip>
        <StatusPill kind={VERDICT_KIND[v]}>{v}</StatusPill>
        {meta.vendor && <Chip>{meta.vendor}</Chip>}
        <Chip name="id">{asset.id}</Chip>
        <Chip name="age">{ago(asset.createdAt)}</Chip>
      </Chips>

      <Player
        label={asset.name}
        peaks={peaks}
        playing={transport.playing}
        position={transport.position}
        duration={meta.duration_s}
        disabled={!playable}
        onToggle={transport.onToggle}
        onSeek={transport.onSeek}
      />

      <div className="aw__rubric" role="group" aria-label="Rubric">
        {RUBRIC.map((d) => {
          const val = meta.ratings?.[d.key] ?? null;
          const disabled = off.has(d.key);
          return (
            <div key={d.key} className="aw__rub">
              <span className="aw__rub-l" title={d.label}>
                {d.short}
              </span>
              <div className="aw__rub-scale" role="radiogroup" aria-label={d.label}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={val === n}
                    disabled={disabled}
                    className={`aw__rub-n${val === n ? " is-at" : val != null && n < val ? " is-fill" : ""}`}
                    onClick={() => setRating(d.key, n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <span className="aw__rub-v">{disabled ? "n/a" : (val ?? "·")}</span>
            </div>
          );
        })}
      </div>

      <div className="aw__actions">
        <button type="button" className="aw__btn aw__btn--keep" aria-pressed={v === "kept" || v === "proven"} onClick={keep}>
          Keep
        </button>
        <button type="button" className="aw__btn aw__btn--rej" onClick={() => setRejecting((r) => !r)}>
          Reject
        </button>
        {v !== "unjudged" && (
          <button type="button" className="aw__btn" onClick={clear}>
            Clear
          </button>
        )}
      </div>

      {rejecting && (
        <div className="aw__rejbox">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why rejected?"
            aria-label="Reject reason"
            autoComplete="off"
          />
          <button type="button" className="aw__btn aw__btn--rej" disabled={!reason.trim()} onClick={commitReject}>
            Reject
          </button>
        </div>
      )}
      {meta.reject_reason && v === "rejected" && <p className="aw__quote">{meta.reject_reason}</p>}

      <dl className="aw__facts">
        {isSfx(meta) ? (
          <>
            <dt>Category</dt>
            <dd>
              <Chips>
                <Chip>{meta.sfx_category}</Chip>
                {meta.loopable && <Chip>loop</Chip>}
              </Chips>
            </dd>
          </>
        ) : (
          <>
            <dt>Genre</dt>
            <dd>
              <Chips>
                {(meta.genre_tags ?? []).map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
              </Chips>
            </dd>
            <dt>Mood</dt>
            <dd>
              <Chips>
                {(meta.mood_tags ?? []).map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
              </Chips>
            </dd>
            <dt>Instr.</dt>
            <dd>
              <Chips>
                {(meta.instrumentation ?? []).map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
              </Chips>
            </dd>
            <dt>Tempo</dt>
            <dd>{meta.tempo_bpm ? `${Math.round(meta.tempo_bpm)} BPM` : "—"} · {meta.key ?? "—"}</dd>
          </>
        )}
        <dt>Length</dt>
        <dd>{dur(meta.duration_s)}</dd>
      </dl>

      <section className="aw__panel" aria-label="Recipe">
        <h3>Recipe</h3>
        <ol className="aw__recipe">
          {meta.reference_track_id ? (
            <li>
              <span className="aw__recipe-k">reference</span>
              <span className="aw__recipe-v">{meta.reference_track_id}</span>
            </li>
          ) : (
            !isSfx(meta) && (
              <li className="aw__recipe--ghost">
                <span className="aw__recipe-k">reference</span>
                <span className="aw__recipe-v">—</span>
              </li>
            )
          )}
          {!isSfx(meta) && (
            <li>
              <span className="aw__recipe-k">
                concept
                {round && (
                  <span className={`aw__chip-src${round.retired ? " is-retired" : ""}`}>
                    {round.label}
                    {round.retired && <span className="aw__tag-retired">retired</span>}
                  </span>
                )}
              </span>
              <span className="aw__recipe-v">
                {[((meta.genre_tags ?? []).join(" / ")), meta.tempo_bpm ? `${Math.round(meta.tempo_bpm)} BPM` : "", meta.key ?? ""]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          )}
          {meta.prompt_text || meta.draft_id ? (
            <li>
              <span className="aw__recipe-k">
                draft <span className="aw__chip">{meta.vendor ?? ""}</span>
              </span>
              {meta.prompt_text && <pre className="aw__recipe-pre">{meta.prompt_text}</pre>}
            </li>
          ) : null}
          <li className="aw__recipe--here">
            <span className="aw__recipe-k">
              this take <StatusPill kind={VERDICT_KIND[v]}>{v}</StatusPill>
              {meta.vendor && <span className="aw__chip">{meta.vendor}</span>}
            </span>
            <span className="aw__recipe-v">{asset.name}</span>
          </li>
        </ol>
      </section>
    </div>
  );
}
