"use client";

// Shared leaves for /library. These used to draw gradient mocks; they now draw
// real generated pixels, so the only thing that changed conceptually is that a
// proof can be WRONG — hence the judge affordances.

import { Check, Library, X } from "lucide-react";

import Modal from "@/components/ui/Modal";
import { Panel, Button } from "@/components/ui/Primitives";
import { promotedId } from "@/lib/assets";
import type { GenerateResult } from "@/lib/imagingClient";
import type { PaletteColor, Proof, ProofState, Theme, ThemeStatus } from "@/lib/themes";
import {
  approvedProofs,
  lockedOnly,
  ORIGIN_WORD,
  PROOF_CAP,
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
      className={`font-jetbrains rounded-full border px-2.5 py-0.5 text-[10px] tracking-[0.14em] uppercase ${STATUS_CLS[status]}`}
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
            <span className="font-jetbrains text-[11px] text-white/55">
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

      <span className="font-jetbrains pointer-events-none absolute bottom-1 left-1.5 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white/80">
        {proof.label}
      </span>

      {proof.state === "approved" && (
        <span className="font-jetbrains pointer-events-none absolute top-1 left-1.5 rounded bg-cyan-300/90 px-1.5 py-0.5 text-[9px] font-semibold text-slate-950">
          APPROVED
        </span>
      )}
      {proof.state === "rejected" && (
        <span className="font-jetbrains pointer-events-none absolute top-1 left-1.5 rounded bg-rose-400/90 px-1.5 py-0.5 text-[9px] font-semibold text-slate-950">
          REJECTED
        </span>
      )}

      {promoted && (
        <span className="font-jetbrains pointer-events-none absolute right-1.5 bottom-1 flex items-center gap-1 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white/75">
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
  onRename,
  onJudge,
  onPromote,
  onKeepTrial,
}: {
  theme: Theme;
  locked: boolean;
  /** Ids of everything already on the asset shelf. */
  shelved: Set<string>;
  /** What just happened to the shelf, if anything. */
  note: string | null;
  onRename: (name: string) => void;
  onJudge: (proofId: string, state: ProofState) => void;
  onPromote: (proof: Proof) => void;
  onKeepTrial: (r: GenerateResult, subject: string) => void | Promise<void>;
}) {
  const full = sheetFull(theme);
  return (
    <Panel className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <input
            value={theme.name}
            onChange={(e) => onRename(e.target.value)}
            disabled={locked}
            className="font-instrument w-full rounded bg-transparent text-2xl text-white disabled:opacity-100"
            aria-label="Style name"
          />
          {/* The cap counts what it caps: approved proofs are the model's
              reference window, and the total is just how much judging has
              been done. */}
          <p className="font-jetbrains mt-0.5 text-[11px] text-white/40">
            {ORIGIN_WORD[theme.origin]} · {approvedProofs(theme).length}/{PROOF_CAP} approved ·{" "}
            {theme.proofs.length} on the sheet
          </p>
        </div>
        <StatusStamp status={statusOf(theme)} />
      </div>

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

      {note && <p className="font-jetbrains text-[11px] text-white/45">{note}</p>}

      <div className="border-t border-white/8 pt-4">
        <Playground
          block={theme.block}
          // Newest approved first: the most recent approval is the best
          // statement of where the style landed.
          references={approvedProofs(theme)
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
        {locked ? (
          <p className="font-jetbrains mt-2 text-[11px] text-white/40">
            Locked — the sheet is final. Trials still render so you can see what this style does; they
            cannot join it.
          </p>
        ) : (
          full && (
            <p className="mt-2 text-[12px] text-amber-200/90">
              {PROOF_CAP} approved proofs — the model&rsquo;s whole reference-image window. Reject one to
              make room; it stays on the sheet as the record of what this style is not.
            </p>
          )
        )}
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
            className="font-jetbrains cursor-pointer rounded-full border border-rose-400/40 bg-rose-400/10 px-5 py-2 text-[12px] text-rose-200 transition hover:bg-rose-400/20"
          >
            Delete the style
          </button>
        </div>
      }
    >
      {theme && (
        <div className="font-hanken space-y-3 text-base text-slate-300">
          <p>
            Its sheet goes with it: {theme.proofs.length} proof{theme.proofs.length === 1 ? "" : "s"},{" "}
            {approved} of them approved
            {spend.usd > 0 && (
              <>
                {" "}
                — ${spend.usd.toFixed(2)} of renders
                {spend.unpriced > 0 && `, and ${spend.unpriced} the vendor did not price`}
              </>
            )}
            . None of it can be got back.
          </p>

          {promoted > 0 && (
            <p className="text-sm text-amber-200/90">
              {promoted} of them {promoted === 1 ? "is" : "are"} on the asset shelf. A promoted plate
              points at the bytes inside this style, so {promoted === 1 ? "it goes" : "they go"} with it.
            </p>
          )}

          <p className="text-sm text-amber-200/90">
            {dependents === "counting"
              ? "Checking which projects were built on it…"
              : dependents === "unknown"
                ? "Which projects were built on it could not be read — check /projects before you delete."
                : dependents === 0
                  ? "No project was built on it."
                  : dependents === 1
                    ? "1 project was built on it. It is NOT deleted — it keeps working, renders on a fallback preset, and says so."
                    : `${dependents} projects were built on it. They are NOT deleted — they keep working, render on a fallback preset, and say so.`}
          </p>

          <p className="font-jetbrains text-[11px] text-white/35">
            The style goes from this browser&rsquo;s storage. Nothing is deleted anywhere else — there is
            nowhere else yet.
          </p>
        </div>
      )}
    </Modal>
  );
}

/** The rule this page exists to enforce, stated where the user starts. */
export function GateChip({ themes }: { themes: Theme[] }) {
  const n = lockedOnly(themes).length;
  const open = n > 0;
  return (
    <span
      className={`font-jetbrains inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] ${
        open ? "border-cyan-400/30 bg-cyan-400/5 text-cyan-200" : "border-amber-300/40 bg-amber-300/5 text-amber-200"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-cyan-300" : "bg-amber-300"}`} />
      {open
        ? `${n} locked ${n === 1 ? "style" : "styles"} — projects open`
        : "no locked style — project creation is gated"}
    </span>
  );
}
