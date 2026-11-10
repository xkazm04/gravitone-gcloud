"use client";

// A take from the person's Suno library (spark suno-api): the songs they made on suno.com, newest
// first, searchable by title, each a press that pulls it into the studio as a take - measured here and
// read by Suno (the host's `onPull`). Not connected: one chip, a link to Suno's sign-in (a navigation,
// so an <a>). A song still being made cannot be pressed and shows its status; a refusal is shown in
// its source's own words under the list. Nothing here spends.
import { useEffect, useRef, useState } from "react";

import type { SunoSong } from "@gt/domain/audio.suno";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { Field } from "../field/Field.tsx";
import { clock } from "./suno.ts";
import s from "./SunoPicker.module.css";

export type SunoConnection = { readonly connected: true } | { readonly connected: false; readonly reason: string };

export type SongPage = {
  readonly songs: readonly SunoSong[];
  readonly next?: string;
};

export type SunoPickerProps = {
  readonly connection: SunoConnection;
  /** Where Suno's sign-in starts (`/api/suno/connect`). */
  readonly connectHref: string;
  /** A page of the library: the search when given, else the newest; the refusal in words. */
  readonly library: (q: { readonly query?: string; readonly cursor?: string }) => Promise<SongPage | string>;
  /** Pull one song; resolve with the refusal in words, or null when the take is filed. */
  readonly onPull: (song: SunoSong) => Promise<string | null>;
  readonly disabled?: boolean;
  /** /kit only: the list as drawn open, before any load. */
  readonly seed?: {
    readonly songs: readonly SunoSong[];
    readonly pulling?: string;
    readonly refused?: string;
  };
};

/** How long typing rests before the search is asked. */
export const SEARCH_REST_MS = 350;

/** A song can be pulled once Suno finished making it. */
export const pullable = (song: Pick<SunoSong, "status">): boolean => song.status.toLowerCase() === "complete";

export function SunoPicker({ connection, connectHref, library, onPull, disabled = false, seed }: SunoPickerProps) {
  const [open, setOpen] = useState(seed !== undefined);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<SongPage | null>(seed === undefined ? null : { songs: seed.songs });
  const [refused, setRefused] = useState<string | null>(seed?.refused ?? null);
  const [pulling, setPulling] = useState<string | null>(seed?.pulling ?? null);
  const asked = useRef(0);

  const load = (q: string, cursor?: string): void => {
    const n = ++asked.current;
    void library({
      ...(q.trim() !== "" ? { query: q.trim() } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
    }).then((r) => {
      if (n !== asked.current) return;
      if (typeof r === "string") {
        setRefused(r);
        return;
      }
      setRefused(null);
      setPage((was) =>
        cursor !== undefined && was !== null
          ? {
              songs: [...was.songs, ...r.songs],
              ...(r.next !== undefined ? { next: r.next } : {}),
            }
          : r,
      );
    });
  };

  // Typing rests SEARCH_REST_MS before the search is asked; a timer left at unmount is cleared.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const type = (q: string): void => {
    setQuery(q);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(q), SEARCH_REST_MS);
  };
  const toggle = (): void => {
    if (!open && page === null) load(query);
    setOpen(!open);
  };

  if (!connection.connected) return <Chip label="connect suno" tone="violet" casing="lower" href={connectHref} name={`connect to suno: ${connection.reason}`} />;

  const pull = (song: SunoSong): void => {
    if (pulling !== null || disabled) return;
    setPulling(song.id);
    setRefused(null);
    void onPull(song).then((reason) => {
      setPulling(null);
      if (reason === null) setOpen(false);
      else setRefused(reason);
    });
  };

  return (
    <span className={s.wrap}>
      <Button label="from suno" size="sm" tone="violet" disabled={disabled} onPress={toggle} />
      {open && (
        <div className={`${s.picker}${seed !== undefined ? ` ${s.still}` : ""}`} role="group" aria-label="songs in your suno library">
          <div className={s.head}>
            <Field label="search suno" value={query} onChange={type} placeholder="title" maxLength={200} />
            <button type="button" className={s.close} aria-label="close the suno library" onClick={() => setOpen(false)}>
              <span aria-hidden="true">{"×"}</span>
            </button>
          </div>
          {page !== null && page.songs.length === 0 && <span className={s.none}>{query.trim() === "" ? "no songs" : `no song matches "${query.trim()}"`}</span>}
          {page !== null && page.songs.length > 0 && (
            <ul className={s.songs}>
              {page.songs.map((song) => {
                const can = pullable(song);
                const busy = pulling === song.id;
                return (
                  <li key={song.id}>
                    <button type="button" className={s.song} disabled={!can || pulling !== null || disabled} aria-busy={busy} aria-label={`pull ${song.title}`} onClick={() => pull(song)}>
                      <span className={s.title}>{song.title}</span>
                      {song.durationS !== undefined && <span className={s.meta}>{clock(song.durationS)}</span>}
                      {song.createdAt !== undefined && <span className={s.meta}>{song.createdAt.slice(0, 10)}</span>}
                      {busy && <span className={s.state}>{"pulling…"}</span>}
                      {!can && <Chip label={song.status} tone="amber" ghost casing="lower" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {page?.next !== undefined && <Button label="more" size="sm" onPress={() => load(query, page.next)} />}
          {refused !== null && <ErrorLine message={refused} live />}
        </div>
      )}
    </span>
  );
}
