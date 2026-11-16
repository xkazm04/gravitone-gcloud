"use client";

// A COVER'S SONG BY ITS LINK (cover from a link, WP-C): the link field beside the file drop, judged as it is typed by
// the same judge the server door uses (lib/sound/cover/link/parse.ts, pure and client-safe), so the two refuse in
// the same words. While the server downloads, the box wears its state. And the link a cover came from, shown where
// its source's name is: the name itself is the link out.
import type { CoverRecord } from "@gt/domain/cover";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";

import { parseYouTubeUrl } from "../../../../../../lib/sound/cover/link/parse.ts";
import s from "../cover.module.css";

/** The source is a file or a link; the file is the default, as it came first. */
export type SourceMode = "file" | "link";
export const SOURCE_MODES: readonly { readonly value: SourceMode; readonly label: string }[] = [
  { value: "file", label: "File" },
  { value: "link", label: "Link" },
];

/** Why the typed link is refused, or null when it is a video's (or nothing is typed yet). */
export function linkProblem(raw: string): string | null {
  if (raw.trim() === "") return null;
  const r = parseYouTubeUrl(raw);
  return r.ok ? null : r.error.message;
}

export function LinkBox({ url, onUrl, fetching }: { readonly url: string; readonly onUrl: (v: string) => void; readonly fetching: boolean }) {
  const problem = linkProblem(url);
  const id = url.trim() === "" || problem !== null ? null : parseYouTubeUrl(url);
  return (
    <div className={s.drop}>
      <div className={s.fields}>
        <span className={s.label}>link</span>
        <Field label="song link" value={url} onChange={onUrl} maxLength={2000} placeholder="https://youtu.be/…" disabled={fetching} />
      </div>
      <div className={s.row}>
        {id !== null && id.ok && <Chip label="video" value={id.value.id} casing="lower" />}
        {fetching && <Chip label="fetching" tone="cyan" dot casing="lower" name="fetching the song" />}
        {!fetching && id === null && <span className={s.count}>youtube.com · youtu.be · ≤ 20 min</span>}
      </div>
      {problem !== null && <ErrorLine message={problem} live />}
    </div>
  );
}

/** The source's file name, linking out to where it was fetched from when it was. */
export function SourceName({ record }: { readonly record: CoverRecord }) {
  const { name, url } = record.source;
  if (url === undefined) return <Chip label={name} casing="lower" />;
  return <Chip label={name} casing="lower" href={url} name={`${name}, from ${url}`} />;
}
