"use client";

// THE AUDITION — every heard leaf side by side, so the comparison is the
// layout. With ONE PLAYHEAD on (the default), stepping to the next take starts
// it at the second the last one was at: the same moment of two briefs, back
// to back, which is the only fair way to hear a variant against its sibling
// (media-generation / generated-music-acceptance / brief-conformance-listen —
// judge against the brief, not against which take happened to be at its
// chorus). Off, each take starts from its top.

import { useEffect, useState } from "react";

import { motion, useReducedMotion } from "motion/react";
import { Crown, Link2, X } from "lucide-react";

import { Keycaps } from "@/components/ui/signal";
import { EASE } from "@/components/ui/tokens";
import { typing } from "@/lib/board/keys";
import type { DefectCode, Hunt, HuntNode, SoundTake } from "@/lib/sound/types";

import {
  DefectChips,
  DefectPicker,
  ProviderChip,
  TechniqueChips,
} from "../shared/Chips";
import { dur } from "../shared/format";
import { transport, usePlayState } from "../shared/transport";
import { BTN_REJECT, CAPS } from "../shared/ui";
import { PlayButton, TakeWave } from "../shared/Wave";
import type { HuntApi } from "./useHunt";

export function Audition({
  api,
  hunt,
  heard,
  takeOf,
}: {
  api: HuntApi;
  hunt: Hunt;
  /** Leaves with a take, in board order. */
  heard: HuntNode[];
  takeOf: (n: HuntNode) => SoundTake | null;
}) {
  const reduce = useReducedMotion();
  const st = usePlayState();
  const [linked, setLinked] = useState(true);
  const [at, setAt] = useState(0);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const pairs = heard.flatMap((n) => {
    const t = takeOf(n);
    return t ? [{ n, t }] : [];
  });
  const idx = Math.min(at, Math.max(0, pairs.length - 1));

  /** Move to a take; if something is playing and the playhead is linked, carry the second over. */
  const go = (i: number) => {
    const p = pairs[i];
    if (!p) return;
    setAt(i);
    if (st?.playing && st.id !== p.t.id)
      transport.play(p.t.id, linked ? st.position : 0, p.t.durationS);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        typing(e.target) ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        !pairs.length
      )
        return;
      const p = pairs[idx];
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        go(
          Math.max(
            0,
            Math.min(pairs.length - 1, idx + (e.key === "ArrowRight" ? 1 : -1)),
          ),
        );
      } else if (e.key === " ") {
        e.preventDefault();
        transport.toggle(p.t.id, p.t.durationS);
      } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        // A held W crowns once; repeats would toggle the crown on and off.
        if (e.repeat) return;
        void api.crown(hunt.id, p.n.id, p.t, !p.n.winner);
      } else if ((e.key === "l" || e.key === "L") && !e.repeat) setLinked((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setLinked((v) => !v)}
          aria-pressed={linked}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 font-jetbrains text-label transition ${
            linked
              ? "border-cyan-400/45 bg-cyan-400/10 text-cyan-100"
              : "border-white/12 text-white/55 hover:text-white"
          }`}
        >
          <Link2 className="h-4 w-4" aria-hidden />
          one playhead
        </button>
        {st && pairs.some((p) => p.t.id === st.id) && (
          <span className="font-jetbrains text-label tabular-nums text-white/45">
            {dur(st.position)} / {dur(st.duration)}
          </span>
        )}
        <Keycaps
          className="ml-auto"
          map={[
            { keys: ["←", "→"], does: "next take" },
            { keys: ["Space"], does: "play" },
            { keys: ["W"], does: "crown" },
            { keys: ["L"], does: "one playhead" },
          ]}
        />
      </div>

      <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))]">
        {pairs.map(({ n, t }, i) => {
          const on = i === idx;
          const playing = st?.id === t.id && st.playing;
          return (
            <motion.article
              key={n.id}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.22,
                ease: EASE,
                delay: reduce ? 0 : Math.min(0.3, i * 0.03),
              }}
              onClick={() => go(i)}
              className={`grid cursor-pointer content-start gap-3 rounded-2xl border p-4 transition ${
                n.winner
                  ? "border-emerald-400/50 bg-emerald-400/[0.06] shadow-[0_0_22px] shadow-emerald-400/10"
                  : on
                    ? "border-cyan-300/45 bg-cyan-400/[0.05]"
                    : t.verdict === "rejected"
                      ? "border-white/6 bg-white/[0.015]"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <div className="grid gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`${CAPS} truncate`}>{n.axis}</span>
                  <ProviderChip provider={n.provider} />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <h3
                    className={`line-clamp-2 font-instrument text-xl leading-tight ${t.verdict === "rejected" ? "text-white/40 line-through" : "text-white"}`}
                  >
                    {n.label}
                  </h3>
                  {n.winner && (
                    <Crown
                      className="mt-1 h-5 w-5 shrink-0 text-emerald-300"
                      aria-label="winner"
                    />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <PlayButton take={t} size="lg" />
                <span
                  className="min-w-0 flex-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <TakeWave
                    take={t}
                    height="h-14"
                    bars={64}
                    tone={n.winner ? "emerald" : "cyan"}
                    dim={t.verdict === "rejected" && !playing}
                  />
                </span>
              </div>
              <TechniqueChips technique={n.technique} empty={null} />
              <DefectChips
                reasons={t.verdict === "rejected" ? t.reasons : []}
              />
              <div
                className="flex flex-wrap gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => void api.crown(hunt.id, n.id, t, !n.winner)}
                  aria-pressed={n.winner}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 font-jetbrains text-label transition ${
                    n.winner
                      ? "border-emerald-400/55 bg-emerald-400/15 text-emerald-100"
                      : "border-emerald-400/30 text-emerald-200/85 hover:bg-emerald-400/10"
                  }`}
                >
                  <Crown className="h-3.5 w-3.5" aria-hidden />
                  {n.winner ? "winner" : "crown"}
                </button>
                {!n.winner && (
                  <button
                    type="button"
                    onClick={() =>
                      setRejecting((r) => (r === n.id ? null : n.id))
                    }
                    aria-expanded={rejecting === n.id}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 font-jetbrains text-label transition ${
                      t.verdict === "rejected"
                        ? "border-rose-400/45 text-rose-200"
                        : "border-white/12 text-white/55 hover:border-rose-400/35 hover:text-rose-100"
                    }`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    {t.verdict === "rejected" ? "rejected" : "reject"}
                  </button>
                )}
              </div>
              {rejecting === n.id && (
                <RejectRow
                  kind={hunt.kind}
                  initial={t.reasons}
                  onDone={(r) => {
                    void api.reject(t, r);
                    setRejecting(null);
                  }}
                />
              )}
            </motion.article>
          );
        })}
      </div>
    </div>
  );
}

function RejectRow({
  kind,
  initial,
  onDone,
}: {
  kind: Hunt["kind"];
  initial: DefectCode[];
  onDone: (r: DefectCode[]) => void;
}) {
  const [r, setR] = useState<DefectCode[]>(initial);
  return (
    <div className="grid gap-2" onClick={(e) => e.stopPropagation()}>
      <DefectPicker kind={kind} value={r} onChange={setR} keyed={false} />
      <button
        type="button"
        disabled={!r.length}
        onClick={() => onDone(r)}
        className={`${BTN_REJECT} justify-self-start`}
      >
        reject · {r.length}
      </button>
    </div>
  );
}
