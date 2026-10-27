"use client";

// The steer's advisory split: a whole percent per audience, and per genre inside it - every group the graph names,
// in its order. Save sends the filled fields to the steer's door (steer.ts checkSplit); a refusal is its sentence,
// verbatim, and a saved split comes back as the view whose bands carry the new targets.

import { useState } from "react";

import type { GraphGroup } from "@gt/domain/scoutGraph";
import { BEFORE_SEEDS } from "@gt/domain/scoutGraph";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { Panel } from "@gt/ui/components/panel/Panel.tsx";

import type { ActionResult } from "../../../_server/actionCore.ts";
import type { ScoutView, SplitInput } from "../_port/contract.ts";
import { fieldsOf, splitOf, type SplitFields } from "./bands.ts";
import s from "./scout.module.css";

export type SplitEditorProps = {
  readonly groups: readonly GraphGroup[];
  readonly split: SplitInput | undefined;
  readonly save: (split: SplitInput) => Promise<ActionResult<ScoutView>>;
  readonly onView: (v: ScoutView) => void;
};

export function SplitEditor({ groups, split, save, onView }: SplitEditorProps) {
  const [fields, setFields] = useState<SplitFields>(() => fieldsOf(split));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = groups.filter((g) => g.key !== BEFORE_SEEDS);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const r = await save(splitOf(fields));
    setBusy(false);
    if (!r.ok) {
      setError(r.error.error);
      return;
    }
    onView(r.value);
    setFields(fieldsOf(r.value.split));
  };

  return (
    <Panel title="split">
      <div className={s.panelBody}>
        <div className={s.split}>
          {rows.map((g) => (
            <div key={g.key} className={g.genre === undefined ? s.share : s.shareGenre}>
              <span className={s.shareKey}>{g.genre ?? g.key}</span>
              <span className={s.shareField}>
                <Field label={`${g.key} share`} value={fields[g.key] ?? ""} onChange={(v) => setFields((f) => ({ ...f, [g.key]: v }))} />
              </span>
              <span className={s.pct}>%</span>
            </div>
          ))}
        </div>
        <div className={s.row}>
          <Button label="Save" size="sm" tone="cyan" disabled={busy} onPress={() => void submit()} />
        </div>
        {error !== null && <ErrorLine message={error} live />}
      </div>
    </Panel>
  );
}
