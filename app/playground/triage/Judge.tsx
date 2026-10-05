"use client";

// THE JUDGING QUEUE — three columns, the hand never leaves the keys.
//
//   left    the queue: every unjudged take of this kind, agents' first, oldest
//           first within an origin (./model.ts#queueOrder), then what was
//           judged this session (so a call can be revisited with P), then the
//           operator's own batch panel, folded — agents do most generating.
//   centre  the take under judgement: its real waveform (measured on first
//           open, ../shared/measure.ts), the rubric for its kind, keep / reject
//           with the registry's defect codes.
//   right   the brief beside the take — prompt verbatim, techniques, terms,
//           provider and op, and what it ASKED for against what was MEASURED.
//           That comparison is the point: a judgement with the brief beside it
//           is evidence about the prompt, not just about the take.
//
// Keys are ./model.ts#resolveKey — one table, drawn as the legend under the
// rubric, so the legend cannot drift from what the keys do.

import { useEffect, useMemo, useRef, useState } from "react";

import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Terminal, X } from "lucide-react";

import { Panel } from "@/components/ui/Primitives";
import { Ghost, Keycaps, Tally } from "@/components/ui/signal";
import { EASE } from "@/components/ui/tokens";
import type { DefectCode, SoundKind, SoundTake } from "@/lib/sound/types";

import { DefectChips, DefectPicker, OriginChip, ProviderChip, TechniqueChips, TermChips, VerdictChip } from "../shared/Chips";
import { DEFECT_ORDER, ORIGIN_WORD, ago, askedFigures, dimsFor, dur, lengthWord, tempoOff } from "../shared/format";
import { measuredLength, useMeasureOnOpen } from "../shared/measure";
import { RubricControl, ScoreMeter } from "../shared/Rubric";
import { transport, useFileLength, usePlayback } from "../shared/transport";
import { CAPS, CARD, FIELD, BTN, BTN_KEEP, BTN_REJECT } from "../shared/ui";
import { PlayButton, TakeWave, GhostWave } from "../shared/Wave";

import Batch from "./Batch";
import { KEYMAP, nextAfter, queueOrder, resolveKey, step, type KeyMode } from "./model";
import type { TriageData } from "./useTriage";

const isField = (el: Element | null) =>
  !!el &&
  (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
    (el as HTMLElement).isContentEditable ||
    !!el.closest('[role="combobox"],[role="listbox"]'));

const OP_WORD: Record<SoundTake["op"], string> = {
  compose: "compose",
  plan: "plan",
  "section-edit": "section edit",
  sfx: "sfx",
  manual: "manual",
};

