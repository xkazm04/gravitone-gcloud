"use client";

// STRENGTHS — what the judging taught, provider by provider.
//
// A heat table off GET /api/sound/insights (judged, non-fixture takes only):
// rows are one facet's values (genre · mood · instrument · technique; for
// effects, category · technique · mood), columns are providers, and a cell is
// how that provider fared on that value — keep rate, mean score, n, the defect
// that sank it most. A cell with fewer than three judged takes draws how much
// evidence it is still waiting for and NO figure (./model.ts#cellView): the
// knowledge doc this feeds claims nothing below n=3 (knowledge/README.md), and
// a 100% off one take is the most misleading number this page could print.
//
// A selected cell lists its takes and drafts a lesson — "when X, brief Y,
// because Z" — with the evidence computed from those takes. The operator
// rewrites the claim and confirms it; a lesson is never written without a
// human (lib/sound/types.ts#Lesson.confirmedAt). Where it goes is drawn, not
// said: ledger.json, then knowledge/audio/PATTERNS.md, which the prompt
// composers read back (pipeline/sound.mts knowledge).

import { useMemo, useState } from "react";

import { motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowRight, ArrowUp, BookOpen, Check, X } from "lucide-react";

import { useLoadFor } from "@/app/_phases/_shared/useLoadFor";
import { Panel } from "@/components/ui/Primitives";
import { Select } from "@/components/ui/Select";
import { Ghost, Hint, PipRow, Tally } from "@/components/ui/signal";
import { EASE } from "@/components/ui/tokens";
import { addLesson, getInsights } from "@/lib/sound/client";
import type { InsightCell, Lesson, ProviderId, SoundKind, SoundTake } from "@/lib/sound/types";

import { DefectChips, ProviderChip, TechniqueChips, VerdictChip } from "../shared/Chips";
import { PROVIDER_NAME, defectWord, meanScore } from "../shared/format";
import { ScoreMeter } from "../shared/Rubric";
import { useSoundLab } from "../shared/shell";
import { BTN_CYAN, CAPS, CAPS_BARE, CARD, FIELD, pill } from "../shared/ui";
import { PlayButton } from "../shared/Wave";

import {
  FACETS,
  FACET_WORD,
  MIN_N,
  cellView,
  claimDraft,
  evidenceFor,
  inCell,
  pivot,
  providerColumns,
  sortRows,
  type CellView,
  type Facet,
  type Sort,
} from "./model";

interface Insights {
  cells: InsightCell[];
  lessons: Lesson[];
  judged: number;
}

const HEAT: Record<-2 | -1 | 0 | 1 | 2, string> = {
  2: "bg-emerald-400/[0.16] border-emerald-400/30",
  1: "bg-emerald-400/[0.08] border-emerald-400/15",
  0: "bg-white/[0.035] border-white/8",
  [-1]: "bg-rose-400/[0.07] border-rose-400/15",
  [-2]: "bg-rose-400/[0.14] border-rose-400/30",
};
const HEAT_TEXT: Record<-2 | -1 | 0 | 1 | 2, string> = {
  2: "text-emerald-100",
  1: "text-emerald-100/85",
  0: "text-white/80",
  [-1]: "text-rose-100/85",
  [-2]: "text-rose-100",
};
const HATCH = "repeating-linear-gradient(45deg, currentColor 0 2px, transparent 2px 7px)";

type Picked = { provider: ProviderId; facet: Facet; value: string };

