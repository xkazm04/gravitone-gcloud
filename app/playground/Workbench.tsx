"use client";

// 1 · WORKBENCH — one dense studio for the quick loop: generate → listen →
// judge → vary, without leaving the keys.
//
//   left     the recipe (the Library's vocabulary, each term with its
//            keep-rate) and the engine it goes to: ElevenLabs live, Suno by
//            hand, Local declared
//   centre   the takes rack — every take the lab made or received, newest
//            first, real waveforms, the rubric on the selected row
//   right    the inspector — what the take was asked for against what was
//            measured on it, its prompt verbatim, its lineage, and the
//            one-change variations the book proposes from it
//
// Keys are the Library ledger's (app/library/audio/AudioWorkbench.tsx#onKey),
// so a hand trained on one works on the other.

import { useEffect, useMemo, useState } from "react";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Layers, RotateCcw } from "lucide-react";

import { Panel } from "@/components/ui/Primitives";
import { Ghost, Keycaps, Tally } from "@/components/ui/signal";
import { EASE } from "@/components/ui/tokens";
import {
  RUBRIC,
  ago,
  compose,
  counts,
  dimsFor,
  OPENED_AT,
  variations,
  verdict,
  type Take,
} from "@/app/library/audio/book";
import type { WirePlan } from "@/lib/music/types";

import { engineById, type EngineDef } from "./engines";
import { SFX_PRESETS, isEditable, isGenChunk, planMs, seams, sectionName, spans } from "./labModel";
import {
  BTN,
  CAPS,
  CARD,
  EngineStatus,
  FIELD,
  FreeTag,
  JudgeBar,
  LocalLane,
  PlayToggle,
  RecipeEditor,
  Rubric,
  Scores,
  SpendButton,
  SunoLane,
  TakeFacts,
  TakeWave,
  VERDICT_TONE,
  VerdictChip,
  Withheld,
  usePlay,
} from "./parts";
import type { LabState } from "./PlaygroundView";
import type { Lab } from "./useLab";

type Filter = "lab" | "unjudged" | "all";
const PAGE = 60;

const isField = (el: Element | null) =>
  !!el &&
  (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
    (el as HTMLElement).isContentEditable ||
    !!el.closest('[role="combobox"],[role="listbox"]'));

