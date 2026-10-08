"use client";

// ONE STRIP, LARGE — the master clip with native controls, its contact sheet
// under a frame scrubber, the verdict with its reason chips and note, and the
// evidence the card only badges: each gate's measured value against its bar,
// the lint, the fix rounds, the seat time.
//
// THE SCRUBBER drives whichever view is up. Over the clip it seeks the mp4 to
// i / fps (paused). Over the LIVE page it posts `{type: "strip-frame", i}`
// into the iframe: the pipeline's contract (pipeline/strips/CONTRACT.md)
// defines a `message` listener on the strip page that calls renderFrameAt(i)
// for exactly that message — which is what makes a lossless scrub possible,
// because a strip is a pure function of its frame index. A page written before
// that listener entered the contract simply ignores the message; nothing is
// injected into it from here. Either way the sheet tile nearest the frame is
// ringed, since the sheet is the evenly-spaced sampler the author's fix loop
// read.
//
// THE LIVE PAGE IS UNTRUSTED CODE. `sandbox="allow-scripts"` and never
// allow-same-origin: an opaque origin, no storage, no cookies, no reach into
// this document. The route serves it under its own `sandbox allow-scripts` CSP
// as well (app/api/foundry/strips/[id]/page/route.ts). postMessage therefore
// targets "*" — an opaque origin has no name to target.
//
// THE BLIND READ HOLDS HERE TOO: the title is the approach number until a
// verdict exists, and the approach's direction and falsifier are revealed with
// its name.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Primitives";
import { CHIP_CLASS, Keycaps, TALLY_TONE } from "@/components/ui/signal";
import { typing } from "@/lib/board/keys";
import { STRIP_CHIPS_MAX, STRIP_NOTE_MAX } from "@/lib/foundry/strips/triage";
import { STRIP_CHIPS, type StripCard, type StripChip, type StripGates, type StripRun, type StripVerdict } from "@/lib/foundry/strips/types";

import { stripPageUrl } from "./foundryClient";
import { refusedKey } from "./keyGuard";
import { CARD_STATUS_WORD } from "./parts";
import { CardSignals, KindChip, approachOf, cardFileUrl, cardNumber, isControl, judgeable, revealLine, type StripVerdictValue } from "./StripGrid";
import { Art, ErrorNote, Label, StatusChip, VerdictButtons, VerdictStamp, verdictRing } from "./ui";

const GATES: (keyof StripGates)[] = ["seek", "legibility", "motion", "length"];
/** The contact sheet's grid (lib/foundry/strips/types.ts: "4x3 contact sheet,
 *  frames evenly spaced"). */
const SHEET_COLS = 4;
const SHEET_ROWS = 3;
const SHEET_TILES = SHEET_COLS * SHEET_ROWS;

/** The sheet tile a frame falls in, for an evenly spaced sampler. */
export function sheetTile(i: number, frames: number): number {
  if (frames <= 1) return 0;
  return Math.min(SHEET_TILES - 1, Math.max(0, Math.floor((i * SHEET_TILES) / frames)));
}
/** The frame a sheet tile starts at. */
export function tileFrame(t: number, frames: number): number {
  return Math.min(frames - 1, Math.round((t * frames) / SHEET_TILES));
}

/** Scale a fixed-size page into the box it is drawn in. A callback ref, so
 *  the observer follows the box as it mounts (only while the live view is up). */
function useFit(width: number) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, width]);
  return [setEl, scale] as const;
}

