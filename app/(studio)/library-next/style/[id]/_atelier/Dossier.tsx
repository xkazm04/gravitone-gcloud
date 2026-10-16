"use client";

// THE STYLE DOCUMENT - everything the style IS, beside the sheet it is proven on: where it
// stands on the ratchet and why, its name, the four slots, its palette doing its jobs, its
// elements, the catalogue's words (recipe, negative, observables),
// and what a generation against it would send. (The evidence the Weir left and the exemplars
// Extract kept sit under the sheet in the main pane: they are evidence, as the sheet is.)
//
// Absorbed: v1 SpecEditor (the slots, the lock and its blocker; rename lived beside them), the
// Foundry document (StylesShelf.tsx: recipe, observables, evidence, plates), parts.tsx's
// `PaletteDots`. Upgraded: the catalogue half and the look half are one record, so the recipe a
// readback wrote and the block an operator edits sit in one place and cannot drift apart (v1
// joined them by a `foundryStyleId` pointer nothing kept true). Dropped: v1's "compiled prompt"
// disclosure - the block's words are the prompt's words (style.ratchet compileStyleBlock), and
// the receipt names what is sent.
import { useState } from "react";

import { SEND_REFS } from "@gt/domain/style.ratchet";
import type { StyleOp, StyleView } from "@gt/domain/styleView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { PipRow } from "@gt/ui/components/piprow/PipRow.tsx";
import { LockGate } from "@gt/ui/components/style/LockGate.tsx";
import { Palette } from "@gt/ui/components/style/StyleFacts.tsx";
import { StyleSlots } from "@gt/ui/components/style/StyleSlots.tsx";

import s from "./Atelier.module.css";

export function Dossier({ view, busy, send }: { readonly view: StyleView; readonly busy: boolean; readonly send: (op: StyleOp) => void }) {
  const [name, setName] = useState(view.name);
  const [seen, setSeen] = useState(view.name);
  if (seen !== view.name) {
    setSeen(view.name);
    setName(view.name);
  }
  const renamed = name.trim() !== "" && name.trim() !== view.name;
  const obs = Object.entries(view.observables).map(([term, value]) => ({ term: term.replace(/_/g, " "), value }));
  return (
    <aside className={s.dossier} aria-label="style document">
      <h1 className={s.title}>{view.name}</h1>
      <div className={s.idrow}>
        <Chip label={view.family} casing="lower" />
        <Chip label={view.origin.kind} value={view.origin.source ?? view.origin.presetId} casing="lower" />
        {view.discipline !== undefined && <Chip label={view.discipline} casing="lower" />}
        {view.duplicatedFrom !== undefined && <Chip label="from" value={view.duplicatedFrom} casing="lower" href={`/library-next/style/${encodeURIComponent(view.duplicatedFrom)}`} />}
      </div>
      <LockGate status={view.status} why={view.why} keptCells={view.keptCells} provenKeeps={view.provenKeeps} coverage={view.coverage} lockProblems={view.lockProblems} lock={view.lock} />

      <form
        className={s.rename}
        onSubmit={(e) => {
          e.preventDefault();
          if (renamed) send({ kind: "rename", name: name.trim() });
        }}
      >
        <Field label="style name" value={name} onChange={setName} keyfield="style-name" />
        {/* Offered once the name differs: a dimmed control beside every name would be a
            control that says nothing (and a disabled one stays in the legibility baseline). */}
        {renamed && <Button label="rename" size="sm" submit disabled={busy} />}
      </form>

      {view.block !== null && (
        <>
          <CapsHeading text="block" variant="section" />
          <StyleSlots block={view.block} locked={view.status === "locked"} busy={busy} onCommit={(block) => send({ kind: "set-block", block })} />
        </>
      )}
      {view.palette !== null && (
        <>
          <CapsHeading text="palette" variant="section" />
          <Palette palette={view.palette} />
        </>
      )}
      {view.elements.length > 0 && (
        <>
          <CapsHeading text="elements" variant="section" tally={{ value: view.elements.length }} />
          <div className={s.idrow}>
            {view.elements.map((e) => (
              <Chip key={e} label={e} casing="lower" />
            ))}
          </div>
        </>
      )}
      <CapsHeading text="recipe" variant="section" />
      <p className={s.recipe}>{view.recipe}</p>
      {view.negative !== "" && (
        <p className={s.negative}>
          <b aria-label="never">−</b> {view.negative}
        </p>
      )}
      {obs.length > 0 && (
        <>
          <CapsHeading text="observables" variant="section" />
          <Facts facts={obs} />
        </>
      )}
      {view.block !== null && (
        <>
          <CapsHeading text="references" variant="section" tally={{ value: view.refs.length, label: "sent" }} />
          <PipRow looks={view.refs.map(() => "done" as const)} max={SEND_REFS} label={`${view.refs.length} of ${SEND_REFS} references sent with each render`} />
        </>
      )}
    </aside>
  );
}
