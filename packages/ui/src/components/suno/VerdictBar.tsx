"use client";

// A verdict on one Suno prompt (spark suno-advisor), the row the dock carries while a prompt card is
// on screen: which take it is about (a / b / both), keep or drop (or neither), what is off as chips
// on the axes the next prompt can move (VERDICT_OFF), and at most one audio file - the mp3 the person
// chose to spend one of the plan's downloads on. The words are the dock's own draft (`text`): this is
// a row of the dock, never a second field. Send hands back exactly SunoHost.sendVerdict's shape; the
// row resets when the send went and holds everything when it was refused (the host says why).
//
// Spark suno-api: beside the file, a take can come FROM SUNO (./SunoPicker.tsx, when the host passes
// `suno`): pressing a song pulls it at once - filed, measured and read on the server - and the row
// then carries that take as its attachment, by id, instead of a file.
import { useRef, useState } from "react";

import { VERDICT_OFF, type VerdictClip, type VerdictOff } from "@gt/domain/audio.suno";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { Seg } from "../seg/Seg.tsx";
import { attachFault, fileSize, verdictOf, verdictText, type Verdict } from "./suno.ts";
import { SunoPicker, type SunoPickerProps } from "./SunoPicker.tsx";
import s from "./VerdictBar.module.css";

export type VerdictSend = { readonly verdict: Verdict; readonly text: string; readonly file?: File; readonly clip?: "a" | "b"; readonly takeId?: string };

/** The Suno library beside the file: the picker's reads, and the pull that files a song as this verdict's take. */
export type VerdictSuno = Pick<SunoPickerProps, "connection" | "connectHref" | "library"> & {
  /** Pull a song as the take of `clip`; resolve with the filed take, or the refusal in words. */
  readonly pull: (clipId: string, clip?: "a" | "b") => Promise<{ readonly takeId: string; readonly name: string } | string>;
};

export type VerdictBarProps = {
  readonly promptId: string;
  /** The dock's draft: the verdict's words (empty: the verdict is said plainly). */
  readonly text: string;
  /** The dock cannot send now (offline, thinking). */
  readonly disabled?: boolean;
  /** Resolve with the refusal in words, or null when it went. */
  readonly onSend: (v: VerdictSend) => Promise<string | null>;
  /** /kit only: a file drawn as attached. */
  readonly seedFile?: { readonly name: string; readonly size: number };
  /** Spark suno-api: a take from the person's Suno library, beside the file. */
  readonly suno?: VerdictSuno;
};

const CLIPS = [
  { value: "a", label: "take a" },
  { value: "b", label: "take b" },
  { value: "both", label: "both" },
] as const;

export function VerdictBar({ promptId, text, disabled = false, onSend, seedFile, suno }: VerdictBarProps) {
  const [clip, setClip] = useState<VerdictClip>("a");
  const [keep, setKeep] = useState<boolean | undefined>(undefined);
  const [off, setOff] = useState<ReadonlySet<VerdictOff>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [pulled, setPulled] = useState<{ readonly takeId: string; readonly name: string } | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState(seedFile !== undefined);
  const picker = useRef<HTMLInputElement>(null);
  const shown = file ?? (seeded ? (seedFile ?? null) : null);

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
    if (why === null) setPulled(null);
  };
  const pullSong = async (clipId: string): Promise<string | null> => {
    if (suno === undefined) return null;
    const r = await suno.pull(clipId, clip === "both" ? undefined : clip);
    if (typeof r === "string") return r;
    setPulled(r);
    setFile(null);
    setFault(null);
    return null;
  };
  const send = (): void => {
    if (disabled || busy) return;
    const verdict = verdictOf(promptId, clip, keep, off);
    const take = clip === "both" ? {} : { clip };
    setBusy(true);
    const attached = file !== null ? { file, ...take } : pulled !== null ? { takeId: pulled.takeId, ...take } : {};
    void onSend({ verdict, text: verdictText(verdict, text), ...attached }).then((reason) => {
      setBusy(false);
      if (reason !== null) return;
      setKeep(undefined);
      setOff(new Set());
      setFile(null);
      setPulled(null);
      setFault(null);
    });
  };

  return (
    <div className={s.bar} role="group" aria-label={`verdict on ${promptId}`}>
      <span className={s.pick}>
        <Seg label="which take" options={CLIPS} value={clip} onChange={setClip} />
        <span className={s.keep} role="group" aria-label="keep or drop">
          <Chip label="keep" tone={keep === true ? "emerald" : "neutral"} casing="lower" pressed={keep === true} onPress={() => setKeep(keep === true ? undefined : true)} />
          <Chip label="drop" tone={keep === false ? "rose" : "neutral"} casing="lower" pressed={keep === false} onPress={() => setKeep(keep === false ? undefined : false)} />
        </span>
      </span>
      <span className={s.off} role="group" aria-label="what is off">
        {VERDICT_OFF.map((o) => (
          <Chip key={o} label={o} tone={off.has(o) ? "amber" : "neutral"} ghost={!off.has(o)} casing="lower" pressed={off.has(o)} onPress={() => toggleOff(o)} />
        ))}
      </span>
      <span className={s.file}>
        <input ref={picker} className={s.picker} type="file" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" tabIndex={-1} aria-hidden="true" onChange={(e) => pick(e.currentTarget.files?.[0])} />
        {pulled !== null ? (
          <>
            <Chip label={pulled.name} value="suno" tone="violet" casing="lower" />
            <button type="button" className={s.remove} aria-label={`remove ${pulled.name}`} onClick={() => setPulled(null)}>
              <span aria-hidden="true">{"×"}</span>
            </button>
          </>
        ) : shown === null ? (
          <>
            <Button label="attach take" size="sm" onPress={() => picker.current?.click()} />
            {suno !== undefined && <SunoPicker connection={suno.connection} connectHref={suno.connectHref} library={suno.library} onPull={(song) => pullSong(song.id)} disabled={disabled || busy} />}
          </>
        ) : (
          <>
            <Chip label={shown.name} value={fileSize(shown.size)} tone="cyan" casing="lower" />
            <button type="button" className={s.remove} aria-label={`remove ${shown.name}`} onClick={() => {
                setFile(null);
                setSeeded(false);
              }}
            >
              <span aria-hidden="true">{"×"}</span>
            </button>
          </>
        )}
      </span>
      <Button label={busy ? "sending…" : "send verdict"} tone="cyan" size="sm" disabled={disabled || busy} onPress={send} />
      {fault !== null && (
        <span className={s.fault}>
          <ErrorLine message={fault} live />
        </span>
      )}
    </div>
  );
}
