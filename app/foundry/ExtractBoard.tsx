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

import { useEffect, useMemo, useState } from "react";

import Modal from "@/components/ui/Modal";
import type { ExtractManifest, ExtractVerdict, ExtractVerdicts, ExtractedStyle, ReplicaRound, Transfer } from "@/lib/foundry/extract/types";
import { OBSERVABLE_FIELDS } from "@/lib/foundry/extract/types";

import { extractFileUrl } from "./extractClient";
import { ScoreChip, pct } from "./parts";

interface Zoom {
  title: string;
  file: string;
  words: { label: string; text: string }[];
  perField?: Partial<Record<string, number>>;
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keysEnabled, readOnly, focused, order, onFocus, onVerdict]);

  useEffect(() => {
    if (!focused) return;
    document.getElementById(`style-${focused}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);

  if (!run.styles.length) {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <p className="font-hanken text-[13px] text-slate-400">
          {run.status === "failed" ? "Nothing could be read back." : "Reading the sources — styles appear once every image has been read back."}
        </p>
        <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
          {run.sources.map((s) => (
            <figure key={s.id} className={`relative aspect-video overflow-hidden rounded-md border ${s.readback ? "border-emerald-300/40" : s.error ? "border-rose-400/40" : "border-white/10"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam */}
              <img src={extractFileUrl(run.id, s.file)} alt={s.name} loading="lazy" className="h-full w-full object-cover" />
              <figcaption className="font-jetbrains absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-[9px] text-white/70">
                {s.readback ? s.readback.render_mode : s.error ? "failed" : "…"}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {run.styles.map((st) => {
        const v = verdicts[st.id]?.verdict;
        const isFocused = focused === st.id;
        const best = bestReplica(st);
        const transfer = meanScore(st.transfers.map((t) => t.score));
        return (
          <section
            key={st.id}
            id={`style-${st.id}`}
            onClick={() => onFocus(st.id)}
            className={`rounded-2xl border p-4 transition ${
              v === "keep" ? "border-emerald-300/50" : v === "reject" ? "border-rose-400/40 opacity-60" : isFocused ? "border-cyan-400/50" : "border-white/8"
            } ${isFocused ? "bg-cyan-400/[0.04]" : "bg-white/[0.02]"}`}
          >
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-hanken text-[15px] text-white">{st.name}</h3>
                  <span className="font-jetbrains text-[10px] text-white/45">
                    {st.id} · {st.family} · {st.members.length} source{st.members.length === 1 ? "" : "s"} · grouped by {st.grouped_by}
                  </span>
                  {v && (
                    <span
                      className={`font-jetbrains rounded px-1.5 py-0.5 text-[9px] font-semibold ${v === "keep" ? "bg-emerald-300/90 text-slate-950" : "bg-rose-400/90 text-slate-950"}`}
                    >
                      {v === "keep" ? "KEPT" : "THROWN"}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {OBSERVABLE_FIELDS.filter((f) => st.observables[f]).map((f) => (
                    <span key={f} className="font-jetbrains rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-white/60">
                      {f.replace(/_/g, " ")}: <span className="text-white/85">{st.observables[f]}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ScoreChip label="replica" value={best?.score ?? null} />
                <ScoreChip label="transfer" value={transfer} />
                {!readOnly && (
                  <span className="ml-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <RowKey label="K" active={v === "keep"} tone="emerald" onClick={() => onVerdict(st.id, v === "keep" ? null : "keep")} title="keep this style" />
                    <RowKey label="X" active={v === "reject"} tone="rose" onClick={() => onVerdict(st.id, v === "reject" ? null : "reject")} title="throw this style" />
                  </span>
                )}
              </div>
            </header>

            <p className="font-hanken mt-3 text-[12px] leading-relaxed text-slate-400">{st.recipe}</p>
            {st.recipe_history.length > 1 && (
              <p className="font-jetbrains mt-1 text-[10px] text-white/35">
                recipe in force is round-tested · {st.recipe_history.length} tried · negative: {st.negative}
              </p>
            )}

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(160px,1fr)_minmax(260px,2fr)_minmax(160px,1fr)]">
              <Column label={`sources · ${st.members.length}`}>
                <div className="grid grid-cols-3 gap-1.5">
                  {st.members.map((mid) => {
                    const s = sourcesById.get(mid);
                    if (!s) return null;
                    return (
                      <Tile
                        key={mid}
                        run={run.id}
                        file={s.file}
                        alt={s.name}
                        onClick={() =>
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
                      >
                        {s.readback?.has_text && <Flag>TEXT</Flag>}
                      </Tile>
                    );
                  })}
                </div>
              </Column>

              <Column label={`replicas · words only · ${run.options.rounds} round${run.options.rounds === 1 ? "" : "s"}`}>
                <div className="flex flex-col gap-2">
                  {st.replicas.map((rep) => (
                    <div key={rep.source} className="flex items-start gap-1.5">
                      <span className="font-jetbrains w-8 shrink-0 pt-1 text-[9px] text-white/40">{rep.source}</span>
                      <div className="grid flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4">
                        {rep.rounds.map((r) => (
                          <RoundTile key={r.n} run={run.id} style={st} round={r} source={rep.source} onZoom={setZoom} />
                        ))}
                      </div>
                    </div>
                  ))}
                  {!st.replicas.length && <Empty>waiting…</Empty>}
                </div>
              </Column>

              <Column label={`transfer · new scene`}>
                <div className="grid grid-cols-1 gap-1.5">
                  {st.transfers.map((t) => (
                    <TransferTile key={t.scene} run={run.id} style={st} transfer={t} onZoom={setZoom} />
                  ))}
                  {!st.transfers.length && <Empty>{run.options.transfers ? "waiting…" : "off"}</Empty>}
                </div>
              </Column>
            </div>
          </section>
        );
      })}

      <Modal open={zoom !== null} onClose={() => setZoom(null)} title={zoom?.title ?? ""} className="max-w-4xl">
        {zoom && (
          <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
            <div className="overflow-hidden rounded-lg border border-white/10 bg-black/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={extractFileUrl(run.id, zoom.file)} alt={zoom.title} className="w-full" />
            </div>
            <div className="flex flex-col gap-3">
              {zoom.perField && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(zoom.perField).map(([f, hit]) => (
                    <span key={f} className={`font-jetbrains rounded border px-1.5 py-0.5 text-[9px] ${hit === 1 ? "border-emerald-400/40 text-emerald-200" : "border-rose-400/40 text-rose-200"}`}>
                      {f.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
              {zoom.words.map((w) => (
                <div key={w.label}>
                  <div className="font-jetbrains text-[10px] tracking-[0.14em] text-white/45 uppercase">{w.label}</div>
                  <p className="font-hanken mt-0.5 text-[12px] leading-relaxed whitespace-pre-wrap text-slate-300">{w.text || "—"}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ── Tiles ────────────────────────────────────────────────────────────────── */

function Column({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-jetbrains mb-1.5 text-[10px] tracking-[0.14em] text-white/40 uppercase">{label}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="font-jetbrains rounded-md border border-dashed border-white/10 px-3 py-6 text-center text-[10px] text-white/30">{children}</div>;
}

function Flag({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-jetbrains absolute top-1 right-1 rounded border border-rose-400/50 bg-rose-400/20 px-1 py-0.5 text-[8px] font-semibold text-rose-100">{children}</span>
  );
}

function Tile({ run, file, alt, onClick, children, ring = "border-white/10" }: { run: string; file: string; alt: string; onClick: () => void; children?: React.ReactNode; ring?: string }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`relative aspect-video cursor-zoom-in overflow-hidden rounded-md border transition hover:border-cyan-300/50 ${ring}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam */}
      <img src={extractFileUrl(run, file)} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      {children}
    </button>
  );
}

function RoundTile({ run, style, round, source, onZoom }: { run: string; style: ExtractedStyle; round: ReplicaRound; source: string; onZoom: (z: Zoom) => void }) {
  if (!round.file) return <Empty>r{round.n} failed</Empty>;
  const inForce = round.recipe === style.recipe;
  return (
    <div className="relative">
      <Tile
        run={run}
        file={round.file}
        alt={`${style.name} replica of ${source}, round ${round.n}`}
        ring={inForce ? "border-cyan-300/40" : "border-white/10"}
        onClick={() =>
          onZoom({
            title: `${style.name} · replica of ${source} · round ${round.n} · ${pct(round.score)}`,
            file: round.file!,
            perField: round.per_field,
            words: [
              { label: "critique", text: round.critique?.critique || (round.error ?? "—") },
              { label: "recipe used", text: round.recipe },
              { label: "recipe fix proposed", text: round.critique?.recipe_fix ?? "—" },
              { label: "prompt", text: round.prompt },
            ],
          })
        }
      >
        {round.critique?.has_text && <Flag>TEXT</Flag>}
        <span className="absolute bottom-1 left-1 flex gap-1">
          <ScoreChip label={`r${round.n}`} value={round.score} />
        </span>
      </Tile>
    </div>
  );
}

function TransferTile({ run, style, transfer, onZoom }: { run: string; style: ExtractedStyle; transfer: Transfer; onZoom: (z: Zoom) => void }) {
  if (!transfer.file) return <Empty>scene {transfer.scene + 1} failed</Empty>;
  return (
    <Tile
      run={run}
      file={transfer.file}
      alt={`${style.name} on scene ${transfer.scene + 1}`}
      onClick={() =>
        onZoom({
          title: `${style.name} · transfer · scene ${transfer.scene + 1} · ${pct(transfer.score)}`,
          file: transfer.file!,
          perField: transfer.per_field,
          words: [
            { label: "scene", text: transfer.brief },
            { label: "readback", text: transfer.readback ? OBSERVABLE_FIELDS.map((f) => `${f}=${transfer.readback![f]}`).join("  ") : (transfer.error ?? "—") },
            { label: "prompt", text: transfer.prompt },
          ],
        })
      }
    >
      {transfer.readback?.has_text && <Flag>TEXT</Flag>}
      <span className="absolute bottom-1 left-1">
        <ScoreChip label="style" value={transfer.score} />
      </span>
    </Tile>
  );
}

function RowKey({ label, active, tone, onClick, title }: { label: string; active: boolean; tone: "emerald" | "rose"; onClick: () => void; title: string }) {
  const cls =
    tone === "emerald"
      ? active
        ? "border-emerald-300/70 bg-emerald-300/20 text-emerald-100"
        : "border-white/15 text-white/60 hover:border-emerald-300/50 hover:text-emerald-200"
      : active
        ? "border-rose-400/70 bg-rose-400/20 text-rose-100"
        : "border-white/15 text-white/60 hover:border-rose-400/50 hover:text-rose-200";
  return (
    <button onClick={onClick} title={title} className={`font-jetbrains h-7 w-7 cursor-pointer rounded-md border text-[11px] font-semibold transition ${cls}`}>
      {label}
    </button>
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
