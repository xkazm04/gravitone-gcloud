"use client";

// 2 · ARRANGEMENT — polish first. The hero is the piece's SECTION PLAN laid on
// a clock: each section as wide as it lasts, its edit mode set inline on the
// section itself (keep by reference · regenerate under the original at low,
// medium or high hold · regenerate free), and every version of the piece
// stacked under it as a lane on the same clock, like tracks in a DAW. A and B
// are two lanes; switching between them keeps the playhead, so the seam is
// judged by ear at the same instant in both.
//
// A piece starts here as a FREE plan draft (lib/music/pricing.ts declares the
// plan endpoint at zero): sections are shaped before a credit is spent. Its
// render is version 1; every section edit is the next version, filed as a take
// whose parent is the version it edited — so the Library's lineage is the
// version stack.

import { useEffect, useMemo, useState } from "react";

import { motion, useReducedMotion } from "motion/react";
import { Layers, Link2, Pause, Play, Plus, Shuffle } from "lucide-react";

import { Panel } from "@/components/ui/Primitives";
import { Select } from "@/components/ui/Select";
import { Keycaps, PipRow, Tally } from "@/components/ui/signal";
import { EASE } from "@/components/ui/tokens";
import { RUBRIC, compose, dimsFor, dur, peaksOf, verdict, type Take } from "@/app/library/audio/book";
import type { LabEditMode } from "@/lib/assets";
import type { WireGenerationChunk, WirePlan } from "@/lib/music/types";

import { can, engineById } from "./engines";
import {
  EDIT_RAMP,
  editSeconds,
  isEditable,
  isGenChunk,
  planMs,
  planStyle,
  seams,
  sectionName,
  spans,
} from "./labModel";
import {
  BTN,
  CAPS,
  FIELD,
  FreeTag,
  GhostRubric,
  GhostWave,
  JudgeBar,
  RecipeEditor,
  Rubric,
  Scores,
  SpendButton,
  VERDICT_TONE,
  Wave,
  Withheld,
  usePlay,
} from "./parts";
import type { LabState } from "./PlaygroundView";
import type { Lab } from "./useLab";

const isField = (el: Element | null) =>
  !!el &&
  (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
    (el as HTMLElement).isContentEditable ||
    !!el.closest('[role="combobox"],[role="listbox"]'));

/** Every version below a source: its section edits, and theirs, oldest first. */
function versionsOf(root: Take, takes: readonly Take[]): Take[] {
  const out: Take[] = [];
  let frontier = [root.id];
  while (frontier.length) {
    const kids = takes.filter((t) => t.parent_id && frontier.includes(t.parent_id) && t.lab_op === "section-edit");
    out.push(...kids);
    frontier = kids.map((k) => k.id);
  }
  return out.sort((a, b) => a.created_at - b.created_at);
}

/** The root of a take's edit chain — the render every version descends from. */
function rootOf(t: Take, byId: ReadonlyMap<string, Take>): Take {
  let cur = t;
  for (let i = 0; i < 20 && cur.lab_op === "section-edit" && cur.parent_id; i++) {
    const p = byId.get(cur.parent_id);
    if (!p) break;
    cur = p;
  }
  return cur;
}

