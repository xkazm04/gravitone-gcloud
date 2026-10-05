"use client";

// 3 · HUNT — search first. Start from a seed (the working recipe, a reference
// track's MEASURED tempo and key, or a kept take), fan it out ONE CHANGE AT A
// TIME (app/library/audio/book.ts#variationsOfSeed — swap an instrument, swap a
// mood, ±6 BPM, the relative key, fence an instrument off) with the unchanged
// seed as the control, across the engines, and audition the grid fast:
// arrows to move, Space to hear, X to knock out, Enter to crown.
//
// One change per lane is the point. A verdict on a lane then says which AXIS
// mattered, and because every take carries its recipe terms into the
// Library's store, a knockout moves those terms' keep-rates — the next hunt's
// lanes are proposed from the evidence this one left.
//
// A hunt has no state of its own beyond the takes: `hunt_id` groups them
// (labModel.ts#hunts), a knockout is a rejection, the crown is a keep. So the
// Library reads the same calls, and a reload rebuilds the bracket.

import { useEffect, useMemo, useState } from "react";

import { motion, useReducedMotion } from "motion/react";
import { Coins, Copy, Crown, Layers, Lock, Swords, X } from "lucide-react";

import { Panel } from "@/components/ui/Primitives";
import { Select } from "@/components/ui/Select";
import { Keycaps, Tally } from "@/components/ui/signal";
import { EASE } from "@/components/ui/tokens";
import {
  RUBRIC,
  compose,
  conceptFor,
  dimsFor,
  references,
  seedOf,
  verdict,
  type Seed,
  type Take,
} from "@/app/library/audio/book";

import { can, engineById, type EngineId } from "./engines";
import {
  fanOut,
  fanOutSeconds,
  hunts,
  isEditable,
  laneOf,
  newHuntId,
  type HuntLane,
} from "./labModel";
import {
  BTN,
  CAPS,
  CARD,
  EngineStatus,
  FIELD,
  GhostWave,
  JudgeBar,
  LocalLane,
  PlayToggle,
  Rubric,
  Scores,
  SeedLine,
  SpendButton,
  SunoLane,
  TakeFacts,
  TakeWave,
  VERDICT_TONE,
  usePlay,
} from "./parts";
import type { LabState } from "./PlaygroundView";
import { laneTag, type Lab } from "./useLab";

const KO_REASON = "knocked out in a hunt";
const AXIS_ORDER = ["control", "swap", "mood", "tempo", "key", "fence"];
const COLS: EngineId[] = ["elevenlabs", "suno", "local"];

const isField = (el: Element | null) =>
  !!el &&
  (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
    (el as HTMLElement).isContentEditable ||
    !!el.closest('[role="combobox"],[role="listbox"]'));

type SeedFrom = "recipe" | "reference" | "take";

/** A hunt's lanes after a reload: the control, plus every change a take or a
 *  draft in it carries. The lanes proposed at the start are not stored — the
 *  takes are the record. */
function lanesFromRecord(id: string, takes: readonly Take[], lab: Lab): HuntLane[] {
  const out = new Map<string, HuntLane>();
  const add = (axis: string, diff: string[], seed: Seed) => {
    const k = axis === "control" ? "control" : `${axis}:${diff.join("|")}`;
    if (!out.has(k))
      out.set(k, { id: k, axis: axis as HuntLane["axis"], diff, seed, why: axis === "control" ? "unchanged" : "" });
  };
  for (const t of takes) if (t.hunt_id === id) add(t.variation?.axis ?? "control", t.variation?.diff ?? [], seedOf(t));
  for (const d of lab.book.drafts)
    if (d.hunt_id === id) add(d.variation?.axis ?? "control", d.variation?.diff ?? [], d.seed);
  // Each lane's evidence line, read again off the control's fan-out: the
  // record keeps the change, and the book says how that change has fared.
  const control = out.get("control");
  const proposed = control ? fanOut(control.seed, lab.voc) : [];
  for (const l of out.values())
    if (!l.why) l.why = proposed.find((p) => p.axis === l.axis && p.diff.join("|") === l.diff.join("|"))?.why ?? "";
  return [...out.values()].sort((a, b) => AXIS_ORDER.indexOf(a.axis) - AXIS_ORDER.indexOf(b.axis));
}

