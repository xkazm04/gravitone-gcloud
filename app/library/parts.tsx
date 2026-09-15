"use client";

// Shared leaves for /library. These used to draw gradient mocks; they now draw
// real generated pixels, so the only thing that changed conceptually is that a
// proof can be WRONG — hence the judge affordances.

import { Check, Library, Lock, LockOpen, X } from "lucide-react";

import Modal from "@/components/ui/Modal";
import { Panel, Button } from "@/components/ui/Primitives";
import { CHIP_CLASS, TALLY_TONE } from "@/components/ui/signal";
import { promotedId } from "@/lib/assets";
import type { GenerateResult } from "@/lib/imagingClient";
import type { PaletteColor, Proof, ProofState, StyleBlock, Theme, ThemeStatus } from "@/lib/themes";
import {
  approvedProofs,
  lockedOnly,
  sheetFull,
  sheetSpend,
  STATUS_WORD,
  statusOf,
} from "@/lib/themes";

import Playground from "./Playground";

const STATUS_CLS: Record<ThemeStatus, string> = {
  draft: "border-white/12 text-white/50",
  proofing: "border-amber-300/40 bg-amber-300/5 text-amber-200",
  locked: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
};

export function StatusStamp({ status }: { status: ThemeStatus }) {
  return (
    <span
      className={`font-jetbrains rounded-full border px-2.5 py-0.5 text-label tracking-[0.14em] uppercase ${STATUS_CLS[status]}`}
    >
      {STATUS_WORD[status]}
    </span>
  );
}

/** The three colours, shown doing their jobs. The role is the part that keeps a
 *  style consistent, so it is what the swatch labels. */