export default function Arrangement({ lab, state }: { lab: Lab; state: LabState }) {
  // Pieces with the most versions first: the arrangement opens on the work
  // that has been polished, not on the newest quick take that merely could be.
  const editable = useMemo(
    () =>
      lab.labTakes
        .filter((t) => isEditable(t) && t.lab_op !== "section-edit")
        .map((t) => ({ t, n: versionsOf(t, lab.takes).length, plan: t.lab_op === "plan" ? 1 : 0 }))
        .sort((a, b) => b.n - a.n || b.plan - a.plan || b.t.created_at - a.t.created_at)
        .map((x) => x.t),
    [lab.labTakes, lab.takes],
  );
  const picked = state.selected ? lab.byId.get(state.selected) : undefined;
  const root = picked && isEditable(picked) ? rootOf(picked, lab.byId) : editable[0];
  const [drafting, setDrafting] = useState(false);
  const el = engineById(lab.reg, "elevenlabs")!;

  if (!can(el, "section-edit"))
    return (
      <Panel className="p-6">
        <Withheld title="Arrangement" reason={el.withheld.find((w) => w.op === "section-edit")?.reason ?? ""} />
      </Panel>
    );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select<string>
          label="piece"
          icon={<Layers className="h-4 w-4" />}
          value={drafting ? "" : (root?.id ?? "")}
          placeholder={drafting ? "pieces" : "no piece yet"}
          minWidth={380}
          options={editable.map((t) => ({
            value: t.id,
            label: t.title,
            meta: `${versionsOf(t, lab.takes).length + 1}v · ${dur(t.duration_s)}`,
          }))}
          onChange={(id) => {
            setDrafting(false);
            state.select(id);
          }}
        />
        <button
          type="button"
          aria-pressed={drafting}
          onClick={() => setDrafting((d) => !d)}
          className={`${BTN} ${drafting ? "border-cyan-400/45 text-cyan-100" : ""}`}
        >
          <Plus className="h-4 w-4" aria-hidden />
          new plan <FreeTag />
        </button>
        <span className="ml-auto flex items-center gap-2">
          <Keycaps
            map={[
              { keys: ["A"], does: "play source" },
              { keys: ["B"], does: "play version" },
              { keys: ["Space"], does: "play" },
              { keys: ["↑", "↓"], does: "version" },
              { keys: ["1", "…", "0"], does: "score B" },
              { keys: ["Enter"], does: "keep B" },
            ]}
          />
        </span>
      </div>

      {drafting || !root ? (
        <PlanComposer lab={lab} state={state} onRendered={(t) => {
          setDrafting(false);
          state.select(t.id);
        }} />
      ) : (
        <Piece key={root.id} lab={lab} state={state} root={root} />
      )}
    </div>
  );
}

/* ── a piece: the timeline, the lanes, the edit ────────────────────────── */