export default function Workbench({ lab, state }: { lab: Lab; state: LabState }) {
  const [filter, setFilter] = useState<Filter>(lab.labTakes.length ? "lab" : "unjudged");
  const [limit, setLimit] = useState(PAGE);
  const [dim, setDim] = useState(0);

  const rows = useMemo(() => {
    const base = filter === "lab" ? lab.labTakes : lab.takes.filter((t) => filter === "all" || verdict(t) === "unjudged");
    return [...base].sort((a, b) => b.created_at - a.created_at);
  }, [filter, lab.labTakes, lab.takes]);
  const shown = rows.slice(0, limit);
  const sel = (state.selected && lab.byId.get(state.selected)) || shown[0];
  const c = counts(lab.labTakes);
  /** A new selection starts scoring at its first dimension. The Library keeps
   *  the ringed dimension across rows; at the lab's pace that put "8 9 7" for
   *  the next take all onto QUA (measured 2026-10-05), so here it resets. */
  const pick = (id: string) => {
    if (id !== sel?.id) setDim(0);
    state.select(id);
  };

  // ── keys: the ledger's map ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isField(e.target as Element | null) || e.ctrlKey || e.metaKey || e.altKey || !sel) return;
      const k = e.key;
      const dims = dimsFor(sel);
      const cur = dims.includes(dim) ? dim : dims[0];
      const ids = shown.map((t) => t.id);
      if (k === "ArrowDown" || k === "ArrowUp" || k === "j" || k === "k") {
        e.preventDefault();
        const i = ids.indexOf(sel.id);
        const n = ids[Math.max(0, Math.min(ids.length - 1, i + (k === "ArrowDown" || k === "j" ? 1 : -1)))];
        if (n) pick(n);
      } else if (k === "ArrowRight" || k === "ArrowLeft") {
        e.preventDefault();
        const np = dims.indexOf(cur) + (k === "ArrowRight" ? 1 : -1);
        setDim(dims[Math.max(0, Math.min(dims.length - 1, np))]);
      } else if (/^[0-9]$/.test(k)) {
        e.preventDefault();
        const pos = dims.indexOf(cur);
        lab.rate(sel.id, RUBRIC[cur].key, k === "0" ? 10 : Number(k));
        setDim(pos < dims.length - 1 ? dims[pos + 1] : cur);
      } else if (k === "Enter") {
        e.preventDefault();
        lab.keep(sel.id);
      } else if (k === "x" || k === "X" || k === "Backspace") {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>(`[data-reject="${sel.id}"] [role="combobox"]`)?.click();
      } else if (k === "u" || k === "U") {
        lab.clear(sel.id);
      } else if (k === " ") {
        e.preventDefault();
        lab.engine.toggle(sel, lab.urlFor(sel));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[400px_minmax(0,1fr)_400px]">
      <RecipeColumn lab={lab} state={state} />

      {/* ── the rack ── */}
      <section aria-label="Takes" className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["lab", "lab", lab.labTakes.length],
              ["unjudged", "unjudged", lab.takes.filter((t) => verdict(t) === "unjudged").length],
              ["all", "all audio", lab.takes.length],
            ] as const
          ).map(([id, word, n]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id);
                setLimit(PAGE);
              }}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1 font-jetbrains text-label transition ${
                filter === id
                  ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100 shadow-[0_0_12px] shadow-cyan-400/15"
                  : "border-white/10 text-white/60 hover:border-white/25 hover:text-white"
              }`}
            >
              {word}
              <span className={filter === id ? "text-cyan-200/70" : "text-white/35"}>{n}</span>
            </button>
          ))}
          <span className="ml-auto flex items-center gap-2">
            <Tally value={c.proven + c.kept} of={lab.labTakes.length} label="kept" tone="emerald" />
            <Tally value={c.unjudged} label="to judge" tone={c.unjudged ? "amber" : "neutral"} />
            <Keycaps
              map={[
                { keys: ["↑", "↓"], does: "move" },
                { keys: ["Space"], does: "play" },
                { keys: ["←", "→"], does: "dimension" },
                { keys: ["1", "…", "0"], does: "score" },
                { keys: ["Enter"], does: "keep" },
                { keys: ["X"], does: "reject" },
                { keys: ["U"], does: "clear" },
              ]}
            />
          </span>
        </div>

        <Panel className="grid gap-1.5 p-2">
          {lab.pending.map((p) => (
            <div
              key={`p${p.id}`}
              className="grid grid-cols-[36px_minmax(0,15rem)_minmax(0,1fr)] items-center gap-4 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.04] px-3 py-3"
            >
              <span aria-hidden className="h-9 w-9 animate-pulse rounded-full border border-cyan-300/40" />
              <span className="truncate font-jetbrains text-label text-cyan-100/80">{p.label}</span>
              <span aria-hidden className="h-8 animate-pulse rounded-lg bg-gradient-to-r from-cyan-400/10 via-cyan-300/20 to-cyan-400/5" />
            </div>
          ))}
          {shown.length === 0 && lab.pending.length === 0 ? (
            <EmptyLab filter={filter} />
          ) : (
            shown.map((t) => (
              <TakeRow
                key={t.id}
                lab={lab}
                take={t}
                selected={sel?.id === t.id}
                dim={dim}
                onDim={setDim}
                onSelect={() => pick(t.id)}
              />
            ))
          )}
          {rows.length > shown.length && (
            <button type="button" onClick={() => setLimit((l) => l + PAGE)} className={`${BTN} m-1 justify-self-center`}>
              {shown.length} of {rows.length} · more
            </button>
          )}
        </Panel>
      </section>

      {sel ? (
        <Inspector lab={lab} state={state} take={sel} />
      ) : (
        <Panel className="p-5">
          <Ghost shape="slot" count={3} label="No take selected" />
        </Panel>
      )}
    </div>
  );
}

/* ── the recipe column ─────────────────────────────────────────────────── */

type ElOp = "compose" | "plan" | "sfx";

const TRANSPORT_WORD: Record<EngineDef["transport"], string> = {
  api: "api",
  manual: "copy · drop",
  none: "—",
};

function RecipeColumn({ lab, state }: { lab: Lab; state: LabState }) {
  const { recipe } = state;
  const engine = engineById(lab.reg, state.engineId)!;
  const parent = recipe.parentId ? lab.byId.get(recipe.parentId) : undefined;

  return (
    <Panel as="section" className="grid min-w-0 gap-5 p-5 [&>*]:min-w-0">
      <h2 className="sr-only">Recipe and engine</h2>
      <div role="radiogroup" aria-label="Engine" className="grid gap-1.5">
        {lab.reg.map((e) => {
          const on = e.id === state.engineId;
          return (
            <button
              key={e.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => state.setEngineId(e.id)}
              className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3.5 py-2 text-left transition ${
                on
                  ? "border-cyan-400/50 bg-cyan-400/[0.08] shadow-[0_0_16px] shadow-cyan-400/10"
                  : "border-white/8 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
              }`}
            >
              <span className="flex min-w-0 items-baseline gap-2.5">
                <span className={`font-instrument text-content leading-tight ${on ? "text-white" : "text-white/80"}`}>{e.name}</span>
                <span className="truncate font-jetbrains text-label text-white/30">{TRANSPORT_WORD[e.transport]}</span>
              </span>
              <EngineStatus engine={e} />
            </button>
          );
        })}
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className={CAPS}>recipe</span>
          {parent && (
            <button
              type="button"
              onClick={() => state.select(parent.id)}
              className="truncate font-jetbrains text-label text-white/40 hover:text-cyan-200"
            >
              ↳ {parent.title}
            </button>
          )}
        </div>
        <RecipeEditor
          seed={recipe.seed}
          voc={lab.voc}
          onChange={(seed) => state.setRecipe({ ...recipe, seed, prompt: null })}
        />
      </div>

      <div className="h-px bg-white/8" />

      {engine.id === "elevenlabs" ? (
        <ElevenLane lab={lab} state={state} engine={engine} />
      ) : engine.id === "suno" ? (
        <SunoLane lab={lab} seed={recipe.seed} parent={parent} />
      ) : (
        <LocalLane engine={engine} />
      )}
    </Panel>
  );
}