export default function Hunt({ lab, state }: { lab: Lab; state: LabState }) {
  const reduce = useReducedMotion();
  const all = useMemo(() => hunts(lab.takes), [lab.takes]);
  const [fresh, setFresh] = useState<{ id: string; lanes: HuntLane[]; seed: Seed } | null>(null);
  const [huntId, setHuntId] = useState<string | null>(null);
  const [seedFrom, setSeedFrom] = useState<SeedFrom>("recipe");
  const [refPick, setRefPick] = useState<{ id: string; method: "librosa" | "fft_autocorr" } | null>(null);
  const [takePick, setTakePick] = useState<string>("");
  const [lengthS, setLengthS] = useState(20);
  const [cell, setCellRaw] = useState<{ lane: number; col: number }>({ lane: 0, col: 0 });
  const [dim, setDim] = useState(0);
  // A new cell starts scoring at its first dimension (see Workbench#pick).
  const setCell = (next: { lane: number; col: number } | ((c: { lane: number; col: number }) => { lane: number; col: number })) => {
    setDim(0);
    setCellRaw(next);
  };

  const el = engineById(lab.reg, "elevenlabs")!;
  const refs = useMemo(() => references(lab.takes), [lab.takes]);
  const keepers = useMemo(
    () => lab.takes.filter((t) => t.kind === "track" && (verdict(t) === "proven" || verdict(t) === "kept")),
    [lab.takes],
  );

  // ── the seed a NEW hunt would start from ──
  const seed: Seed = useMemo(() => {
    if (seedFrom === "reference" && refPick) {
      const r = refs.find((x) => x.ref.id === refPick.id);
      const m = r?.methods.find((x) => x.id === refPick.method);
      if (r && m) return conceptFor(r.ref.id, { tempo: m.tempo, key: m.key }, lab.takes);
    }
    if (seedFrom === "take" && takePick) {
      const t = lab.byId.get(takePick);
      if (t) return seedOf(t);
    }
    return state.recipe.seed;
  }, [seedFrom, refPick, refs, takePick, lab.takes, lab.byId, state.recipe.seed]);
  const preview = useMemo(() => fanOut(seed, lab.voc), [seed, lab.voc]);

  // ── the hunt on the board ──
  const currentId = huntId ?? fresh?.id ?? all[0]?.id ?? null;
  const current = all.find((h) => h.id === currentId) ?? null;
  const lanes =
    fresh && fresh.id === currentId
      ? mergeLanes(fresh.lanes, lanesFromRecord(currentId, lab.takes, lab))
      : currentId
        ? lanesFromRecord(currentId, lab.takes, lab)
        : preview;
  const board = currentId ? (current?.takes ?? []) : [];
  const takeAt = (lane: HuntLane, eng: EngineId) =>
    board
      .filter((t) => laneOf(t, lanes)?.id === lane.id && (eng === "elevenlabs" ? t.vendor === "elevenlabs" : eng === "suno" ? t.vendor === "suno" : false))
      .sort((a, b) => b.created_at - a.created_at)[0];
  const draftAt = (lane: HuntLane) =>
    lab.book.drafts.find(
      (d) =>
        d.hunt_id === currentId &&
        (d.variation?.axis ?? "control") === lane.axis &&
        (d.variation?.diff ?? []).join("|") === lane.diff.join("|"),
    );

  const selLane = lanes[Math.min(cell.lane, lanes.length - 1)];
  const selEngine = COLS[cell.col];
  const selTake = selLane ? takeAt(selLane, selEngine) : undefined;

  const start = () => {
    const id = newHuntId();
    setFresh({ id, lanes: preview, seed });
    setHuntId(id);
    setCell({ lane: 0, col: 0 });
    lab.say(`hunt opened · ${preview.length} lanes`);
    return { id, lanes: preview };
  };

  const renderLane = (lane: HuntLane, id: string) =>
    lab.quick(lane.seed, lengthS, compose(lane.seed, "elevenlabs", lab.book.hands), {
      variation: lane.axis === "control" ? null : { axis: lane.axis, diff: lane.diff },
      huntId: id,
    });

  const renderAll = async () => {
    const h = currentId && lanes.length ? { id: currentId, lanes } : start();
    for (const lane of h.lanes) {
      if (takeAt(lane, "elevenlabs")) continue;
      // Sequential, not a burst: the budget ceiling refuses a request rather
      // than a batch, so a fan-out that hits it stops with what it bought.
      const t = await renderLane(lane, h.id);
      if (!t) break;
    }
  };

  // ── keys ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isField(e.target as Element | null) || e.ctrlKey || e.metaKey || e.altKey || !lanes.length) return;
      const k = e.key;
      if (k === "ArrowDown" || k === "ArrowUp" || k === "j" || k === "k") {
        e.preventDefault();
        setCell((c) => ({ ...c, lane: Math.max(0, Math.min(lanes.length - 1, c.lane + (k === "ArrowDown" || k === "j" ? 1 : -1))) }));
      } else if (k === "ArrowRight" || k === "ArrowLeft") {
        e.preventDefault();
        setCell((c) => ({ ...c, col: Math.max(0, Math.min(COLS.length - 1, c.col + (k === "ArrowRight" ? 1 : -1))) }));
      } else if (!selTake) return;
      else if (k === " ") {
        e.preventDefault();
        lab.engine.toggle(selTake, lab.urlFor(selTake));
      } else if (k === "x" || k === "X") {
        e.preventDefault();
        lab.reject(selTake.id, KO_REASON);
      } else if (k === "Enter") {
        e.preventDefault();
        lab.keep(selTake.id);
      } else if (k === "u" || k === "U") lab.clear(selTake.id);
      else if (/^[0-9]$/.test(k)) {
        e.preventDefault();
        const dims = dimsFor(selTake);
        const cur = dims.includes(dim) ? dim : dims[0];
        lab.rate(selTake.id, RUBRIC[cur].key, k === "0" ? 10 : Number(k));
        const pos = dims.indexOf(cur);
        setDim(pos < dims.length - 1 ? dims[pos + 1] : cur);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toRender = lanes.filter((l) => !takeAt(l, "elevenlabs"));
  const huntOptions = [
    ...(fresh && !all.some((h) => h.id === fresh.id) ? [{ value: fresh.id, label: "new hunt", meta: "0 takes" }] : []),
    ...all.map((h, i) => ({
      value: h.id,
      label: `hunt ${all.length - i}`,
      meta: `${h.alive.length}/${h.takes.length}`,
    })),
  ];

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)_360px]">
      {/* ── the seed ── */}
      <Panel as="section" className="grid min-w-0 gap-4 p-5 [&>*]:min-w-0">
        <h2 className="sr-only">Seed</h2>
        <div role="tablist" aria-label="Seed from" className="flex gap-1 rounded-full border border-white/8 bg-white/[0.02] p-1">
          {(["recipe", "reference", "take"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={seedFrom === s}
              onClick={() => setSeedFrom(s)}
              className={`flex-1 cursor-pointer rounded-full px-2 py-1 font-jetbrains text-label transition ${
                seedFrom === s ? "bg-white/[0.09] text-white" : "text-white/50 hover:text-white/80"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {seedFrom === "reference" && (
          <div className="grid gap-2">
            {refs.map((r) => (
              <div key={r.ref.id} className={`${CARD} grid gap-1.5 px-3 py-2.5`}>
                <span className="font-instrument text-content leading-tight text-white/90">
                  {r.ref.artist} — {r.ref.title}
                </span>
                <div className="grid gap-1">
                  {r.methods.map((m) => {
                    const on = refPick?.id === r.ref.id && refPick.method === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setRefPick({ id: r.ref.id, method: m.id })}
                        className={`grid cursor-pointer grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-2 rounded-lg px-2 py-1 text-left font-jetbrains text-label transition ${
                          on ? "bg-cyan-400/10 text-cyan-100" : "text-white/60 hover:bg-white/[0.04]"
                        }`}
                      >
                        <span className="text-white/40">{m.label}</span>
                        <span className="truncate">
                          {m.tempo} · {m.key}{" "}
                          <span className={m.err.ok ? "text-emerald-300/80" : "text-amber-300/80"}>{m.err.kind}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {seedFrom === "take" && (
          <Select<string>
            label="take"
            value={takePick}
            placeholder="a kept take"
            minWidth={320}
            options={keepers
              .slice()
              .sort((a, b) => b.created_at - a.created_at)
              .slice(0, 40)
              .map((t) => ({ value: t.id, label: t.title, meta: verdict(t) }))}
            onChange={setTakePick}
            className="[&>button]:w-full"
          />
        )}

        <div className="grid gap-2">
          <span className={CAPS}>seed</span>
          <SeedLine seed={seed} />
        </div>

        <div className="grid gap-1.5">
          <span className={CAPS}>{preview.length} lanes</span>
          <div className="grid gap-1">
            {preview.map((l) => (
              <span key={l.id} className="flex min-w-0 items-baseline gap-2 font-jetbrains text-label">
                <span className="w-[4.5rem] shrink-0 text-white/35">{l.axis}</span>
                <span className="min-w-0 truncate text-white/70">{l.diff.join(" ") || "—"}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-end gap-3">
          <label className="grid gap-1">
            <span className={CAPS}>seconds</span>
            <input
              type="number"
              min={5}
              max={120}
              value={lengthS}
              onChange={(e) => setLengthS(Number(e.target.value))}
              className={`${FIELD} w-24 font-jetbrains tabular-nums`}
            />
          </label>
          <button type="button" onClick={start} className={`${BTN} ml-auto`}>
            <Swords className="h-4 w-4" aria-hidden />
            open hunt
          </button>
        </div>
      </Panel>

      {/* ── the bracket ── */}
      <section aria-label="Hunt" className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {huntOptions.length > 0 && (
            <Select<string>
              label="hunt"
              icon={<Swords className="h-4 w-4" />}
              value={currentId ?? ""}
              options={huntOptions}
              minWidth={240}
              onChange={(id) => {
                setHuntId(id);
                setCell({ lane: 0, col: 0 });
              }}
            />
          )}
          {current && (
            <>
              <Tally value={current.alive.length} of={current.takes.length} label="alive" tone="cyan" />
              <Tally value={current.out.length} label="out" tone={current.out.length ? "rose" : "neutral"} />
              {current.winner && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-400/10 px-3 py-0.5 font-jetbrains text-label text-emerald-100">
                  <Crown className="h-3.5 w-3.5" aria-hidden />
                  {current.winner.title}
                </span>
              )}
            </>
          )}
          <span className="ml-auto flex items-start gap-3">
            <Keycaps
              map={[
                { keys: ["↑", "↓", "←", "→"], does: "move" },
                { keys: ["Space"], does: "play" },
                { keys: ["1", "…", "0"], does: "score" },
                { keys: ["X"], does: "knock out" },
                { keys: ["Enter"], does: "crown" },
                { keys: ["U"], does: "clear" },
              ]}
            />
            {can(el, "compose") && toRender.length > 0 && (
              <SpendButton lab={lab} seconds={fanOutSeconds(toRender, [el], lengthS)} busy={lab.pending.length > 0} onClick={() => void renderAll()}>
                render {toRender.length} lanes
              </SpendButton>
            )}
          </span>
        </div>

        <Panel className="overflow-hidden p-0">
          <div role="grid" aria-label="Lanes by engine" className="grid">
            <div role="row" className="grid grid-cols-[13rem_minmax(0,1fr)_minmax(0,1fr)_8.5rem] border-b border-white/6">
              <span role="columnheader" className={`${CAPS} px-4 py-2.5`}>
                lane
              </span>
              {COLS.map((id) => {
                const e = engineById(lab.reg, id)!;
                return (
                  <span
                    role="columnheader"
                    key={id}
                    className={`flex border-l border-white/5 px-4 py-2.5 ${
                      id === "local" ? "flex-col justify-center gap-0" : "items-center justify-between gap-2"
                    }`}
                  >
                    <span className="font-instrument text-content text-white/85">{e.name}</span>
                    <EngineStatus engine={e} />
                  </span>
                );
              })}
            </div>
            {lanes.map((lane, li) => (
              <motion.div
                role="row"
                key={lane.id}
                initial={reduce ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22, ease: EASE, delay: reduce ? 0 : li * 0.03 }}
                className="grid grid-cols-[13rem_minmax(0,1fr)_minmax(0,1fr)_8.5rem] border-b border-white/5 last:border-b-0"
              >
                <span role="rowheader" className="grid content-center gap-0.5 px-4 py-3">
                  <span className={`font-jetbrains text-label uppercase tracking-[0.12em] ${lane.axis === "control" ? "text-cyan-200/70" : "text-white/40"}`}>
                    {lane.axis}
                  </span>
                  <span className="flex flex-wrap gap-x-2">
                    {lane.diff.length === 0 ? (
                      <span className="font-hanken text-label text-white/55">unchanged seed</span>
                    ) : (
                      lane.diff.map((d) => (
                        <span
                          key={d}
                          className={`font-hanken text-label ${
                            d.startsWith("−") || d.startsWith("no ") ? "text-rose-200/85" : d.startsWith("+") ? "text-emerald-200/90" : "text-white/85"
                          }`}
                        >
                          {d}
                        </span>
                      ))
                    )}
                  </span>
                  {lane.why && lane.axis !== "control" && <span className="font-jetbrains text-label text-white/30">{lane.why}</span>}
                </span>
                {COLS.map((eng, ci) => {
                  const on = cell.lane === li && cell.col === ci;
                  const t = currentId ? takeAt(lane, eng) : undefined;
                  return (
                    <div
                      role="gridcell"
                      key={eng}
                      aria-selected={on}
                      onClick={() => setCell({ lane: li, col: ci })}
                      className={`relative cursor-pointer border-l border-white/5 p-2 transition ${on ? "bg-cyan-400/[0.05]" : "hover:bg-white/[0.02]"}`}
                    >
                      {on && <span aria-hidden className="pointer-events-none absolute inset-1 rounded-xl ring-1 ring-cyan-300/50" />}
                      {eng === "local" ? (
                        <span className="flex h-full items-center justify-center text-white/20">
                          <Lock className="h-4 w-4" aria-label="Local engine not installed" />
                        </span>
                      ) : t ? (
                        <BracketCard lab={lab} take={t} winner={current?.winner?.id === t.id} />
                      ) : (
                        <EmptyCell
                          kind={eng === "suno" ? (draftAt(lane) ? "awaiting" : "send") : can(el, "compose") ? "render" : "off"}
                          pending={
                            eng === "elevenlabs" &&
                            !!currentId &&
                            lab.pending.some((p) => p.tag === laneTag(currentId, lane.axis, lane.diff))
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </motion.div>
            ))}
          </div>
        </Panel>
      </section>

      {/* ── the cell ── */}
      <Panel as="aside" className="grid min-w-0 gap-4 p-5 xl:sticky xl:top-4 [&>*]:min-w-0">
        {!selLane ? null : selEngine === "local" ? (
          <>
            <span className={CAPS}>local · {selLane.axis}</span>
            <LocalLane engine={engineById(lab.reg, "local")!} />
          </>
        ) : selTake ? (
          <CellTake lab={lab} state={state} take={selTake} dim={dim} onDim={setDim} winner={current?.winner?.id === selTake.id} />
        ) : (
          <>
            <div className="grid gap-1.5">
              <span className={CAPS}>
                {selEngine === "suno" ? "suno" : "elevenlabs"} · {selLane.axis}
              </span>
              <SeedLine seed={selLane.seed} />
            </div>
            {selEngine === "suno" ? (
              currentId ? (
                <SunoLane
                  lab={lab}
                  seed={selLane.seed}
                  compact
                  extra={{
                    hunt_id: currentId,
                    ...(selLane.axis === "control" ? {} : { variation: { axis: selLane.axis, diff: selLane.diff } }),
                  }}
                />
              ) : (
                <button type="button" onClick={start} className={`${BTN} justify-self-start`}>
                  <Swords className="h-4 w-4" aria-hidden />
                  open hunt
                </button>
              )
            ) : can(el, "compose") ? (
              <SpendButton
                lab={lab}
                seconds={lengthS}
                busy={lab.pending.length > 0}
                onClick={() => {
                  const h = currentId ?? start().id;
                  void renderLane(selLane, h);
                }}
              >
                render this lane
              </SpendButton>
            ) : null}
          </>
        )}
      </Panel>
    </div>
  );
}

/** Lanes proposed at the start, then any the record adds (a draft or take
 *  from an earlier visit), without duplicates. */
function mergeLanes(a: HuntLane[], b: HuntLane[]): HuntLane[] {
  const key = (l: HuntLane) => (l.axis === "control" ? "control" : `${l.axis}:${l.diff.join("|")}`);
  const seen = new Set(a.map(key));
  return [...a, ...b.filter((l) => !seen.has(key(l)))];
}

function BracketCard({ lab, take, winner }: { lab: Lab; take: Take; winner: boolean }) {
  const st = usePlay(lab.engine);
  const out = verdict(take) === "rejected";
  const playing = st?.id === take.id && st.playing;
  return (
    <div
      className={`grid h-[4.75rem] content-center gap-1 rounded-xl border px-2.5 transition ${
        winner
          ? "border-emerald-400/50 bg-emerald-400/[0.07] shadow-[0_0_16px] shadow-emerald-400/10"
          : out
            ? "border-white/5 bg-transparent"
            : playing
              ? "border-cyan-300/40 bg-white/[0.035]"
              : "border-white/8 bg-white/[0.025]"
      }`}
    >
      <div className="flex items-center gap-2">
        <PlayToggle lab={lab} take={take} />
        <span className={`min-w-0 flex-1 truncate font-hanken text-label ${out ? "text-white/35 line-through" : "text-white/90"}`}>
          {take.title}
        </span>
        <Scores take={take} />
        {winner ? (
          <Crown className="h-4 w-4 shrink-0 text-emerald-300" aria-label="crowned" />
        ) : out ? (
          <X className="h-4 w-4 shrink-0 text-rose-300/70" aria-label="knocked out" />
        ) : (
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${VERDICT_TONE[verdict(take)].dot}`} />
        )}
      </div>
      <TakeWave lab={lab} take={take} height="h-6" n={72} dim={out} seamTone="quiet" />
    </div>
  );
}

