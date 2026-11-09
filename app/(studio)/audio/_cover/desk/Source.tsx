"use client";

// THE SONG: the upload of a new one, and the facts of the one in hand. An upload names its rights with no default - the declaration is the owner's, and a choice made
// for them is not one (registry: rights-and-provenance-record). The file's peaks are drawn the moment it is
// dropped, decoded here, and the decode is carried to the cover the upload answers. Or the song is a YouTube link
// (./link/, cover from a link WP-C): the same declaration, the server downloads it, and the new cover opens on its
// brief's receipt.
import { useRef, useState, type DragEvent } from "react";

import { COVER_NOTE_MAX, COVER_RIGHTS, COVER_TITLE_MAX, type CoverCard, type CoverRights } from "@gt/domain/cover";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { Wave } from "@gt/ui/components/wave/Wave.tsx";

import { hearFile, rekey } from "./audio.ts";
import { LinkBox, linkProblem, SOURCE_MODES, SourceName, type SourceMode } from "./link/LinkSource.tsx";
import type { Desk } from "./useDesk.ts";
import { clock, RIGHTS_LABEL, RIGHTS_TONE, STATE_TONE } from "./words.ts";
import s from "./cover.module.css";

type Pick = CoverRights | "undeclared";
const RIGHTS_OPTIONS = COVER_RIGHTS.map((r) => ({ value: r, label: RIGHTS_LABEL[r] }));
const DROP_KEY = "dropped";

const titleOf = (name: string): string => name.replace(/\.[a-z0-9]{2,4}$/i, "").slice(0, COVER_TITLE_MAX);

export function SourceDrop({ desk }: { readonly desk: Desk }) {
  const [file, setFile] = useState<File | null>(null);
  const [peaks, setPeaks] = useState<readonly number[]>([]);
  const [lenS, setLenS] = useState<number | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [rights, setRights] = useState<Pick>("undeclared");
  const [holder, setHolder] = useState("");
  const [note, setNote] = useState("");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SourceMode>("file");
  const [url, setUrl] = useState("");
  const seq = useRef(0);

  const take = (f: File | undefined): void => {
    if (f === undefined) return;
    const mine = ++seq.current;
    setFile(f);
    setError(null);
    setDecodeError(null);
    setPeaks([]);
    setLenS(null);
    if (title === "") setTitle(titleOf(f.name));
    void hearFile(DROP_KEY, f).then((a) => {
      if (mine !== seq.current) return;
      if (a.ok) {
        setPeaks(a.value.peaks);
        setLenS(a.value.lenS);
      } else setDecodeError(a.error);
    });
  };
  const drop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files[0]);
  };

  const linked = url.trim() !== "" && linkProblem(url) === null;
  // A link's title may stay empty: the server takes the video's own.
  const ready = rights !== "undeclared" && !busy && (mode === "link" ? linked : file !== null && title.trim() !== "");
  const send = (): void => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const sent =
      mode === "link"
        ? desk.sender.link({ url, title: title.trim(), rights, holder, note }).then((a) => {
            if (!a.ok) return setError(a.error);
            desk.openWithBrief(a.id);
          })
        : file === null
          ? Promise.resolve()
          : desk.sender.source({ file, title: title.trim(), rights, holder, note }).then((a) => {
              if (!a.ok) return setError(a.error);
              rekey(DROP_KEY, a.id);
              desk.open(a.id);
            });
    sent.catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false));
  };

  return (
    <section className={s.block} aria-label="new cover">
      <div className={s.head}>
        <CapsHeading text="song" level={3} />
        <Seg<SourceMode> label="song from" options={SOURCE_MODES} value={mode} onChange={(m) => !busy && setMode(m)} />
        {mode === "file" && file !== null && <Chip label={file.name} casing="lower" />}
        {mode === "file" && lenS !== null && <Chip label="length" value={clock(lenS)} />}
      </div>
      {mode === "link" ? (
        <LinkBox url={url} onUrl={setUrl} fetching={busy} />
      ) : (
        <div
          className={over ? `${s.drop} ${s.dropOn}` : s.drop}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
        >
          {file === null ? null : (
            <div className={s.strip}>
              <Wave peaks={peaks} width={1000} height={86} tone="cyan" stretch />
            </div>
          )}
          <div className={s.row}>
            <label className={s.choose}>
              <input className={s.file} type="file" accept="audio/mpeg,audio/*,.mp3" aria-label="song file" onChange={(e) => take(e.currentTarget.files?.[0])} />
              {file === null ? "Choose mp3" : "Another file"}
            </label>
            {file === null && <span className={s.count}>mp3 · flac · wav</span>}
          </div>
          {decodeError !== null && <ErrorLine message={decodeError} live />}
        </div>
      )}
      <div className={s.pair}>
        <div className={s.fields}>
          <span className={s.label}>title</span>
          <Field label="title" value={title} onChange={setTitle} maxLength={COVER_TITLE_MAX} {...(mode === "link" ? { placeholder: "the video's title" } : {})} />
        </div>
        <div className={s.fields}>
          <span className={s.label}>holder</span>
          <Field label="rights holder" value={holder} onChange={setHolder} maxLength={COVER_TITLE_MAX} placeholder="Tears for Fears" />
        </div>
      </div>
      <div className={s.fields}>
        <span className={s.label}>rights</span>
        <Seg<Pick> label="rights" options={RIGHTS_OPTIONS} value={rights} onChange={setRights} />
      </div>
      <div className={s.fields}>
        <span className={s.label}>note</span>
        <Field label="rights note" value={note} onChange={setNote} maxLength={COVER_NOTE_MAX} />
      </div>
      <div className={s.row}>
        <Button label={mode === "link" ? (busy ? "Fetching" : "Fetch") : busy ? "Uploading" : "Upload"} tone="cyan" disabled={!ready} onPress={send} />
        {rights === "undeclared" && <Chip label="rights undeclared" tone="amber" casing="lower" />}
      </div>
      {error !== null && <ErrorLine message={error} live />}
    </section>
  );
}

export function SourceFacts({ card, lenS }: { readonly card: CoverCard; readonly lenS: number }) {
  const r = card.record;
  return (
    <div className={s.row}>
      <Chip label={RIGHTS_LABEL[r.rights]} tone={RIGHTS_TONE[r.rights]} dot name={`rights ${RIGHTS_LABEL[r.rights]}`} />
      {r.holder !== undefined && <Chip label="holder" value={r.holder} casing="lower" />}
      <SourceName record={r} />
      <Chip label="length" value={clock(lenS)} />
      <Chip label={r.state} tone={STATE_TONE[r.state]} dot casing="lower" />
      {r.note !== undefined && <span className={s.mono}>{r.note}</span>}
    </div>
  );
}
