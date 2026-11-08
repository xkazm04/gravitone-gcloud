"use client";

// THE REMIX BROUGHT BACK (copied from ../After.tsx RemixPart, laid as sheet lines): the Suno file chosen and uploaded
// with its style, then the two style prompts saved - the source's and the remix's - for the next cover.
import { useState } from "react";

import { COVER_STYLE_MAX } from "@gt/domain/cover";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { TextArea } from "@gt/ui/components/field/Field.tsx";

import base from "../cover.module.css";
import type { CoverFlow } from "../useCover.ts";
import { Line } from "./Line.tsx";
import s from "./sheet.module.css";

export function RemixLines({ flow }: { readonly flow: CoverFlow }) {
  const r = flow.card.record;
  const [file, setFile] = useState<File | null>(null);
  const [remixStyle, setRemixStyle] = useState(r.remix?.style ?? "");
  const [sourceStyle, setSourceStyle] = useState(r.sourceStyle ?? "");
  return (
    <>
      <Line term="remix" tone="rule">
        <div className={s.stack}>
          <div className={s.inline}>
            <label className={base.choose}>
              <input className={base.file} type="file" accept="audio/*" aria-label="remix file" onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
              {r.remix === undefined ? "Choose remix" : "Replace remix"}
            </label>
            {file !== null && <Chip label={file.name} casing="lower" />}
            {file === null && r.remix !== undefined && <Chip label={r.remix.name} casing="lower" tone="emerald" />}
            <Button label={flow.remixBusy ? "Uploading" : "Upload remix"} tone="cyan" size="sm" disabled={file === null || flow.remixBusy} onPress={() => file !== null && flow.sendRemix(file, remixStyle)} />
          </div>
          {flow.remixError !== null && <ErrorLine message={flow.remixError} live />}
        </div>
      </Line>
      <Line term="remix style">
        <TextArea label="remix style" value={remixStyle} onChange={setRemixStyle} maxLength={COVER_STYLE_MAX} rows={2} disabled={flow.remixBusy} />
      </Line>
      <Line term="source style">
        <div className={s.stack}>
          <TextArea label="source style" value={sourceStyle} onChange={setSourceStyle} maxLength={COVER_STYLE_MAX} rows={2} disabled={flow.stylesBusy} />
          <div className={s.inline}>
            <Button label={flow.stylesBusy ? "Saving" : "Save styles"} size="sm" disabled={flow.stylesBusy} onPress={() => flow.saveStyles(sourceStyle, remixStyle)} />
            {flow.stylesSaved && <Chip label="saved" tone="emerald" casing="lower" />}
          </div>
          {flow.stylesError !== null && <ErrorLine message={flow.stylesError} live />}
        </div>
      </Line>
    </>
  );
}