function EmptyCell({ kind, pending }: { kind: "render" | "send" | "awaiting" | "off"; pending: boolean }) {
  if (pending)
    return (
      <span className="flex h-[4.75rem] animate-pulse flex-col justify-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-400/[0.05] px-2.5">
        <span className="font-jetbrains text-label text-cyan-100/80">rendering…</span>
        <GhostWave bars={44} height="h-6" />
      </span>
    );
  const word = kind === "awaiting" ? "awaiting return" : kind === "send" ? "copy to suno" : kind === "render" ? "not rendered" : "off here";
  return (
    <span
      className={`flex h-[4.75rem] flex-col justify-center gap-1.5 rounded-xl border px-2.5 ${
        kind === "awaiting" ? "border-dashed border-amber-400/35 bg-amber-400/[0.03]" : "border-white/[0.05]"
      }`}
    >
      <span className={`flex items-center gap-1.5 font-jetbrains text-label ${kind === "awaiting" ? "text-amber-200/80" : "text-white/30"}`}>
        {kind === "send" && <Copy className="h-3.5 w-3.5" aria-hidden />}
        {kind === "render" && <Coins className="h-3.5 w-3.5" aria-hidden />}
        {word}
      </span>
      <GhostWave bars={44} height="h-6" seed={kind.length} />
    </span>
  );
}

