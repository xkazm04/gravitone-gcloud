"use client";

// RESEARCH · THE BEAT VARIANT BOARD (STEPS-DESIGN §2; v1 BeatVariantBoard, VariantTile,
// useBeatPicks). PRIMARY: slots x variants, one pick per slot; the cue chip stays inside its
// column (v1's chips overran into the neighbour's). RAIL: the slots with their pick state.
// INSPECTOR: the variant - what is on screen, why it was offered, its named risk. HEADER:
// "compose spine" is an op (it freezes the picks Script composes from), with the picks as pips.
//
// Dropped from v1: the eyebrow and the "Glass Harbor slots, whatever the logline" notice - a
// fixture board is marked by its source tag, and a project with no board of its own gets none.
import { useState } from "react";

import type { BeatSlotView, PartView, ResearchData } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { cx } from "@gt/ui/components/cx.ts";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { RailList } from "@gt/ui/components/part/RailList.tsx";
import { walk } from "@gt/ui/components/part/part.ts";
import { PipRow } from "@gt/ui/components/piprow/PipRow.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import type { EditorProps } from "./PartEditor.tsx";
import s from "./Editors.module.css";

type Data = Extract<ResearchData, { face: "beats" }>;

function SlotRow({ slot }: { readonly slot: BeatSlotView }) {
  const v = slot.variants.find((x) => x.id === slot.pick);
  return (
    <div className={s.rr}>
      <div className={s.rrTop}>
        <span>{slot.pick === null ? "○" : "●"}</span>
        <span className={s.ell}>{slot.label}</span>
        <span className={s.faint}>{slot.variants.length}</span>
      </div>
      <div className={cx(s.rrTitle, s.clamp1)}>{v?.label ?? "—"}</div>
    </div>
  );
}

export function BeatsEditor({ view, frame, send, busy, error, data: d }: EditorProps<PartView<"research">> & { readonly data: Data }) {
  const [slotSel, setSlotSel] = useState<string | null>(d.slots[0]?.id ?? null);
  const [sel, setSel] = useState<string | null>(null);
  const slot = d.slots.find((x) => x.id === slotSel) ?? d.slots[0];
  const variant = slot?.variants.find((v) => v.id === (sel ?? slot.pick));
  const pick = (sl: BeatSlotView, id: string): void => send({ op: "pick-beat", slotId: sl.id, variantId: sl.pick === id ? null : id });

  useKeys(
    "part.research",
    {
      item: ({ index }) => {
        const next = walk(slot?.variants.map((v) => v.id) ?? [], variant?.id ?? null, index === 0 ? 1 : -1);
        if (next === null) return false;
        setSel(next);
      },
      column: ({ index }) => {
        const next = walk(d.slots.map((x) => x.id), slot?.id ?? null, index === 0 ? -1 : 1);
        if (next === null) return false;
        setSlotSel(next);
        setSel(d.slots.find((x) => x.id === next)?.variants[0]?.id ?? null);
      },
      open: () => (slot === undefined || variant === undefined || busy ? false : pick(slot, variant.id)),
      deselect: () => setSel(null),
    },
    { facts: variant === undefined ? [] : ["item"] },
  );

  const missing = d.slots.length - d.picked;
  const acts = (
    <>
      <PipRow looks={d.slots.map((x) => (x.pick === null ? "idle" : "done"))} label={`${d.picked} of ${d.slots.length} parts picked`} />
      {missing === 0 && d.slots.length > 0 && (!d.spine.composed || d.spine.moved) && <Button label="compose spine" size="sm" tone="emerald" onPress={() => send({ op: "compose-spine" })} />}
      {frame.acts}
    </>
  );

  return (
    <PartWorkspace
      {...frame}
      acts={acts}
      mode="part.research"
      facts={variant === undefined ? [] : ["item"]}
      rail={{
        label: "slots",
        children: <RailList label="slots" items={d.slots} idOf={(x) => x.id} selected={slot?.id ?? null} onSelect={(id) => (setSlotSel(id), setSel(null))} row={(x) => <SlotRow slot={x} />} />,
      }}
      primary={{
        label: "beat board",
        children: (
          <div className={s.primaryFill}>
            {error !== null && (
              <div className={s.err}>
                <ErrorLine message={error} live />
              </div>
            )}
            <div className={s.bar}>
              {d.slots.length > 0 && <SourceTag kind={d.origin === "fixture" ? "illustrative" : "model"} />}
              {view.data.offers.length > 1 && <Button label="notebook" size="sm" onPress={() => send({ op: "set-face", face: "notebook" })} />}
            </div>
            {d.slots.length === 0 ? (
              <div className={s.empty}>
                <Empty label="no beat board" />
              </div>
            ) : (
              <div className={s.slots}>
                {d.slots.map((sl) => (
                  <section key={sl.id} className={s.slot} aria-label={sl.label} {...(sl.id === slot?.id ? { "data-on": "" } : {})}>
                    <h3 className={s.h}>{sl.label}</h3>
                    {sl.cue !== undefined && <span className={s.cue}>{`cue ${sl.cue.label}${sl.cue.boundary ? " · boundary" : ""}`}</span>}
                    {sl.variants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className={s.variant}
                        aria-pressed={sl.pick === v.id}
                        data-variant={v.id}
                        {...(v.id === sel ? { "data-on": "" } : {})}
                        onClick={() => (setSlotSel(sl.id), setSel(v.id), pick(sl, v.id))}
                      >
                        <span className={s.blabel}>
                          <span>{v.kind}</span>
                          {v.connector !== null && <span className={s.conn}>{v.connector.toLowerCase()}</span>}
                          <span>{v.at}</span>
                          {v.raises.map((r) => (
                            <span key={r} className={s.on}>{`raises ${r}`}</span>
                          ))}
                          {v.spends > 0 && <span className={s.missing}>{`spends ${v.spends}`}</span>}
                        </span>
                        <span className={s.vlabel}>{v.label}</span>
                        <span className={cx(s.work, s.clamp2)}>{v.text}</span>
                      </button>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </div>
        ),
      }}
      inspector={{
        label: "variant",
        children:
          variant === undefined || slot === undefined ? (
            <Empty label="no variant selected" />
          ) : (
            <>
              <div className={s.bar}>
                <Chip label={slot.label} casing="lower" />
                <Chip label={variant.kind} casing="lower" />
                {slot.pick === variant.id && <Chip label="picked" tone="emerald" casing="lower" />}
              </div>
              <div className={s.sect}>
                <p className={s.claim}>{variant.label}</p>
                <p className={s.work}>{variant.text}</p>
                <p className={cx(s.work, s.faint)}>{variant.rationale}</p>
                {variant.risk !== undefined && <p className={s.risk}>{`risk — ${variant.risk}`}</p>}
              </div>
              <Button label={slot.pick === variant.id ? "unpick" : "pick"} size="sm" tone="emerald" shortcut={{ mode: "part.research", verb: "open" }} onPress={() => pick(slot, variant.id)} />
            </>
          ),
      }}
    />
  );
}