export default function Judge({ data, kind, now }: { data: TriageData; kind: SoundKind; now: number }) {
  const reduce = useReducedMotion();
  const queue = useMemo(() => queueOrder(data.takes, kind), [data.takes, kind]);
  const byId = useMemo(() => new Map(data.takes.map((t) => [t.id, t])), [data.takes]);
  const [session, setSession] = useState<string[]>([]);
  const judged = session.map((id) => byId.get(id)).filter((t): t is SoundTake => !!t);
  const [pick, setPick] = useState<string | null>(null);
  const active = (pick && byId.get(pick)) || queue[0] || null;
  const [dimPick, setDim] = useState<string | null>(null);
  const dims = active ? dimsFor(active) : [];
  const dim = dimPick && dims.includes(dimPick) ? dimPick : (dims[0] ?? null);
  const [mode, setMode] = useState<KeyMode>("judge");
  const [defects, setDefects] = useState<DefectCode[]>([]);
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLInputElement>(null);

  const measure = useMeasureOnOpen(active, (t) => data.upsert([t], { keepLocal: true }));

  const rail = useMemo(() => [...queue.map((t) => t.id), ...judged.map((t) => t.id)], [queue, judged]);

  const open = (id: string | null) => {
    if (id === active?.id) return;
    setPick(id);
    setDim(null);
    setMode("judge");
    setDefects([]);
    setNote("");
  };

  /** File a verdict, then land on the next take in the queue — and keep
   *  playing if the judge was listening, so a batch is heard back to back. */
  const decide = (t: SoundTake, verdict: "kept" | "rejected") => {
    const wasPlaying = transport.current?.id === t.id && transport.current.playing;
    const following = t.verdict === "unjudged" ? nextAfter(queue, t.id) : step(rail, t.id, 1);
    data.patch(t.id, () =>
      verdict === "kept"
        ? { verdict, reasons: [], note: null }
        : { verdict, reasons: defects, note: note.trim() || null },
    );
    setSession((s) => [t.id, ...s.filter((x) => x !== t.id)]);
    open(following && following !== t.id ? following : null);
    if (following && following !== t.id && wasPlaying) {
      const nx = byId.get(following);
      if (nx?.file) transport.play(following, 0, nx.durationS);
    } else if (wasPlaying) transport.pause();
  };

  const rate = (t: SoundTake, d: string, v: number) => {
    data.patch(t.id, (cur) => ({ ratings: { ...cur.ratings, [d]: v } }));
  };

  // ── the keys ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !active) return;
      const target = e.target as Element | null;
      const inNote = target === noteRef.current;
      if (isField(target) && !(inNote && (e.key === "Enter" || e.key === "Escape"))) return;
      // Tab moves the rubric dimension only while focus is nowhere in
      // particular (the page itself, or the judge pane) — never out of a
      // control, so Tab still walks the page for anyone not judging by keys.
      if (e.key === "Tab") {
        const free = !target || target === document.body || (target as HTMLElement).dataset?.judge === "pane";
        if (!free) return;
        const i = dim ? dims.indexOf(dim) : -1;
        const edge = e.shiftKey ? i <= 0 : i >= dims.length - 1;
        if (edge) return;
      }
      const a = resolveKey(e.key, mode, e.shiftKey);
      if (!a) return;
      e.preventDefault();
      switch (a.type) {
        case "play":
          if (active.file) transport.toggle(active.id, active.durationS);
          break;
        case "seek":
          if (active.file) transport.nudge(active.id, a.by, active.durationS);
          break;
        case "score": {
          if (!dim) break;
          rate(active, dim, a.value);
          const i = dims.indexOf(dim);
          if (i < dims.length - 1) setDim(dims[i + 1]);
          break;
        }
        case "dim": {
          const i = dim ? dims.indexOf(dim) : 0;
          setDim(dims[Math.max(0, Math.min(dims.length - 1, i + a.by))]);
          break;
        }
        case "keep":
          decide(active, "kept");
          break;
        case "reject":
          setMode("defects");
          setDefects(active.verdict === "rejected" ? active.reasons : []);
          setNote(active.note ?? "");
          break;
        case "defect": {
          const code = DEFECT_ORDER[kind][a.index];
          if (code) setDefects((d) => (d.includes(code) ? d.filter((x) => x !== code) : [...d, code]));
          break;
        }
        case "confirm":
          decide(active, "rejected");
          break;
        case "cancel":
          setMode("judge");
          if (inNote) noteRef.current?.blur();
          break;
        case "next":
          open(step(rail, active.id, 1));
          break;
        case "prev":
          open(step(rail, active.id, -1));
          break;
        case "clear":
          if (active.verdict !== "unjudged") data.patch(active.id, () => ({ verdict: "unjudged", reasons: [], note: null }));
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)_400px]">
      {/* ── the queue ── */}
      <section aria-label="Queue" className="grid min-w-0 gap-4">
        <Panel className="grid gap-1 p-2">
          <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-1.5">
            <span className={CAPS}>queue</span>
            <OriginMix queue={queue} />
          </div>
          {queue.length === 0 ? (
            <div className="px-1 pb-1">
              <Ghost shape="row" count={3} label="Nothing waiting to be judged" />
            </div>
          ) : (
            <ol className="grid gap-1">
              {queue.map((t, i) => (
                <QueueRow
                  key={t.id}
                  take={t}
                  on={t.id === active?.id}
                  onOpen={() => open(t.id)}
                  groupHead={i === 0 || queue[i - 1].origin !== t.origin ? ORIGIN_WORD[t.origin] : null}
                  reduce={!!reduce}
                />
              ))}
            </ol>
          )}
          {judged.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-3">
                <span className={CAPS}>judged here</span>
                <Tally value={judged.filter((t) => t.verdict === "kept").length} of={judged.length} label="kept" tone="emerald" />
              </div>
              <ol className="grid gap-1">
                {judged.map((t) => (
                  <QueueRow key={t.id} take={t} on={t.id === active?.id} onOpen={() => open(t.id)} groupHead={null} reduce={!!reduce} done />
                ))}
              </ol>
            </>
          )}
        </Panel>
        <Batch kind={kind} onMade={(ts) => data.upsert(ts)} />
      </section>

      {/* ── the take ── */}
      {active ? (
        <JudgePane
          key={active.id}
          take={active}
          position={queue.findIndex((t) => t.id === active.id)}
          total={queue.length}
          dim={dim}
          onDim={setDim}
          onRate={(d, v) => rate(active, d, v)}
          mode={mode}
          defects={defects}
          onDefects={setDefects}
          note={note}
          onNote={setNote}
          noteRef={noteRef}
          onKeep={() => decide(active, "kept")}
          onReject={() => (mode === "defects" ? decide(active, "rejected") : (setMode("defects"), setDefects(active.reasons), setNote(active.note ?? "")))}
          onBack={() => setMode("judge")}
          measuring={measure.measuring}
          now={now}
        />
      ) : (
        <ClearPane kind={kind} judged={judged.length} />
      )}

      {/* ── the brief ── */}
      {active ? (
        <Brief take={active} measuring={measure.measuring} measureError={measure.error} now={now} />
      ) : (
        <Panel className="grid gap-3 p-5">
          <span className={CAPS}>brief</span>
          <Ghost shape="slot" count={3} label="No take open" />
        </Panel>
      )}
    </div>
  );
}

