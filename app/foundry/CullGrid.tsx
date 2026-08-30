"use client";

// THE MATRIX — one scene at a time, styles down, mechanisms across.
//
// This is the trial-matrix reading the registry asks for: read by ROW (a
// style that holds on every mechanism, or none) and by COLUMN (a mechanism
// that fails every style is a bad lane, not five bad styles) before reading
// totals. The source frame is pinned beside the grid because every judgement
// is "did the shot survive", and the shot has to be in view to say so.
//
// Keyboard is the point of the surface: a cull of hundreds is arrow, K, X,
// arrow, K, X. Enter opens the comparison; the lightbox owns the keys while
// it is open. Each style row also carries its own K/X, because "this style
// failed this scene" is one decision, not two or six.

import { useEffect, useMemo } from "react";

import type { Candidate, RunManifest, Verdict, Verdicts } from "@/lib/foundry/types";

import { fileUrl } from "./foundryClient";
import { ScoreChip, VERDICT_RING, VerdictStamp, VetoChip } from "./parts";

/** Elements the browser ACTIVATES on Enter.
 *
 *  The grid's keys are bound on `window`, which is right for arrows and for
 *  K/X/U: a cull is hundreds of decisions and the hand should not have to keep
 *  the browser's focus anywhere in particular. Enter is the exception, because
 *  it is the only one of them that the focused element already owns.
 *
 *  Nothing in this grid is focusable — a tile is a `<div onClick>` — so the
 *  browser's focus is always on something ELSE while a candidate is "focused"
 *  in app state, and `focused` becomes non-null on the first tile click anyone
 *  makes. Enter then reached this handler, which called `preventDefault()`, and
 *  a `<button>`'s Enter activation is precisely what that suppresses: after one
 *  click on one tile, Enter stopped working on the row K/X buttons, the run
 *  list, the tab strip and Commit, and opened the lightbox instead. Space still
 *  worked, which is the kind of half-working that takes a while to report.
 *
 *  Checked by tag and by role rather than with `closest`, because Enter is
 *  delivered to the focused element itself. */
const ENTER_ACTIVATES = new Set(["BUTTON", "A", "SUMMARY", "SELECT", "TEXTAREA", "INPUT"]);

export function activatesOnEnter(t: { tagName?: string; getAttribute?: (n: string) => string | null } | null): boolean {
  if (!t) return false;
  if (ENTER_ACTIVATES.has(t.tagName ?? "")) return true;
  const role = t.getAttribute?.("role") ?? null;
  return role === "button" || role === "link" || role === "menuitem" || role === "tab";
}

const CRAFT_SUMMARY = ["shot_size", "camera_angle", "composition", "lighting_key", "lighting_direction", "depth_of_field"];