export default function Strengths({ kind, takes }: { kind: SoundKind; takes: SoundTake[] }) {
  const lab = useSoundLab();
  const reduce = useReducedMotion();
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  useLoadFor(
    `${kind}:${nonce}`,
    () => getInsights(kind),
    (r) => {
      if (!r.ok) {
        setError(r.error);
        return false;
      }
      setError(null);
      setData(r.data);
    },
  );

  const [facet, setFacet] = useState<Facet>(FACETS[kind][0]);
  const [sort, setSort] = useState<Sort>({ key: "keep", provider: "elevenlabs", dir: "desc" });
  const [picked, setPicked] = useState<Picked | null>(null);

  const cells = useMemo(() => data?.cells.filter((c) => c.kind === kind) ?? [], [data, kind]);
  const cols = providerColumns(cells);
  const rows = useMemo(() => sortRows(pivot(cells, facet), sort), [cells, facet, sort]);
  const measured = cells.filter((c) => c.facet === facet && c.n >= MIN_N).length;
  const total = cells.filter((c) => c.facet === facet).length;
  const pickedCell = picked ? cells.find((c) => c.provider === picked.provider && c.facet === picked.facet && c.value === picked.value) ?? null : null;
  const lessons = data?.lessons.filter((l) => l.kind === kind) ?? [];

  const sortBy = (key: Sort["key"], provider: ProviderId | null) =>
    setSort((s) =>
      s.key === key && s.provider === provider ? { ...s, dir: s.dir === "desc" ? "asc" : "desc" } : { key, provider, dir: key === "value" ? "asc" : "desc" },
    );

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
      <Panel as="section" aria-label="Provider strengths" className="grid min-w-0 gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="facet" className="flex flex-wrap gap-1.5">
            {FACETS[kind].map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={facet === f}
                onClick={() => {
                  setFacet(f);
                  setPicked(null);
                }}
                className={`${pill(facet === f)} px-3.5 py-1 font-jetbrains`}
              >
                {FACET_WORD[f]}
                <span className={facet === f ? "text-cyan-200/60" : "text-white/30"}>{pivot(cells, f).length}</span>
              </button>
            ))}
          </div>
          <span className="ml-auto flex items-center gap-2">
            {data && total > 0 && (
              <Tally
                value={measured}
                of={total}
                label={`n≥${MIN_N}`}
                tone={measured ? "emerald" : "amber"}
                hint={<Hint>a cell under {MIN_N} judged takes shows no rate</Hint>}
              />
            )}
            <Select<string>
              label="sort"
              value={sort.key}
              minWidth={200}
              options={[
                { value: "keep", label: "keep rate" },
                { value: "mean", label: "mean score" },
                { value: "n", label: "judged n" },
                { value: "value", label: "name" },
              ]}
              onChange={(k) => setSort((s) => ({ ...s, key: k as Sort["key"], dir: k === "value" ? "asc" : "desc" }))}
            />
          </span>
        </div>

        {error ? (
          <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/[0.06] px-4 py-2 font-hanken text-label text-rose-100">
            {error}
          </p>
        ) : !data ? (
          <Ghost shape="row" count={5} label="Reading the strengths" />
        ) : rows.length === 0 ? (
          <EmptyTable cols={cols} facet={facet} />
        ) : (
          <div role="table" aria-label={`${FACET_WORD[facet]} by provider`} className="grid gap-1.5">
            <div
              role="row"
              className="grid items-end gap-1.5 px-1 pb-1"
              style={{ gridTemplateColumns: `minmax(10rem,0.6fr) repeat(${cols.length}, minmax(0,1fr)) 4rem` }}
            >
              <SortHead label={FACET_WORD[facet]} on={sort.key === "value"} dir={sort.dir} onClick={() => sortBy("value", null)} />
              {cols.map((p) => (
                <SortHead
                  key={p}
                  label={PROVIDER_NAME[p]}
                  on={(sort.key === "keep" || sort.key === "mean") && sort.provider === p}
                  dir={sort.dir}
                  onClick={() => sortBy(sort.key === "mean" ? "mean" : "keep", p)}
                  provider={p}
                />
              ))}
              <SortHead label="n" on={sort.key === "n"} dir={sort.dir} onClick={() => sortBy("n", null)} align="right" />
            </div>
            {rows.map((r, i) => (
              <motion.div
                key={r.value}
                role="row"
                layout={reduce ? false : "position"}
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: EASE, delay: reduce ? 0 : Math.min(i, 12) * 0.015 }}
                className="grid items-stretch gap-1.5"
                style={{ gridTemplateColumns: `minmax(10rem,0.6fr) repeat(${cols.length}, minmax(0,1fr)) 4rem` }}
              >
                <span role="rowheader" className="flex items-center truncate px-2 font-instrument text-lg text-white/90">
                  {r.value}
                </span>
                {cols.map((p) => (
                  <Cell
                    key={p}
                    view={cellView(r.cells[p])}
                    label={`${PROVIDER_NAME[p]} on ${r.value}`}
                    on={picked?.provider === p && picked.value === r.value && picked.facet === facet}
                    onPick={() => setPicked({ provider: p, facet, value: r.value })}
                  />
                ))}
                <span className="flex items-center justify-end px-2 font-jetbrains text-label tabular-nums text-white/45">{r.n}</span>
              </motion.div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid min-w-0 gap-5">
        {pickedCell ? (
          <CellDetail
            key={`${pickedCell.provider}:${pickedCell.facet}:${pickedCell.value}`}
            cell={pickedCell}
            kind={kind}
            takes={takes}
            onSaved={() => {
              setNonce((n) => n + 1);
              lab.say("lesson confirmed · ledger");
            }}
          />
        ) : (
          <Panel className="grid gap-3 p-5">
            <span className={CAPS}>cell</span>
            <Ghost shape="slot" count={2} label="No cell selected" />
          </Panel>
        )}
        <LessonList lessons={lessons} />
      </div>
    </div>
  );
}

function SortHead({
  label,
  on,
  dir,
  onClick,
  provider,
  align = "left",
}: {
  label: string;
  on: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  provider?: ProviderId;
  align?: "left" | "right";
}) {
  const Arrow = dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <span role="columnheader" aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"} className={align === "right" ? "text-right" : ""}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 ${CAPS_BARE} transition ${
          on ? "text-cyan-200" : "text-white/40 hover:text-white/70"
        }`}
      >
        {provider ? <ProviderChip provider={provider} className="!normal-case !tracking-normal" /> : label}
        {on && <Arrow className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </span>
  );
}

function Cell({ view, label, on, onPick }: { view: CellView; label: string; on: boolean; onPick: () => void }) {
  const ring = on ? "ring-2 ring-cyan-300/60 shadow-[0_0_18px] shadow-cyan-400/15" : "";
  if (view.state === "empty") {
    return (
      <span role="cell" aria-label={`${label}: nothing judged`} className="grid min-h-16 place-items-center rounded-xl border border-white/[0.04]">
        <span aria-hidden className="h-1 w-1 rounded-full bg-white/15" />
      </span>
    );
  }
  if (view.state === "insufficient") {
    return (
      <button
        type="button"
        role="cell"
        onClick={onPick}
        aria-label={`${label}: ${view.n} judged, ${view.need} more before a rate is shown`}
        className={`relative grid min-h-16 cursor-pointer place-items-center overflow-hidden rounded-xl border border-white/8 transition hover:border-white/20 ${ring}`}
      >
        <span aria-hidden className="absolute inset-0 text-white/[0.05]" style={{ backgroundImage: HATCH }} />
        <span className="relative flex flex-col items-center gap-1.5">
          <PipRow states={Array.from({ length: view.n }, () => "filled" as const)} max={MIN_N} label={`${view.n} of ${MIN_N} judged`} />
          <span className="font-jetbrains text-label text-white/30">insufficient</span>
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      role="cell"
      onClick={onPick}
      aria-label={`${label}: kept ${view.keepPct} of ${view.n}${view.mean ? `, mean ${view.mean}` : ""}${view.topDefect ? `, most often ${defectWord(view.topDefect)}` : ""}`}
      className={`grid min-h-16 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 rounded-xl border px-3 py-2 text-left transition hover:brightness-125 ${HEAT[view.heat]} ${ring}`}
    >
      <span aria-hidden className={`font-jetbrains text-2xl tabular-nums leading-none ${HEAT_TEXT[view.heat]}`}>{view.keepPct}</span>
      <span aria-hidden className="grid min-w-0 gap-0.5 font-jetbrains text-label leading-tight">
        <span className="text-white/55 tabular-nums">
          {view.mean ?? "–"} <span className="text-white/30">· n {view.n}</span>
        </span>
        {view.topDefect && (
          <span className="flex min-w-0 items-center gap-1 text-rose-200/70">
            <X className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{defectWord(view.topDefect)}</span>
          </span>
        )}
      </span>
    </button>
  );
}

/** No judged take of this kind yet: the table's shape, providers named, no rows of numbers. */
function EmptyTable({ cols, facet }: { cols: ProviderId[]; facet: Facet }) {
  return (
    <div className="grid gap-1.5" aria-label={`No ${FACET_WORD[facet]} judged yet`}>
      <div className="grid items-end gap-1.5 px-1 pb-1" style={{ gridTemplateColumns: `minmax(10rem,0.6fr) repeat(${cols.length}, minmax(0,1fr)) 4rem` }}>
        <span className={`${CAPS} px-2`}>{FACET_WORD[facet]}</span>
        {cols.map((p) => (
          <span key={p} className="px-2">
            <ProviderChip provider={p} />
          </span>
        ))}
        <span />
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          aria-hidden
          style={{ gridTemplateColumns: `minmax(10rem,0.6fr) repeat(${cols.length}, minmax(0,1fr)) 4rem`, opacity: 0.7 - i * 0.14 }}
          className="grid gap-1.5"
        >
          <span className="flex items-center px-2">
            <span className="h-3 w-28 rounded-full bg-white/[0.07]" />
          </span>
          {cols.map((p) => (
            <span key={p} className="relative h-16 overflow-hidden rounded-xl border border-dashed border-white/20">
              <span className="absolute inset-0 text-white/[0.07]" style={{ backgroundImage: HATCH }} />
            </span>
          ))}
          <span />
        </div>
      ))}
    </div>
  );
}

/* ── a selected cell: its takes, and a lesson drawn from them ─────────── */

function CellDetail({ cell, kind, takes, onSaved }: { cell: InsightCell; kind: SoundKind; takes: SoundTake[]; onSaved: () => void }) {
  const view = cellView(cell);
  const mine = useMemo(
    () =>
      takes
        .filter((t) => inCell(t, cell.provider, cell.facet, cell.value))
        .sort((a, b) => (meanScore(b) ?? -1) - (meanScore(a) ?? -1)),
    [takes, cell],
  );
  const ev = evidenceFor(takes, cell);
  const [claim, setClaim] = useState(() => claimDraft(cell, kind));
  const [state, setState] = useState<{ busy: boolean; error: string | null; saved: boolean }>({ busy: false, error: null, saved: false });
  const enough = view.state === "measured";

  const save = async () => {
    setState({ busy: true, error: null, saved: false });
    const r = await addLesson({
      kind,
      source: "triage",
      provider: cell.provider,
      huntId: null,
      claim: claim.trim(),
      technique: cell.facet === "technique" ? [cell.value] : [],
      evidence: ev,
    });
    if (!r.ok) return setState({ busy: false, error: r.error, saved: false });
    setState({ busy: false, error: null, saved: true });
    onSaved();
  };

  return (
    <Panel as="section" aria-label="Selected cell" className="grid min-w-0 gap-5 p-5 [&>*]:min-w-0">
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <ProviderChip provider={cell.provider} />
          <span className={CAPS}>{FACET_WORD[cell.facet]}</span>
        </div>
        <h2 className="font-instrument text-2xl leading-tight text-white">{cell.value}</h2>
        <span className="flex flex-wrap items-center gap-1.5">
          {view.state === "measured" ? (
            <>
              <Tally value={cell.kept} of={cell.n} label="kept" tone={view.heat > 0 ? "emerald" : view.heat < 0 ? "rose" : "neutral"} />
              {view.mean && <Tally value={Number(view.mean)} label="mean" />}
              {cell.topDefect && cell.rejected > 0 && <DefectChips reasons={[cell.topDefect]} />}
            </>
          ) : (
            <PipRow states={Array.from({ length: cell.n }, () => "filled" as const)} max={MIN_N} label={`${cell.n} of ${MIN_N} judged`} />
          )}
        </span>
      </div>

      <div className="grid gap-1.5">
        <span className={CAPS}>takes</span>
        {mine.length === 0 ? (
          <Ghost shape="row" count={2} label="No takes behind this cell on this page" />
        ) : (
          <ul className="grid max-h-72 gap-1 overflow-auto pr-1">
            {mine.map((t) => (
              <li key={t.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-1.5 py-1.5 hover:bg-white/[0.03]">
                <PlayButton take={t} size="sm" />
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate font-instrument text-content text-white/90">{t.title}</span>
                  {t.verdict === "rejected" && t.reasons.length > 0 && (
                    <span className="truncate font-jetbrains text-label text-rose-200/60">{t.reasons.map(defectWord).join(" · ")}</span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <ScoreMeter take={t} />
                  <VerdictChip take={t} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-2.5 border-t border-white/6 pt-4">
        <div className="flex items-center justify-between gap-2">
          <span className={CAPS}>lesson</span>
          {!enough && <Hint variant="lock">needs {MIN_N} judged takes behind the cell</Hint>}
        </div>
        <textarea
          value={claim}
          onChange={(e) => setClaim(e.target.value)}
          rows={4}
          disabled={!enough || state.saved}
          aria-label="Lesson claim"
          className={`${FIELD} resize-y text-content leading-snug disabled:opacity-50`}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-jetbrains text-label tabular-nums text-white/55">
            n {ev.n}
            {ev.keepRate != null && <> · keep {Math.round(ev.keepRate * 100)}%</>}
            {ev.meanScore != null && <> · mean {ev.meanScore.toFixed(1)}</>}
            <span className="text-white/30"> · {ev.takeIds.length} take ids</span>
          </span>
          {cell.facet === "technique" && <TechniqueChips technique={[cell.value]} empty={null} />}
        </div>
        <LessonRoute />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!enough || state.busy || state.saved || claim.trim().length < 12}
            className={`${BTN_CYAN} ${state.busy ? "animate-pulse" : ""}`}
          >
            <Check className="h-4 w-4" aria-hidden />
            {state.saved ? "confirmed" : "confirm lesson"}
          </button>
          {state.error && <span role="alert" className="font-hanken text-label text-rose-200/90">{state.error}</span>}
        </div>
      </div>
    </Panel>
  );
}

/** Where a confirmed lesson travels, drawn: the ledger, then the knowledge
 *  doc the prompt composers read. File names are the work, not narration. */
function LessonRoute() {
  const hop = "rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-jetbrains text-label text-white/60";
  return (
    <span role="img" aria-label="lesson goes to pipeline/sound/ledger.json, then knowledge/audio/PATTERNS.md" className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span aria-hidden className={hop}>ledger.json</span>
      <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-white/30" />
      <span aria-hidden className={`${hop} inline-flex items-center gap-1 border-cyan-400/25 text-cyan-100/80`}>
        <BookOpen className="h-3.5 w-3.5" aria-hidden />
        knowledge/audio
      </span>
    </span>
  );
}

function LessonList({ lessons }: { lessons: Lesson[] }) {
  return (
    <Panel as="section" aria-label="Confirmed lessons" className="grid min-w-0 gap-3 p-5">
      <div className="flex items-center justify-between">
        <span className={CAPS}>lessons</span>
        <Tally value={lessons.length} label="confirmed" tone={lessons.length ? "cyan" : "neutral"} />
      </div>
      {lessons.length === 0 ? (
        <Ghost shape="row" count={2} label="No lesson confirmed yet" />
      ) : (
        <ul className="grid gap-2">
          {[...lessons].reverse().map((l) => (
            <li key={l.id} className={`${CARD} grid gap-2 px-3.5 py-3`}>
              <p className="font-hanken text-content leading-snug text-white/85">{l.claim}</p>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-jetbrains text-label text-white/40">
                {l.provider && <ProviderChip provider={l.provider} />}
                <span>{l.source}</span>
                <span className="tabular-nums">
                  n {l.evidence.n}
                  {l.evidence.keepRate != null && ` · ${Math.round(l.evidence.keepRate * 100)}%`}
                  {l.evidence.meanScore != null && ` · ${l.evidence.meanScore.toFixed(1)}`}
                </span>
                <span>{l.confirmedAt.slice(0, 10)}</span>
              </span>
              {l.technique.length > 0 && <TechniqueChips technique={l.technique} empty={null} />}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