function ElevenLane({ lab, state, engine }: { lab: Lab; state: LabState; engine: EngineDef }) {
  const { recipe } = state;
  const [op, setOp] = useState<ElOp>("compose");
  const [plan, setPlan] = useState<WirePlan | null>(null);
  const [sfxAt, setSfxAt] = useState(0);
  const [sfxLoop, setSfxLoop] = useState(SFX_PRESETS[0].loop);
  const [sfxText, setSfxText] = useState(SFX_PRESETS[0].text);
  const [sfxS, setSfxS] = useState(SFX_PRESETS[0].seconds);
  const composed = compose(recipe.seed, "elevenlabs", lab.book.hands);
  const prompt = recipe.prompt ?? composed;
  const parent = recipe.parentId ? lab.byId.get(recipe.parentId) : undefined;
  const busy = lab.pending.length > 0;
  const withheld = (o: ElOp) => engine.withheld.find((w) => w.op === o);

  return (
    <div className="grid gap-3.5">
      <div role="tablist" aria-label="Operation" className="flex gap-1 rounded-full border border-white/8 bg-white/[0.02] p-1">
        {(
          [
            ["compose", "quick"],
            ["plan", "plan"],
            ["sfx", "effect"],
          ] as const
        ).map(([id, word]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={op === id}
            onClick={() => setOp(id)}
            className={`flex-1 cursor-pointer rounded-full px-3 py-1 font-jetbrains text-label transition ${
              op === id ? "bg-white/[0.09] text-white" : "text-white/50 hover:text-white/80"
            } ${withheld(id) ? "line-through decoration-white/30" : ""}`}
          >
            {word}
          </button>
        ))}
      </div>

      {withheld(op) ? (
        <Withheld title={op === "sfx" ? "Effects" : op === "plan" ? "Plan" : "Quick take"} reason={withheld(op)!.reason} />
      ) : op === "sfx" ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {SFX_PRESETS.map((p, i) => (
              <button
                key={p.label}
                type="button"
                aria-pressed={sfxAt === i}
                onClick={() => {
                  setSfxAt(i);
                  setSfxText(p.text);
                  setSfxS(p.seconds);
                  setSfxLoop(p.loop);
                }}
                className={`cursor-pointer rounded-full border px-3 py-0.5 font-hanken text-label transition ${
                  sfxAt === i ? "border-cyan-400/45 bg-cyan-400/10 text-cyan-100" : "border-white/12 text-white/65 hover:border-white/25"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <textarea value={sfxText} onChange={(e) => setSfxText(e.target.value)} rows={3} aria-label="Effect prompt" className={FIELD} />
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1">
              <span className={CAPS}>seconds</span>
              <input
                type="number"
                min={0.5}
                max={30}
                step={0.5}
                value={sfxS}
                onChange={(e) => setSfxS(Number(e.target.value))}
                className={`${FIELD} w-24 font-jetbrains`}
              />
            </label>
            <label className="mb-2 flex cursor-pointer items-center gap-2 font-jetbrains text-label text-white/60">
              <input type="checkbox" checked={sfxLoop} onChange={(e) => setSfxLoop(e.target.checked)} className="accent-cyan-400" />
              loop
            </label>
            <span className="ml-auto">
              <SpendButton
                lab={lab}
                seconds={sfxS}
                busy={busy}
                onClick={() =>
                  void lab
                    .sfx({ text: sfxText, seconds: sfxS, influence: 0.7, loop: sfxLoop, category: SFX_PRESETS[sfxAt].category })
                    .then((t) => t && state.select(t.id))
                }
              >
                render effect
              </SpendButton>
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <span className={CAPS}>prompt</span>
              {recipe.prompt != null && (
                <button
                  type="button"
                  onClick={() => state.setRecipe({ ...recipe, prompt: null })}
                  aria-label="Compose the prompt from the recipe again"
                  className="inline-flex cursor-pointer items-center gap-1 font-jetbrains text-label text-white/40 hover:text-cyan-200"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  recipe
                </button>
              )}
            </div>
            <textarea
              value={prompt}
              onChange={(e) => state.setRecipe({ ...recipe, prompt: e.target.value })}
              rows={4}
              aria-label="Prompt sent to ElevenLabs"
              className={`${FIELD} leading-snug`}
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1">
              <span className={CAPS}>seconds</span>
              <input
                type="number"
                min={5}
                max={300}
                value={recipe.lengthS}
                onChange={(e) => state.setRecipe({ ...recipe, lengthS: Number(e.target.value) })}
                className={`${FIELD} w-24 font-jetbrains tabular-nums`}
              />
            </label>
            <span className="ml-auto flex items-start gap-2">
              {op === "plan" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void lab.draft(recipe.seed, recipe.lengthS, prompt).then((p) => p && setPlan(p))}
                  className={`${BTN} mt-0`}
                >
                  draft plan <FreeTag />
                </button>
              )}
              {op === "compose" ? (
                <SpendButton
                  lab={lab}
                  seconds={recipe.lengthS}
                  busy={busy}
                  onClick={() =>
                    void lab.quick(recipe.seed, recipe.lengthS, prompt, { parent }).then((t) => t && state.select(t.id))
                  }
                >
                  render
                </SpendButton>
              ) : (
                plan && (
                  <SpendButton
                    lab={lab}
                    seconds={planMs(plan) / 1000}
                    busy={busy}
                    onClick={() =>
                      void lab.renderPlan(plan, recipe.seed, prompt, { parent }).then((t) => t && state.select(t.id))
                    }
                  >
                    render plan
                  </SpendButton>
                )
              )}
            </span>
          </div>
          {op === "plan" && plan && <PlanStrip plan={plan} />}
        </>
      )}
    </div>
  );
}

/** A plan's sections as a strip, each as wide as it is long. */
export function PlanStrip({ plan, active }: { plan: WirePlan; active?: number | null }) {
  const gen = plan.chunks.filter(isGenChunk);
  return (
    <div
      role="img"
      aria-label={`Plan: ${gen.length} sections, ${Math.round(planMs(plan) / 1000)} seconds`}
      className="flex gap-1"
    >
      {plan.chunks.map((c, i) => (
        <span
          key={i}
          style={{ flexGrow: isGenChunk(c) ? c.duration_ms : c.range.end_ms - c.range.start_ms, flexBasis: 0 }}
          className={`grid min-w-0 gap-0.5 overflow-hidden rounded-lg border px-2 py-1.5 ${
            active === i ? "border-cyan-300/50 bg-cyan-400/10" : "border-white/10 bg-white/[0.03]"
          }`}
        >
          <span className="sr-only">{sectionName(c, i)}</span>
          <span aria-hidden className="flex items-baseline justify-between gap-1 overflow-hidden whitespace-nowrap font-jetbrains text-label tabular-nums">
            <span className={active === i ? "text-cyan-100" : "text-white/70"}>{i + 1}</span>
            <span className="truncate text-white/30">
              {Math.round((isGenChunk(c) ? c.duration_ms : c.range.end_ms - c.range.start_ms) / 1000)}s
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}

/* ── a row in the rack ─────────────────────────────────────────────────── */

function TakeRow({
  lab,
  take,
  selected,
  dim,
  onDim,
  onSelect,
}: {
  lab: Lab;
  take: Take;
  selected: boolean;
  dim: number;
  onDim: (d: number) => void;
  onSelect: () => void;
}) {
  const reduce = useReducedMotion();
  const v = verdict(take);
  const parent = take.parent_id ? lab.byId.get(take.parent_id) : undefined;
  const marks = take.plan ? seams(take.plan.chunks) : [];
  const tints =
    take.plan && take.edit_modes
      ? spans(take.plan.chunks).filter((_, i) => (take.edit_modes![i] ?? "keep") !== "keep")
      : [];
  return (
    <motion.div
      layout={reduce ? false : "position"}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
      data-id={take.id}
      onClick={onSelect}
      className={`group cursor-pointer rounded-xl border px-3 py-2.5 transition ${
        selected
          ? "border-cyan-400/45 bg-cyan-400/[0.05] shadow-[0_0_18px] shadow-cyan-400/10"
          : "border-transparent hover:border-white/12 hover:bg-white/[0.035]"
      }`}
    >
      <div className="grid grid-cols-[36px_minmax(0,15rem)_minmax(0,1fr)_7.5rem_6.5rem] items-center gap-4">
        <PlayToggle lab={lab} take={take} />
        <span className="grid min-w-0 gap-0.5">
          <button
            type="button"
            onClick={onSelect}
            aria-current={selected || undefined}
            className="truncate text-left font-instrument text-content leading-tight text-white"
          >
            {take.title}
          </button>
          <TakeFacts take={take} parent={parent} />
        </span>
        <TakeWave lab={lab} take={take} height="h-10" seams={marks} tints={tints} seamTone="quiet" />
        <Scores take={take} />
        <span className="flex justify-end">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-jetbrains text-label ${VERDICT_TONE[v].ring} ${VERDICT_TONE[v].text}`}
          >
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${VERDICT_TONE[v].dot}`} />
            {VERDICT_TONE[v].word}
          </span>
        </span>
      </div>
      {selected && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-6 border-t border-white/6 pt-3 pl-[52px]"
        >
          <Rubric take={take} dim={dim} onDim={onDim} onRate={(k, n) => lab.rate(take.id, k, n)} />
          <span data-reject={take.id}>
            <JudgeBar lab={lab} take={take} />
          </span>
        </div>
      )}
    </motion.div>
  );
}

function EmptyLab({ filter }: { filter: Filter }) {
  return (
    <div className="grid gap-1.5 p-1">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          aria-hidden
          style={{ opacity: 0.55 - i * 0.12 }}
          className="grid grid-cols-[36px_minmax(0,15rem)_minmax(0,1fr)] items-center gap-4 rounded-xl border border-white/6 px-3 py-3"
        >
          <span className="h-9 w-9 rounded-full border border-white/12" />
          <span className="grid gap-1.5">
            <span className="h-3 w-32 rounded-full bg-white/[0.07]" />
            <span className="h-2.5 w-20 rounded-full bg-white/[0.05]" />
          </span>
          <span className="flex h-8 items-center gap-[3px]">
            {Array.from({ length: 64 }, (_, k) => (
              <span key={k} style={{ height: `${20 + ((k * 37) % 60)}%` }} className="flex-1 rounded-full bg-white/[0.06]" />
            ))}
          </span>
        </div>
      ))}
      <span className="sr-only">{filter === "lab" ? "No take rendered or returned yet" : "Nothing here"}</span>
    </div>
  );
}

/* ── the inspector ─────────────────────────────────────────────────────── */

function Inspector({ lab, state, take }: { lab: Lab; state: LabState; take: Take }) {
  const st = usePlay(lab.engine);
  const parent = take.parent_id ? lab.byId.get(take.parent_id) : undefined;
  const children = lab.takes.filter((t) => t.parent_id === take.id);
  const vars = variations(take, lab.voc).slice(0, 5);
  const playing = st?.id === take.id && st.playing;
  const activeSection =
    playing && take.plan
      ? spans(take.plan.chunks).findIndex(([a, b]) => {
          const f = (st?.position ?? 0) / (st?.duration || 1);
          return f >= a && f < b;
        })
      : null;
  const asked = [take.tempo_bpm ? `${Math.round(take.tempo_bpm)} BPM` : null, take.key].filter(Boolean).join(" · ");
  const m = take.measured;
  const tempoOff = m && take.tempo_bpm ? Math.abs(m.tempo_bpm - take.tempo_bpm) / take.tempo_bpm > 0.04 : false;
  const keyOff = m && take.key ? m.key !== take.key : false;

  return (
    <Panel as="aside" className="grid min-w-0 gap-5 p-5 xl:sticky xl:top-4 [&>*]:min-w-0">
      <div className="grid gap-2">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-instrument text-2xl leading-tight text-white">{take.title}</h2>
          <VerdictChip take={take} className="mt-1.5 shrink-0" />
        </div>
        <span className="flex flex-wrap items-center gap-x-3 font-jetbrains text-label text-white/40">
          <TakeFacts take={take} />
          <span>{ago(take.created_at, OPENED_AT)} ago</span>
        </span>
      </div>

      <div className="flex items-center gap-3">
        <PlayToggle lab={lab} take={take} size="lg" />
        <TakeWave
          lab={lab}
          take={take}
          height="h-16"
          n={72}
          seams={take.plan ? seams(take.plan.chunks) : []}
          tints={
            take.plan && take.edit_modes
              ? spans(take.plan.chunks).filter((_, i) => (take.edit_modes![i] ?? "keep") !== "keep")
              : []
          }
        />
      </div>
      {take.plan && <PlanStrip plan={take.plan} active={activeSection} />}

      {(asked || m) && (
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1 font-jetbrains text-label">
          <dt className="text-white/40">asked</dt>
          <dd className="text-white/80">{asked || "—"}</dd>
          <dt className="text-white/40">measured</dt>
          <dd className={m ? "text-white/80" : "text-white/30"}>
            {m ? (
              <>
                <span className={tempoOff ? "text-amber-200" : ""}>{m.tempo_bpm.toFixed(1)} BPM</span>
                {" · "}
                <span className={keyOff ? "text-amber-200" : ""}>{m.key}</span>
                {m.energy && <span className="text-white/40"> · {m.energy}</span>}
              </>
            ) : (
              "not measured"
            )}
          </dd>
        </dl>
      )}

      {take.prompt_text && (
        <div className="grid gap-1.5">
          <span className={CAPS}>prompt</span>
          <p className={`${CARD} max-h-40 overflow-auto whitespace-pre-line px-3 py-2 font-hanken text-label leading-snug text-white/75`}>
            {take.prompt_text}
          </p>
        </div>
      )}

      {(parent || children.length > 0) && (
        <div className="grid gap-1.5">
          <span className={CAPS}>lineage</span>
          <div className="grid gap-1">
            {parent && <LineageLink lab={lab} take={parent} onPick={state.select} prefix="from" />}
            {children.map((ch) => (
              <LineageLink key={ch.id} lab={lab} take={ch} onPick={state.select} prefix="→" />
            ))}
          </div>
        </div>
      )}

      {take.kind === "track" && (
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className={CAPS}>one change</span>
            <button
              type="button"
              onClick={() => state.loadFrom(take)}
              className="font-jetbrains text-label text-white/45 hover:text-cyan-200"
            >
              load recipe
            </button>
          </div>
          {vars.length === 0 ? (
            <span className="font-jetbrains text-label text-white/30">no evidence to vary on</span>
          ) : (
            vars.map((va, i) => (
              <div key={i} className={`${CARD} flex items-center gap-2 px-3 py-2`}>
                <span className="w-14 shrink-0 font-jetbrains text-label text-white/35">{va.axis}</span>
                <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {va.diff.map((d) => (
                    <span
                      key={d}
                      className={`truncate font-hanken text-label ${
                        d.startsWith("−") || d.startsWith("no ") ? "text-rose-200/80" : d.startsWith("+") ? "text-emerald-200/90" : "text-white/80"
                      }`}
                    >
                      {d}
                    </span>
                  ))}
                </span>
                {va.why && <span className="shrink-0 font-jetbrains text-label text-white/35">{va.why}</span>}
                <button
                  type="button"
                  onClick={() => state.loadFrom(take, va.seed)}
                  aria-label={`Load the ${va.axis} variation into the recipe`}
                  className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full border border-white/12 text-white/60 hover:border-cyan-300/40 hover:text-cyan-100"
                >
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {isEditable(take) && (
        <button type="button" onClick={() => state.goto(2, take.id)} className={`${BTN} justify-self-start`}>
          <Layers className="h-4 w-4" aria-hidden />
          polish sections
        </button>
      )}
    </Panel>
  );
}

function LineageLink({ lab, take, onPick, prefix }: { lab: Lab; take: Take; onPick: (id: string) => void; prefix: string }) {
  return (
    <button
      type="button"
      onClick={() => onPick(take.id)}
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-white/[0.04]"
    >
      <span className="w-10 shrink-0 font-jetbrains text-label text-white/30">{prefix}</span>
      <span className="min-w-0 flex-1 truncate font-hanken text-label text-white/80">{take.title}</span>
      <Scores take={take} />
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${VERDICT_TONE[verdict(take)].dot}`} />
      <span className="sr-only">{VERDICT_TONE[verdict(take)].word}</span>
      {lab.urlFor(take) === null && take.upload_id ? <span className="font-jetbrains text-label text-rose-300/70">missing</span> : null}
    </button>
  );
}