function CellTake({
  lab,
  state,
  take,
  dim,
  onDim,
  winner,
}: {
  lab: Lab;
  state: LabState;
  take: Take;
  dim: number;
  onDim: (d: number) => void;
  winner: boolean;
}) {
  const parent = take.parent_id ? lab.byId.get(take.parent_id) : undefined;
  return (
    <>
      <div className="grid gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-instrument text-2xl leading-tight text-white">{take.title}</h3>
          {winner && <Crown className="mt-1.5 h-5 w-5 shrink-0 text-emerald-300" aria-label="crowned" />}
        </div>
        <TakeFacts take={take} parent={parent} />
      </div>
      <div className="flex items-center gap-3">
        <PlayToggle lab={lab} take={take} size="lg" />
        <TakeWave lab={lab} take={take} height="h-16" n={72} />
      </div>
      {take.variation && (
        <span className="flex flex-wrap gap-2 font-hanken text-label text-white/80">
          <span className="font-jetbrains text-white/35">{take.variation.axis}</span>
          {take.variation.diff.join(" ")}
        </span>
      )}
      <Rubric take={take} dim={dim} onDim={onDim} onRate={(k, n) => lab.rate(take.id, k, n)} />
      <JudgeBar lab={lab} take={take} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => state.loadFrom(take)} className={BTN}>
          load recipe
        </button>
        {isEditable(take) && (
          <button type="button" onClick={() => state.goto(2, take.id)} className={BTN}>
            <Layers className="h-4 w-4" aria-hidden />
            polish sections
          </button>
        )}
      </div>
    </>
  );
}
