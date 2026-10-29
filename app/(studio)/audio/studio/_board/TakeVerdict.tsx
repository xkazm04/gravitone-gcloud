"use client";

// ONE TAKE COLUMN'S VERDICT (spark suno-advisor S1, the takes board): the dock's VerdictBar with its
// clip fixed by the column - keep or drop (or neither), what is off as chips on VERDICT_OFF, the
// person's words, at most one audio file (the mp3 of THIS clip, one of the plan's metered downloads,
// the person's choice), and send. Composed from @gt/ui primitives and the suno vocabulary's pure
// arithmetic (verdictOf / verdictText / attachFault), because VerdictBar always draws its own a/b/both
// switch (WP4c asks WP3 for a fixed `clip` prop; then this file becomes a VerdictBar). Sends through
// SunoHost.sendVerdict with `clip`, so an upload is filed against this column's clip. The control
// resets when the send went and holds everything, with the refusal under it, when it did not.
import { useRef, useState } from "react";

import { VERDICT_OFF, type VerdictOff } from "@gt/domain/audio.suno";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { attachFault, fileSize, verdictOf, verdictText } from "@gt/ui/components/suno/suno.ts";

import type { SunoHost } from "../_host/types.ts";
import type { Clip } from "./board.ts";
import s from "./board.module.css";

/** The door's cap on a user turn's words (audio.studio.ts `text`). */
const WORDS_MAX = 2000;

export function TakeVerdict({ promptId, clip, send, disabled, hasTake }: { readonly promptId: string; readonly clip: Clip; readonly send: SunoHost["sendVerdict"]; readonly disabled: boolean; readonly hasTake: boolean }) {
  const [keep, setKeep] = useState<boolean | undefined>(undefined);
  const [off, setOff] = useState<ReadonlySet<VerdictOff>>(new Set());
  const [words, setWords] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const toggleOff = (o: VerdictOff): void =>
    setOff((was) => {
      const next = new Set(was);
      if (next.has(o)) next.delete(o);
      else next.add(o);
      return next;
    });
  const pick = (f: File | undefined): void => {
    if (f === undefined) return;
    const why = attachFault(f);
    setFault(why);
    setFile(why === null ? f : null);
  };
  const go = (): void => {
    if (disabled || busy) return;
    const verdict = verdictOf(promptId, clip, keep, off);
    setBusy(true);
    setRefused(null);
    void send({ verdict, text: verdictText(verdict, words), ...(file !== null ? { file, clip } : {}) }).then((reason) => {
      setBusy(false);
      if (reason !== null) {
        setRefused(reason);
        return;
      }
      setKeep(undefined);
      setOff(new Set());
      setWords("");
      setFile(null);
      setFault(null);
    });
  };

  return (
    <div className={s.verdict} role="group" aria-label={`verdict on ${promptId}, take ${clip}`}>
      <span className={s.verdictRow}>
        <span className={s.chips} role="group" aria-label="keep or drop">
          <Chip label="keep" tone={keep === true ? "emerald" : "neutral"} casing="lower" pressed={keep === true} onPress={() => setKeep(keep === true ? undefined : true)} />
          <Chip label="drop" tone={keep === false ? "rose" : "neutral"} casing="lower" pressed={keep === false} onPress={() => setKeep(keep === false ? undefined : false)} />
        </span>
        <span className={s.file}>
          <input ref={picker} className={s.picker} type="file" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" tabIndex={-1} aria-hidden="true" onChange={(e) => pick(e.currentTarget.files?.[0])} />
          {file === null ? (
            <Button label={hasTake ? "attach another" : `attach take ${clip}`} size="sm" glyph="up" onPress={() => picker.current?.click()} />
          ) : (
            <>
              <Chip label={file.name} value={fileSize(file.size)} tone="cyan" casing="lower" />
              <button type="button" className={s.remove} aria-label={`remove ${file.name}`} onClick={() => setFile(null)}>
                <span aria-hidden="true">{"×"}</span>
              </button>
            </>
          )}
        </span>
      </span>
      <span className={s.chips} role="group" aria-label="what is off">
        {VERDICT_OFF.map((o) => (
          <Chip key={o} label={o} tone={off.has(o) ? "amber" : "neutral"} ghost={!off.has(o)} casing="lower" pressed={off.has(o)} onPress={() => toggleOff(o)} />
        ))}
      </span>
      <span className={s.verdictRow}>
        <span className={s.say}>
          <Field label={`take ${clip}, in your words`} value={words} onChange={setWords} maxLength={WORDS_MAX} disabled={busy} />
        </span>
        <Button label={busy ? "sending…" : "send verdict"} tone="cyan" size="sm" disabled={disabled || busy} onPress={go} />
      </span>
      {fault !== null && <ErrorLine message={fault} live />}
      {refused !== null && <ErrorLine message={refused} live />}
    </div>
  );
}
