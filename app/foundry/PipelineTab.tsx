"use client";

// THE PIPELINE TAB — one canvas, two media, four directions.
//
// The ENGINE is app/foundry/pipeline: it owns the board, the drag, the keyboard,
// the two move dialogs and the one live region. This file is everything AROUND
// it — the media switch, the re-group, the arm, the `?v=` direction, the status
// strip, and the three dialogs a shell owes (./pipelineModals.tsx). It draws no
// card and no column; it reads `CanvasStatus` back and draws it AS STATE.
//
// ── THE ARM IS A WRAPPER, NOT A LABEL ──────────────────────────────────────
//
// STUB is the default and it survives a reload. It is not decoration: in LIVE
// an articles dispatch spends the operator's own Claude seat at the figures
// RUN_COST_HINT carries, and an audio dispatch bills ElevenLabs per call.
//
// `MoveRequest.live` is the flag that decides, and `lib/board/pipeline.ts` is
// explicit that "an unset `live` never bills". The shell cannot simply *label*
// that, because one path does not come through this file: the canvas's own
// `MovePrompt` answers a `needs: "confirm"` offer with `{ live: true }`
// unconditionally (app/foundry/pipeline/MovePrompt.tsx:70), and `submitMoves`
// hands that straight to `source.move()`. When this shell was built there was no
// prop through which it could be disarmed, so `armSource` below was the only
// seam that covered a dragged confirm. The engine now takes `arm` and clamps
// every request at its own chokepoint, and the canvas is handed it here.
//
// BOTH ARE KEPT, deliberately. The engine's clamp is the belt: it covers every
// path into the authority, including ones this shell does not know about. The
// wrapper is the braces: it is what counts the dry runs and keeps the last
// `wouldCall` for the receipt, and it would still hold if someone mounted the
// canvas without the prop. A switch that spends $47-92 when it is wrong is
// worth two independent guards that must both agree.
//
// So the arm is applied where every path must pass: the SOURCE. `armSource`
// wraps `move()` and clears `live` while the arm is on stub, which makes the
// switch true for the dragged confirm as well as for the two dialogs here. The
// wrapper keeps the source's identity stable (the canvas memoises on it — see
// PipelineCanvas.tsx:206) by reading the arm through a ref at CALL time rather
// than closing over the rendered value.
//
// A dry move comes back as `stubbedMove(item, wouldCall)` — a SUCCESS whose
// `wouldCall` names the route that was not called. That string is drawn in the
// strip, because a switch whose only evidence is that nothing happened is a
// switch nobody trusts.
//
// ── `?v=` ──────────────────────────────────────────────────────────────────
//
// The direction is local state seeded ONCE from the query, and written back with
// `history.replaceState` (the same door app/kit/KitView.tsx:58 uses). A
// `router.replace` would be a navigation, and a navigation is the one thing that
// could re-key this subtree and reload the board; flipping a direction changes
// `skin` and nothing else. `useSearchParams` makes the subtree client-rendered
// up to the nearest Suspense boundary, which FoundryView provides.
//
// ── WHAT IS NOT HERE ───────────────────────────────────────────────────────
//
// No `aria-live`, no `role="status"`, no `role="alert"`: the budget
// (tests/golden-path/live-region-budget) is at its ceiling and the engine owns
// the region. Announcements go through `useAnnounce`.
//
// No window keydown handler. The canvas owns the board's keys and suppresses
// them itself while an `aria-modal` dialog is up (`overlayOpen`), so a shell
// handler here could only fight it.

import { Suspense, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { Unplug } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { Segmented } from "@/components/ui/Field";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Hint, Tally } from "@/components/ui/signal";
import { useAnnounce } from "@/lib/announcer";
import { RUN_COST_HINT } from "@/lib/articles/types";
import {
  CANON_STAGES,
  type CanonStage,
  type MoveRequest,
  type MoveResult,
  type PipelineEntry,
  type PipelineLoadNotes,
  type PipelineSource,
} from "@/lib/board/pipeline";
import { makeArticlesSource } from "@/lib/board/sources/articles";
import { makeAudioSource } from "@/lib/board/sources/audio";

import { PIPELINE_ARM_KEY } from "@/lib/identityEviction";

import { PipelineCanvas, STAGE_TONE, type CanvasStatus, type PipelineHandle } from "./pipeline";
import { VARIANTS, variantFrom, type VariantId } from "./pipeline/skins";
import { DetailModal, DetailPane, DispatchConfirm, ReworkNote, type Arm, type OfferedMove } from "./pipelineModals";
import { Glass, Label, Loading } from "./ui";

