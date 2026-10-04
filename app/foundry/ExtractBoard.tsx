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
// A row is a kit Entry; a picture is a kit Thumb; the zoom is a kit Sheet. What
// this file owns is the reading order and the keys.

import { useEffect, useMemo, useState } from "react";

import {
  Chip,
  Chips,
  Column,
  Doc,
  DocSection,
  Entry,
  FlagChip,
  Figures,
  Ghost,
  Hint,
  Plate,
  Prose,
  ScoreChip,
  Sheet,
  Thumb,
  VerdictKeys,
  VerdictMark,
  pct,
} from "@/components/kit";
import type { ExtractManifest, ExtractVerdict, ExtractVerdicts, ExtractedStyle, ReplicaRound, Transfer } from "@/lib/foundry/extract/types";
import { OBSERVABLE_FIELDS } from "@/lib/foundry/extract/types";

import { activatesOnEnter } from "./CullGrid";
import { extractFileUrl } from "./extractClient";

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
    // its own order of work; the strip below already draws it, one rule per
    // source, and the count says how far it has got. The FAILURE line stays —
    // that is an outcome, not a mechanism.
    return (
      <div>
        {run.status === "failed" ? (
          <Prose>Nothing could be read back.</Prose>
        ) : (
          <div className="k-caps k-muted">
            sources {run.sources.filter((s) => s.readback).length}/{run.sources.length} read
          </div>
        )}
        <div className="mt-3">
          <Figures
            items={run.sources.map((s) => ({
              id: s.id,
              src: extractFileUrl(run.id, s.file),
              alt: s.name,
              caption: s.readback ? s.readback.render_mode : s.error ? "failed" : "…",
              state: s.readback ? "read" : s.error ? "failed" : undefined,
            }))}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="k-stack">
      {run.styles.map((st) => {
        const v = verdicts[st.id]?.verdict;
        const best = bestReplica(st);
        const transfer = meanScore(st.transfers.map((t) => t.score));
        return (
          <Entry
            key={st.id}
            id={`style-${st.id}`}
            label={st.name}
            focused={focused === st.id}
            verdict={v}
            onFocus={() => onFocus(st.id)}
            title={st.name}
            lede={
              <>
                <div className="k-muted">
                  {st.id} · {st.family} · {st.members.length} source{st.members.length === 1 ? "" : "s"} · grouped by {st.grouped_by}
                </div>
                <div className="mt-2">
                  <Chips>
                    {st.similar_to && st.similar_to.length > 0 && (
                      <Chip tone="gold">
                        ≈ {st.similar_to.join(", ")}
                        <Hint tone="amber" label="What the ≈ chip means">
                          declared observables differ by at most one minor field
                        </Hint>
                      </Chip>
                    )}
                    {OBSERVABLE_FIELDS.filter((f) => st.observables[f]).map((f) => (
                      <Chip key={f} name={f.replace(/_/g, " ")}>
                        {st.observables[f]}
                      </Chip>
                    ))}
                  </Chips>
                </div>
              </>
            }
            aside={
              <>
                <ScoreChip label="replica" value={best?.score ?? null} />
                <ScoreChip label="transfer" value={transfer} />
                {v && <VerdictMark verdict={v} />}
                {!readOnly && <VerdictKeys value={v} subject={`style ${st.name}`} toggle onVerdict={(next) => onVerdict(st.id, next)} />}
              </>
            }
          >
            <div className="mt-3">
              <Prose>{st.recipe}</Prose>
              {st.recipe_history.length > 1 && (
                <p className="k-muted mt-1">
                  recipe in force is round-tested · {st.recipe_history.length} tried · negative: {st.negative}
                </p>
              )}
            </div>

            <div className="k-cols">
              <Column label={`sources · ${st.members.length}`}>
                <div className="k-thumbs">
                  {st.members.map((mid) => {
                    const s = sourcesById.get(mid);
                    if (!s) return null;
                    return (
                      <Thumb
                        key={mid}
                        src={extractFileUrl(run.id, s.file)}
                        alt={s.name}
                        label={`Inspect source ${s.id}, ${s.name}`}
                        flag={s.readback?.has_text ? <FlagChip kind="text" /> : undefined}
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
                <div className="k-rounds">
                  {st.replicas.map((rep) => (
                    <div key={rep.source}>
                      <span className="k-muted">{rep.source}</span>
                      <div className="k-thumbs">
                        {rep.rounds.map((r) => (
                          <RoundThumb key={r.n} run={run.id} style={st} round={r} source={rep.source} onZoom={setZoom} />
                        ))}
                      </div>
                    </div>
                  ))}
                  {!st.replicas.length && <Ghost shape="slot" label="waiting for replicas" />}
                </div>
              </Column>

              <Column label="transfer · new scene">
                <div className="k-thumbs" style={{ gridTemplateColumns: "1fr" }}>
                  {st.transfers.map((t) => (
                    <TransferThumb key={t.scene} run={run.id} style={st} transfer={t} onZoom={setZoom} />
                  ))}
                  {!st.transfers.length && <Ghost shape="slot" label={run.options.transfers ? "waiting for transfers" : "transfers off"} />}
                </div>
              </Column>
            </div>
          </Entry>
        );
      })}

      <Sheet open={zoom !== null} onClose={() => setZoom(null)} title={zoom?.title ?? ""}>
        {zoom && (
          <Doc>
            <Plate>
              {/* eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam */}
              <img src={extractFileUrl(run.id, zoom.file)} alt={zoom.title} />
            </Plate>
            {zoom.perField && (
              <div className="mt-4">
                <Chips>
                  {Object.entries(zoom.perField).map(([f, hit]) => (
                    <Chip key={f} tone={hit === 1 ? undefined : "ant"}>
                      {f.replace(/_/g, " ")}
                      <span className="sr-only">{hit === 1 ? " matched" : " missed"}</span>
                    </Chip>
                  ))}
                </Chips>
              </div>
            )}
            {zoom.words.map((w) => (
              <DocSection key={w.label} label={w.label}>
                <Prose ink>{w.text || "—"}</Prose>
              </DocSection>
            ))}
          </Doc>
        )}
      </Sheet>
    </div>
  );
}

/* ── Thumbs ───────────────────────────────────────────────────────────────── */

function RoundThumb({ run, style, round, source, onZoom }: { run: string; style: ExtractedStyle; round: ReplicaRound; source: string; onZoom: (z: Zoom) => void }) {
  if (!round.file)
    return (
      <Chip tone="ant" wrap>
        r{round.n} failed
      </Chip>
    );
  return (
    <Thumb
      src={extractFileUrl(run, round.file)}
      alt={`${style.name} replica of ${source}, round ${round.n}`}
      label={`Inspect ${style.name} replica of ${source}, round ${round.n}`}
      inForce={round.recipe === style.recipe}
      flag={round.critique?.has_text ? <FlagChip kind="text" /> : undefined}
      chips={<ScoreChip label={`r${round.n}`} value={round.score} />}
      onOpen={() => {
        const z = roundZoom(style, round, source);
        if (z) onZoom(z);
      }}
    />
  );
}

function TransferThumb({ run, style, transfer, onZoom }: { run: string; style: ExtractedStyle; transfer: Transfer; onZoom: (z: Zoom) => void }) {
  if (!transfer.file)
    return (
      <Chip tone="ant" wrap>
        scene {transfer.scene + 1} failed
      </Chip>
    );
  return (
    <Thumb
      src={extractFileUrl(run, transfer.file)}
      alt={`${style.name} on scene ${transfer.scene + 1}`}
      label={`Inspect ${style.name} on scene ${transfer.scene + 1}`}
      flag={transfer.readback?.has_text ? <FlagChip kind="text" /> : undefined}
      chips={<ScoreChip label="style" value={transfer.score} />}
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
