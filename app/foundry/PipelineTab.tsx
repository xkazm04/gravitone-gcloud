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
// `skin` and nothing else.
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

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";


import type { SelectOption } from "@/components/ui/Select";
import { useAnnounce } from "@/lib/announcer";
import { typing } from "@/lib/board/keys";

import { refusedKey } from "./keyGuard";
import {
  type CanonStage,
  type MoveRequest,
  type MoveResult,
  type PipelineEntry,
  type PipelineSource,
} from "@/lib/board/pipeline";
import { makeArticlesSource } from "@/lib/board/sources/articles";
import { makeAudioSource } from "@/lib/board/sources/audio";

import { PIPELINE_ARM_KEY } from "@/lib/identityEviction";

import { PipelineCanvas, type CanvasStatus, type PipelineHandle } from "./pipeline";
import BoardControls from "./pipeline/BoardControls";
import { ledger } from "./pipeline/skins";
import { DetailModal, DispatchConfirm, ReworkNote, type Arm, type OfferedMove } from "./pipelineModals";
import { Glass, Label, Loading } from "./ui";

/* ── the two media ────────────────────────────────────────────────────────── */

/** How much bigger full screen draws everything. ~20%: enough to read the board
 *  from further back, small enough that a lane of cards still fits the width it
 *  fitted before. Applied to the camera (content) and to the two type tokens
 *  (chrome) — see the note on `full` below. */
const FULL_SCALE = 1.2;

export type MediaId = "articles" | "audio";

export const MEDIA: ReadonlyArray<{ id: MediaId; label: string }> = [
  { id: "articles", label: "Articles" },
  { id: "audio", label: "Audio" },
];

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

/**
 * THE BOARD'S HEIGHT, MEASURED — not `calc(100vh - 34rem)`.
 *
 * The canvas is `absolute inset-0` inside its parent, so the parent needs a real
 * height and not a content-driven one. That was spelled as a viewport
 * subtraction, and 34rem is 544px: on a 1080p screen the board got 536px and
 * over half the window was reserved for the chrome above it. Round 1's first
 * sentence was that the canvas is barely visible, and this number is most of the
 * reason — it was correct for the chrome of the day it was written and nothing
 * re-derived it when that chrome changed.
 *
 * So it is read off the element: whatever sits above the board, the board runs
 * from where it starts to the bottom of the viewport. A ResizeObserver on the
 * document element catches the chrome above growing or shrinking (the top bar
 * wraps at narrow widths, the degraded strip appears and disappears) without
 * this needing to know what any of it is.
 */
