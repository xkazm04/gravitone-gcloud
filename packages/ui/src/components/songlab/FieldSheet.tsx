"use client";

// THE FIELD SHEET (spark yue2-song-lab S2, off the draw head): every take of the lab in one dense
// row - its name, condition, lyric gate, SongEval, WER, length and rights - and the reference slot a
// master stage matches to. The level sheet's layer (sheet/LevelSheet): Escape and the way back close
// it; the takes are the field the agent draws from, so nothing here acts on a take.
//
// Absence is the row's: an unscored take says so in its gate column and leaves its figures as dashes
// (never 0); an empty lab is one line.
import { useRef, useState } from "react";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { Empty } from "../empty/Empty.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { LevelSheet } from "../sheet/LevelSheet.tsx";
import { Tally } from "../tally/Tally.tsx";
import { length, type FieldTakeView } from "./songlab.ts";
import s from "./FieldSheet.module.css";

export type FieldSheetProps = {
  readonly takes: readonly FieldTakeView[];
  /** The lab's reference takes, by name. */
  readonly references: readonly string[];
  readonly onClose: () => void;
  /** Resolve with the refusal in words, or null when the reference was filed. */
  readonly onUpload: (file: File) => Promise<string | null>;
  readonly specimen?: boolean;
};

const GATE = { pass: { label: "gate ✓", tone: "emerald" }, fail: { label: "gate ✗", tone: "rose" }, unscored: { label: "not scored yet", tone: "neutral" } } as const;

const fixed = (v: number | undefined, d: number): string => (v === undefined ? "—" : v.toFixed(d));
const pct = (v: number | undefined): string => (v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);

export function FieldSheet({ takes, references, onClose, onUpload, specimen = false }: FieldSheetProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const [press, setPress] = useState<{ readonly kind: "pending" } | { readonly kind: "refused"; readonly reason: string } | null>(null);
  const pass = takes.filter((t) => t.gate === "pass").length;
  const upload = (f: File | undefined) => {
    if (f === undefined || press?.kind === "pending") return;
    setPress({ kind: "pending" });
    void onUpload(f).then((reason) => setPress(reason === null ? null : { kind: "refused", reason }));
  };
  return (
    <LevelSheet trail={[{ label: "song lab", onPress: onClose }]} here="field" mode="audio.songlab" back="Back to the draw" onClose={onClose} specimen={specimen} fit>
      <div className={s.field} data-role="sl-field">
        <div className={s.head}>
          <Tally value={takes.length} label="takes" />
          <Tally value={pass} label="past gate" />
          <span className={s.ref}>
            <span className={s.caps}>reference</span>
            {references.length === 0 ? <span className={s.none}>none attached</span> : references.map((r) => <Chip key={r} label={r} tone="violet" casing="lower" />)}
            <input ref={input} className={s.file} type="file" accept="audio/*" aria-label="reference audio" onChange={(e) => upload(e.currentTarget.files?.[0])} />
            <Button label={press?.kind === "pending" ? "Uploading…" : "Upload reference"} size="sm" disabled={press?.kind === "pending"} onPress={() => input.current?.click()} />
          </span>
        </div>
        {press?.kind === "refused" && <ErrorLine message={press.reason} live />}
        {takes.length === 0 ? (
          <Empty label="no takes in the lab yet" />
        ) : (
          <table className={s.rows}>
            <thead>
              <tr>
                <th scope="col">seed</th>
                <th scope="col">take</th>
                <th scope="col">condition</th>
                <th scope="col">gate</th>
                <th scope="col" className={s.num}>
                  SongEval
                </th>
                <th scope="col" className={s.num}>
                  wer
                </th>
                <th scope="col" className={s.num}>
                  length
                </th>
                <th scope="col">rights</th>
              </tr>
            </thead>
            <tbody>
              {takes.map((t) => (
                <tr key={t.key} data-role="sl-field-row">
                  <td className={s.sd}>{t.seed ?? ""}</td>
                  <td className={s.lb}>{t.label}</td>
                  <td className={s.cond}>{t.cond}</td>
                  <td>
                    <Chip label={GATE[t.gate].label} tone={GATE[t.gate].tone} casing="lower" ghost={t.gate === "unscored"} />
                  </td>
                  <td className={s.num}>{fixed(t.songEval, 2)}</td>
                  <td className={s.num}>{pct(t.wer)}</td>
                  <td className={s.num}>{length(t.durationS)}</td>
                  <td>
                    <Chip label={t.rights.short} tone="amber" name={t.rights.licence} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </LevelSheet>
  );
}
