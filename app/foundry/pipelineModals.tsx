"use client";

// THE PIPELINE TAB'S OWN DIALOGS — the three the engine does not own.
//
// The canvas already owns two: `MovePrompt` (the answer a dragged move asks
// for) and `MoveMap` ("move to…"). Neither is duplicated or wrapped here. What
// is left is the set a SHELL owes:
//
//   DispatchConfirm  the money gate, for a move the operator ordered from the
//                    detail surface rather than by dragging. A destructive /
//                    costly confirm states its consequence in full — one of
//                    CLAUDE.md's three standing exemptions — and the figures
//                    are the AUTHORITY'S, read off the `MoveCost` that
//                    `admits()` returned, never retyped here. `costLine`
//                    (app/foundry/pipeline/moves.ts) is the one formatter.
//   ReworkNote       a move back to drafting that REQUIRES the operator's
//                    instruction, opened deliberately. The engine collects the
//                    same note when the move is dragged; this is the other door
//                    to the same write.
//   ItemDetail       the item's own facts, media and href — mounted TWICE, as
//                    `DetailModal` and as `DetailPane`. Variant 4's whole bet is
//                    that the detail is a docked pane beside the board rather
//                    than an overlay over it, and a bet is only readable if both
//                    arms draw the same content.
//
// THE DRY PATH IS A RESULT, NOT A SILENCE. `MoveResult` says so in
// lib/board/pipeline.ts: `stub` rides on the SUCCESS variant, so a caller that
// commits on `ok` alone draws a move that never happened. Every dialog here
// reads `isStubbedMove` and, when it is true, stays open carrying `wouldCall` —
// the route that was NOT called, verbatim. That string is the receipt the STUB
// arm is worth having.
//
// A DIALOG DOES NOT CLOSE OVER A WRITE THAT FAILED
// (tests/golden-path/dialog-closes-on-success.probe.spec.ts). Confirming awaits
// the move; the controls are inert while it is in flight; a refusal keeps the
// dialog up carrying the authority's own words, because `aria-modal` has
// removed everything behind it from the accessibility tree.
//
// NO LIVE REGION IN THIS FILE. tests/golden-path/live-region-budget sits at its
// ceiling and the engine already owns the one region this surface announces
// through (lib/announcer.tsx). A failure here is drawn, and the shell announces.

import { useCallback, useState } from "react";

import { ExternalLink, Unplug } from "lucide-react";

import { TextArea } from "@/components/ui/Field";
import { NOTE_MAX_CHARS } from "@/lib/articles/types";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Primitives";
import { Ghost, Tally } from "@/components/ui/signal";
import { isStubbedMove, type CanonStage, type MoveCost, type MoveResult, type PipelineEntry } from "@/lib/board/pipeline";

import { costLine, STAGE_TONE } from "./pipeline";
import { dwell } from "./pipeline/dwell";
import { Art, ErrorNote, Glass, Label } from "./ui";

/** Whether a move on this board writes. STUB is the default and the only state
 *  a reload can land in by accident; see `PipelineTab`'s `readArm`. */
export type Arm = "stub" | "live";

/** What a dialog does when it is confirmed: the shell builds the `MoveRequest`
 *  (it owns the arm and the layout) and this is what comes back. */
export type RunMove = (note?: string) => Promise<MoveResult>;

/** A move the operator can order from the detail surface, as the authority
 *  described it. `to`/`band` are what the shell will send. */
export interface OfferedMove {
  to: CanonStage;
  band: string | null;
  needs: "note" | "confirm";
  prompt: string;
  cost?: MoveCost;
  /** The destination's word, for the button. */
  verb: string;
}

/* ── the shared tail of a write dialog ────────────────────────────────────── */

type Phase = { kind: "idle" } | { kind: "busy" } | { kind: "stub"; wouldCall: string } | { kind: "failed"; reason: string; retryable: boolean };

