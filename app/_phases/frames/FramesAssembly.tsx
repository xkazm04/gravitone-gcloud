"use client";

// ASSEMBLY — the cut as a production ledger.
//
// Metaphor: a shot list on a wall. One row per scene, and the columns are the
// three layers, so the eye reads DOWN a column and finds every frame still
// missing a plate, not across a row and finds one frame. On a sixteen-frame cut
// the real question is "what is not done", and neither a band nor a canvas
// answers it without scrolling.
//
// Rows carry the beat's own title and its breakdown, and expand in place to
// show the composite — so the sequence view and the standalone view are the
// same view at two densities, rather than two screens.
//
// It also does the thing neither sibling can: RENDER EVERY MISSING PLATE in one
// action, serially, because sixteen clicks is not a workflow.

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";

import { Keycaps, Tally } from "@/components/ui/signal";
import { typing } from "@/lib/board/keys";
import { quoteBudget, type BudgetQuoteResult } from "@/lib/imagingClient";

import { durationOf, humanMs, isComposed, type Frame, type FrameText, type LayerRef, type PlateState } from "./frames";
import SourceChip from "../_shared/notebook/SourceChip";
import type { Fact } from "../_shared/notebook/types";
import { FrameCanvas, KindChip, LayerBreakdown } from "./parts";
import LayerPanel from "./LayerPanel";
import DispatchStrip from "../_shared/ui/DispatchStrip";
import { planRender, afterOutcome } from "./renderPlan";
import type { useFrames } from "./useFrames";

// The assembly table's columns, shared by the header and every row — they can
// only stay aligned if they read the same rule.
//
// `breakdown` is 244px because that is what it MEASURES: the column holds four
// badges (plate · clip · elements · texts) in a row, and at text-label 16px
// they need 235px including their three 8px gaps. It was 206px, cut for the
// old 14px label, and the 2026-09-08 type bump pushed the four badges out of
// their own column and over the plate word beside it. The other four tracks
// were re-measured at the same time and still fit. `1fr` absorbs the
// difference, so the table's overall width is unchanged.
const ASSEMBLY_GRID = "grid-cols-[52px_1fr_244px_120px_86px]";

