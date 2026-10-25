// THE PROOF SHEET - every picture a style was judged on, with its verdict on it (v1
// app/library/parts.tsx `StyleSheet` + `ProofThumb`). What was kept and why:
//   · the verdict is the surface's whole job, so approve/reject sit ON the plate, always
//     reachable - not behind hover (v1 revealed them on hover; a keyboard user found them by
//     focus alone);
//   · a REJECTION IS KEPT with its note: it is the record of what the style is not
//     (visual-style-locking/rejections-as-negative-evidence). Reject therefore opens a one-line
//     note before it lands - "rejection without a note is half a decision" - and Esc backs out;
//   · the reference window (PROOF_CAP) counts APPROVED proofs only: v1 once counted rejections
//     and turned a well-worked sheet into a dead end that "reject one to make room" could not fix;
//   · an approval rendered under an earlier block is marked and drawn dimmed: it no longer
//     vouches for the words, and it is no longer sent as a reference (v1 coverage.ts `stale`).
// Upgraded: lineage is the server's reading (`lineage` on the view), never recomputed here; a
// forge plate seeded by adopt says where it came from rather than passing as a production render.
import type { BlobRef } from "@gt/domain/blob";
import type { ProofState, StyleProofView } from "@gt/domain/styleView";

import { SrOnly } from "../a11y/SrOnly.tsx";
import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { Plate } from "../desk/Plate.tsx";
import { Field } from "../field/Field.tsx";
import { PipRow } from "../piprow/PipRow.tsx";
import { Tally } from "../tally/Tally.tsx";
import { STATE_WORD, proofLook, spendWords } from "./style.ts";
import s from "./Style.module.css";

const STATE_TONE = { pending: "amber", approved: "emerald", rejected: "rose" } as const;

export type ProofNoting = { readonly id: string; readonly note: string };

export type ProofSheetProps = {
  readonly proofs: readonly StyleProofView[];
  readonly sheet: { readonly approved: number; readonly pending: number; readonly rejected: number; readonly cap: number; readonly spend: { readonly usd: number; readonly unpriced: number } };
  readonly srcOf: (ref: BlobRef) => string;
  readonly held: string | null;
  readonly onHold: (id: string) => void;
  /** Absent when the sheet may not be judged (a locked style: its sheet is the reference set). */
  readonly onJudge?: (id: string, state: ProofState) => void;
  readonly noting: ProofNoting | null;
  readonly onNote: (note: string) => void;
  readonly onAttach: () => void;
  readonly onCancelNote: () => void;
  readonly busy: boolean;
};

export function ProofSheet({ proofs, sheet, srcOf, held, onHold, onJudge, noting, onNote, onAttach, onCancelNote, busy }: ProofSheetProps) {
  const current = proofs.filter((p) => p.state === "approved" && p.lineage !== "stale").length;
  return (
    <section className={s.sheet} aria-label="proof sheet" data-component="ProofSheet">
      <div className={s.sheetHead}>
        <PipRow looks={Array.from({ length: Math.min(current, sheet.cap) }, () => "done" as const)} max={sheet.cap} label={`${current} of ${sheet.cap} reference slots approved`} />
        <Tally value={sheet.approved} label="approved" />
        <Tally value={sheet.pending} label="undecided" />
        <Tally value={sheet.rejected} label="rejected" />
        <Chip label="spend" value={spendWords(sheet.spend)} casing="lower" />
      </div>
      <ul className={s.grid}>
        {proofs.map((p) => (
          <li key={p.id}>
            <ProofTile
              proof={p}
              src={srcOf(p.media)}
              held={p.id === held}
              onHold={() => onHold(p.id)}
              {...(onJudge === undefined ? {} : { onJudge: (state: ProofState) => onJudge(p.id, state) })}
              noting={noting?.id === p.id ? noting.note : null}
              onNote={onNote}
              onAttach={onAttach}
              onCancelNote={onCancelNote}
              busy={busy}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

type TileProps = {
  readonly proof: StyleProofView;
  readonly src: string;
  readonly held: boolean;
  readonly onHold: () => void;
  readonly onJudge?: (state: ProofState) => void;
  readonly noting: string | null;
  readonly onNote: (note: string) => void;
  readonly onAttach: () => void;
  readonly onCancelNote: () => void;
  readonly busy: boolean;
};

export function ProofTile({ proof: p, src, held, onHold, onJudge, noting, onNote, onAttach, onCancelNote, busy }: TileProps) {
  return (
    <figure className={cx(s.tile, s[p.state], p.lineage === "stale" && s.stale, held && s.held)} data-proof={p.id} data-state={p.state} data-lineage={p.lineage} aria-current={held ? "true" : undefined}>
      <button type="button" className={s.plateBtn} onClick={onHold} aria-label={`hold ${p.label}`}>
        <Plate className={s.plate} src={src} alt="" lazy />
        <span className={cx(s.mark, s[p.state])} aria-hidden="true">
          <PipRow looks={[proofLook(p)]} label={STATE_WORD[p.state]} />
        </span>
      </button>
      <figcaption className={s.cap}>
        <span className={s.label}>{p.label}</span>
        <span className={s.chips}>
          <Chip label={STATE_WORD[p.state]} tone={STATE_TONE[p.state]} casing="lower" />
          {p.problem !== undefined && <Chip label={p.problem} casing="lower" />}
          {p.lineage === "stale" && <Chip label="earlier block" tone="amber" casing="lower" ghost />}
          {p.lineage === "unknown" && <Chip label="no lineage" casing="lower" ghost />}
          {p.source !== undefined && <Chip label="forge plate" casing="lower" ghost name={`forge plate ${p.source}`} />}
        </span>
        <span className={s.meta}>
          {[p.provider, p.model].filter((x) => x !== undefined).join(" · ") || "provider not recorded"}
          {" · "}
          {p.costUsd === undefined ? "unpriced" : `$${p.costUsd.toFixed(3)}`}
        </span>
        {p.note !== undefined && <q className={s.note}>{p.note}</q>}
      </figcaption>
      {noting !== null ? (
        <div className={s.noteRow}>
          <Field label={`why reject ${p.label}`} value={noting} onChange={onNote} placeholder="gradients crept in" keyfield="proof-note" />
          <Button label="reject" size="sm" tone="rose" onPress={onAttach} disabled={busy} shortcut={{ mode: "style", verb: "attach" }} />
          <Button label="keep undecided" size="sm" onPress={onCancelNote} />
        </div>
      ) : (
        onJudge !== undefined && (
          <div className={s.judge}>
            {p.state !== "approved" && <Button label="approve" size="sm" tone="emerald" onPress={() => onJudge("approved")} disabled={busy} />}
            {p.state !== "rejected" && <Button label="reject" size="sm" tone="rose" onPress={() => onJudge("rejected")} disabled={busy} />}
            {p.state !== "pending" && <Button label="undecide" size="sm" onPress={() => onJudge("pending")} disabled={busy} />}
          </div>
        )
      )}
      {held && <SrOnly text="held" />}
    </figure>
  );
}