/** Run a move, keep the dialog's phase, and close only on a REAL success. */
function useWrite(run: RunMove, onDone: () => void) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const submit = useCallback(
    async (note?: string) => {
      setPhase({ kind: "busy" });
      const r = await run(note);
      if (!r.ok) {
        setPhase({ kind: "failed", reason: r.reason, retryable: r.retryable });
        return;
      }
      // A dry move is a success of the DRY path: nothing was written, so the
      // dialog has not finished its job until the operator has read what would
      // have been called.
      if (isStubbedMove(r)) {
        setPhase({ kind: "stub", wouldCall: r.wouldCall ?? "" });
        return;
      }
      setPhase({ kind: "idle" });
      onDone();
    },
    [run, onDone],
  );
  return { phase, submit, reset: useCallback(() => setPhase({ kind: "idle" }), []) };
}

function Receipt({ wouldCall }: { wouldCall: string }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300/30 bg-amber-300/[0.07] px-3.5 py-2.5">
      <Unplug aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <div className="min-w-0 flex-1">
        <Label>not called</Label>
        <p className="font-jetbrains mt-1 text-label break-words text-amber-100/90">{wouldCall}</p>
      </div>
    </div>
  );
}

function Failure({ reason }: { reason: string }) {
  return (
    <div className="mt-4">
      <ErrorNote>{reason}</ErrorNote>
    </div>
  );
}

/* ── 1. the money gate ────────────────────────────────────────────────────── */

/**
 * The confirm for a move that spends. The authority's `prompt` names the vendor
 * or the seat and its `cost` carries the figures; both are rendered verbatim,
 * because a price and a vendor are the WORK.
 *
 * In STUB the same figures are shown as what a LIVE dispatch would cost, and
 * the confirm is a dry run: nothing is written and nothing is spent.
 */
export function DispatchConfirm({
  open,
  title,
  move,
  arm,
  run,
  onClose,
}: {
  open: boolean;
  /** The card's own title. */
  title: string;
  move: OfferedMove;
  arm: Arm;
  run: RunMove;
  onClose: () => void;
}) {
  const { phase, submit, reset } = useWrite(run, onClose);
  const busy = phase.kind === "busy";
  const done = phase.kind === "stub";
  const line = costLine(move.cost);
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      eyebrow={<Label>{move.verb}</Label>}
      className="max-w-xl"
      footer={
        <div className="flex items-center justify-end gap-3">
          {!done && (
            <Button variant="ghost" size="sm" onClick={close} disabled={busy}>
              Cancel
            </Button>
          )}
          {done ? (
            <Button size="sm" onClick={close}>
              Close
            </Button>
          ) : (
            <Button
              size="sm"
              variant={arm === "live" ? "danger" : "primary"}
              onClick={() => void submit()}
              disabled={busy}
              aria-busy={busy}
              data-testid="pipeline-dispatch-confirm"
            >
              {busy ? "dispatching…" : phase.kind === "failed" && phase.retryable ? "Retry" : arm === "live" ? move.verb : "Dry run"}
            </Button>
          )}
        </div>
      }
    >
      <p className="font-hanken text-content leading-relaxed text-white/90">{move.prompt}</p>
      {line && (
        <p className={`font-jetbrains mt-3 text-label ${arm === "live" ? "text-amber-200/90" : "text-white/55"}`}>
          {line}
        </p>
      )}
      {arm === "stub" && (
        <p className="font-hanken mt-3 text-content leading-relaxed text-white/70">Nothing is written and nothing is spent.</p>
      )}
      {phase.kind === "stub" && <Receipt wouldCall={phase.wouldCall} />}
      {phase.kind === "failed" && <Failure reason={phase.reason} />}
    </Modal>
  );
}

/* ── 2. the rework note ───────────────────────────────────────────────────── */

/**
 * A move back to drafting, which the authority refuses without the operator's
 * instruction — that instruction is what the draft turn is fed.
 *
 * `maxLength` is `NOTE_MAX_CHARS` from lib/articles/types.ts. It used to live in
 * engine.ts, which imports `node:child_process` and is server-only, so no
 * client could reach it - and the field was built with no bound at all, letting
 * the operator type past the limit and lose the note to a 400. RunView.tsx had
 * answered the same problem with a bare `maxLength={2000}`, a second copy
 * already drifting from the server's number. The constant moved to types.ts
 * (client-safe, where `RUN_COST_HINT` lives), engine.ts re-exports and still
 * enforces it, and both fields now read the one number: the bound is the
 * server's, the hint is the client's. The route's refusal is still rendered
 * verbatim below, because a bound is not a guarantee.
 */