/* ── the two media ────────────────────────────────────────────────────────── */

type MediaId = "articles" | "audio";

const MEDIA: ReadonlyArray<{ id: MediaId; label: string }> = [
  { id: "articles", label: "Articles" },
  { id: "audio", label: "Audio" },
];

/* ── the four directions ──────────────────────────────────────────────────── */

// `VARIANTS` is a RECORD keyed "1".."4", not a list, so the rail's order is
// stated here once rather than left to object key order.
const VARIANT_IDS = (Object.keys(VARIANTS) as VariantId[]).sort();

/* ── the arm ──────────────────────────────────────────────────────────────── */

// The key itself lives with the eviction list that must know about it: a key
// spelled here and listed there is two copies, and the copy that drifts is
// the one that stops being wiped on sign-out.
const ARM_KEY = PIPELINE_ARM_KEY;

/** STUB unless the operator has said otherwise, and STUB whenever storage
 *  cannot be read: the default of a switch that spends money is the side that
 *  does not. */
function readArm(): Arm {
  if (typeof window === "undefined") return "stub";
  try {
    return window.localStorage.getItem(ARM_KEY) === "live" ? "live" : "stub";
  } catch {
    return "stub";
  }
}

/** THE ARM AT THE MOMENT A MOVE IS SUBMITTED.
 *
 *  Module state rather than a ref: `armSource` has to read it when `move()` is
 *  CALLED, and the React Compiler rule `react-hooks/refs` forbids handing a ref
 *  to a function during render (the warning buckets in lint-baseline.json are a
 *  two-way ratchet, so a second one is a failed gate, not a note). There is one
 *  pipeline board per document and one arm on it; `localStorage` is the
 *  authority across reloads and this is the live copy.
 *
 *  `null` means nobody has asked yet, so the first read is the stored one. */
let liveArm: Arm | null = null;

const currentArm = (): Arm => (liveArm ??= readArm());

function setLiveArm(a: Arm): void {
  liveArm = a;
  try {
    window.localStorage.setItem(ARM_KEY, a);
  } catch {
    // A browser with storage blocked keeps the arm for this page's life only.
    // Failing closed on the next load is the right direction to fail in.
  }
}

/**
 * The source with the arm applied to every write, however the write was ordered.
 *
 * Identity is stable for the life of one media choice — the arm is read from the
 * ref when `move()` is CALLED — so flipping the arm does not re-key the canvas
 * and does not reload the board.
 */
function armSource(base: PipelineSource, onStub: (wouldCall: string) => void): PipelineSource {
  return {
    ...base,
    async move(req: MoveRequest): Promise<MoveResult> {
      const r = await base.move({ ...req, live: currentArm() === "live" && req.live === true });
      if (r.ok && r.stub) onStub(r.wouldCall ?? "");
      return r;
    },
  };
}

/* ── the status strip ─────────────────────────────────────────────────────── */

/**
 * The four canon stages with what the last load said about each of them.
 *
 * THIS IS WHERE `notes.degraded` LANDS. The canvas draws the in-world column
 * heads from `layout` and `skin.stageLabel` alone (app/foundry/pipeline/Frame.tsx
 * `StageHeads`) and has no slot for a per-stage note, so the shell's own stage
 * cells are the column as the shell can draw it. The reason is rendered
 * VERBATIM on the cell it names: an empty `proposed` column with no reason
 * reads as "no topics to write about" when the truth is "nobody could ask".
 *
 * `degraded` is amber, never rose. The load SUCCEEDED; a stage whose upstream is
 * absent is a limit, not a failure — the same call `StaleBadge` makes.
 */