export function PaletteDots({ palette, withNames = false }: { palette: PaletteColor[]; withNames?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      {palette.map((c) => (
        <span key={c.name} className="flex items-center gap-1.5">
          <span
            className="h-3.5 w-3.5 rounded-full border border-white/25"
            style={{ background: c.hex }}
            aria-hidden
          />
          {withNames && (
            <span className="font-jetbrains text-label text-white/55">
              {c.name}
              <span className="text-white/30"> · {c.role}</span>
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

const PROOF_RING: Record<ProofState, string> = {
  approved: "border-cyan-300/60",
  pending: "border-white/12",
  rejected: "border-rose-400/50 opacity-55",
};

/** One plate on the proof sheet — a real image, with its verdict on it. */
export function ProofThumb({
  proof,
  className = "aspect-video",
  onJudge,
  onPromote,
  promoted = false,
  onClick,
  selected = false,
}: {
  proof: Proof;
  className?: string;
  onJudge?: (state: ProofState) => void;
  /** Put this plate on the asset shelf. Offered on APPROVED proofs only — the
   *  shelf is for work that was judged good, and promoting a rejection would
   *  file the record of a mistake as reusable material. */
  onPromote?: () => void;
  /** Already on the shelf. Shown as state, not hidden behind hover: the answer
   *  to "did that work" has to be on the plate. */
  promoted?: boolean;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-lg border transition ${PROOF_RING[proof.state]} ${
        selected ? "ring-1 ring-cyan-300/60" : ""
      } ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URL held in
          IndexedDB; there is no remote file for next/image to optimise. */}
      <img
        src={`data:${proof.mime};base64,${proof.base64}`}
        alt={proof.label}
        onClick={onClick}
        className={`h-full w-full object-cover ${onClick ? "cursor-zoom-in" : ""}`}
      />

      <span className="font-jetbrains pointer-events-none absolute bottom-1 left-1.5 rounded bg-black/60 px-1 py-0.5 text-label text-white/80">
        {proof.label}
      </span>

      {proof.state === "approved" && (
        <span className="font-jetbrains pointer-events-none absolute top-1 left-1.5 rounded bg-cyan-300/90 px-1.5 py-0.5 text-label font-semibold text-slate-950">
          APPROVED
        </span>
      )}
      {proof.state === "rejected" && (
        <span className="font-jetbrains pointer-events-none absolute top-1 left-1.5 rounded bg-rose-400/90 px-1.5 py-0.5 text-label font-semibold text-slate-950">
          REJECTED
        </span>
      )}

      {promoted && (
        <span className="font-jetbrains pointer-events-none absolute right-1.5 bottom-1 flex items-center gap-1 rounded bg-black/60 px-1 py-0.5 text-label text-white/75">
          <Library className="h-2.5 w-2.5" aria-hidden />
          on the shelf
        </span>
      )}

      {/* The verdict is the whole job of this surface, so the controls are
          always reachable — revealed on hover, but never hidden behind a menu. */}
      {(onJudge || onPromote) && (
        <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          {onPromote && !promoted && (
            <button
              onClick={onPromote}
              aria-label={`Keep ${proof.label} on the shelf`}
              title="keep on the asset shelf"
              className="rounded bg-black/70 p-1 text-white/70 transition hover:bg-white hover:text-slate-950"
            >
              <Library className="h-3 w-3" aria-hidden />
            </button>
          )}
          {onJudge && (
            <>
              <button
                onClick={() => onJudge("approved")}
                aria-label={`Approve ${proof.label}`}
                className="rounded bg-black/70 p-1 text-cyan-300 transition hover:bg-cyan-300 hover:text-slate-950"
              >
                <Check className="h-3 w-3" aria-hidden />
              </button>
              <button
                onClick={() => onJudge("rejected")}
                aria-label={`Reject ${proof.label}`}
                className="rounded bg-black/70 p-1 text-rose-300 transition hover:bg-rose-400 hover:text-slate-950"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * THE SHEET — one style, worked: its name, what the sheet holds, every proof
 * with its verdict, and the playground that fills it.
 *
 * A leaf rather than part of the atelier because the atelier is a three-pane
 * layout and this is the pane that keeps growing; at 80 lines inline it was
 * what pushed that surface past the line the design language draws.
 */
export function StyleSheet({
  theme,
  locked,
  shelved,
  note,
  onJudge,
  onBlockChange,
  onPromote,
  onKeepTrial,
}: {
  theme: Theme;
  locked: boolean;
  /** Ids of everything already on the asset shelf. */
  shelved: Set<string>;
  /** What just happened to the shelf, if anything. */
  note: string | null;
  onJudge: (proofId: string, state: ProofState) => void;
  /** Absent when locked — the playground then shows the slots as prose. */
  onBlockChange?: (block: StyleBlock) => void;
  onPromote: (proof: Proof) => void;
  onKeepTrial: (r: GenerateResult, subject: string) => void | Promise<void>;
}) {
  const full = sheetFull(theme);
  const approved = approvedProofs(theme);
  return (
    <Panel className="space-y-4 p-5">
      {/* NO HEADER. It carried the style's name in an editable field, its
          origin, a pip row counting approved proofs against the vendor's
          reference cap, a count of everything on the sheet, and a status stamp
          — five facts about the sheet, stacked above the sheet, before any
          picture. Every one of them is legible elsewhere: the name and palette
          are on the pill that selects this style, the status is the lock chip
          in the dossier, and the proofs are countable by looking at them.
          Renaming moved to the dossier, which is where a style's words live.

          What is left starts where the work is: the plates, then the playground
          that makes them. */}
      <h2 className="sr-only">{theme.name} — proof sheet</h2>

      {theme.proofs.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {theme.proofs.map((p) => (
            <ProofThumb
              key={p.id}
              proof={p}
              onJudge={locked ? undefined : (state) => onJudge(p.id, state)}
              // Approved only: the shelf is for work that was judged good. A
              // locked style's plates are the most promotable of all, so this
              // is offered whether or not it locked.
              onPromote={p.state === "approved" ? () => onPromote(p) : undefined}
              promoted={shelved.has(promotedId(theme.id, p.id))}
            />
          ))}
        </div>
      )}

      {note && <p className="font-jetbrains text-content text-white/45">{note}</p>}

      <div className="border-t border-white/8 pt-4">
        <Playground
          block={theme.block}
          onBlockChange={locked ? undefined : onBlockChange}
          // Newest approved first: the most recent approval is the best
          // statement of where the style landed.
          references={approved
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
            .map((p) => ({ base64: p.base64, mime: p.mime }))}
          // A locked sheet is closed, so trials still RENDER — that is how you
          // see what the style does — they simply cannot join it. Offering a
          // keep that lands as a proof nobody may ever judge is the dead end
          // one row down.
          disabled={!locked && full}
          onKeep={locked ? undefined : onKeepTrial}
        />
        {/* Nothing is written here any more. "Locked — the sheet is final.
            Trials still render…" restated the lock chip in SpecEditor and the
            StatusStamp two rows up, in a third spelling; the absent keep button
            is the rest of it. The full-window sentence became the pip row in the
            header. */}
      </div>
    </Panel>
  );
}

/** How many projects were created on a style: a number, or the two states that
 *  are not one. `unknown` is not folded into 0 — "no project uses this" and "we
 *  could not find out" are opposite facts to delete a paid sheet on. */
export type Dependents = number | "counting" | "unknown";

/**
 * Deleting a style is the one destructive act in the atelier, and the only one
 * in this app that discards work a vendor was PAID to produce. So it asks
 * first, and it names all of it: how many proofs, what they cost, and which
 * projects were built on the style and will lose it.
 */
export function ConfirmDeleteStyle({
  theme,
  dependents,
  promoted,
  onClose,
  onConfirm,
}: {
  theme: Theme | null;
  dependents: Dependents;
  /** Proofs from this style that were promoted to the asset shelf. They point
   *  at bytes inside the theme, so they go with it — said here, before. */
  promoted: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const spend = theme ? sheetSpend(theme) : { usd: 0, unpriced: 0 };
  const approved = theme ? approvedProofs(theme).length : 0;
  return (
    <Modal
      open={Boolean(theme)}
      onClose={onClose}
      title={theme ? `Delete “${theme.name}”?` : ""}
      className="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" className="cursor-pointer px-4 py-2" onClick={onClose}>
            Keep it
          </Button>
          <button
            onClick={onConfirm}
            className="font-jetbrains cursor-pointer rounded-full border border-rose-400/40 bg-rose-400/10 px-5 py-2 text-label text-rose-200 transition hover:bg-rose-400/20"
          >
            Delete the style
          </button>
        </div>
      }
    >
      {/* A LEDGER, NOT FOUR PARAGRAPHS. Every figure here is a fact about the
          user's own work — how many plates, what a vendor was paid for them,
          what else points at them — so none of it is deletable narration. It was
          simply unreadable at the moment it is read: four sentences, scanned
          under a rose button, with the numbers buried mid-clause. Laid out as
          terms and figures the same facts are countable at a glance.

          What DID go is the last paragraph — "the style goes from this
          browser's storage; nothing is deleted anywhere else, there is nowhere
          else yet" — which is the app describing its own persistence layer at
          the moment the user is deciding about their work. */}
      {theme && (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5">
            <Figure term="proofs" value={theme.proofs.length} />
            <Figure term="approved" value={approved} />
            <Figure
              term="paid for renders"
              value={spend.usd > 0 ? `$${spend.usd.toFixed(2)}` : "$0.00"}
              note={spend.unpriced > 0 ? `${spend.unpriced} the vendor did not price` : undefined}
            />
            <Figure
              term="on the asset shelf"
              value={promoted}
              tone={promoted > 0 ? "amber" : undefined}
              // A promoted plate is a POINTER at bytes inside this style, so it
              // cannot outlive it. Said as a consequence, not a mechanism.
              note={promoted > 0 ? (promoted === 1 ? "goes with it" : "go with it") : undefined}
            />
            <Figure
              term="projects built on it"
              value={
                dependents === "counting" ? "…" : dependents === "unknown" ? "unknown" : dependents
              }
              tone={dependents === "unknown" || (typeof dependents === "number" && dependents > 0) ? "amber" : undefined}
              note={
                dependents === "unknown"
                  ? "check /projects first"
                  : typeof dependents === "number" && dependents > 0
                    ? "kept — they fall back to a preset"
                    : undefined
              }
            />
          </dl>
          <p className="font-hanken text-content text-slate-300">None of it can be got back.</p>
        </div>
      )}
    </Modal>
  );
}

/** One term and one figure from the delete ledger. `note` is the consequence,
 *  never a definition — it says what happens to the thing counted. */
function Figure({
  term,
  value,
  note,
  tone,
}: {
  term: string;
  value: number | string;
  note?: string;
  tone?: "amber";
}) {
  return (
    <div>
      <dt className="font-jetbrains text-label tracking-[0.12em] text-white/40 uppercase">{term}</dt>
      <dd
        className={`font-instrument mt-0.5 text-2xl ${tone === "amber" ? "text-amber-200" : "text-white"}`}
      >
        {value}
      </dd>
      {note && (
        <dd
          className={`font-jetbrains text-label leading-snug ${tone === "amber" ? "text-amber-200/70" : "text-white/40"}`}
        >
          {note}
        </dd>
      )}
    </div>
  );
}

/**
 * THE PIPELINE, DRAWN — and drawn against the style the user is looking at.
 *
 * It was a sentence in the dossier: "preset or brief → render trials → approve
 * the ones that hold → locked". A diagram written in prose, printed identically
 * whatever state the selected style was in, so the one thing it could have told
 * the reader — where THIS style has got to — was the one thing it did not say.
 *
 * Filled = passed. A lit ring = where the style stands now. Hollow = ahead of
 * it. The rail between two nodes is cyan up to the current one and hairline
 * after it, which is the same grammar <UpstreamBreak> uses for phases.
 */
const STAGES = ["start", "trials", "approved", "locked"] as const;

export function StyleStepper({ theme }: { theme: Theme | null }) {
  const approved = theme ? approvedProofs(theme).length : 0;
  // Index of the first stage NOT reached. Cumulative on purpose: a locked style
  // has necessarily been through the three before it, so the rail cannot show a
  // gap the data cannot produce.
  const reached = [Boolean(theme), (theme?.proofs.length ?? 0) > 0, approved > 0, theme ? statusOf(theme) === "locked" : false];
  const firstOpen = reached.indexOf(false);
  const at = firstOpen === -1 ? STAGES.length - 1 : Math.max(0, firstOpen);

  return (
    <ol
      aria-label={`Style pipeline: at ${STAGES[at]}`}
      className="font-jetbrains space-y-0 text-label"
    >
      {STAGES.map((s, i) => {
        const done = reached[i];
        const here = i === at && !done;
        return (
          <li key={s} className="flex items-start gap-2.5">
            <span aria-hidden className="flex w-3 shrink-0 flex-col items-center">
              <span
                className={`mt-1.5 h-2.5 w-2.5 rounded-full border ${
                  done
                    ? "border-cyan-300/70 bg-cyan-300/80"
                    : here
                      ? "animate-pulse border-cyan-300/70"
                      : "border-white/20"
                }`}
              />
              {i < STAGES.length - 1 && (
                <span className={`h-5 w-px ${done ? "bg-cyan-300/40" : "bg-white/12"}`} />
              )}
            </span>
            <span className={done ? "text-cyan-200/70" : here ? "text-white/70" : "text-white/25"}>
              {s}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The gate, as a padlock.
 *
 * It used to read "no locked style — project creation is gated" / "2 locked
 * styles — projects open": the rule spelled out beside a dot that already had
 * two states. A closed padlock IS "gated" and an open one IS "projects open",
 * so the words were the drawing said twice. The sentence survives for a screen
 * reader, which gets nothing at all from a padlock.
 */
export function GateChip({ themes }: { themes: Theme[] }) {
  const n = lockedOnly(themes).length;
  const open = n > 0;
  return (
    <span className={`${CHIP_CLASS} ${TALLY_TONE[open ? "cyan" : "amber"]}`}>
      {open ? (
        <LockOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      <span aria-hidden>{n}</span>
      <span className="sr-only">
        {open
          ? `${n} locked ${n === 1 ? "style" : "styles"}. Projects can be created.`
          : "No locked style. Project creation is gated."}
      </span>
    </span>
  );
}