export function ReworkNote({
  open,
  title,
  move,
  arm,
  run,
  onClose,
}: {
  open: boolean;
  title: string;
  move: OfferedMove;
  arm: Arm;
  run: RunMove;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const { phase, submit, reset } = useWrite(run, onClose);
  const busy = phase.kind === "busy";
  const done = phase.kind === "stub";
  const line = costLine(move.cost);
  const valid = text.trim().length > 0;
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      eyebrow={<Label>{move.verb}</Label>}
      className="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-3">
          {!done && (
            <Button variant="ghost" size="sm" onClick={close} disabled={busy}>
              Cancel
            </Button>
          )}
          {done ? (
            <Button size="sm" onClick={close}>
              Close
            </Button>
          ) : (
            <Button
              size="sm"
              variant={arm === "live" ? "danger" : "primary"}
              onClick={() => void submit(text.trim())}
              disabled={busy || !valid}
              aria-busy={busy}
              data-testid="pipeline-rework-confirm"
            >
              {busy ? "sending…" : phase.kind === "failed" && phase.retryable ? "Retry" : arm === "live" ? move.verb : "Dry run"}
            </Button>
          )}
        </div>
      }
    >
      <p className="font-hanken text-content leading-relaxed text-white/90">{move.prompt}</p>
      {line && (
        <p className={`font-jetbrains mt-3 text-label ${arm === "live" ? "text-amber-200/90" : "text-white/55"}`}>
          {line}
        </p>
      )}
      <TextArea
        autoFocus
        rows={4}
        maxLength={NOTE_MAX_CHARS}
        aria-label="Rework note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy || done}
        className="mt-3"
        data-testid="pipeline-rework-note"
      />
      {phase.kind === "stub" && <Receipt wouldCall={phase.wouldCall} />}
      {phase.kind === "failed" && <Failure reason={phase.reason} />}
    </Modal>
  );
}

/* ── 3. the detail, in two mounts ─────────────────────────────────────────── */

function Media({ media, title }: { media: PipelineEntry["item"]["media"]; title: string }) {
  if (media.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {media.map((m, i) => {
        const key = `${m.kind}-${m.src ?? i}`;
        if (m.kind === "image") return <Art key={key} src={m.src} alt={title} fit="contain" className="aspect-video" />;
        // A generated take has no caption track; the heading above it is its
        // name, which is what `aria-label` carries here.
        //
        // NO `video` BRANCH. Neither v1 lane emits one — Articles emits `image`
        // and `text`, Audio emits `audio` and `text` — and the Image/Video lanes
        // are deferred by the operator's own scoping. A branch for a media kind
        // nothing produces cannot be exercised, so it is a guess about a lane
        // that has not been designed yet; the one that eventually needs it will
        // add it against a real card. The raw <audio> below is the reviewed
        // exception the kit census ratchets: `components/kit/Player` is a
        // CONTROLLED part that owns no element by design, so a surface that
        // actually plays something holds the element itself (app/board/parts.tsx
        // carries four such, accepted the same way).
        if (m.kind === "audio") return <audio key={key} src={m.src} controls preload="none" aria-label={title} className="w-full" />;
        return (
          <Glass key={key} className="p-3.5">
            <pre className="font-jetbrains text-label leading-7 whitespace-pre-wrap text-white/80">{m.text}</pre>
          </Glass>
        );
      })}
    </div>
  );
}

/**
 * The item's own facts, verbatim, with its media and the surface it is decided
 * on. One component, two mounts — the modal and the docked pane — so a variant
 * that bets on the pane is betting on the LAYOUT and not on different content.
 */