export function StripLightbox({
  run,
  card,
  verdict,
  readOnly,
  onClose,
  onVerdict,
  onToggleChip,
  onNote,
  onStep,
  index,
  count,
}: {
  run: StripRun;
  card: StripCard | null;
  verdict: StripVerdict | undefined;
  readOnly: boolean;
  onClose: () => void;
  onVerdict: (v: StripVerdictValue | null) => void;
  onToggleChip: (chip: StripChip) => void;
  onNote: (note: string) => void;
  onStep: (d: 1 | -1) => void;
  index: number;
  count: number;
}) {
  const ok = judgeable(card ?? undefined);
  const canJudge = ok && !readOnly;
  const v = verdict?.verdict;

  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (refusedKey(e)) return;
      // The scrubber and the note own their own keys.
      if (typing(e.target)) return;
      switch (e.key) {
        case "k":
        case "K":
          if (canJudge) onVerdict("keep");
          return;
        case "x":
        case "X":
          if (canJudge) onVerdict("reject");
          return;
        case "u":
        case "U":
          if (canJudge) onVerdict(null);
          return;
        case "ArrowRight":
          e.preventDefault();
          onStep(1);
          return;
        case "ArrowLeft":
          e.preventDefault();
          onStep(-1);
          return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= STRIP_CHIPS.length && canJudge && v) onToggleChip(STRIP_CHIPS[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, canJudge, v, onVerdict, onToggleChip, onStep]);

  const stepBtn = (d: 1 | -1) => {
    const off = d === -1 ? index <= 0 : index >= count - 1;
    const Icon = d === -1 ? ChevronLeft : ChevronRight;
    return (
      <button
        type="button"
        disabled={off}
        onClick={() => onStep(d)}
        aria-label={d === -1 ? "Previous strip" : "Next strip"}
        className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-white/12 text-white/70 transition hover:border-white/30 hover:text-white disabled:cursor-default disabled:opacity-30"
      >
        <Icon aria-hidden className="h-4 w-4" />
      </button>
    );
  };

  const num = card ? cardNumber(card) : "";
  return (
    <Modal
      open={Boolean(card)}
      onClose={onClose}
      title={card ? (v ? `${num} · ${revealLine(run, card)}` : num) : ""}
      eyebrow={card ? <Label>{card.id}</Label> : undefined}
      className="max-w-[min(1560px,96vw)]"
      footer={
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-2">
            {stepBtn(-1)}
            <span className="font-jetbrains text-label text-white/45 tabular-nums">
              {index + 1}/{count}
            </span>
            {stepBtn(1)}
          </span>
          {readOnly ? (
            <StatusChip kind="committed" word="committed · verdicts are final" />
          ) : (
            <Keycaps
              label="Strip shortcuts"
              map={[
                { keys: ["←", "→"], does: "step" },
                ...(canJudge
                  ? [
                      { keys: ["K"], does: "keep" },
                      { keys: ["X"], does: "reject" },
                      { keys: ["U"], does: "clear" },
                      { keys: ["1–8"], does: "reason chip" },
                    ]
                  : []),
                { keys: ["Esc"], does: "close" },
              ]}
            />
          )}
          {canJudge && (
            <span className="ml-auto flex items-center gap-3">
              <span className={`font-jetbrains text-label ${v === "keep" ? "text-emerald-200" : v === "reject" ? "text-rose-200" : "text-white/45"}`}>
                {v === "keep" ? "kept" : v === "reject" ? "rejected" : "undecided"}
              </span>
              {v && (
                <Button variant="ghost" size="sm" onClick={() => onVerdict(null)}>
                  Clear
                </Button>
              )}
              <VerdictButtons value={v} subject={`strip ${num}`} onVerdict={(x) => onVerdict(x)} />
            </span>
          )}
        </div>
      }
    >
      {/* Keyed by card: the frame, the live toggle and the player reset per strip. */}
      {card && <Body key={card.id} run={run} card={card} verdict={verdict} readOnly={readOnly} onToggleChip={onToggleChip} onNote={onNote} />}
    </Modal>
  );
}