/** Where the waiting takes came from, as one proportional rail — the agents'
 *  share is the number that says whether triage is keeping up with them. */
function OriginMix({ queue }: { queue: SoundTake[] }) {
  if (queue.length === 0) return <Tally value={0} label="waiting" />;
  const n = (o: SoundTake["origin"]) => queue.filter((t) => t.origin === o).length;
  const agent = n("agent");
  return (
    <span className="flex items-center gap-2">
      {agent > 0 && <Tally value={agent} of={queue.length} label="agent" tone="cyan" />}
      {agent < queue.length && <Tally value={queue.length - agent} label="other" />}
    </span>
  );
}

/* ── a queue row ───────────────────────────────────────────────────────── */

function QueueRow({
  take,
  on,
  onOpen,
  groupHead,
  reduce,
  done = false,
}: {
  take: SoundTake;
  on: boolean;
  onOpen: () => void;
  groupHead: string | null;
  reduce: boolean;
  done?: boolean;
}) {
  return (
    <motion.li
      layout={reduce ? false : "position"}
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE }}
      className={groupHead ? "mt-1.5 first:mt-0" : ""}
    >
      <div
        onClick={onOpen}
        className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_4.5rem] items-center gap-3 rounded-xl border px-2.5 py-2 transition ${
          on
            ? "border-cyan-400/45 bg-cyan-400/[0.06] shadow-[0_0_18px] shadow-cyan-400/10"
            : "border-transparent hover:border-white/12 hover:bg-white/[0.035]"
        } ${done && !on ? "opacity-70" : ""}`}
      >
        <PlayButton take={take} size="sm" />
        <span className="grid min-w-0 gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            aria-current={on || undefined}
            className="truncate text-left font-instrument text-content leading-tight text-white"
          >
            {take.title}
          </button>
          <span className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap font-jetbrains text-label text-white/40">
            {done ? <VerdictChip take={take} className="!px-2 !py-px" /> : <OriginChip origin={take.origin} />}
            <span className="shrink-0 tabular-nums">{lengthWord(take.kind, take.durationS)}</span>
            <span className="min-w-0 truncate">
              <ProviderChip provider={take.provider} />
            </span>
          </span>
        </span>
        <span className="h-7">
          {take.peaks?.length ? <TakeWave take={take} height="h-7" bars={28} dim={!on} /> : <GhostWave bars={20} height="h-7" />}
        </span>
      </div>
    </motion.li>
  );
}

/* ── the take under judgement ──────────────────────────────────────────── */

function JudgePane({
  take,
  position,
  total,
  dim,
  onDim,
  onRate,
  mode,
  defects,
  onDefects,
  note,
  onNote,
  noteRef,
  onKeep,
  onReject,
  onBack,
  measuring,
  now,
}: {
  take: SoundTake;
  position: number;
  total: number;
  dim: string | null;
  onDim: (d: string) => void;
  onRate: (d: string, v: number) => void;
  mode: KeyMode;
  defects: DefectCode[];
  onDefects: (d: DefectCode[]) => void;
  note: string;
  onNote: (s: string) => void;
  noteRef: React.RefObject<HTMLInputElement | null>;
  onKeep: () => void;
  onReject: () => void;
  onBack: () => void;
  measuring: boolean;
  now: number;
}) {
  const reduce = useReducedMotion();
  const st = usePlayback(take.id);
  const fileLength = useFileLength(take.id);
  const length = st?.duration || measuredLength(take.id) || fileLength || take.durationS;
  const kept = take.verdict === "kept";
  const rejected = take.verdict === "rejected";
  return (
    <motion.section
      aria-label={`Judging ${take.title}`}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
    >
      <Panel className="grid min-w-0 gap-6 p-6 [&>*]:min-w-0">
        <div tabIndex={-1} data-judge="pane" className="grid gap-1.5 outline-none">
          <div className="flex items-start justify-between gap-4">
            <h2 className="min-w-0 truncate font-instrument text-3xl leading-tight text-white">{take.title}</h2>
            <span className="flex shrink-0 items-center gap-2 pt-1.5">
              {take.verdict !== "unjudged" && <VerdictChip take={take} />}
              {position >= 0 && <Tally value={position + 1} of={total} label="queue" />}
            </span>
          </div>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-jetbrains text-label text-white/40">
            <OriginChip origin={take.origin} />
            <ProviderChip provider={take.provider} />
            <span>{OP_WORD[take.op]}</span>
            {take.kind === "sfx" && take.loop && <span className="text-cyan-200/70">loop</span>}
            <span>{ago(take.createdAt, now)} ago</span>
          </span>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center gap-4">
            <PlayButton take={take} size="lg" />
            <div className="min-w-0 flex-1">
              <TakeWave take={take} height="h-24" bars={140} measuring={measuring} />
            </div>
          </div>
          <div className="flex justify-between pl-16 font-jetbrains text-label tabular-nums text-white/40">
            <span className={st?.playing ? "text-cyan-200/80" : ""}>{dur(st?.position ?? 0)}</span>
            {st?.failed ? <span className="text-rose-300/80">file would not play</span> : !take.file ? <span className="text-white/30">no file</span> : null}
            <span>{dur(length)}</span>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className={CAPS}>rubric</span>
            <ScoreMeter take={take} />
          </div>
          <RubricControl take={take} active={mode === "judge" ? dim : null} onActive={onDim} onRate={onRate} size="lg" />
        </div>

        <div className="grid gap-3 border-t border-white/6 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onKeep} aria-pressed={kept} className={`${BTN_KEEP} ${kept ? "bg-emerald-400/15" : ""}`}>
              <Check className="h-4 w-4" aria-hidden />
              keep
              <kbd className="font-jetbrains text-label text-emerald-200/50">K</kbd>
            </button>
            <button
              type="button"
              onClick={onReject}
              aria-pressed={rejected || mode === "defects"}
              className={`${BTN_REJECT} ${mode === "defects" || rejected ? "bg-rose-400/12" : ""}`}
            >
              <X className="h-4 w-4" aria-hidden />
              {mode === "defects" ? `reject${defects.length ? ` · ${defects.length}` : ""}` : "reject"}
              <kbd className="font-jetbrains text-label text-rose-200/50">{mode === "defects" ? "Enter" : "X"}</kbd>
            </button>
            {mode === "defects" && (
              <button type="button" onClick={onBack} className={BTN}>
                back <kbd className="font-jetbrains text-label text-white/35">Esc</kbd>
              </button>
            )}
            {mode === "judge" && rejected && <DefectChips reasons={take.reasons} />}
          </div>
          {mode === "defects" && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="grid gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.03] p-3"
            >
              <DefectPicker kind={take.kind} value={defects} onChange={onDefects} />
              <input
                ref={noteRef}
                value={note}
                onChange={(e) => onNote(e.target.value)}
                placeholder="note"
                aria-label="Rejection note"
                className={FIELD}
              />
            </motion.div>
          )}
        </div>

        <KeyLegend mode={mode} />
      </Panel>
    </motion.section>
  );
}

/** The keys, always on screen under the calls — a keymap is a table, not
 *  prose (CLAUDE.md's <Keycaps> exemption); the glyph holds the same table. */
function KeyLegend({ mode }: { mode: KeyMode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/6 pt-4">
      {KEYMAP[mode].map((b) => (
        <span key={b.does} className="inline-flex items-center gap-1.5">
          {b.keys.map((k) => (
            <kbd
              key={k}
              className="inline-flex min-w-[1.5rem] justify-center rounded border border-white/15 bg-white/[0.05] px-1.5 py-px font-jetbrains text-label text-white/70"
            >
              {k}
            </kbd>
          ))}
          <span className="font-jetbrains text-label text-white/40">{b.does}</span>
        </span>
      ))}
      <Keycaps map={[...KEYMAP.judge, ...KEYMAP.defects]} className="ml-auto" label="Triage keys" />
    </div>
  );
}

/* ── the queue is clear ────────────────────────────────────────────────── */

function ClearPane({ kind, judged }: { kind: SoundKind; judged: number }) {
  const cli =
    kind === "sfx"
      ? "npx tsx pipeline/sound.mts generate --kind sfx --prompt … --duration 3"
      : "npx tsx pipeline/sound.mts generate --kind music --prompt … --technique tag-list --duration 30";
  return (
    <Panel className="grid min-w-0 gap-6 p-6 [&>*]:min-w-0">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-instrument text-3xl leading-tight text-white/80">Queue clear</h2>
        {judged > 0 && <Tally value={judged} label="judged here" tone="emerald" className="mt-1.5" />}
      </div>
      <div className="flex min-w-0 items-center gap-4 opacity-70">
        <span aria-hidden className="h-12 w-12 shrink-0 rounded-full border border-white/12" />
        <GhostWave bars={96} height="h-24" className="min-w-0 flex-1" seed={3} />
      </div>
      <div aria-hidden className="grid gap-1.5 opacity-70">
        {(kind === "sfx" ? ["EVT", "SND"] : ["MEL", "CHO", "QUA"]).map((r) => (
          <div key={r} className="grid grid-cols-[3.75rem_minmax(0,1fr)_2rem] items-center gap-2 px-1">
            <span className="px-1 font-jetbrains text-label tracking-[0.12em] text-white/25">{r}</span>
            <span className="flex gap-[3px]">
              {Array.from({ length: 10 }, (_, k) => (
                <span key={k} className="h-7 min-w-0 flex-1 rounded-[3px] bg-white/[0.04]" />
              ))}
            </span>
            <span />
          </div>
        ))}
      </div>
      <div className={`${CARD} flex items-center gap-3 px-4 py-3`}>
        <Terminal className="h-4 w-4 shrink-0 text-cyan-200/60" aria-label="agent command" />
        <code className="min-w-0 truncate font-jetbrains text-label text-white/70">{cli}</code>
      </div>
    </Panel>
  );
}

/* ── the brief ─────────────────────────────────────────────────────────── */

function Brief({
  take,
  measuring,
  measureError,
  now,
}: {
  take: SoundTake;
  measuring: boolean;
  measureError: string | null;
  now: number;
}) {
  const fileLength = useFileLength(take.id);
  useEffect(() => {
    if (take.file) transport.probe(take.id);
  }, [take.id, take.file]);
  const asked = askedFigures(take);
  const m = take.measured;
  const length = measuredLength(take.id) ?? fileLength;
  const lengthOff = take.durationS != null && length != null && Math.abs(length - take.durationS) > Math.max(1, take.durationS * 0.1);
  const unmeasured = measuring ? "measuring" : measureError ? "unreadable" : take.file ? "—" : "no file";
  const rows: { k: string; asked: string | null; measured: string | null; off: boolean }[] =
    take.kind === "music"
      ? [
          { k: "tempo", asked: asked.tempo, measured: m?.tempoBpm != null ? `${m.tempoBpm.toFixed(1)} BPM` : null, off: tempoOff(take.tempoBpm, m?.tempoBpm ?? null) },
          { k: "key", asked: asked.key, measured: m?.key ?? null, off: !!(take.key && m?.key && take.key !== m.key) },
          { k: "length", asked: asked.length, measured: length != null ? dur(length) : null, off: lengthOff },
        ]
      : [
          { k: "length", asked: asked.length, measured: length != null ? lengthWord("sfx", length) : null, off: lengthOff },
          { k: "loop", asked: take.loop == null ? null : take.loop ? "loop" : "one-shot", measured: null, off: false },
        ];
  return (
    <Panel as="aside" className="grid min-w-0 gap-5 p-5 xl:sticky xl:top-4 [&>*]:min-w-0">
      <div className="flex items-center justify-between gap-3">
        <span className={CAPS}>brief</span>
        <span className="flex items-center gap-2 font-jetbrains text-label text-white/40">
          <ProviderChip provider={take.provider} />
          <span>{OP_WORD[take.op]}</span>
        </span>
      </div>

      <div className="grid gap-1.5">
        <p className={`${CARD} max-h-56 overflow-auto whitespace-pre-line px-3.5 py-3 font-hanken text-content leading-snug text-white/85`}>
          {take.prompt || <span className="text-white/30">no prompt recorded</span>}
        </p>
        {take.negative && (
          <p className="flex gap-2 px-1 font-hanken text-label leading-snug text-rose-200/80">
            <span className="shrink-0 font-jetbrains text-rose-300/60">no</span>
            {take.negative}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <span className={CAPS}>technique</span>
        <TechniqueChips technique={take.technique} />
      </div>

      <div className="grid gap-2">
        <span className={CAPS}>{take.kind === "sfx" ? "category · mood" : "genre · mood · instrument"}</span>
        <TermChips terms={take.terms} kind={take.kind} />
      </div>

      <div className="grid gap-2">
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 font-jetbrains text-label">
          <span />
          <span className={CAPS}>asked</span>
          <span className={CAPS}>measured</span>
        </div>
        <dl className={`${CARD} grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2 px-3.5 py-3 font-jetbrains text-label`}>
          {rows.map((r) => (
            <div key={r.k} className="contents">
              <dt className="text-white/40">{r.k}</dt>
              <dd className={r.asked ? "text-white/85" : "text-white/25"}>{r.asked ?? "—"}</dd>
              <dd
                className={
                  r.measured
                    ? r.off
                      ? "text-amber-200"
                      : "text-white/85"
                    : measuring
                      ? "animate-pulse text-cyan-200/60"
                      : "text-white/25"
                }
              >
                {r.measured ?? (r.k === "loop" ? "—" : unmeasured)}
              </dd>
            </div>
          ))}
        </dl>
        {measureError && <span className="px-1 font-jetbrains text-label text-rose-200/70">{measureError}</span>}
      </div>

      {take.parentId && (
        <span className="flex items-center gap-2 font-jetbrains text-label text-white/40">
          <ChevronDown className="h-3.5 w-3.5 -rotate-90" aria-hidden />
          version of {take.parentId}
        </span>
      )}
      <span className="font-jetbrains text-label text-white/30">
        {take.id} · {ago(take.createdAt, now)} ago
      </span>
    </Panel>
  );
}

