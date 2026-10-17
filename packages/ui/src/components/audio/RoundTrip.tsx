"use client";

// THE MANUAL STAGES, FIRST-CLASS (v1 app/playground/arrange/RoundTrip.tsx). Remaster and edit
// are done by hand in Suno's studio, so a card in either carries the whole round trip on its
// face: the file to take there, the prompt it was made from, Suno's steps, and a drop zone for
// what comes back. The returned file becomes the stack's next version.
//
// Two halves, because the operator decides where the new version sits: still in this stage
// (another pass to come) or one stage on. A version dropped toward FINALIZED needs its label
// first - the island opens the label prompt with the file held, and nothing is uploaded until
// it is named. These are native FILE drops (a file from the desktop), so they never collide
// with the board's card drag, which is pointer events.
import { useRef, useState } from "react";

import { Button } from "../button/Button.tsx";
import { cx } from "../cx.ts";
import type { ArrangeKind, Stage } from "./arrange.ts";
import s from "./Arrange.module.css";

/** Suno's studio as the operator walks it, per manual stage; an effect's edit is a trim. */
export const SUNO_STEPS: Readonly<Record<ArrangeKind, Readonly<Record<"remaster" | "edit", string>>>> = {
  music: { remaster: "upload → Remaster → download WAV", edit: "upload → Edit → replace section → download WAV" },
  sfx: { remaster: "upload → Remaster → download WAV", edit: "upload → Edit → trim · fade → download WAV" },
};

export type RoundTripProps = {
  readonly kind: ArrangeKind;
  readonly title: string;
  readonly stage: "remaster" | "edit";
  readonly next: Stage;
  /** The head's bytes to take to Suno; null when it has none. */
  readonly download: { readonly href: string; readonly name: string } | null;
  readonly busy: boolean;
  readonly onCopyPrompt: (() => void) | null;
  readonly onFile: (file: File, to: Stage) => void;
};

function Drop({ label, name, busy, onFile }: { readonly label: string; readonly name: string; readonly busy: boolean; readonly onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  return (
    <label
      className={cx(s.drop, over && s.dropOver, busy && s.dropBusy)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f !== undefined && !busy) onFile(f);
      }}
    >
      {label}
      <input
        ref={input}
        type="file"
        accept="audio/*"
        className={s.dropInput}
        aria-label={name}
        disabled={busy}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (f !== undefined) onFile(f);
        }}
      />
    </label>
  );
}

export function RoundTrip({ kind, title, stage, next, download, busy, onCopyPrompt, onFile }: RoundTripProps) {
  return (
    <div className={s.trip} data-nodrag>
      <span className={s.tripStep}>
        <b>suno</b> {SUNO_STEPS[kind][stage]}
      </span>
      <div className={s.tripActs}>
        {download === null ? <span className={s.tripNone}>no file</span> : <Button label="File" size="sm" href={download.href} />}
        {onCopyPrompt !== null && <Button label="Prompt" size="sm" onPress={onCopyPrompt} />}
      </div>
      <div className={s.tripDrops}>
        <Drop label={`↺ ${stage}`} name={`return for ${title}, stays in ${stage}`} busy={busy} onFile={(f) => onFile(f, stage)} />
        <Drop label={`→ ${next}`} name={`return for ${title}, moves to ${next}`} busy={busy} onFile={(f) => onFile(f, next)} />
      </div>
    </div>
  );
}