function Body({
  run,
  card,
  verdict,
  readOnly,
  onToggleChip,
  onNote,
}: {
  run: StripRun;
  card: StripCard;
  verdict: StripVerdict | undefined;
  readOnly: boolean;
  onToggleChip: (chip: StripChip) => void;
  onNote: (note: string) => void;
}) {
  const ok = judgeable(card);
  const v = verdict?.verdict;
  const [live, setLive] = useState(false);
  const [frame, setFrame] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const W = run.width[card.lane];
  const H = run.height[card.lane];
  const [fitBox, scale] = useFit(W);
  const frames = run.frames;
  const mp4 = cardFileUrl(run.id, card, "mp4");
  const webm = cardFileUrl(run.id, card, "webm");
  const poster = cardFileUrl(run.id, card, "poster");
  const sheet = cardFileUrl(run.id, card, "sheet");
  const tall = card.lane === "stat";
  const ap = approachOf(run, card);

  const scrub = (i: number) => {
    setFrame(i);
    if (live) {
      // The contract's listener (see the header); "*" because the frame's
      // origin is opaque by construction.
      iframe.current?.contentWindow?.postMessage({ type: "strip-frame", i }, "*");
    } else if (video.current) {
      video.current.pause();
      video.current.currentTime = i / run.fps;
    }
  };

  const viewToggle = (on: boolean, word: string) => (
    <button
      type="button"
      aria-pressed={live === on}
      onClick={() => setLive(on)}
      className={`font-jetbrains cursor-pointer rounded-md border px-2.5 py-1 text-label transition ${
        live === on ? "border-cyan-400/45 bg-cyan-400/[0.10] text-cyan-100" : "border-white/10 text-white/55 hover:border-white/25 hover:text-white/85"
      }`}
    >
      {word}
    </button>
  );

  const player = !ok ? (
    <Art alt={`strip ${cardNumber(card)}`} state="failed" absentWord={CARD_STATUS_WORD[card.status]} className={tall ? "aspect-[9/16]" : "aspect-video"} />
  ) : live ? (
    <div ref={fitBox} className={`relative overflow-hidden rounded-xl bg-black ${tall ? "aspect-[9/16]" : "aspect-video"} ${verdictRing(v)}`}>
      {scale > 0 && (
        <iframe
          ref={iframe}
          aria-label={`strip ${cardNumber(card)}, live page`}
          src={stripPageUrl(run.id, card.id)}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          onLoad={() => iframe.current?.contentWindow?.postMessage({ type: "strip-frame", i: frame }, "*")}
          className="absolute top-0 left-0 origin-top-left border-0"
          style={{ width: W, height: H, transform: `scale(${scale})` }}
        />
      )}
    </div>
  ) : mp4 || webm ? (
    <div className={`relative overflow-hidden rounded-xl bg-black ${tall ? "aspect-[9/16]" : "aspect-video"} ${verdictRing(v)}`}>
      <video ref={video} controls muted loop playsInline preload="metadata" poster={poster} aria-label={`strip ${cardNumber(card)}`} className="absolute inset-0 h-full w-full object-contain">
        {mp4 && <source src={mp4} type="video/mp4" />}
        {webm && <source src={webm} type="video/webm" />}
      </video>
      {v && <VerdictStamp verdict={v} className="pointer-events-none absolute top-3 left-3" />}
    </div>
  ) : (
    <Art alt={`strip ${cardNumber(card)}`} state={run.status === "committed" && v === "reject" ? "deleted" : "missing"} className={tall ? "aspect-[9/16]" : "aspect-video"} />
  );

  const tile = sheetTile(frame, frames);
  const chips = verdict?.chips ?? [];
  const full = chips.length >= STRIP_CHIPS_MAX;

  return (
    <div className={`grid gap-6 ${tall ? "lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"}`}>
      <div className="flex min-w-0 flex-col gap-3">
        {ok && (
          <div role="group" aria-label="view" className="flex items-center gap-1.5">
            {viewToggle(false, "clip")}
            {viewToggle(true, "live")}
          </div>
        )}
        {player}
        {!ok && card.error && <ErrorNote>{card.error}</ErrorNote>}
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <KindChip card={card} />
          {card.replicaOf && <span className="font-jetbrains text-label text-white/45">of {card.replicaOf}</span>}
          <CardSignals run={run} card={card} />
        </div>

        {sheet && (
          <section aria-label="contact sheet" className="flex flex-col gap-2">
            <div className="relative overflow-hidden rounded-lg ring-1 ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- served off local disk through /api/foundry/file */}
              <img src={sheet} alt={`contact sheet, strip ${cardNumber(card)}`} className="block h-auto w-full" />
              <div aria-hidden className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${SHEET_COLS}, 1fr)`, gridTemplateRows: `repeat(${SHEET_ROWS}, 1fr)` }}>
                {Array.from({ length: SHEET_TILES }, (_, t) => (
                  <span
                    key={t}
                    onClick={() => scrub(tileFrame(t, frames))}
                    className={`cursor-pointer transition ${t === tile ? "ring-2 ring-cyan-300 ring-inset" : "hover:bg-white/[0.06]"}`}
                  />
                ))}
              </div>
            </div>
            <label className="flex items-center gap-3">
              <span className="sr-only">frame</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, frames - 1)}
                value={frame}
                onChange={(e) => scrub(Number(e.target.value))}
                className="min-w-0 flex-1 accent-cyan-300"
              />
              <span className="font-jetbrains shrink-0 text-label text-white/60 tabular-nums">
                f{frame}/{frames - 1} · {(frame / run.fps).toFixed(2)}s
              </span>
            </label>
          </section>
        )}

        {ok && (
          <section aria-label="verdict" className="flex flex-col gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-4">
            <div role="group" aria-label="reason chips" className="flex flex-wrap gap-1.5">
              {STRIP_CHIPS.map((c, i) => {
                const on = chips.includes(c);
                const disabled = readOnly || !v || (!on && full);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => onToggleChip(c)}
                    className={`${CHIP_CLASS} cursor-pointer transition disabled:cursor-default disabled:opacity-40 ${on ? (v === "keep" ? TALLY_TONE.emerald : TALLY_TONE.rose) : TALLY_TONE.neutral}`}
                  >
                    <span aria-hidden className="opacity-60">
                      {i + 1}
                    </span>
                    {c}
                  </button>
                );
              })}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="sr-only">note</span>
              <textarea
                value={verdict?.note ?? ""}
                disabled={readOnly || !v}
                maxLength={STRIP_NOTE_MAX}
                rows={3}
                placeholder={v ? "note" : ""}
                onChange={(e) => onNote(e.target.value)}
                className="font-hanken w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-content text-white/85 placeholder:text-white/30 focus:border-cyan-400/45 disabled:opacity-40"
              />
              <span className="font-jetbrains self-end text-label text-white/35 tabular-nums">
                {(verdict?.note ?? "").length}/{STRIP_NOTE_MAX}
              </span>
            </label>
          </section>
        )}

        {card.gates && (
          <table className="w-full border-separate border-spacing-0 text-left">
            <tbody>
              {GATES.map((k) => {
                const g = card.gates?.[k];
                return (
                  <tr key={k}>
                    <th scope="row" className="font-jetbrains border-b border-white/[0.05] py-1.5 pr-3 text-label font-normal text-white/50">
                      {k}
                    </th>
                    <td className={`font-jetbrains border-b border-white/[0.05] py-1.5 pr-3 text-label ${!g ? "text-white/40" : g.ok ? "text-emerald-200/90" : "text-rose-200/90"}`}>{!g ? "not run" : g.ok ? "pass" : "fail"}</td>
                    <td className="font-hanken border-b border-white/[0.05] py-1.5 text-label text-white/70">{g?.detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {card.lint && card.lint.length > 0 && (
          <section aria-label="lint" className="flex flex-col gap-1">
            <Label as="h4">lint</Label>
            {card.lint.map((l, i) => (
              <code key={i} className="font-jetbrains text-label break-words text-rose-200/80">
                {l}
              </code>
            ))}
          </section>
        )}

        <div className="font-jetbrains flex flex-wrap gap-x-4 gap-y-1 text-label text-white/45">
          <span>
            effort <span className="text-white/75">{card.effort}</span>
          </span>
          <span>
            author <span className="text-white/75 tabular-nums">{(card.authorMs / 1000).toFixed(0)}s</span>
          </span>
          <span>
            render <span className="text-white/75 tabular-nums">{(card.renderMs / 1000).toFixed(0)}s</span>
          </span>
          {card.costUsd !== undefined && (
            <span>
              cost <span className="text-white/75 tabular-nums">${card.costUsd.toFixed(2)}</span>
            </span>
          )}
          <span>
            {W}×{H} · {run.fps} fps · {frames} f
          </span>
        </div>

        {v && ap && !isControl(card) && (
          <section aria-label="approach" className="flex flex-col gap-2 rounded-xl border border-white/8 bg-black/20 p-4">
            <div className="flex flex-wrap gap-1.5">
              {[ap.medium, ap.grammar, ap.density, ap.seat, ap.leonardo !== "none" ? `leonardo ${ap.leonardo}` : undefined, ...(ap.vendored ?? [])]
                .filter((x): x is string => Boolean(x))
                .map((x) => (
                  <span key={x} className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>
                    {x}
                  </span>
                ))}
            </div>
            <p className="font-hanken text-content leading-snug text-white/75">{ap.direction}</p>
            <p className="font-hanken text-content leading-snug text-amber-100/80">
              <span className="font-jetbrains text-label text-amber-200/70">falsifier · </span>
              {ap.falsifier}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