function useFillHeight(ref: React.RefObject<HTMLElement | null>, gutter = 12): number {
  const [h, setH] = useState(520);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // FLOOR, not a clamp for tidiness: on a short viewport, or mid-layout when
    // the chrome above has not settled, the subtraction can go to nothing, and a
    // board of 0px reads as a board that failed to load.
    const measure = () => setH(Math.max(280, Math.round(window.innerHeight - el.getBoundingClientRect().top - gutter)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref, gutter]);
  return h;
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

// NO SUSPENSE BOUNDARY ANY MORE, and that is a deletion rather than an omission.
// It existed for `useSearchParams`, which read `?v=` to pick one of four
// directions; with one direction there is no parameter to read, nothing in this
// subtree suspends, and a boundary whose only job is gone is a fallback nobody
// will ever see keeping a `Loading` import alive.
export default function PipelineTab({ media }: { media: MediaId }) {
  // KEYED ON THE MEDIA, so switching it REMOUNTS this shell. Everything the old
  // medium left behind goes with it — an axis the next adapter may not offer, a
  // status read off the old board, an open detail and an order aimed at an item
  // the new source has never heard of. The alternative was four `setState` calls
  // in an effect keyed on the prop, which `react-hooks/set-state-in-effect`
  // refuses and is right to: that is a remount spelled by hand, one state at a
  // time, and the one somebody forgets to add is the stale one. A remount per
  // media switch is also exactly what WP4a measured and allowed — once per
  // switch, never per render (`__gtPipelineMounts`).
  return <PipelineShell key={media} media={media} />;
}

function PipelineShell({ media }: { media: MediaId }) {
  const announce = useAnnounce();

  /* sources: constructed ONCE each. The canvas memoises on source identity and
     a fresh source every render defeats the engine. */
  const articles = useMemo(() => makeArticlesSource(), []);
  const audio = useMemo(() => makeAudioSource(), []);

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

  // A pick that belongs to the other medium is not an axis here: every source
  // declares its own, and `groupAxes` is already the POPULATED set by contract
  // (lib/board/pipeline.ts GroupAxis) — "an axis that reads blank for most items
  // is a worse board than no axis", so the adapter never offers one.
  const axes = source.groupAxes;
  const axisId = axes.some((a) => a.id === axisPick) ? axisPick! : axes[0].id;


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
          verb: band ? `${ledger.stageLabel?.[stage] ?? stage} · ${band}` : (ledger.stageLabel?.[stage] ?? stage),
        });
      }
    }
    return out;
  }, [open, source]);

  // WHERE FOCUS GOES WHEN AN ORDER DIALOG CLOSES. The button that opened it
  // lived inside the detail dialog and went with it, so `Modal`'s own
  // `restoreFocus` finds a detached opener and falls to `<main>` — correct as a
  // floor, wrong as a destination: the operator was on the board. The canvas's
  // viewport is the focusable element (it carries `aria-activedescendant`, so
  // the card is still the cursor), and the shell reaches it through its own
  // wrapper rather than the document. `PipelineHandle` has no `focus()`; it
  // should, and until it does this is the seam.
  const boardRef = useRef<HTMLDivElement>(null);
  const boardH = useFillHeight(boardRef);
  // FULL SCREEN BUYS SIZE, NOT JUST AREA — and the first cut of it only bought
  // area. Filling the screen gave the board 173 more pixels of height and left
  // every card and every label exactly as big as they were at a third of the
  // width, which is a bigger spreadsheet rather than a better one. A wider
  // screen should be legible from further away.
  //
  // So full screen scales BOTH halves by `FULL_SCALE`, and they are two
  // mechanisms because the board has two coordinate systems:
  //
  //   the CONTENT rides the camera. The world is one element under
  //   `translate3d(x,y,0) scale(k)`, so a card and the type inside it scale
  //   together with `k` — one `zoomBy` is the whole of it, and nothing in the
  //   skin or the layout has to know.
  //
  //   the CHROME is in screen space — the stage heads, the lane heads, these
  //   controls — and does not ride the camera by design (a head that scaled
  //   with the board would stop being a fixed reference). It moves by
  //   redefining the two scale tokens on this root, so every `text-label` and
  //   `text-content` under it grows together and not one className changes.
  //   Writing sizes into the markup instead would mean an arbitrary size per
  //   element, which is what `npm run check:type` exists to stop.
  const [full, setFull] = useState(false);
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
  const degradedKey = degraded.map((d) => `${d.stage}:${d.reason}`).join("|");
  const sayDegraded = useEffectEvent(() => {
    for (const d of status?.notes?.degraded ?? []) announce({ key: `pipeline-degraded:${d.stage}:${d.reason}`, text: `${d.stage}: ${d.reason}` });
  });
  useEffect(() => {
    if (degradedKey) sayDegraded();
  }, [degradedKey]);

  // `f` TOGGLES, and Escape deliberately does not. Escape is the canvas's own
  // "close the innermost thing" — menu, then map, then selection, then cursor
  // (app/foundry/pipeline/keymap.ts) — and a second listener taking it would
  // collapse the board and clear the selection on one press. `f` is free: the
  // canvas's keymap returns null for it.
  // THE CAMERA FOLLOWS THE FLAG, in an effect rather than in each of the two
  // callers that can flip it (the key and the button), so the two cannot drift
  // and a flip from anywhere else later is covered for free. `skip` holds the
  // first run: on mount `full` is false and there is nothing to undo, and
  // zooming out by a factor nobody zoomed in by would shrink the opening frame.
  const zoomed = useRef(false);
  useEffect(() => {
    if (zoomed.current === full) return;
    zoomed.current = full;
    api.current?.zoomBy(full ? FULL_SCALE : 1 / FULL_SCALE);
  }, [full]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // `refusedKey` FIRST, and it is the board's own guard rather than a second
      // set: a chord belongs to the browser (Ctrl+F is its find) and a held key
      // must not toggle the screen forty times. Spelling that by hand here is
      // what `foundry-key-guard` exists to catch, and it caught this.
      if (refusedKey(e)) return;
      if (typing(e.target)) return;
      // Spelled as `===`, not `!== && !==`. foundry-key-guard reads the file for
      // the first `e.key ===` and requires `refusedKey(e)` before it; a handler
      // that only ever writes `!==` reads the key without the probe seeing it,
      // so the probe treats "no read found" as a failure. It errs in the safe
      // direction, and the positive form is the clearer one anyway.
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setFull((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── render ─────────────────────────────────────────────────────────────── */

  const word = useCallback((s: CanonStage) => ledger.stageLabel?.[s] ?? s, []);
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
    <div
      className={`flex flex-col gap-3 ${full ? "fixed inset-0 z-40 overflow-y-auto bg-[var(--gt-ink)] p-3" : ""}`}
      style={full ? ({ "--text-label": `${FULL_SCALE}rem`, "--text-content": `${1.125 * FULL_SCALE}rem` } as React.CSSProperties) : undefined}
    >
      {/* ── the top bar ─────────────────────────────────────────────────── */}
      {/* NO TOP BAR. Three rows stood between the page title and the board —
          the station rail, this bar, and a strip of stage counts — and the
          operator cut all three. The media choice went up to the foundry
          submenu, the arm, the group and the counters went INTO the board
          (./pipeline/BoardControls.tsx), and the stage counts were already
          drawn across the top of the canvas by its own heads, one row above
          themselves. What is left here is what cannot be drawn on a board:
          a load that failed outright. */}

      {status?.loading && !status.total && <Loading label="reading the pipeline" />}
      {status?.error && (
        <Glass className="px-4 py-3">
          <Label>load failed</Label>
          <p className="font-jetbrains mt-1 text-label break-words text-rose-200/90">{status.error}</p>
        </Glass>
      )}

      {/* ── the board ───────────────────────────────────────────────────── */}
      {/* THE CANVAS FILLS ITS PARENT (app/foundry/pipeline/index.ts), so the
          parent needs an explicit height and not a content-driven one. The
          number is MEASURED — see `useFillHeight`, which replaced a
          `calc(100vh-34rem)` that was reserving 544px for chrome that is now
          about a third of that. */}
      <div ref={boardRef} className="flex gap-3" style={{ height: boardH }}>
        <CanvasMount>
          <PipelineCanvas
            source={source}
            axisId={axisId}
            arm={arm}
            skin={ledger}
            onOpen={setOpen}
            onStatus={setStatus}
            apiRef={api}
            className="absolute inset-0"
          />
          <BoardControls
            arm={arm}
            onArm={flipArm}
            axisId={axisId}
            axisOptions={axisOptions}
            onAxis={setAxisPick}
            status={status}
            stub={stub}
            full={full}
            onFull={() => setFull((v) => !v)}
            word={word}
          />
        </CanvasMount>
      </div>

      {/* ── the dialogs ─────────────────────────────────────────────────── */}
      {<DetailModal entry={order ? null : open} stageWord={word(open?.placement.stage ?? "proposed")} actions={detailActions} onClose={() => setOpen(null)} />}

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