function StageStrip({
  counts,
  notes,
  word,
}: {
  counts: Readonly<Record<CanonStage, number>>;
  notes: PipelineLoadNotes | null;
  word: (s: CanonStage) => string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {CANON_STAGES.map((s) => {
        const tone = STAGE_TONE[s];
        const down = notes?.degraded?.find((d) => d.stage === s) ?? null;
        const hidden = notes?.hidden.filter((h) => h.stage === s) ?? [];
        return (
          <div key={s} className={`flex min-w-0 flex-col gap-1.5 rounded-xl border px-3 py-2 ${down ? "border-amber-300/35 bg-amber-300/[0.05]" : tone.cell}`}>
            <div className="flex items-center gap-2">
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
              <span className={`font-jetbrains text-label tracking-[0.12em] uppercase ${tone.head}`}>{word(s)}</span>
              <span className="ml-auto flex items-center gap-1.5">
                <Tally value={counts[s]} tone={s === "gate" && counts[s] > 0 ? "amber" : "neutral"} label={s === "gate" ? "yours" : undefined} />
                {hidden.map((h) => (
                  <Tally key={h.why} label="hidden" value={h.count} tone="amber" hint={<Hint tone="amber">{h.why}</Hint>} />
                ))}
              </span>
            </div>
            {down && (
              <div className="flex items-start gap-2 border-t border-amber-300/25 pt-1.5">
                <Unplug aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <span className="font-jetbrains min-w-0 text-label break-words text-amber-100/90" data-testid={`pipeline-degraded-${s}`}>
                  {down.reason}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── the mount counter ────────────────────────────────────────────────────── */

// WP4a acceptance 2: the canvas mounts once per MEDIA switch, not per render.
// The counter lives on the canvas's parent with `[]` deps, so it counts mounts
// and nothing else. Kept in the tree rather than deleted after the measurement:
// it is three lines, it costs one effect, and the claim it proves is the one a
// re-render-happy shell breaks first. Read it off the console, or off
// `window.__gtPipelineMounts` in a driven browser.
declare global {
  interface Window {
    __gtPipelineMounts?: number;
  }
}

function CanvasMount({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const n = (window.__gtPipelineMounts ?? 0) + 1;
    window.__gtPipelineMounts = n;
    // The counter is kept in both builds (it is one number and a driven browser
    // can read it); only the console line is dev's.
    if (process.env.NODE_ENV !== "production") console.log(`[pipeline] canvas parent mounted ${n}x`);
  }, []);
  return <div className="relative h-full w-full">{children}</div>;
}

/* ── the shell ────────────────────────────────────────────────────────────── */

export default function PipelineTab() {
  return (
    // The boundary `useSearchParams` needs, placed around the one component
    // that reads it rather than around the view (app/calendar/page.tsx keeps
    // the same rule one level up). app/foundry/page.tsx deliberately has none.
    <Suspense fallback={<Loading label="reading the direction" />}>
      <PipelineShell />
    </Suspense>
  );
}

function PipelineShell() {
  const params = useSearchParams();
  const announce = useAnnounce();

  /* sources: constructed ONCE each. The canvas memoises on source identity and
     a fresh source every render defeats the engine. */
  const articles = useMemo(() => makeArticlesSource(), []);
  const audio = useMemo(() => makeAudioSource(), []);

  const [media, setMedia] = useState<MediaId>("articles");
  const [variant, setVariant] = useState<VariantId>(() => variantFrom(params.get("v")).id);
  const [arm, setArm] = useState<Arm>(currentArm);
  const [axisPick, setAxisPick] = useState<string | null>(null);
  const [status, setStatus] = useState<CanvasStatus | null>(null);
  const [stub, setStub] = useState<{ n: number; wouldCall: string } | null>(null);
  const [open, setOpen] = useState<PipelineEntry | null>(null);
  const [order, setOrder] = useState<OfferedMove | null>(null);

  const api = useRef<PipelineHandle>(null);

  // One writer for both copies of the arm: the module's (what `move()` reads)
  // and React's (what the strip draws).
  const flipArm = useCallback((a: Arm) => {
    setLiveArm(a);
    setArm(a);
  }, []);

  const onStub = useCallback((wouldCall: string) => setStub((s) => ({ n: (s?.n ?? 0) + 1, wouldCall })), []);
  const base = media === "articles" ? articles : audio;
  const source = useMemo(() => armSource(base, onStub), [base, onStub]);

  const direction = VARIANTS[variant] ?? VARIANTS[VARIANT_IDS[0]];

  // A pick that belongs to the other medium is not an axis here: every source
  // declares its own, and `groupAxes` is already the POPULATED set by contract
  // (lib/board/pipeline.ts GroupAxis) — "an axis that reads blank for most items
  // is a worse board than no axis", so the adapter never offers one.
  const axes = source.groupAxes;
  const axisId = axes.some((a) => a.id === axisPick) ? axisPick! : axes[0].id;

  const pickMedia = (m: MediaId) => {
    if (m === media) return;
    setMedia(m);
    setAxisPick(null);
    setStatus(null);
    setOpen(null);
    setOrder(null);
  };

  const pickVariant = (id: VariantId) => {
    setVariant(id);
    const p = new URLSearchParams(window.location.search);
    p.set("v", id);
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
  };

  /* ── the deliberate move ────────────────────────────────────────────────── */

  // WHICH MOVE THE AUTHORITY WANTS AN ANSWER FOR, asked of `admits()` once per
  // candidate column when the detail opens — the same cardinality the canvas
  // uses when the move map opens, never per render of the pane.
  const offers = useMemo<OfferedMove[]>(() => {
    if (!open) return [];
    const out: OfferedMove[] = [];
    for (const stage of source.stages) {
      const bands = source.bands[stage];
      for (const band of bands && bands.length ? bands.map((b) => b.id) : [null]) {
        if (stage === open.placement.stage && band === open.placement.band) continue;
        const offer = source.admits(open.item, stage, band);
        if (offer.kind !== "needs" || offer.needs === "label") continue;
        out.push({
          to: stage,
          band,
          needs: offer.needs,
          prompt: offer.prompt,
          ...(offer.cost ? { cost: offer.cost } : {}),
          verb: band ? `${direction.skin.stageLabel?.[stage] ?? stage} · ${band}` : (direction.skin.stageLabel?.[stage] ?? stage),
        });
      }
    }
    return out;
  }, [open, source, direction]);

  // WHERE FOCUS GOES WHEN AN ORDER DIALOG CLOSES. The button that opened it
  // lived inside the detail dialog and went with it, so `Modal`'s own
  // `restoreFocus` finds a detached opener and falls to `<main>` — correct as a
  // floor, wrong as a destination: the operator was on the board. The canvas's
  // viewport is the focusable element (it carries `aria-activedescendant`, so
  // the card is still the cursor), and the shell reaches it through its own
  // wrapper rather than the document. `PipelineHandle` has no `focus()`; it
  // should, and until it does this is the seam.
  const boardRef = useRef<HTMLDivElement>(null);
  const closeOrder = useCallback(() => {
    setOrder(null);
    setOpen(null);
    // After Modal's cleanup, which runs synchronously before paint.
    requestAnimationFrame(() => boardRef.current?.querySelector<HTMLElement>('[role="application"]')?.focus());
  }, []);

  const runOrder = useCallback(
    async (note?: string): Promise<MoveResult> => {
      if (!open || !order) return { ok: false, reason: "nothing is ordered", retryable: false };
      // `live: true` is the INTENT of a confirmed order; `armSource` is what
      // decides whether it survives. Setting it per-need would mean a rework
      // could never run even in LIVE — the adapter stubs anything whose `live`
      // is unset (lib/board/sources/articles.ts:470).
      const r = await source.move({
        itemId: open.item.id,
        to: order.to,
        band: order.band,
        ...(note ? { note } : {}),
        live: true,
      });
      if (r.ok && !r.stub) await api.current?.reload();
      return r;
    },
    [open, order, source],
  );

  /* ── the honesty channels, announced once each ──────────────────────────── */

  // A degraded stage is drawn on its cell AND spoken once. The announcer keys
  // off the event, so a repeat of the same reason is dropped by it rather than
  // by a guard here. An effect EVENT, so the only dependency is the identity
  // string — the arrays are rebuilt every render and would re-fire on each one.
  const degraded = status?.notes?.degraded ?? [];
  const damaged = status?.notes?.damaged ?? [];
  const degradedKey = degraded.map((d) => `${d.stage}:${d.reason}`).join("|");
  const sayDegraded = useEffectEvent(() => {
    for (const d of status?.notes?.degraded ?? []) announce({ key: `pipeline-degraded:${d.stage}:${d.reason}`, text: `${d.stage}: ${d.reason}` });
  });
  useEffect(() => {
    if (degradedKey) sayDegraded();
  }, [degradedKey]);

  /* ── render ─────────────────────────────────────────────────────────────── */

  const word = useCallback((s: CanonStage) => direction.skin.stageLabel?.[s] ?? s, [direction]);
  const choreo = status?.choreo;
  const axisOptions: SelectOption<string>[] = axes.map((a) => ({ value: a.id, label: a.label }));
  const detailActions = offers.map((o) => (
    <button
      key={`${o.to}:${o.band ?? ""}`}
      type="button"
      onClick={() => setOrder(o)}
      data-testid={`pipeline-order-${o.to}-${o.band ?? "none"}`}
      className={`font-jetbrains cursor-pointer rounded-full border px-3.5 py-1.5 text-label transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
        o.needs === "confirm" ? "border-amber-300/45 text-amber-100 hover:bg-amber-300/10" : "border-white/15 text-white/85 hover:bg-white/5"
      }`}
    >
      {o.verb}
    </button>
  ));

  return (
    <div className="flex flex-col gap-3">
      {/* ── the top bar ─────────────────────────────────────────────────── */}
      <Glass className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <Segmented label="media" value={media} options={MEDIA.map((m) => ({ id: m.id, label: m.label }))} onChange={pickMedia} />

        <Select label="group" value={axisId} onChange={setAxisPick} options={axisOptions} minWidth={180} testId="pipeline-axis" />

        <Segmented
          label="arm"
          value={arm}
          options={[
            { id: "stub", label: "STUB" },
            { id: "live", label: `LIVE · $${RUN_COST_HINT.usdLow}–${RUN_COST_HINT.usdHigh} · ${RUN_COST_HINT.turnsLow}–${RUN_COST_HINT.turnsHigh} turns` },
          ]}
          onChange={flipArm}
        />
        {/* WHAT THE ARM COVERS, and it is the work rather than narration: the
            engine's own drag-confirm sets `live: true` itself
            (app/foundry/pipeline/MovePrompt.tsx:70), so without `armSource` a
            dragged confirm would spend whatever this switch said. */}
        <Hint tone="amber" label="what the arm covers">every write passes this arm, dragged or ordered</Hint>

        <Segmented
          label="direction"
          value={variant}
          options={VARIANT_IDS.map((id) => ({ id, label: VARIANTS[id].name }))}
          onChange={pickVariant}
        />
        <Hint label={`what ${direction.name} bets`}>{direction.bet}</Hint>
        <Hint variant="warn" tone="amber" label={`what ${direction.name} loses`}>
          {direction.loses}
        </Hint>

        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Tally label="cards" value={status?.total ?? 0} />
          <Tally label="drawn" value={status?.mounted ?? 0} />
          {(status?.selected ?? 0) > 0 && <Tally label="picked" value={status!.selected} tone="cyan" />}
          {choreo?.reason === "cap" && <Tally value={choreo.visible} of={choreo.cap} tone="amber" label="choreo" />}
          {damaged.length > 0 && <Tally label="damaged" value={damaged.length} tone="rose" hint={<Hint tone="rose">{damaged.join(" · ")}</Hint>} />}
          {stub && (
            <span className="flex items-center gap-2">
              <Tally label="dry" value={stub.n} tone="amber" />
              <span className="font-jetbrains max-w-[22rem] truncate text-label text-amber-100/80" data-testid="pipeline-would-call">
                {stub.wouldCall}
              </span>
            </span>
          )}
        </span>
      </Glass>

      {/* ── the columns, as the shell can draw them ─────────────────────── */}
      {status && <StageStrip counts={status.counts} notes={status.notes} word={word} />}
      {status?.loading && !status.total && <Loading label="reading the pipeline" />}
      {status?.error && (
        <Glass className="px-4 py-3">
          <Label>load failed</Label>
          <p className="font-jetbrains mt-1 text-label break-words text-rose-200/90">{status.error}</p>
        </Glass>
      )}

      {/* ── the board ───────────────────────────────────────────────────── */}
      {/* THE CANVAS FILLS ITS PARENT (app/foundry/pipeline/index.ts), so the
          parent needs an explicit height and not a content-driven one. */}
      <div ref={boardRef} className="flex h-[calc(100vh-34rem)] min-h-[26rem] gap-3">
        <CanvasMount>
          <PipelineCanvas
            source={source}
            axisId={axisId}
            arm={arm}
            skin={direction.skin}
            onOpen={setOpen}
            onStatus={setStatus}
            apiRef={api}
            className="absolute inset-0"
          />
        </CanvasMount>
        {direction.inspector && <DetailPane entry={open} stageWord={word(open?.placement.stage ?? "proposed")} actions={detailActions} onClose={() => setOpen(null)} />}
      </div>

      {/* ── the dialogs ─────────────────────────────────────────────────── */}
      {!direction.inspector && <DetailModal entry={order ? null : open} stageWord={word(open?.placement.stage ?? "proposed")} actions={detailActions} onClose={() => setOpen(null)} />}

      {/* An order dialog REPLACES the detail rather than stacking on it: two
          `aria-modal` panels on one Escape would both close, and a dialog whose
          opener is another dialog has nowhere to hand focus back to. Closing
          one — cancelled or done — clears both and hands focus to the board
          (`closeOrder` above). Cancelling writes nothing, so the card is where
          it was. */}
      {order?.needs === "confirm" && open && <DispatchConfirm open title={open.item.title} move={order} arm={arm} run={runOrder} onClose={closeOrder} />}
      {order?.needs === "note" && open && <ReworkNote open title={open.item.title} move={order} arm={arm} run={runOrder} onClose={closeOrder} />}
    </div>
  );
}