export default function FramesAssembly({ ctl }: { ctl: ReturnType<typeof useFrames> }) {
  const { frames, render, busy, generatePlate, setSubject, plateCost, totalCost, direction } = ctl;
  const { setMotion, setText, bindFact, removeText, addText, moveLayer, resizeElement, reorderLayer, toggleHidden, removeElement } = ctl;
  const [openId, setOpenId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  /** How many plates were still missing when a batch stopped itself. Null when
   *  no batch has stopped early — absence, not zero. */
  const [stoppedWith, setStoppedWith] = useState<number | null>(null);
  const [budgetQuoteResult, setBudgetQuoteResult] = useState<BudgetQuoteResult | null>(null);
  const [pausedUntil, setPausedUntil] = useState<number | null>(null);
  // One selection, shared by the canvas and the panel. Held here rather than in
  // either of them so they cannot disagree about what is selected.
  const [selected, setSelected] = useState<LayerRef>(null);

  const missing = useMemo(() => frames.filter((f) => !isComposed(f)), [frames]);

  // THE ROW'S HANDLERS, ONCE. Every one of them is a stable callback in
  // `useFrames` (generatePlate reads the cut through a ref), so this object is
  // built once per cut and a memoised <Row> re-renders only when its own frame
  // does. Before, each row was handed fresh closures on every render of the
  // ledger — a pointer move dragging one caption re-rendered all sixteen rows,
  // canvases and all.
  const ops = useMemo<LedgerOps>(
    () => ({
      toggle: (id) => {
        setOpenId((cur) => (cur === id ? null : id));
        setSelected(null);
      },
      render: (id) => void generatePlate(id),
      subject: setSubject,
      motion: setMotion,
      text: setText,
      bind: bindFact,
      removeText,
      addText,
      select: setSelected,
      move: moveLayer,
      resize: resizeElement,
      reorder: reorderLayer,
      toggleHidden,
      removeLayer: (id, ref) => (ref.type === "element" ? removeElement(id, ref.id) : removeText(id, ref.id)),
    }),
    [generatePlate, setSubject, setMotion, setText, bindFact, removeText, addText, moveLayer, resizeElement, reorderLayer, toggleHidden, removeElement],
  );

  // THE LEDGER BY KEYBOARD — the Board's J/K/Esc, plus N for the question this
  // view exists to answer: the next frame with no plate, opened. A sixteen-row
  // pass used to be sixteen aims at a chevron. Ignored while typing (the subject
  // box, a caption, the fact picker) and with any modifier held.
  const rows = useRef<HTMLDivElement>(null);
  const live = useRef({ frames, openId });
  useEffect(() => {
    live.current = { frames, openId };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || typing(e.target)) return;
      const { frames: fs, openId: cur } = live.current;
      if (fs.length === 0) return;
      const at = fs.findIndex((f) => f.id === cur);
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      let next: string | null | undefined;
      if (k === "j") next = fs[Math.min(fs.length - 1, at + 1)].id;
      else if (k === "k") next = fs[Math.max(0, at === -1 ? 0 : at - 1)].id;
      else if (k === "n") {
        // From the row after the open one, wrapping, so N walks the gaps in order.
        const order = [...fs.slice(at + 1), ...fs.slice(0, at + 1)];
        next = order.find((f) => !isComposed(f))?.id;
      } else if (k === "Escape" && cur !== null) next = null;
      if (next === undefined) return;
      e.preventDefault();
      setOpenId(next);
      setSelected(null);
      if (next)
        requestAnimationFrame(() =>
          rows.current
            ?.querySelector(`[data-frame-row="${CSS.escape(next)}"]`)
            ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
        );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const plan = planRender({
    missing: missing.length,
    quote: missing.length > 0 ? (budgetQuoteResult?.quote ?? null) : null,
  });

  // A blocked or partial quote carries the moment the budget window rolls over.
  // The quote is only fetched when the missing count changes, which a blocked
  // batch cannot do, so the button would stay dead until a reload; the timer
  // bumps `requote` at resumeAt to ask again. State is set only inside the
  // timer and promise callbacks, never synchronously in the effect.
  const [requote, setRequote] = useState(0);

  useEffect(() => {
    let mounted = true;
    if (missing.length === 0) return;
    void quoteBudget(missing.length)
      .then((res) => {
        if (mounted) setBudgetQuoteResult(res);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [missing.length, requote]);

  useEffect(() => {
    if (plan.resumeAt === null) return;
    const wait = plan.resumeAt - Date.now();
    // Past or absurdly far (setTimeout wraps at 2^31 ms): do not arm.
    if (wait <= 0 || wait > 2_147_483_647) return;
    const timer = setTimeout(() => setRequote((n) => n + 1), wait);
    return () => clearTimeout(timer);
  }, [plan.resumeAt]);

  /** Serial, not parallel: the vendor's rate ceiling is unpublished and a
   *  sixteen-wide burst is exactly how you find it.
   *
   *  AND IT STOPS ON A SYSTEMIC FAILURE. `generatePlate` swallows its own error
   *  so one bad plate cannot take the row down, which used to mean this loop
   *  could not tell "the vendor declined this subject" from "there is no quota
   *  left" — so a dead key or a dropped connection fired all sixteen calls into
   *  the same wall, one per frame, and the user was shown only the last one's
   *  message. A refusal is about one subject and the loop continues; a failure
   *  is about the run and the loop ends, saying how much it did not attempt. */
  const renderMissing = async () => {
    setRunningAll(true);
    setStoppedWith(null);
    setPausedUntil(null);
    try {
      const queue = frames.filter((f) => !isComposed(f));
      const limit = plan.count > 0 ? Math.min(plan.count, queue.length) : queue.length;
      for (let i = 0; i < limit; i++) {
        const res = await generatePlate(queue[i].id);
        const action = afterOutcome(res.outcome, res.retryAt);
        if (action.action === "pause-until") {
          setPausedUntil(action.until ?? null);
          setStoppedWith(queue.length - i);
          break;
        }
        if (action.action === "stop") {
          setStoppedWith(queue.length - i);
          break;
        }
      }
    } finally {
      setRunningAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className="font-jetbrains text-label text-white/50"
          title={
            direction || plateCost > 0
              ? `${direction?.unpriced ? "at least " : ""}$${totalCost.toFixed(3)} spent on this step in total`
              : undefined
          }
        >
          {frames.length - missing.length}/{frames.length} composed
          {/* THE SPEND LINE, and the reason it is two figures rather than one:
              plates are many small charges made one at a time, the direction
              pass is one large charge made rarely, and the header used to show
              only the first — an undercount that omitted the most expensive
              call in the step. Merging them back would hide the same thing
              behind a bigger number. */}
          {plateCost > 0 && <span className="text-white/30"> · ${plateCost.toFixed(3)} plates</span>}
          {direction && (
            <span className="text-white/30">
              {" · "}
              {/* A pass the engine did not price reads as unknown. Never zero:
                  zero is a claim about money that nobody can support. */}
              {direction.costUsd > 0
                ? `${direction.unpriced ? "at least " : ""}$${direction.costUsd.toFixed(3)} direction`
                : "direction · cost unknown"}
              {direction.runs > 1 && ` (${direction.runs} passes)`}
              {/* This call takes minutes. The user paid for those too. */}
              {direction.lastMs !== undefined && ` · last pass ${humanMs(direction.lastMs)}`}
            </span>
          )}
          {/* The integrity number. A figure nobody sourced is the defect this
              step exists to catch, so it is on the header rather than buried. */}
          {ctl.unboundFigures > 0 && (
            <span className="text-amber-200/90"> · {ctl.unboundFigures} unsourced figure{ctl.unboundFigures === 1 ? "" : "s"}</span>
          )}
          {/* The clip layer's own "what is not done". Authored, never rendered —
              this app has no video engine, and the word says exactly that. */}
          <span className="text-white/30"> · {ctl.clipsAuthored}/{frames.length} clips authored</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
        <Keycaps
          label="Ledger keys"
          map={[
            { keys: ["J", "K"], does: "next · previous" },
            { keys: ["N"], does: "next missing plate" },
            { keys: ["Esc"], does: "close" },
          ]}
        />
        <button
          onClick={() => void ctl.direct()}
          data-testid="direct-the-cut"
          // A pass the route would refuse, or no engine can serve, is not
          // offered: the strip under the row carries the reason (AIO-B).
          disabled={ctl.directing || Boolean(ctl.directionBlocked)}
          aria-describedby={ctl.directionBlocked ? "frames-dispatch" : undefined}
          title="Read the whole script and art-direct every frame in one pass"
          className="inline-flex items-center gap-2 rounded-xl border border-violet-300/35 bg-violet-300/10 px-3.5 py-1.5 text-label font-semibold text-violet-100 transition hover:bg-violet-300/20 disabled:opacity-40"
        >
          {ctl.directing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Wand2 className="h-3.5 w-3.5" aria-hidden />}
          {ctl.directing ? "directing…" : "direct the cut"}
          {/* By the ledger's clock, so a reload mid-pass picks up where it was. */}
          {ctl.directingSince !== null && <Elapsed since={ctl.directingSince} />}
        </button>
        {/* The pass is the server's and outlives this step (2026-10-06), so
            stopping it is a deliberate act with its own control. It ends the
            engine's process, not just this view of it. Absent until the server
            has named the turn — there is nothing to stop before. */}
        {ctl.directingSince !== null && (
          <button
            data-testid="direct-stop"
            onClick={ctl.cancelDirection}
            aria-label="Stop the scene direction"
            className="font-jetbrains rounded-full border border-white/15 px-2.5 py-1 text-label text-white/55 transition hover:border-rose-400/40 hover:text-rose-200"
          >
            stop
          </button>
        )}
        <button
          onClick={() => void renderMissing()}
          disabled={runningAll || missing.length === 0 || plan.count === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-400/10 px-3.5 py-1.5 text-label font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-40"
        >
          {runningAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
          {runningAll
            ? "rendering…"
            : pausedUntil !== null
              ? `paused until ${new Date(pausedUntil).toLocaleTimeString()} (${stoppedWith ?? missing.length} left)`
              : stoppedWith !== null
                ? `retry ${missing.length} missing plate${missing.length === 1 ? "" : "s"}`
                : plan.resumeAt !== null
                  ? `${plan.label} · resumes ${new Date(plan.resumeAt).toLocaleTimeString()}`
                  : plan.label}
          {/* WHAT THE STOPPED BATCH GOT THROUGH, on the button that ran it. A
              paragraph used to stand under this row saying "The batch stopped
              after a failure that was about the run rather than one plate — N
              plates were not attempted. Fix the reason above, then run it
              again." The reason is in the error line above; the count is this;
              and "run it again" is the verb already on the button. */}
          {stoppedWith !== null && !runningAll && (
            <Tally
              label="left"
              value={stoppedWith}
              of={frames.length}
              tone="amber"
              className="ml-1"
            />
          )}
        </button>
        </div>
      </div>

      {/* The direction pass's pre-flight: what it sends, who serves it, about
          how long it takes here — beside the button that spends it. */}
      <DispatchStrip id="frames-dispatch" outcome={ctl.directionPreview} />

      {/* Which notebook the binding list, the brief and the grade read. */}
      <SourceChip source={ctl.notebook} />

      <div ref={rows} className="overflow-hidden rounded-xl border border-white/8">
        <div className={`font-jetbrains grid ${ASSEMBLY_GRID} gap-2 border-b border-white/8 bg-white/[0.02] px-3 py-2 text-label tracking-[0.14em] text-white/35 uppercase`}>
          <span>at</span>
          <span>scene</span>
          <span>breakdown</span>
          <span>plate</span>
          <span className="text-right">holds</span>
        </div>

        {frames.map((f, i) => (
          <Row
            key={f.id}
            frame={f}
            index={i}
            holdS={durationOf(frames, i, render.durationS)}
            open={openId === f.id}
            busy={busy.has(f.id)}
            rejection={ctl.rejections[f.at]}
            facts={ctl.facts}
            selected={openId === f.id ? selected : null}
            ops={ops}
          />
        ))}
      </div>
    </div>
  );
}

/** What a ledger row can do, each keyed by the frame it acts on. One object for
 *  the whole ledger — see `ops` above. */
interface LedgerOps {
  toggle: (id: string) => void;
  render: (id: string) => void;
  subject: (id: string, v: string) => void;
  motion: (id: string, v: string) => void;
  text: (id: string, textId: string, v: string) => void;
  bind: (id: string, textId: string, factId: string | undefined) => void;
  removeText: (id: string, textId: string) => void;
  addText: (id: string, role: FrameText["role"]) => void;
  select: (ref: LayerRef) => void;
  move: (id: string, ref: NonNullable<LayerRef>, x: number, y: number) => void;
  resize: (id: string, elId: string, w: number, h: number) => void;
  reorder: (id: string, ref: NonNullable<LayerRef>, dir: -1 | 1) => void;
  toggleHidden: (id: string, ref: NonNullable<LayerRef>) => void;
  removeLayer: (id: string, ref: NonNullable<LayerRef>) => void;
}

/** Keyed by `PlateState` rather than by `string`, so a sixth plate state is a
 *  compile error here and not a `undefined.cls` at render time. Its two
 *  siblings on the shot sheet (`VERDICT_STYLE`, `PACE_STYLE`) are keyed by
 *  their unions already; this was the one map that was not. */
const PLATE_WORD: Record<PlateState, { word: string; cls: string }> = {
  ready: { word: "rendered", cls: "text-cyan-300" },
  generating: { word: "rendering", cls: "text-cyan-300/60" },
  refused: { word: "refused", cls: "text-rose-300" },
  empty: { word: "—", cls: "text-white/25" },
};

const Row = memo(function Row({
  frame,
  index,
  holdS,
  open,
  busy,
  rejection,
  facts,
  selected,
  ops,
}: {
  frame: Frame;
  index: number;
  /** Null when the beat's position does not parse — an unknown hold, drawn as a
   *  dash rather than as a number nobody can support. */
  holdS: number | null;
  open: boolean;
  busy: boolean;
  /** Why the last direction pass refused this beat, if it did. */
  rejection?: string;
  facts: Fact[];
  selected: LayerRef;
  ops: LedgerOps;
}) {
  const id = frame.id;
  const onToggle = () => ops.toggle(id);
  const onRender = () => ops.render(id);
  const onSubject = (v: string) => ops.subject(id, v);
  const onMotion = (v: string) => ops.motion(id, v);
  const onText = (textId: string, v: string) => ops.text(id, textId, v);
  const onBind = (textId: string, factId: string | undefined) => ops.bind(id, textId, factId);
  const onRemoveText = (textId: string) => ops.removeText(id, textId);
  const onAddText = (role: FrameText["role"]) => ops.addText(id, role);
  const onSelect = ops.select;
  const onMove = (ref: NonNullable<LayerRef>, x: number, y: number) => ops.move(id, ref, x, y);
  const onResize = (elId: string, w: number, h: number) => ops.resize(id, elId, w, h);
  const onReorder = (ref: NonNullable<LayerRef>, dir: -1 | 1) => ops.reorder(id, ref, dir);
  const onToggleHidden = (ref: NonNullable<LayerRef>) => ops.toggleHidden(id, ref);
  const onRemoveLayer = (ref: NonNullable<LayerRef>) => ops.removeLayer(id, ref);
  const plate = PLATE_WORD[frame.plate.state];
  return (
    <div data-frame-row={frame.id} className={`border-b border-white/6 last:border-0 ${open ? "bg-white/[0.02]" : ""}`}>
      <div className={`grid ${ASSEMBLY_GRID} items-center gap-2 px-3 py-2`}>
        {/* Both halves of the row toggle the same panel, so both carry the
            state. Without it the chevron is the only thing that says whether
            this row is open, and a chevron is a picture. */}
        <button onClick={onToggle} aria-expanded={open} className="flex items-center gap-1 text-left">
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-white/40" aria-hidden />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-white/40" aria-hidden />
          )}
          <span className="font-jetbrains text-label text-white/55">{frame.at}</span>
        </button>

        <button onClick={onToggle} aria-expanded={open} className="flex min-w-0 items-center gap-2 text-left">
          <span className="font-jetbrains w-5 shrink-0 text-label text-white/25">{String(index + 1).padStart(2, "0")}</span>
          <span className="font-hanken truncate text-content text-white/85">{frame.title}</span>
          <KindChip kind={frame.kind} />
        </button>

        <LayerBreakdown frame={frame} compact />

        <span className={`font-jetbrains text-label ${plate.cls}`}>{plate.word}</span>

        <span className="font-jetbrains text-right text-label text-white/35" title={holdS === null ? "this beat's position is not a timecode, so its hold is unknown" : undefined}>
          {holdS === null ? "—" : `${holdS}s`}
        </span>
      </div>

      {/* What the last direction pass said about THIS beat. It sits on the row
          rather than in a summary line because that is where it can be acted
          on: the reason names the defect, and the frame beside it still holds
          whatever it had before the pass ran. */}
      {rejection && (
        <p className="font-jetbrains flex items-start gap-1.5 px-3 pb-2 text-content leading-snug text-amber-200/85">
          <AlertTriangle className="mt-[2px] h-3 w-3 shrink-0" aria-hidden />
          {/* The reason, and nothing after it. "This beat kept what it had"
              described the row underneath, which is unchanged and visibly so. */}
          <span>{rejection}</span>
        </p>
      )}

      {open && (
        <div className="grid gap-4 px-3 pb-4 lg:grid-cols-[1fr_300px]">
          <div className="space-y-3">
            <FrameCanvas
              frame={frame}
              edit={{ selected, onSelect, onMove, onResize }}
            />
            {/* "drag any layer to move it · a selected element gets a resize
                handle" stood here. The canvas draws both affordances: a layer
                under the pointer takes `cursor-move` (see FrameCanvas in
                ./parts) and a selected element grows a handle. A sentence about
                a direct-manipulation affordance is the affordance failing. */}
            <LayerPanel
              frame={frame}
              selected={selected}
              onSelect={onSelect}
              onReorder={onReorder}
              onToggleHidden={onToggleHidden}
              onRemove={(ref) => {
                onRemoveLayer(ref);
                onSelect(null);
              }}
            />
          </div>
          <div className="space-y-2.5">
            <p className="font-hanken text-content leading-snug text-slate-400">&ldquo;{frame.line}&rdquo;</p>
            {frame.device && (
              <p className="font-jetbrains text-content text-white/35">device · {frame.device}</p>
            )}

            {/* The director's reasoning, shown. It is the difference between a
                composed frame and a templated one, so it belongs on screen
                where it can be disagreed with — not in a log. */}
            {frame.rationale && (
              <p className="font-hanken rounded-lg border border-violet-300/20 bg-violet-300/[0.06] px-2.5 py-2 text-content leading-snug text-violet-100/90">
                {frame.rationale}
              </p>
            )}

            <div>
              <p className="font-jetbrains mb-1 text-content tracking-[0.14em] text-white/40 uppercase">texts</p>
              <div className="space-y-1.5">
                {frame.texts.map((t) => (
                  <div key={t.id} className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-jetbrains w-11 shrink-0 text-label text-white/35">{t.role}</span>
                      <input
                        value={t.value}
                        aria-label={`${t.role} text`}
                        onChange={(e) => onText(t.id, e.target.value)}
                        className="font-hanken min-w-0 flex-1 rounded border border-white/10 bg-white/[0.03] px-1.5 py-1 text-content text-slate-200 focus:border-cyan-400/40"
                      />
                      <button
                        onClick={() => onRemoveText(t.id)}
                        aria-label={`Remove ${t.role}`}
                        className="shrink-0 rounded p-1 text-white/30 transition hover:text-rose-300"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden />
                      </button>
                    </div>
                    {/* A figure is a claim. Binding it to a sourced row is the
                        only thing that separates this from a caption someone
                        typed, so the control sits on the figure itself. */}
                    {t.role === "figure" && (() => {
                      // A binding to a fact this notebook does not carry is not
                      // a source: it is drawn as its own option, in the
                      // unsourced tone, rather than as "— unsourced —" over a
                      // stored binding.
                      const dangling = Boolean(t.factId) && !facts.some((f) => f.id === t.factId);
                      return (
                      <select
                        value={t.factId ?? ""}
                        onChange={(e) => onBind(t.id, e.target.value || undefined)}
                        // The control's meaning comes from the row it sits
                        // under; on its own it announced as an unnamed combo box.
                        aria-label={`Notebook fact cited by the figure "${t.value}"`}
                        className={`font-jetbrains ml-[3.1rem] w-[calc(100%-3.1rem)] rounded border bg-slate-950 px-1.5 py-1 text-label ${
                          t.factId && !dangling ? "border-white/10 text-white/60" : "border-amber-300/40 text-amber-200"
                        }`}
                      >
                        <option value="">— unsourced —</option>
                        {dangling && <option value={t.factId}>{t.factId} · not in this notebook</option>}
                        {facts.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.id} · {f.claim.slice(0, 60)}
                          </option>
                        ))}
                      </select>
                      );
                    })()}
                  </div>
                ))}
                <div className="flex gap-1.5 pt-0.5">
                  {(["caption", "figure", "label"] as FrameText["role"][]).map((r) => (
                    <button
                      key={r}
                      onClick={() => onAddText(r)}
                      className="font-jetbrains rounded border border-white/12 px-1.5 py-1 text-label text-white/55 transition hover:text-white/85"
                    >
                      + {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <p className="font-jetbrains mb-1 text-content tracking-[0.14em] text-white/40 uppercase">plate subject</p>
              <textarea
                value={frame.plate.subject ?? ""}
                onChange={(e) => onSubject(e.target.value)}
                rows={3}
                aria-label="plate subject"
                placeholder="subject"
                className="font-hanken w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-content leading-snug text-slate-200 focus:border-cyan-400/40"
              />
            </div>

            {/* What the picture DOES. Frames inherited motion on 2026-08-14 and
                this is where it landed — beside the subject, because a move
                decided apart from the composition fights it.

                There is no render button under this box and there will not be
                one until something can render it. Saying "the seam is unbuilt"
                costs a line; a disabled button that implies a provider exists
                costs the user's trust in every other number on this screen. */}
            <div>
              <p className="font-jetbrains mb-1 text-content tracking-[0.14em] text-white/40 uppercase">clip motion</p>
              <textarea
                value={frame.clip?.motion ?? ""}
                onChange={(e) => onMotion(e.target.value)}
                rows={2}
                aria-label="clip motion"
                placeholder="what this plate does — e.g. a slow push in as the left stack settles"
                className="font-hanken w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-content leading-snug text-slate-200 focus:border-violet-300/40"
              />
              {/* The hold and the clip's state word, and that is all. The
                  clause that followed — "this app has no video engine, so a
                  clip is written here and rendered nowhere. The render seam is
                  unbuilt" — was written three times on this one screen (here,
                  in the header's `clips authored` count, and in LayerPanel's
                  clip group). `authored` with no `rendered` beside it is the
                  same fact, said once, in the vocabulary
                  `ClipStatusWord` already uses. */}
              <p className="font-jetbrains mt-1 text-content leading-snug text-white/30">
                {holdS === null ? "hold unknown" : `holds ${holdS}s`} ·{" "}
                {frame.clip?.motion.trim() ? "authored" : "—"}
              </p>
            </div>
            <button
              onClick={onRender}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-300/90 py-2 text-label font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Sparkles className="h-3 w-3" aria-hidden />}
              {frame.plate.state === "ready" ? "render again" : "render the plate"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

/** The direction pass's elapsed time, by the ledger's clock — ticking once a
 *  second, in a component of its own. The ticker used to live in the ledger,
 *  so a pass that runs for minutes re-rendered every row, canvas and field once
 *  a second for all of them; now the second hand is the only thing that moves.
 *  Mounted only while a pass runs, and the only setState is inside the
 *  interval, never in the effect body. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(iv);
  }, []);
  return (
    <span data-testid="direct-elapsed" className="font-jetbrains font-normal text-violet-100/55">
      {humanMs(Math.max(0, now - since))}
    </span>
  );
}
