"use client";

// A SLOT VERB THAT CANNOT BE TAKEN BACK, confirmed (modal-stack destructive-confirmation:
// irreversible with a small blast radius gets a lightweight dialog that names the object and
// the consequence, never "are you sure"). Two verbs come here: cancel (a cancelled slot is
// terminal in the machine - nothing schedules it again) and publish now (it leaves the machine,
// or on a dry side writes the plan it would send). Move does not: a moved slot moves back.
//
// Drawn in the consequence panel's own vocabulary (../consequence/Consequence.module.css) - its
// veil, panel and hued rows - because ConsequencePanel itself is the Board commit's (its title,
// counts and token are a packet's). A dialog layer: Escape cancels and focus returns to the
// sheet; the confirm takes focus, so ⏎ confirms through the button itself.
import { useEffect, useRef } from "react";

import { useLayer } from "../../layers/useLayer.ts";
import { Button } from "../button/Button.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import type { Tone } from "../chip/tone.ts";
import c from "../consequence/Consequence.module.css";

export type SlotConfirmProps = {
  /** The verb as the button says it: `Cancel slot`, `Publish now`. */
  readonly verb: string;
  /** The object: the slot's title, channel and hour. */
  readonly object: string;
  /** What happens, one line each, in the work's words. */
  readonly consequences: readonly string[];
  readonly tone: Extract<Tone, "rose" | "amber">;
  readonly busy: boolean;
  /** The refusal, verbatim. */
  readonly error?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly specimen?: boolean;
};

export function SlotConfirm({ verb, object, consequences, tone, busy, error, onConfirm, onCancel, specimen = false }: SlotConfirmProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  useLayer(!specimen, { kind: "dialog", panelRef: panel, onClose: onCancel });
  useEffect(() => {
    if (specimen) return;
    const buttons = panel.current?.querySelectorAll("button");
    buttons?.[buttons.length - 1]?.focus();
  }, [specimen]);
  return (
    <div className={specimen ? c.inline : c.backdrop}>
      <div ref={panel} className={c.panel} role="alertdialog" aria-modal={specimen ? undefined : true} aria-label={`${verb} · ${object}`} data-component="SlotConfirm">
        <div className={c.head}>
          <h3 className={c.title}>{verb}</h3>
        </div>
        <div className={c.body}>
          <ul className={c.rows}>
            <li className={c.row}>{object}</li>
            {consequences.map((line) => (
              <li key={line} className={c[tone]}>
                {line}
              </li>
            ))}
          </ul>
        </div>
        {error !== undefined && <ErrorLine message={error} live />}
        <div className={c.foot}>
          <Button label="Keep" onPress={onCancel} />
          <Button label={busy ? `${verb} …` : verb} tone={tone} onPress={onConfirm} disabled={busy} />
        </div>
      </div>
    </div>
  );
}