export function ItemDetail({ entry, stageWord, actions }: { entry: PipelineEntry; stageWord: string; actions?: React.ReactNode }) {
  const { item, facts, href } = entry;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`font-jetbrains rounded-full border px-2.5 py-0.5 text-label ${STAGE_TONE[entry.placement.stage].card} ${STAGE_TONE[entry.placement.stage].head}`}>{stageWord}</span>
        {entry.placement.band && (
          <span className="font-jetbrains rounded-full border border-white/12 px-2.5 py-0.5 text-label text-white/60">{entry.placement.band}</span>
        )}
        <span className="font-jetbrains rounded-full border border-white/12 px-2.5 py-0.5 text-label text-white/60">{item.lane}</span>
        {item.verdict && (
          <span className={`font-jetbrains rounded-full border px-2.5 py-0.5 text-label ${item.verdict === "reject" ? "border-rose-400/35 text-rose-200" : "border-emerald-400/35 text-emerald-200"}`}>
            {item.verdict}
          </span>
        )}
        {item.reasons.length > 0 && <Tally label="reasons" value={item.reasons.length} tone="rose" />}
      </div>

      <Media media={item.media} title={item.title} />

      {/* THE FACTS, and `standing` is here because round 1 took it off the card.
          The ledger's card carried vendor / state / dwell under its title and the
          operator's verdict was that those four facts were costing the title its
          readability. Three of them were already in this list or in the chips
          above; how long it has stood was not, and a figure removed from one
          surface and added to none is a figure deleted. */}
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {facts.map((f) => (
          <div key={f.name} className="min-w-0">
            <dt>
              <Label>{f.name}</Label>
            </dt>
            <dd className="font-jetbrains mt-0.5 text-label break-words text-white/85">{f.value}</dd>
          </div>
        ))}
        <div className="min-w-0">
          <dt>
            <Label>standing</Label>
          </dt>
          <dd className="font-jetbrains mt-0.5 text-label text-white/85">
            {dwell(item.createdAt) || "—"} <span className="text-white/45">· {item.createdAt}</span>
          </dd>
        </div>
      </dl>

      {item.machinePick && (
        <div>
          <Label>machine pick</Label>
          <p className="font-jetbrains mt-0.5 text-label text-white/75">{item.machinePick}</p>
        </div>
      )}

      {item.reasons.length > 0 && (
        <div>
          <Label>reasons</Label>
          <p className="font-jetbrains mt-0.5 text-label text-white/75">{item.reasons.join(" · ")}</p>
        </div>
      )}

      {item.note && (
        <Glass className="p-3.5">
          <Label>note</Label>
          <p className="font-hanken mt-1 text-content leading-relaxed text-white/80">{item.note}</p>
        </Glass>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={href}
          className="font-jetbrains inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-label text-white/85 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          Open
        </a>
        {actions}
      </div>
    </div>
  );
}

export function DetailModal({
  entry,
  stageWord,
  actions,
  onClose,
}: {
  entry: PipelineEntry | null;
  stageWord: string;
  actions?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal open={Boolean(entry)} onClose={onClose} title={entry?.item.title ?? ""} eyebrow={<Label>{entry?.item.source ?? ""}</Label>} className="max-w-2xl">
      {entry && <ItemDetail entry={entry} stageWord={stageWord} actions={actions} />}
    </Modal>
  );
}

/**
 * The same detail, docked beside the canvas. NOT a dialog: it traps nothing and
 * takes no `aria-modal`, which is exactly why variant 4 can keep the board's
 * keyboard alive while it is open (`overlayOpen` in lib/board/keys.ts reads
 * `[aria-modal="true"]`, so a pane does not disarm the canvas).
 */
export function DetailPane({
  entry,
  stageWord,
  actions,
  onClose,
}: {
  entry: PipelineEntry | null;
  stageWord: string;
  actions?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <aside aria-label="card detail" className="flex w-[22rem] shrink-0">
      <Glass className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/8 px-4 py-3">
          <div className="min-w-0">
            <Label>{entry?.item.source ?? "detail"}</Label>
            <h3 className="font-instrument mt-0.5 truncate text-xl text-white">{entry?.item.title ?? "—"}</h3>
          </div>
          {entry && (
            <Button variant="ghost" size="sm" onClick={onClose} className="shrink-0">
              Clear
            </Button>
          )}
        </header>
        <div className="scroll-y grow px-4 py-4">
          {/* An absence drawn as the shape that will fill it, not as a sentence
              about how to fill it (components/ui/signal/README.md). */}
          {entry ? <ItemDetail entry={entry} stageWord={stageWord} actions={actions} /> : <Ghost shape="card" label="no card open" />}
        </div>
      </Glass>
    </aside>
  );
}
