"use client";

// THE BOARD — one row per extracted style, read left to right the way the
// run was made: the sources it was read from, the replicas the recipe
// produced (every self-critique round, scored), and the transfer onto a
// scene the gallery never showed. The verdict is on the ROW: "did this look
// hold" is one decision, and the transfer is the tile that answers it.
//
// Keyboard: ↑/↓ move the focused row, K keeps, X throws, U clears. Any tile
// opens the zoom, which shows the image with the words behind it — the
// prompt, the critique, the readback — so a wrong-looking score can be
// audited against what the grader actually read.
//
// A row is a glass section, a picture is ./ui.tsx's Art behind a button, the
// zoom is the app's Modal (round-2 UI pass, 2026-10-05). What this file owns is
// the reading order and the keys.

import { useEffect, useMemo, useState } from "react";

import Modal from "@/components/ui/Modal";
import { Hint } from "@/components/ui/signal";
import type { ExtractManifest, ExtractVerdict, ExtractVerdicts, ExtractedStyle, ReplicaRound, Transfer } from "@/lib/foundry/extract/types";
import { OBSERVABLE_FIELDS } from "@/lib/foundry/extract/types";

import { activatesOnEnter } from "./CullGrid";
import { extractFileUrl } from "./extractClient";
import { Art, ErrorNote, FlagPill, Glass, Label, ScorePill, VerdictButtons, VerdictStamp, pct } from "./ui";

interface Zoom {
  title: string;
  file: string;
  words: { label: string; text: string }[];
  perField?: Partial<Record<string, number>>;
}

/* The three tile inspections, shared by click and by the Enter key. */

function roundZoom(style: ExtractedStyle, round: ReplicaRound, source: string): Zoom | null {
  if (!round.file) return null;
  return {
    title: `${style.name} · replica of ${source} · round ${round.n} · ${pct(round.score)}`,
    file: round.file,
    perField: round.per_field,
    words: [
      { label: "critique", text: round.critique?.critique || (round.error ?? "—") },
      { label: "recipe used", text: round.recipe },
      { label: "recipe fix proposed", text: round.critique?.recipe_fix ?? "—" },
      { label: "prompt", text: round.prompt },
    ],
  };
}

function transferZoom(style: ExtractedStyle, transfer: Transfer): Zoom | null {
  if (!transfer.file) return null;
  return {
    title: `${style.name} · transfer · scene ${transfer.scene + 1} · ${pct(transfer.score)}`,
    file: transfer.file,
    perField: transfer.per_field,
    words: [
      { label: "scene", text: transfer.brief },
      { label: "readback", text: transfer.readback ? OBSERVABLE_FIELDS.map((f) => `${f}=${transfer.readback![f]}`).join("  ") : (transfer.error ?? "—") },
      { label: "prompt", text: transfer.prompt },
    ],
  };
}

/** The focused row's best face, for Enter: the highest-scoring replica with
 *  pixels, else the first transfer, else the first source. */
function focusedZoom(style: ExtractedStyle, sources: Map<string, ExtractManifest["sources"][number]>): Zoom | null {
  let best: { round: ReplicaRound; source: string } | null = null;
  for (const r of style.replicas)
    for (const x of r.rounds)
      if (x.file && (best === null || (x.score ?? -1) > (best.round.score ?? -1))) best = { round: x, source: r.source };
  if (best) return roundZoom(style, best.round, best.source);
  const t = style.transfers.find((x) => x.file);
  if (t) return transferZoom(style, t);
  const s = sources.get(style.members[0]);
  if (!s) return null;
  return {
    title: `${style.name} · source ${s.id} · ${s.name}`,
    file: s.file,
    words: s.readback
      ? [
          { label: "look", text: s.readback.look },
          { label: "depiction", text: s.readback.depiction },
        ]
      : [{ label: "error", text: s.error ?? "not read" }],
  };
}

