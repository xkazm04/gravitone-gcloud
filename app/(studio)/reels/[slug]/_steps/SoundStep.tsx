"use client";

// The sound step: the bed the operator made on suno.com, uploaded with the prompt that made it (POST
// /reels/<slug>/bed, measured before it is filed), the length it must reach (the desktop film's), the attached
// bed's facts and its player, and the two mixes once `reel-release` laid the bed under each face.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { Field, TextArea } from "@gt/ui/components/field/Field.tsx";

import type { BedPrompt } from "../../../../../lib/reel/types.ts";
import type { ReelDetail } from "../../_port/types.ts";
import { fmtSeconds } from "./view.ts";
import s from "./Steps.module.css";

type PromptKey = keyof BedPrompt;
const EMPTY: Readonly<Record<PromptKey, string>> = { style: "", title: "", lyrics: "", model: "", url: "", note: "" };

/** The bed route's answer: the record, or the one error envelope's sentence. */
async function upload(slug: string, file: File, prompt: Readonly<Record<PromptKey, string>>): Promise<string | undefined> {
  const form = new FormData();
  form.set("file", file);
  for (const [k, v] of Object.entries(prompt)) if (v.trim() !== "") form.set(k, v);
  let res: Response;
  try {
    res = await fetch(`/reels/${encodeURIComponent(slug)}/bed`, { method: "POST", body: form, credentials: "same-origin" });
  } catch (e) {
    return `the upload did not reach the studio: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (res.ok) return undefined;
  const body: unknown = await res.json().catch(() => null);
  const said = typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : undefined;
  return said ?? `HTTP ${res.status}`;
}

export function SoundStep({ detail, bedProblem }: { readonly detail: ReelDetail; readonly bedProblem?: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState<Readonly<Record<PromptKey, string>>>(() => ({ ...EMPTY, ...detail.bedPrompt }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const desktop = detail.film?.renders.desktop;
  const bed = detail.film?.bed;
  const set = (k: PromptKey) => (v: string) => setPrompt((p) => ({ ...p, [k]: v }));

  async function send(): Promise<void> {
    if (file === null || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const said = await upload(detail.slug, file, prompt);
      if (said !== undefined) setError(said);
      else {
        setFile(null);
        if (fileRef.current !== null) fileRef.current.value = "";
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={s.row}>
        {desktop !== undefined ? <Chip label="bed at least" value={fmtSeconds(desktop.seconds)} tone="cyan" /> : <Chip label="no desktop film" ghost casing="lower" />}
        {bed !== undefined && <Chip label="bed" value={fmtSeconds(bed.seconds)} tone={bedProblem === undefined ? "emerald" : "rose"} dot />}
        {bed?.lufs !== undefined && <Chip label="LUFS" value={bed.lufs.toFixed(1)} />}
      </div>
      {bedProblem !== undefined && <ErrorLine message={bedProblem} />}
      {bed !== undefined && detail.media.bed !== undefined && <audio className={s.audio} controls preload="none" src={detail.media.bed} aria-label="bed" />}
      {bed?.prompt !== undefined && (
        <Facts
          facts={[
            { term: "style", value: bed.prompt.style },
            ...(bed.prompt.model === undefined ? [] : [{ term: "model", value: bed.prompt.model }]),
            ...(bed.prompt.title === undefined ? [] : [{ term: "title", value: bed.prompt.title }]),
            { term: "attached", value: bed.attachedAt.slice(0, 16).replace("T", " ") },
          ]}
        />
      )}
      <div className={s.form}>
        <input ref={fileRef} className={s.file} type="file" accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav" aria-label="bed file" onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
        <div className={s.wide}>
          <TextArea label="suno style" value={prompt.style} onChange={set("style")} maxLength={1000} rows={2} placeholder="cinematic synthwave, 92 bpm, no vocals" />
        </div>
        <Field label="suno title" value={prompt.title} onChange={set("title")} maxLength={200} />
        <Field label="suno model" value={prompt.model} onChange={set("model")} maxLength={40} placeholder="v5.5" />
        <Field label="suno song url" value={prompt.url} onChange={set("url")} maxLength={400} placeholder="https://suno.com/song/…" />
        <Field label="note" value={prompt.note} onChange={set("note")} maxLength={2000} />
        <div className={s.wide}>
          <TextArea label="lyrics" value={prompt.lyrics} onChange={set("lyrics")} maxLength={6000} rows={2} />
        </div>
      </div>
      <div className={s.row}>
        <Button label={bed === undefined ? "Attach bed" : "Replace bed"} tone="cyan" size="sm" glyph="up" pending={busy} disabled={file === null || prompt.style.trim() === "" || desktop === undefined} onPress={() => void send()} />
      </div>
      {error !== undefined && <ErrorLine message={error} live />}
      {(detail.media.mixDesktop !== undefined || detail.media.mixPhone !== undefined) && (
        <div className={s.faces}>
          {detail.media.mixDesktop !== undefined && (
            <div className={s.face}>
              <Chip label="desktop mix" />
              <video className={s.player} controls preload="none" src={detail.media.mixDesktop} poster={detail.media.posterDesktop} aria-label="desktop mix" />
            </div>
          )}
          {detail.media.mixPhone !== undefined && (
            <div className={s.face}>
              <Chip label="phone mix" />
              <video className={s.player} controls preload="none" src={detail.media.mixPhone} poster={detail.media.posterPhone} aria-label="phone mix" />
            </div>
          )}
        </div>
      )}
    </>
  );
}
