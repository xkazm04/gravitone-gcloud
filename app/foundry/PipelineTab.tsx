"use client";

// THE PIPELINE TAB — one canvas, two media.
//
// The ENGINE is ./pipeline: it owns the board, the drag, the keyboard, the two
// move dialogs and the one live region. This file is everything AROUND it, and
// each of those parts now argues for itself in its own file:
//
//   the money switch ..... ./pipeline/arm.ts         (and why there are two guards)
//   the deliberate moves   ./pipeline/useOffers.ts
//   the three dialogs .... ./pipeline/BoardDialogs.tsx
//   expand on `f` ........ ./pipeline/useFullScreen.ts
//   the board's height ... ./pipeline/boardMount.tsx
//   the controls row ..... ./pipeline/BoardControls.tsx
//   the skin per medium .. ./pipeline/skins (audio says "queue" where articles says "running")
//
// What is left here is the composition: pick the source for the medium, arm it,
// give the board a measured height, and draw the two things that cannot be drawn
// ON a board — a load that is still running, and a load that failed outright.
//
// ── WHAT IS NOT HERE ───────────────────────────────────────────────────────
//
// No `aria-live`, no `role="status"`, no `role="alert"`: the budget
// (tests/golden-path/live-region-budget) is at its ceiling and the engine owns
// the region. Announcements go through `useAnnounce`.
//
// No window keydown handler for the BOARD's keys. The canvas owns them and
// suppresses them itself while an `aria-modal` dialog is up (`overlayOpen`), so a
// shell handler here could only fight it. `f` is the one exception and it lives
// in ./pipeline/useFullScreen.ts, which states why.
//
// No Suspense boundary, and that is a deletion rather than an omission. It
// existed for `useSearchParams`, which read `?v=` to pick one of four
// directions; with one direction there is no parameter to read, nothing in this
// subtree suspends, and a boundary whose only job is gone is a fallback nobody
// will ever see.

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import type { SelectOption } from "@/components/ui/Select";
import { useAnnounce } from "@/lib/announcer";
import { RUN_COST_HINT } from "@/lib/articles/types";
import { type CanonStage, type PipelineEntry } from "@/lib/board/pipeline";
import { makeArticlesSource } from "@/lib/board/sources/articles";
import { makeAudioSource } from "@/lib/board/sources/audio";

import { PipelineCanvas, type CanvasStatus, type PipelineHandle } from "./pipeline";
import { useArmedSource } from "./pipeline/arm";
import BoardControls from "./pipeline/BoardControls";
import { BoardDialogs } from "./pipeline/BoardDialogs";
import { CanvasMount, useFillHeight } from "./pipeline/boardMount";
import { ledger, ledgerAudio } from "./pipeline/skins";
import { useFullScreen } from "./pipeline/useFullScreen";
import { useOffers } from "./pipeline/useOffers";
import { Glass, Label, Loading } from "./ui";

/* ── the two media ────────────────────────────────────────────────────────── */

export type MediaId = "articles" | "audio";

export const MEDIA: ReadonlyArray<{ id: MediaId; label: string }> = [
  { id: "articles", label: "Articles" },
  { id: "audio", label: "Audio" },
];

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
  const { arm, flipArm, stub, source } = useArmedSource(media === "articles" ? articles : audio);

  const [axisPick, setAxisPick] = useState<string | null>(null);
  const [status, setStatus] = useState<CanvasStatus | null>(null);
  const [open, setOpen] = useState<PipelineEntry | null>(null);
  // ONE SKIN PER MEDIUM, chosen once: the same skin names the column heads,
  // the shell's stage words and the detail's order buttons, so the three can
  // never disagree about what `working` is called.
  const skin = media === "audio" ? ledgerAudio : ledger;
  const api = useRef<PipelineHandle>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const full = useFullScreen(api);
  const boardH = useFillHeight(boardRef, { watch: controlsRef, epoch: full.full });
  const offers = useOffers(open, source, skin);

  // A pick that belongs to the other medium is not an axis here: every source
  // declares its own, and `groupAxes` is already the POPULATED set by contract
  // (lib/board/pipeline.ts GroupAxis) — "an axis that reads blank for most items
  // is a worse board than no axis", so the adapter never offers one.
  const axes = source.groupAxes;
  const axisId = axes.some((a) => a.id === axisPick) ? axisPick! : axes[0].id;

  /* ── the honesty channels, announced once each ──────────────────────────── */

  // A degraded stage is drawn on its cell AND spoken once. The announcer keys
  // off the event, so a repeat of the same reason is dropped by it rather than
  // by a guard here. An effect EVENT, so the only dependency is the identity
  // string — the arrays are rebuilt every render and would re-fire on each one.
  const degradedKey = (status?.notes?.degraded ?? []).map((d) => `${d.stage}:${d.reason}`).join("|");
  const sayDegraded = useEffectEvent(() => {
    for (const d of status?.notes?.degraded ?? []) announce({ key: `pipeline-degraded:${d.stage}:${d.reason}`, text: `${d.stage}: ${d.reason}` });
  });
  useEffect(() => {
    if (degradedKey) sayDegraded();
  }, [degradedKey]);

  /* ── render ─────────────────────────────────────────────────────────────── */

  const word = useCallback((s: CanonStage) => skin.stageLabel?.[s] ?? s, [skin]);
  const axisOptions: SelectOption<string>[] = axes.map((a) => ({ value: a.id, label: a.label }));

  return (
    <div className={`flex flex-col gap-3 ${full.rootClass}`} style={full.rootStyle}>
      {/* EVERYTHING ABOVE THE BOARD, in one element the height is measured
          against: the load line and the failure come and go and the controls
          row wraps, and in full screen none of that resizes the document.

          THE CONTROLS ARE A ROW, above the board and outside it. Floating over
          the board's corner they sat where the stage heads draw, and the heads
          had to measure them to stay clear; here nothing overlaps anything. */}
      <div ref={controlsRef} className="flex flex-col gap-3">
        {status?.loading && !status.total && <Loading label="reading the pipeline" />}
        {status?.error && (
          <Glass className="px-4 py-3">
            <Label>load failed</Label>
            <p className="font-jetbrains mt-1 text-label break-words text-rose-200/90">{status.error}</p>
          </Glass>
        )}
        <BoardControls
          arm={arm}
          onArm={flipArm}
          axisId={axisId}
          axisOptions={axisOptions}
          onAxis={setAxisPick}
          status={status}
          stub={stub}
          full={full.full}
          onFull={full.toggle}
          word={word}
          liveCost={media === "articles" ? `$${RUN_COST_HINT.usdLow}–${RUN_COST_HINT.usdHigh}` : null}
        />
      </div>

      {/* THE CANVAS FILLS ITS PARENT (./pipeline/index.ts), so the parent needs
          an explicit height and not a content-driven one. The number is
          MEASURED — see `useFillHeight`, which replaced a `calc(100vh-34rem)`
          that was reserving 544px for chrome now about a third of that. */}
      <div ref={boardRef} className="flex gap-3" style={{ height: boardH }}>
        <CanvasMount>
          <PipelineCanvas source={source} axisId={axisId} arm={arm} skin={skin} onOpen={setOpen} onStatus={setStatus} apiRef={api} className="absolute inset-0" />
        </CanvasMount>
      </div>

      <BoardDialogs open={open} setOpen={setOpen} offers={offers} source={source} arm={arm} apiRef={api} boardRef={boardRef} word={word} />
    </div>
  );
}