export function CullGrid({
  run,
  verdicts,
  focused,
  readOnly,
  onFocus,
  onVerdict,
  onOpen,
  keysEnabled,
}: {
  run: RunManifest;
  verdicts: Verdicts;
  focused: string | null;
  /** A committed run: no verdict controls at all, navigation only. */
  readOnly: boolean;
  onFocus: (id: string) => void;
  onVerdict: (ids: string | string[], v: Verdict | null) => void;
  onOpen: (id: string) => void;
  keysEnabled: boolean;
}) {
  const columns = useMemo(
    () => run.plan.mechanisms.flatMap((m) => run.plan.seeds.map((seed) => ({ mechanism: m, seed }))),
    [run.plan.mechanisms, run.plan.seeds],
  );
  const order = useMemo(() => run.candidates.map((c) => c.id), [run.candidates]);
  const byId = useMemo(() => new Map(run.candidates.map((c) => [c.id, c])), [run.candidates]);

  useEffect(() => {
    if (!keysEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const i = focused ? order.indexOf(focused) : -1;
      const step = (d: number) => {
        const n = Math.min(order.length - 1, Math.max(0, (i < 0 ? 0 : i) + d));
        onFocus(order[n]);
      };
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          step(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          step(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          step(columns.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          step(-columns.length);
          break;
        case "k":
        case "K":
          if (focused && !readOnly) onVerdict(focused, "keep");
          break;
        case "x":
        case "X":
          if (focused && !readOnly) onVerdict(focused, "reject");
          break;
        case "u":
        case "U":
          if (focused && !readOnly) onVerdict(focused, null);
          break;
        case "Enter":
          // Enter belongs to the focused element when that element activates on
          // it — see `activatesOnEnter`. Taking it here suppressed every button
          // on the page.
          if (activatesOnEnter(t)) return;
          if (focused) {
            e.preventDefault();
            onOpen(focused);
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keysEnabled, readOnly, focused, order, columns.length, onFocus, onVerdict, onOpen]);

  useEffect(() => {
    if (!focused) return;
    document.getElementById(`cand-${cssId(focused)}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);

  return (
    <div className="flex flex-col gap-10">
      {run.scenes.map((scene) => (
        <section key={scene.id} className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element -- served off local disk through the file seam */}
              <img src={fileUrl(run.id, scene.source)} alt={scene.note || scene.id} className="w-full" />
            </div>
            <div className="mt-2">
              <div className="font-jetbrains text-label tracking-[0.14em] text-cyan-300 uppercase">source · {scene.id}</div>
              <p className="font-hanken mt-1 text-content leading-snug text-slate-400">{scene.note}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {CRAFT_SUMMARY.map((f) => {
                  const v = scene.annotation?.[f];
                  return typeof v === "string" ? (
                    <span key={f} className="font-jetbrains rounded border border-white/10 px-1.5 py-0.5 text-label text-white/60">
                      {f.replace(/_/g, " ")}: <span className="text-white/85">{v}</span>
                    </span>
                  ) : null;
                })}
              </div>
              {scene.annotation_from && (
                <p className="font-jetbrains mt-2 text-content text-white/55">annotation from {scene.annotation_from}</p>
              )}
            </div>
          </aside>

          <div className="overflow-x-auto">
            <div
              className="grid min-w-[560px] gap-2"
              style={{ gridTemplateColumns: `170px repeat(${columns.length}, minmax(200px, 1fr))` }}
            >
              <div />
              {columns.map((col) => (
                <div key={`${col.mechanism.id}-${col.seed}`} className="px-1 pb-1">
                  <div className="font-jetbrains text-label tracking-[0.14em] text-white/70 uppercase">{col.mechanism.id}</div>
                  <div className="font-hanken text-content leading-snug text-slate-500">
                    {col.mechanism.label ?? (col.mechanism.reference ? "reference-conditioned" : "words only")}
                    {run.plan.seeds.length > 1 ? ` · seed ${col.seed}` : ""}
                  </div>
                </div>
              ))}

              {run.plan.styles.map((sid) => {
                const style = run.styles[sid];
                const rowIds = columns.map((col) => `${scene.id}/${sid}--${col.mechanism.id}--s${col.seed}`);
                const rowLive = rowIds.filter((id) => {
                  const c = byId.get(id);
                  return c && !c.deleted && c.status !== "pending" && c.status !== "failed";
                });
                const rowVerdicts = rowLive.map((id) => verdicts[id]?.verdict);
                const rowAll = (v: Verdict) => rowLive.length > 0 && rowVerdicts.every((x) => x === v);
                return [
                  <div key={`${sid}-head`} className="flex flex-col justify-center pr-2">
                    <div className="font-hanken text-content text-white">{style?.name ?? sid}</div>
                    <div className="font-jetbrains text-label text-white/60">
                      {style?.family} · {style?.origin.kind}
                      {style?.origin.source ? ` (${style.origin.source})` : ""}
                    </div>
                    {!readOnly && rowLive.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1">
                        <button
                          onClick={() => onVerdict(rowLive, "keep")}
                          title="Keep the whole row"
                          className={`font-jetbrains cursor-pointer rounded border px-1.5 py-0.5 text-label transition ${
                            rowAll("keep") ? "border-emerald-300/70 bg-emerald-300/20 text-emerald-100" : "border-white/15 text-white/65 hover:border-emerald-300/50 hover:text-emerald-200"
                          }`}
                        >
                          row K
                        </button>
                        <button
                          onClick={() => onVerdict(rowLive, "reject")}
                          title="Reject the whole row"
                          className={`font-jetbrains cursor-pointer rounded border px-1.5 py-0.5 text-label transition ${
                            rowAll("reject") ? "border-rose-400/70 bg-rose-400/20 text-rose-100" : "border-white/15 text-white/65 hover:border-rose-400/50 hover:text-rose-200"
                          }`}
                        >
                          row X
                        </button>
                      </div>
                    )}
                  </div>,
                  ...rowIds.map((id) => (
                    <Tile
                      key={id}
                      run={run.id}
                      candidate={byId.get(id)}
                      verdict={verdicts[id]?.verdict}
                      focused={focused === id}
                      readOnly={readOnly}
                      onFocus={() => onFocus(id)}
                      onOpen={() => onOpen(id)}
                      onVerdict={(v) => onVerdict(id, v)}
                    />
                  )),
                ];
              })}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

export function cssId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "_");
}

function Tile({
  run,
  candidate,
  verdict,
  focused,
  readOnly,
  onFocus,
  onOpen,
  onVerdict,
}: {
  run: string;
  candidate: Candidate | undefined;
  verdict: Verdict | undefined;
  focused: boolean;
  readOnly: boolean;
  onFocus: () => void;
  onOpen: () => void;
  onVerdict: (v: Verdict | null) => void;
}) {
  const ready = candidate && !candidate.deleted && (candidate.status === "graded" || candidate.status === "unmeasured" || candidate.status === "generated");
  return (
    <div
      id={candidate ? `cand-${cssId(candidate.id)}` : undefined}
      onClick={onFocus}
      className={`group relative aspect-video overflow-hidden rounded-lg border bg-black/40 transition ${VERDICT_RING[verdict ?? "none"]} ${
        focused ? "ring-2 ring-cyan-300/70" : ""
      }`}
    >
      {ready ? (
        // eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam
        <img src={fileUrl(run, candidate.file)} alt={candidate.id} className="h-full w-full cursor-zoom-in object-cover" loading="lazy" onClick={onOpen} />
      ) : (
        <div className="font-jetbrains flex h-full w-full items-center justify-center text-label text-white/55">
          {candidate?.deleted ? "deleted" : candidate?.status === "failed" ? `failed · ${candidate.error?.slice(0, 40)}` : candidate?.status ?? "—"}
        </div>
      )}

      <VerdictStamp verdict={verdict} />

      {candidate?.grade && (
        <div className="pointer-events-none absolute bottom-1 left-1.5 flex flex-wrap gap-1">
          <ScoreChip label="craft" value={candidate.grade.craft?.score} />
          <ScoreChip label="style" value={candidate.grade.style?.score} />
          <VetoChip candidate={candidate} />
        </div>
      )}

      {ready && !readOnly && (
        // Always visible on the focused tile and on any decided tile, so the
        // control that just acted stays where the eye is; hover reveals the
        // rest. Each press is idempotent — clearing is U, not a second press.
        <div
          className={`absolute top-1 right-1.5 flex gap-1 transition ${focused || verdict ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFocus();
              onVerdict("keep");
            }}
            title="Keep (K)"
            className={`font-jetbrains cursor-pointer rounded px-1.5 py-0.5 text-label font-semibold transition ${
              verdict === "keep" ? "bg-emerald-300 text-slate-950 ring-2 ring-emerald-200/70" : "bg-emerald-300/80 text-slate-950 hover:bg-emerald-300"
            }`}
          >
            K
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFocus();
              onVerdict("reject");
            }}
            title="Reject (X)"
            className={`font-jetbrains cursor-pointer rounded px-1.5 py-0.5 text-label font-semibold transition ${
              verdict === "reject" ? "bg-rose-400 text-slate-950 ring-2 ring-rose-200/70" : "bg-rose-400/80 text-slate-950 hover:bg-rose-400"
            }`}
          >
            X
          </button>
        </div>
      )}
    </div>
  );
}
