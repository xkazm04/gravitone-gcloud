"use client";

// THE TRIAL MATRIX — six presets against five problems, read by row and column.
//
// A row is one preset across all five problems; a column is one problem across
// all presets. Each cell is the plate, with what the vision readback found
// drawn as signal glyphs: a "text" mark when text leaked in, a check when it
// drew what was asked, and a clutter tally. No cell carries a sentence.
//
// The selected preset's row lifts and its first cell is the clip. A cell the
// grader never read draws NO flags — absent is "not read", not "clean".

import { useEffect, useMemo, useState } from "react";
import { Check, CaseSensitive, ImageOff, X } from "lucide-react";

import Clip from "@/components/ui/Clip";
import { Segmented } from "@/components/ui/Field";
import { Tally } from "@/components/ui/signal";

import { clipPoster, clipSources, PRESETS, type Preset } from "./presets";
import { TRIALS } from "./trials";
import { buildMatrix, lanesOf, parseTrialIndex, type MatrixCell, type TrialIndex } from "./trialIndex";

const INDEX_URL = "/trials/index.json";

/** Prefer the lane the shelf is seeded from; otherwise the first one present. */
const DEFAULT_LANE = "google";

function Flags({ cell }: { cell: MatrixCell }) {
  const g = cell.entry?.grade;
  if (!g) return null;
  return (
    <div className="absolute inset-x-1 bottom-1 flex items-center gap-1">
      {g.hasText === true && (
        <span
          role="img"
          aria-label="text in the plate"
          data-flag="text"
          className="inline-flex rounded bg-rose-500/80 p-0.5 text-white"
        >
          <CaseSensitive className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}
      {g.drewWhatWasAsked !== undefined && (
        <span
          role="img"
          aria-label={g.drewWhatWasAsked ? "drew what was asked" : "did not draw what was asked"}
          data-flag="asked"
          className={`inline-flex rounded p-0.5 text-white ${g.drewWhatWasAsked ? "bg-emerald-500/80" : "bg-amber-500/80"}`}
        >
          {g.drewWhatWasAsked ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
        </span>
      )}
      {typeof g.clutter === "number" && (
        <Tally value={g.clutter} of={5} label="clutter" tone={g.clutter >= 4 ? "amber" : "neutral"} className="ml-auto" />
      )}
    </div>
  );
}

function Cell({ cell, presetName }: { cell: MatrixCell; presetName: string }) {
  const name = `${presetName} — ${cell.trial.label}`;
  return (
    <div
      data-cell={cell.trial.id}
      className="relative aspect-video overflow-hidden rounded-lg border border-white/8 bg-white/[0.03]"
    >
      {cell.entry ? (
        // eslint-disable-next-line @next/next/no-img-element -- static plates from public/trials; no optimizer step wanted
        <img src={cell.entry.file} alt={name} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span role="img" aria-label={`${name}: not rendered`} className="flex h-full items-center justify-center text-white/25">
          <ImageOff className="h-4 w-4" aria-hidden />
        </span>
      )}
      <Flags cell={cell} />
    </div>
  );
}

function FirstCell({ preset, lifted }: { preset: Preset; lifted: boolean }) {
  return lifted ? (
    <Clip
      key={preset.id}
      sources={clipSources(preset.id)}
      poster={clipPoster(preset.id)}
      label={`${preset.name} — ${preset.motion}`}
      className="aspect-video w-full rounded-lg bg-white/[0.03]"
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- static preset poster
    <img
      src={clipPoster(preset.id)}
      alt={preset.name}
      loading="lazy"
      className="aspect-video w-full rounded-lg border border-white/8 object-cover"
    />
  );
}

export default function TrialMatrix({ preset }: { preset: Preset }) {
  const [index, setIndex] = useState<TrialIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [laneChoice, setLaneChoice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(INDEX_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((raw: unknown) => {
        if (live) setIndex(parseTrialIndex(raw));
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const lanes = useMemo(() => (index ? lanesOf(index) : []), [index]);
  const lane =
    laneChoice && lanes.includes(laneChoice) ? laneChoice : lanes.includes(DEFAULT_LANE) ? DEFAULT_LANE : (lanes[0] ?? null);
  const rows = useMemo(() => (index && lane ? buildMatrix(index, lane, PRESETS, TRIALS) : []), [index, lane]);

  return (
    <section aria-label="Trial matrix" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.02] p-3">
      {lanes.length > 1 && lane && (
        <Segmented label="Provider" value={lane} options={lanes.map((l) => ({ id: l, label: l }))} onChange={setLaneChoice} />
      )}
      {failed && (
        <p role="alert" className="text-content text-rose-200">
          {INDEX_URL} could not be read
        </p>
      )}
      {!index && !failed && <div aria-busy="true" className="aspect-[6/1] animate-pulse rounded-xl bg-white/[0.03]" />}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <div className="min-w-[760px] space-y-2" role="table" aria-label="Presets by problem">
            <div role="row" className="grid grid-cols-[repeat(6,minmax(0,1fr))] gap-2">
              <span role="columnheader" className="sr-only">
                Preset
              </span>
              {TRIALS.map((t) => (
                <span
                  key={t.id}
                  role="columnheader"
                  className="font-jetbrains truncate text-label tracking-[0.12em] text-white/50 uppercase"
                >
                  {t.problem}
                </span>
              ))}
            </div>
            {rows.map((row) => {
              const lifted = row.preset.id === preset.id;
              return (
                <div
                  key={row.preset.id}
                  role="row"
                  data-row={row.preset.id}
                  data-lifted={lifted ? "" : undefined}
                  className={`grid grid-cols-[repeat(6,minmax(0,1fr))] items-start gap-2 rounded-xl p-1 transition ${
                    lifted ? "-translate-y-0.5 bg-white/[0.06] ring-1 ring-white/25" : ""
                  }`}
                >
                  <div role="rowheader" className="space-y-1">
                    <FirstCell preset={row.preset} lifted={lifted} />
                    <div className="font-instrument truncate text-content text-white">{row.preset.name}</div>
                  </div>
                  {row.cells.map((cell) => (
                    <div key={cell.trial.id} role="cell">
                      <Cell cell={cell} presetName={row.preset.name} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