export function ExtractBoard({
  run,
  verdicts,
  focused,
  readOnly,
  onFocus,
  onVerdict,
  keysEnabled,
  onZoomChange,
}: {
  run: ExtractManifest;
  verdicts: ExtractVerdicts;
  focused: string | null;
  readOnly: boolean;
  onFocus: (id: string) => void;
  onVerdict: (id: string, v: ExtractVerdict | null) => void;
  keysEnabled: boolean;
  onZoomChange: (open: boolean) => void;
}) {
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const order = useMemo(() => run.styles.map((s) => s.id), [run.styles]);
  const sourcesById = useMemo(() => new Map(run.sources.map((s) => [s.id, s])), [run.sources]);

  useEffect(() => onZoomChange(zoom !== null), [zoom, onZoomChange]);

  useEffect(() => {
    if (!keysEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const i = focused ? order.indexOf(focused) : -1;
      const step = (d: number) => {
        if (!order.length) return;
        onFocus(order[Math.min(order.length - 1, Math.max(0, (i < 0 ? 0 : i) + d))]);
      };
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          step(1);
          break;
        case "ArrowUp":
          e.preventDefault();
          step(-1);
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
        case "Enter": {
          // Enter belongs to the focused element when that element activates on
          // it — the same rule, and the same defect, as CullGrid's grid. Nothing
          // in this board is focusable (a row is a `<section onClick>`), so the
          // browser's focus is always on something ELSE while a row is "focused"
          // in app state, and `focused` becomes non-null on the first row click
          // anyone makes. Taking Enter here then suppressed the twelve real
          // buttons live beside this board — Resume / Pause / Retry, the run
          // list, "+ new extraction", the tab strip, Commit — and opened the
          // zoom instead. Space still worked, which is the kind of half-working
          // that takes a while to report.
          if (activatesOnEnter(t)) break;
          if (!focused) break;
          const st = run.styles.find((x) => x.id === focused);
          const z = st && focusedZoom(st, sourcesById);
          if (z) {
            e.preventDefault();
            setZoom(z);
          }
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keysEnabled, readOnly, focused, order, run.styles, sourcesById, onFocus, onVerdict]);

  useEffect(() => {
    if (!focused) return;
    document.getElementById(`style-${focused}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);

  if (!run.styles.length) {
    // "styles appear once every image has been read back" was the app narrating
    // its own order of work; the wall below already draws it, one tile per
    // source, and the count says how far it has got. The FAILURE line stays —
    // that is an outcome, not a mechanism.
    return (
      <Glass className="flex flex-col gap-4 p-5">
        {run.status === "failed" ? (
          <ErrorNote>Nothing could be read back.</ErrorNote>
        ) : (
          <Label>
            sources {run.sources.filter((s) => s.readback).length}/{run.sources.length} read
          </Label>
        )}
        <div className="grid grid-cols-3 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {run.sources.map((s) => (
            <figure key={s.id} className="flex flex-col gap-1.5">
              <Art src={extractFileUrl(run.id, s.file)} alt={s.name} className="aspect-video" />
              <figcaption className={`font-jetbrains truncate text-label ${s.readback ? "text-emerald-200/80" : s.error ? "text-rose-200/80" : "text-white/40"}`}>
                {s.readback ? s.readback.render_mode : s.error ? "failed" : "…"}
              </figcaption>
            </figure>
          ))}
        </div>
      </Glass>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {run.styles.map((st) => {
        const v = verdicts[st.id]?.verdict;
        const best = bestReplica(st);
        const transfer = meanScore(st.transfers.map((t) => t.score));
        const isFocused = focused === st.id;
        return (
          <section
            key={st.id}
            id={`style-${st.id}`}
            aria-label={`${st.name}${v ? (v === "keep" ? ", kept" : ", rejected") : ""}`}
            onClick={() => onFocus(st.id)}
            className={`rounded-2xl border bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-5 backdrop-blur-[14px] transition ${
              isFocused ? "border-cyan-400/45 shadow-[0_0_0_1px_var(--gt-ring-cyan)]" : v === "keep" ? "border-emerald-400/30" : v === "reject" ? "border-rose-400/25 opacity-70" : "border-white/8 hover:border-white/15"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-instrument text-3xl text-white">{st.name}</h3>
                  {v && <VerdictStamp verdict={v} />}
                </div>
                <span className="font-jetbrains text-label text-white/40">
                  {st.id} · {st.family} · {st.members.length} source{st.members.length === 1 ? "" : "s"} · grouped by {st.grouped_by}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ScorePill label="replica" value={best?.score ?? null} />
                <ScorePill label="transfer" value={transfer} />
                {!readOnly && <VerdictButtons value={v} subject={`style ${st.name}`} toggle onVerdict={(next) => onVerdict(st.id, next)} />}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {st.similar_to && st.similar_to.length > 0 && (
                <span className="font-jetbrains inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/[0.08] px-2.5 py-0.5 text-label text-amber-100">
                  ≈ {st.similar_to.join(", ")}
                  <Hint tone="amber" label="What the ≈ chip means">
                    declared observables differ by at most one minor field
                  </Hint>
                </span>
              )}
              {OBSERVABLE_FIELDS.filter((f) => st.observables[f]).map((f) => (
                <span key={f} className="font-jetbrains inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-label text-white/75">
                  <span className="text-white/40">{f.replace(/_/g, " ")}</span>
                  {st.observables[f]}
                </span>
              ))}
            </div>

            <p className="font-hanken mt-4 border-l-2 border-cyan-300/35 pl-4 text-content leading-relaxed text-white/80">{st.recipe}</p>
            {st.recipe_history.length > 1 && (
              <p className="font-jetbrains mt-2 text-label text-white/40">
                recipe in force is round-tested · {st.recipe_history.length} tried · negative: {st.negative}
              </p>
            )}

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
              <Column label={`sources · ${st.members.length}`}>
                <div className="grid grid-cols-2 gap-2">
                  {st.members.map((mid) => {
                    const s = sourcesById.get(mid);
                    if (!s) return null;
                    return (
                      <Thumb
                        key={mid}
                        src={extractFileUrl(run.id, s.file)}
                        alt={s.name}
                        label={`Inspect source ${s.id}, ${s.name}`}
                        flag={s.readback?.has_text ? <FlagPill kind="text" /> : undefined}
                        onOpen={() =>
                          setZoom({
                            title: `${st.name} · source ${s.id} · ${s.name}`,
                            file: s.file,
                            words: s.readback
                              ? [
                                  { label: "look", text: s.readback.look },
                                  { label: "depiction", text: s.readback.depiction },
                                  { label: "colours", text: s.readback.dominant_colours.join(", ") },
                                  { label: "readback", text: OBSERVABLE_FIELDS.map((f) => `${f}=${s.readback![f]}`).join("  ") },
                                ]
                              : [{ label: "error", text: s.error ?? "not read" }],
                          })
                        }
                      />
                    );
                  })}
                </div>
              </Column>

              <Column label={`replicas · words only · ${run.options.rounds} round${run.options.rounds === 1 ? "" : "s"}`}>
                <div className="flex flex-col gap-3">
                  {st.replicas.map((rep) => (
                    <div key={rep.source} className="flex flex-col gap-1.5">
                      <span className="font-jetbrains text-label text-white/40">{rep.source}</span>
                      <div className="grid grid-cols-2 gap-2">
                        {rep.rounds.map((r) => (
                          <RoundThumb key={r.n} run={run.id} style={st} round={r} source={rep.source} onZoom={setZoom} />
                        ))}
                      </div>
                    </div>
                  ))}
                  {!st.replicas.length && <Art alt="waiting for replicas" state="queued" className="aspect-video" />}
                </div>
              </Column>

              <Column label="transfer · new scene">
                <div className="flex flex-col gap-2">
                  {st.transfers.map((t) => (
                    <TransferThumb key={t.scene} run={run.id} style={st} transfer={t} onZoom={setZoom} />
                  ))}
                  {!st.transfers.length && <Art alt={run.options.transfers ? "waiting for transfers" : "transfers off"} state={run.options.transfers ? "queued" : "missing"} className="aspect-video" />}
                </div>
              </Column>
            </div>
          </section>
        );
      })}

      <Modal open={zoom !== null} onClose={() => setZoom(null)} title={zoom?.title ?? ""} className="max-w-[min(1200px,94vw)]">
        {zoom && (
          <div className="flex flex-col gap-5">
            <Art src={extractFileUrl(run.id, zoom.file)} alt={zoom.title} className="aspect-video" fit="contain" />
            {zoom.perField && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(zoom.perField).map(([f, hit]) => (
                  <span
                    key={f}
                    className={`font-jetbrains inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-label ${
                      hit === 1 ? "border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-100" : "border-rose-400/30 bg-rose-400/[0.07] text-rose-100"
                    }`}
                  >
                    <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${hit === 1 ? "bg-emerald-300" : "bg-rose-400"}`} />
                    {f.replace(/_/g, " ")}
                    <span className="sr-only">{hit === 1 ? " matched" : " missed"}</span>
                  </span>
                ))}
              </div>
            )}
            {zoom.words.map((w) => (
              <section key={w.label}>
                <Label as="h3" className="mb-1.5">
                  {w.label}
                </Label>
                <p className="font-hanken text-content leading-relaxed whitespace-pre-wrap text-white/85">{w.text || "—"}</p>
              </section>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Column({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <Label as="h4">{label}</Label>
      {children}
    </div>
  );
}

/* ── Thumbs ───────────────────────────────────────────────────────────────── */

function Thumb({
  src,
  alt,
  label,
  flag,
  chips,
  inForce,
  onOpen,
}: {
  src: string;
  alt: string;
  label: string;
  flag?: React.ReactNode;
  chips?: React.ReactNode;
  /** This round's recipe is the one in force — the ring says so. */
  inForce?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={`group block w-full cursor-zoom-in rounded-xl transition focus-visible:outline-2 focus-visible:outline-offset-2 ${inForce ? "ring-2 ring-cyan-300/60" : "ring-1 ring-white/10 hover:ring-white/30"}`}
    >
      <Art src={src} alt={alt} className="aspect-video">
        {flag && <span className="absolute top-1.5 right-1.5">{flag}</span>}
        {chips && <span className="absolute bottom-1.5 left-1.5">{chips}</span>}
        {inForce && (
          <span className="font-jetbrains pointer-events-none absolute top-1.5 left-1.5 rounded-md bg-cyan-300/90 px-1.5 py-0.5 text-label font-semibold text-slate-950">in force</span>
        )}
      </Art>
    </button>
  );
}

function RoundThumb({ run, style, round, source, onZoom }: { run: string; style: ExtractedStyle; round: ReplicaRound; source: string; onZoom: (z: Zoom) => void }) {
  if (!round.file) return <Art alt={`r${round.n} failed`} state="failed" className="aspect-video" />;
  return (
    <Thumb
      src={extractFileUrl(run, round.file)}
      alt={`${style.name} replica of ${source}, round ${round.n}`}
      label={`Inspect ${style.name} replica of ${source}, round ${round.n}`}
      inForce={round.recipe === style.recipe}
      flag={round.critique?.has_text ? <FlagPill kind="text" /> : undefined}
      chips={<ScorePill label={`r${round.n}`} value={round.score} className="!bg-black/55 backdrop-blur-sm" />}
      onOpen={() => {
        const z = roundZoom(style, round, source);
        if (z) onZoom(z);
      }}
    />
  );
}

function TransferThumb({ run, style, transfer, onZoom }: { run: string; style: ExtractedStyle; transfer: Transfer; onZoom: (z: Zoom) => void }) {
  if (!transfer.file) return <Art alt={`scene ${transfer.scene + 1} failed`} state="failed" className="aspect-video" />;
  return (
    <Thumb
      src={extractFileUrl(run, transfer.file)}
      alt={`${style.name} on scene ${transfer.scene + 1}`}
      label={`Inspect ${style.name} on scene ${transfer.scene + 1}`}
      flag={transfer.readback?.has_text ? <FlagPill kind="text" /> : undefined}
      chips={<ScorePill label="style" value={transfer.score} className="!bg-black/55 backdrop-blur-sm" />}
      onOpen={() => {
        const z = transferZoom(style, transfer);
        if (z) onZoom(z);
      }}
    />
  );
}

/* ── Arithmetic for the header chips ──────────────────────────────────────── */

function bestReplica(st: ExtractedStyle): ReplicaRound | null {
  let best: ReplicaRound | null = null;
  for (const r of st.replicas) for (const x of r.rounds) if (typeof x.score === "number" && (best === null || x.score > (best.score ?? -1))) best = x;
  return best;
}

function meanScore(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