function Piece({ lab, state, root }: { lab: Lab; state: LabState; root: Take }) {
  const reduce = useReducedMotion();
  const st = usePlay(lab.engine);
  const versions = useMemo(() => [root, ...versionsOf(root, lab.takes)], [root, lab.takes]);
  // B: the selected version if it is in this stack, else the newest.
  const bTake =
    (state.selected && versions.find((v) => v.id === state.selected && v.id !== root.id)) ||
    (versions.length > 1 ? versions[versions.length - 1] : null);
  // The edit is made FROM the source of the stack — or from B, when B is the
  // version being polished further (its own stored song).
  const [fromB, setFromB] = useState(false);
  const source = fromB && bTake && isEditable(bTake) ? bTake : root;
  const plan = source.plan!;
  const gen = plan.chunks.filter(isGenChunk);
  // The edit grammar belongs to ONE source: switching the source (A, or B
  // polished further) starts a fresh one, read off that source's own plan.
  // Keyed by id rather than reset in an effect, so no render ever shows one
  // source's modes over another's sections.
  const blank = { of: source.id, modes: gen.map((): LabEditMode => "keep"), texts: gen.map((c) => c.text) };
  const [grammar, setGrammar] = useState(blank);
  const g = grammar.of === source.id ? grammar : blank;
  const { modes, texts } = g;
  const setModes = (fn: (m: LabEditMode[]) => LabEditMode[]) => setGrammar({ ...g, modes: fn(g.modes) });
  const setTexts = (fn: (t: string[]) => string[]) => setGrammar({ ...g, texts: fn(g.texts) });
  const [dim, setDim] = useState(0);

  const total = planMs(plan) / 1000;
  const marks = seams(plan.chunks);
  const sp = spans(plan.chunks);
  const touched = modes.filter((m) => m !== "keep").length;
  const seconds = editSeconds(plan, modes);
  const playingId = st?.playing ? st.id : null;
  const frac = st && versions.some((v) => v.id === st.id) && st.duration > 0 ? st.position / st.duration : null;

  /** Play a version FROM THE SAME INSTANT the other one is at — the A/B. */
  const playAt = (t: Take) => {
    const pos = st && versions.some((v) => v.id === st.id) ? st.position : 0;
    const d = t.duration_s ?? total;
    lab.engine.play(t, Math.min(pos, Math.max(0, d - 0.05)), lab.urlFor(t));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isField(e.target as Element | null) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "a") playAt(root);
      else if (k === "b" && bTake) playAt(bTake);
      else if (k === " ") {
        e.preventDefault();
        const cur = (st && versions.find((v) => v.id === st.id)) || bTake || root;
        lab.engine.toggle(cur, lab.urlFor(cur));
      } else if ((k === "arrowdown" || k === "arrowup") && versions.length > 1) {
        e.preventDefault();
        const i = bTake ? versions.indexOf(bTake) : 0;
        const n = versions[Math.max(1, Math.min(versions.length - 1, i + (k === "arrowdown" ? 1 : -1)))];
        if (n) state.select(n.id);
      } else if (k === "enter" && bTake) {
        e.preventDefault();
        lab.keep(bTake.id);
      } else if (/^[0-9]$/.test(k) && bTake) {
        // Score B, one dimension per key, as the ledger does.
        e.preventDefault();
        const dims = dimsFor(bTake);
        const cur = dims.includes(dim) ? dim : dims[0];
        lab.rate(bTake.id, RUBRIC[cur].key, k === "0" ? 10 : Number(k));
        const pos = dims.indexOf(cur);
        setDim(pos < dims.length - 1 ? dims[pos + 1] : cur);
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The clock: a tick every 5s (10s past a minute), labelled.
  const step = total > 60 ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step).filter((s) => s <= total);

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Panel as="section" className="grid gap-0 overflow-hidden p-0">
        <h2 className="sr-only">Sections of {root.title}</h2>
        {/* ── the ruler ── */}
        <div className="grid grid-cols-[13rem_minmax(0,1fr)] border-b border-white/6">
          <div className="flex items-end px-4 pb-2">
            <span className={CAPS}>{dur(total)}</span>
          </div>
          <div className="relative h-9 mr-5">
            {ticks.map((s) => (
              <span key={s} style={{ left: `${(s / total) * 100}%` }} className="absolute bottom-0 flex flex-col items-start">
                <span className="mb-1 -translate-x-1/2 font-jetbrains text-label text-white/30 tabular-nums">
                  {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
                </span>
                <span className="h-2 w-px bg-white/15" />
              </span>
            ))}
          </div>
        </div>

        {/* ── the sections, with their modes ── */}
        <div className="grid grid-cols-[13rem_minmax(0,1fr)] border-b border-white/6">
          <div className="grid content-start gap-1 px-4 py-4">
            <span className={CAPS}>edit from</span>
            <span className="truncate font-instrument text-content text-white">{source.title}</span>
            {bTake && isEditable(bTake) && (
              <button
                type="button"
                onClick={() => setFromB((b) => !b)}
                className="justify-self-start font-jetbrains text-label text-white/40 hover:text-cyan-200"
              >
                {fromB ? "← from the source" : "from version B →"}
              </button>
            )}
          </div>
          <div className="mr-5 flex gap-1.5 py-3">
            {plan.chunks.map((c, i) => {
              const g = isGenChunk(c) ? c : null;
              const gi = plan.chunks.slice(0, i).filter(isGenChunk).length;
              const mode = g ? modes[gi] : "keep";
              const moving = mode !== "keep";
              const [a, b] = sp[i];
              return (
                <motion.div
                  key={i}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: EASE, delay: reduce ? 0 : i * 0.04 }}
                  style={{ flexGrow: b - a, flexBasis: 0 }}
                  className={`grid min-w-0 content-start gap-2 rounded-xl border p-2.5 transition ${
                    moving ? "border-cyan-400/40 bg-cyan-400/[0.06]" : "border-white/8 bg-white/[0.025]"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-hanken text-label font-medium text-white/90">{sectionName(c, i)}</span>
                    <span className="shrink-0 font-jetbrains text-label text-white/35 tabular-nums">
                      {Math.round((b - a) * total)}s
                    </span>
                  </div>
                  {g && (
                    <ModeRamp
                      value={mode}
                      label={`Section ${i + 1} mode`}
                      onChange={(m) => setModes((ms) => ms.map((v, j) => (j === gi ? m : v)))}
                    />
                  )}
                  {g && moving ? (
                    <textarea
                      value={texts[gi]}
                      onChange={(e) => setTexts((t) => t.map((v, j) => (j === gi ? e.target.value : v)))}
                      rows={4}
                      aria-label={`Section ${i + 1} direction`}
                      className={`${FIELD} px-2 py-1.5 leading-snug`}
                    />
                  ) : (
                    g && <p className="line-clamp-3 font-hanken text-label leading-snug text-white/45">{g.text}</p>
                  )}
                  {g && (g.positive_styles.length > 0 || g.negative_styles.length > 0) && (
                    <span className="flex flex-wrap gap-1">
                      {g.positive_styles.slice(0, 3).map((x) => (
                        <span key={x} className="rounded-full border border-white/8 px-2 font-jetbrains text-label text-white/45">
                          {x}
                        </span>
                      ))}
                      {g.negative_styles.slice(0, 2).map((x) => (
                        <span key={`no-${x}`} className="rounded-full border border-rose-400/20 px-2 font-jetbrains text-label text-rose-200/60">
                          no {x}
                        </span>
                      ))}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* ── the lanes ── */}
        <div className="relative">
          {versions.map((v, i) => {
            const isA = v.id === root.id;
            const isB = bTake?.id === v.id;
            const vMarks = v.plan ? seams(v.plan.chunks) : marks;
            const tints = v.edit_modes ? sp.filter((_, j) => (v.edit_modes![j] ?? "keep") !== "keep") : [];
            const mine = st?.id === v.id ? st : null;
            return (
              <div
                key={v.id}
                className={`grid grid-cols-[13rem_minmax(0,1fr)] items-center border-b border-white/5 transition ${
                  isB ? "bg-cyan-400/[0.04]" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5 py-3 pl-4 pr-3">
                  <button
                    type="button"
                    onClick={() => (mine?.playing ? lab.engine.pause() : playAt(v))}
                    aria-label={`${mine?.playing ? "Pause" : "Play"} ${isA ? "source" : `version ${i + 1}`}`}
                    className={`grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full border transition ${
                      playingId === v.id
                        ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100"
                        : "border-white/12 text-white/60 hover:text-white"
                    }`}
                  >
                    {playingId === v.id ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="ml-0.5 h-3.5 w-3.5" aria-hidden />}
                  </button>
                  <button
                    type="button"
                    onClick={() => !isA && state.select(v.id)}
                    className="grid min-w-0 flex-1 cursor-pointer gap-0.5 text-left"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`grid h-6 min-w-6 place-items-center rounded-md px-1 font-jetbrains text-label ${
                          isA ? "bg-white/[0.08] text-white/80" : isB ? "bg-cyan-300/20 text-cyan-100" : "text-white/35"
                        }`}
                      >
                        {isA ? "A" : isB ? "B" : `v${i + 1}`}
                      </span>
                      <span className="truncate font-hanken text-label text-white/85">{isA ? "source" : `version ${i + 1}`}</span>
                      <span aria-hidden className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${VERDICT_TONE[verdict(v)].dot}`} />
                      <span className="sr-only">{VERDICT_TONE[verdict(v)].word}</span>
                    </span>
                    <Scores take={v} />
                  </button>
                </div>
                <div className="pr-5">
                  <Wave
                    label={`${v.title} position`}
                    peaks={peaksOf(v, 140)}
                    position={mine?.position ?? 0}
                    duration={mine?.duration || v.duration_s || total}
                    playing={!!mine?.playing}
                    seams={vMarks}
                    tints={tints}
                    height="h-20"
                    onSeek={(s) => lab.engine.seek(v, s, lab.urlFor(v))}
                  />
                </div>
              </div>
            );
          })}
          {/* One playhead across every lane: the A/B is the same instant in both. */}
          {frac != null && (
            <span
              aria-hidden
              style={{ left: `calc(13rem + (100% - 13rem - 1.25rem) * ${frac})` }}
              className="pointer-events-none absolute inset-y-0 w-px bg-white/50"
            />
          )}
          {versions.length === 1 && (
            <div className="grid grid-cols-[13rem_minmax(0,1fr)] items-center">
              <span className="flex items-center gap-2.5 py-3 pl-4">
                <span aria-hidden className="h-8 w-8 rounded-full border border-white/8" />
                <span className="grid h-6 min-w-6 place-items-center rounded-md font-jetbrains text-label text-white/25">B</span>
                <span className="sr-only">No section edit of this piece yet</span>
              </span>
              <div className="pr-5">
                <GhostWave bars={140} height="h-20" seed={3} />
              </div>
            </div>
          )}
        </div>

        {/* ── the edit ── */}
        <div className="flex flex-wrap items-center gap-4 border-t border-white/6 bg-white/[0.015] px-4 py-3">
          <PipRow
            states={modes.map((m) => (m === "keep" ? ("hollow" as const) : ("filled" as const)))}
            label={`${touched} of ${modes.length} sections regenerated`}
          />
          <Tally value={touched} of={modes.length} label="regenerate" tone={touched ? "cyan" : "neutral"} />
          <span className="ml-auto">
            <SpendButton
              lab={lab}
              seconds={seconds}
              busy={lab.pending.length > 0}
              disabled={touched === 0}
              onClick={() =>
                void lab.edit(source, modes, texts, seconds).then((t) => {
                  if (t) {
                    state.select(t.id);
                    lab.say(`version ${versions.length + 1} · ${t.title}`);
                  }
                })
              }
            >
              render the edit
            </SpendButton>
          </span>
        </div>
      </Panel>

      {/* ── judging B ── */}
      <Panel as="aside" className="grid min-w-0 gap-4 p-5 xl:sticky xl:top-4 [&>*]:min-w-0">
        {bTake ? (
          <>
            <div className="grid gap-1">
              <span className={CAPS}>B · version {versions.indexOf(bTake) + 1}</span>
              <h3 className="font-instrument text-2xl leading-tight text-white">{bTake.title}</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(bTake.edit_modes ?? []).map((m, i) => (
                <span
                  key={i}
                  className={`rounded-full border px-2 py-0.5 font-jetbrains text-label ${
                    m === "keep" ? "border-white/10 text-white/40" : "border-cyan-400/35 text-cyan-100"
                  }`}
                >
                  S{i + 1} {EDIT_RAMP.find((r) => r.id === m)?.word}
                </span>
              ))}
            </div>
            <Rubric take={bTake} dim={dim} onDim={setDim} onRate={(k, n) => lab.rate(bTake.id, k, n)} />
            <JudgeBar lab={lab} take={bTake} />
          </>
        ) : (
          <>
            <span className={CAPS}>B</span>
            <GhostRubric label="No version to judge yet" />
          </>
        )}
        <div className="h-px bg-white/8" />
        <div className="grid gap-1.5">
          <span className={CAPS}>A · source</span>
          <span className="font-instrument text-content text-white/85">{root.title}</span>
          <Rubric take={root} dim={dim} onDim={setDim} onRate={(k, n) => lab.rate(root.id, k, n)} />
        </div>
      </Panel>
    </div>
  );
}

/**
 * THE KEEP/CONDITION GRAMMAR AS A RAMP — a link, one to three pips of hold on
 * the original, the dice (labModel.ts#EDIT_RAMP). Laid out as a segmented
 * control the shape is the meaning; the spoken label is the fuller sentence.
 */
function ModeRamp({ value, onChange, label }: { value: LabEditMode; onChange: (m: LabEditMode) => void; label: string }) {
  return (
    <span role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-lg border border-white/8 bg-black/10 p-0.5">
      {EDIT_RAMP.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.spoken}
            onClick={() => onChange(o.id)}
            className={`flex h-7 min-w-0 flex-1 cursor-pointer items-center justify-center gap-0.5 rounded-md transition ${
              on ? (o.id === "keep" ? "bg-white/[0.1] text-white" : "bg-cyan-400/20 text-cyan-100") : "text-white/35 hover:bg-white/[0.05] hover:text-white/70"
            }`}
          >
            {o.id === "keep" ? (
              <Link2 className="h-3.5 w-3.5" aria-hidden />
            ) : o.id === "free" ? (
              <Shuffle className="h-3.5 w-3.5" aria-hidden />
            ) : (
              Array.from({ length: o.pips }, (_, i) => <span key={i} aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />)
            )}
          </button>
        );
      })}
    </span>
  );
}

/* ── a new piece: the free plan, shaped before anything is spent ───────── */

function PlanComposer({ lab, state, onRendered }: { lab: Lab; state: LabState; onRendered: (t: Take) => void }) {
  const { recipe } = state;
  const [plan, setPlan] = useState<WirePlan | null>(null);
  const prompt = recipe.prompt ?? compose(recipe.seed, "elevenlabs", lab.book.hands);
  const busy = lab.pending.length > 0;
  const style = planStyle(recipe.seed);
  const total = plan ? planMs(plan) / 1000 : recipe.lengthS;

  const patch = (i: number, p: Partial<WireGenerationChunk>) =>
    setPlan((cur) => {
      if (!cur) return cur;
      const chunks = cur.chunks.slice();
      chunks[i] = { ...(chunks[i] as WireGenerationChunk), ...p };
      return { chunks };
    });

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
      <Panel as="section" className="grid min-w-0 gap-4 p-5 [&>*]:min-w-0">
        <h2 className="sr-only">Plan recipe</h2>
        <RecipeEditor seed={recipe.seed} voc={lab.voc} dense onChange={(seed) => state.setRecipe({ ...recipe, seed, prompt: null })} />
        <label className="grid gap-1.5">
          <span className={CAPS}>prompt</span>
          <textarea
            value={prompt}
            rows={4}
            onChange={(e) => state.setRecipe({ ...recipe, prompt: e.target.value })}
            className={`${FIELD} leading-snug`}
          />
        </label>
        <div className="grid gap-1 font-jetbrains text-label">
          <span className="text-white/40">style</span>
          <span className="text-white/70">{style.style}</span>
          {style.negativeStyle && (
            <>
              <span className="mt-1 text-white/40">exclude</span>
              <span className="text-rose-200/80">{style.negativeStyle}</span>
            </>
          )}
        </div>
      </Panel>

      <Panel as="section" className="grid min-w-0 gap-4 p-5 [&>*]:min-w-0">
        {!plan ? (
          <div className="grid gap-4">
            <div aria-hidden className="flex gap-1.5">
              {[0.2, 0.27, 0.33, 0.2].map((w, i) => (
                <span key={i} style={{ flexGrow: w, flexBasis: 0 }} className="grid min-w-0 content-start gap-2.5 rounded-xl border border-white/6 bg-white/[0.015] p-3">
                  <span className="flex justify-between">
                    <span className="h-3 w-1/2 rounded-full bg-white/[0.07]" />
                    <span className="h-3 w-6 rounded-full bg-white/[0.05]" />
                  </span>
                  <span className="h-2.5 w-full rounded-full bg-white/[0.04]" />
                  <span className="h-2.5 w-4/5 rounded-full bg-white/[0.04]" />
                  <span className="h-2.5 w-3/5 rounded-full bg-white/[0.04]" />
                  <GhostWave bars={Math.round(w * 90)} height="h-10" seed={i + 1} className="mt-3" />
                </span>
              ))}
            </div>
            <span className="sr-only">No plan drafted yet</span>
            <div className="flex items-center justify-end gap-3">
              <label className="flex h-10 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3">
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={recipe.lengthS}
                  aria-label="Length in seconds"
                  onChange={(e) => state.setRecipe({ ...recipe, lengthS: Number(e.target.value) })}
                  className="w-12 bg-transparent font-jetbrains text-content text-white/90 tabular-nums"
                />
                <span className="font-jetbrains text-label text-white/40">s</span>
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void lab.draft(recipe.seed, recipe.lengthS, prompt).then((p) => p && setPlan(p))}
                className={BTN}
              >
                draft plan <FreeTag />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-1.5">
              {plan.chunks.map((c, i) =>
                isGenChunk(c) ? (
                  <div key={i} style={{ flexGrow: c.duration_ms, flexBasis: 0 }} className="grid min-w-0 content-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-hanken text-label font-medium text-white/90">{sectionName(c, i)}</span>
                      <input
                        type="number"
                        min={3}
                        max={120}
                        step={0.5}
                        value={c.duration_ms / 1000}
                        onChange={(e) => patch(i, { duration_ms: Math.round(Number(e.target.value) * 1000) })}
                        aria-label={`Section ${i + 1} seconds`}
                        className="w-16 rounded-md border border-white/10 bg-transparent px-1.5 text-right font-jetbrains text-label text-white/70 tabular-nums"
                      />
                    </div>
                    <textarea
                      value={c.text}
                      onChange={(e) => patch(i, { text: e.target.value })}
                      rows={5}
                      aria-label={`Section ${i + 1} direction`}
                      className={`${FIELD} px-2 py-1.5 leading-snug`}
                    />
                    <input
                      value={c.positive_styles.join(", ")}
                      onChange={(e) => patch(i, { positive_styles: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      aria-label={`Section ${i + 1} include`}
                      className={`${FIELD} px-2 py-1`}
                    />
                    <input
                      value={c.negative_styles.join(", ")}
                      onChange={(e) => patch(i, { negative_styles: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      aria-label={`Section ${i + 1} exclude`}
                      className={`${FIELD} px-2 py-1 text-rose-100/80`}
                    />
                  </div>
                ) : null,
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-jetbrains text-label text-white/40 tabular-nums">
                {plan.chunks.filter(isGenChunk).length} sections · {dur(total)}
              </span>
              <span className="ml-auto">
                <SpendButton
                  lab={lab}
                  seconds={total}
                  busy={busy}
                  onClick={() =>
                    void lab.renderPlan(plan, recipe.seed, prompt).then((t) => t && onRendered(t))
                  }
                >
                  render version 1
                </SpendButton>
              </span>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
