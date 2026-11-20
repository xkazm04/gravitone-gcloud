"use client";

// The shelf: kept takes with what was measured on them (length, integrated loudness, true peak) and
// the provider that made them. Two uses - pick several to start a release, or add one to the open
// release - one row shape. And its import (WP3): audio files dropped or chosen, each sent in pieces
// to ../importActs.ts and filed kept, one row per file with its state and, refused, the door's own
// sentence. On the fixture side nothing is sent: each row stays `not filed`.
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import type { ShelfTake } from "@gt/domain/release";

import { clock, db } from "./fmt.ts";
import im from "./import.module.css";
import s from "./step.module.css";

type Mode =
  | { readonly kind: "pick"; readonly picked: ReadonlySet<string>; readonly onToggle: (takeId: string) => void }
  | { readonly kind: "add"; readonly onAdd: (take: ShelfTake) => void };

/** The shelf; with `importing`, its import above the rows (the shelf a release is started from). */
export function Shelf({ takes, mode, label, importing }: { readonly takes: readonly ShelfTake[]; readonly mode: Mode; readonly label: string; readonly importing?: { readonly fixture: boolean } }) {
  const rows = <ShelfRows takes={takes} mode={mode} label={label} />;
  if (importing === undefined) return rows;
  return (
    <div className={im.shelf}>
      <ShelfImport fixture={importing.fixture} />
      {rows}
    </div>
  );
}

function ShelfRows({ takes, mode, label }: { readonly takes: readonly ShelfTake[]; readonly mode: Mode; readonly label: string }) {
  if (takes.length === 0) return <Empty label="No kept takes on the shelf" />;
  return (
    <ul className={s.shelf} data-mode={mode.kind} aria-label={label}>
      {takes.map((t) => {
        const on = mode.kind === "pick" && mode.picked.has(t.takeId);
        return (
          <li key={t.takeId} className={s.shelfRow} data-on={on ? "" : undefined}>
            {mode.kind === "pick" ? (
              <button type="button" className={s.pick} aria-pressed={on} aria-label={`pick ${t.title}`} onClick={() => mode.onToggle(t.takeId)}>
                <span aria-hidden="true">{on ? "✓" : ""}</span>
              </button>
            ) : null}
            <span className={s.shelfTitle}>{t.title}</span>
            <span className={s.num}>{clock(t.durationS)}</span>
            <span className={s.num} aria-label={t.lufs === null ? "loudness not measured" : `${t.lufs} LUFS`}>
              {t.lufs === null ? "—" : `${db(t.lufs)} LUFS`}
            </span>
            <span className={s.num} aria-label={t.truePeakDb === null ? "true peak not measured" : `${t.truePeakDb} dBTP`}>
              {t.truePeakDb === null ? "—" : `${db(t.truePeakDb)} dBTP`}
            </span>
            <Chip label={t.provider} casing="lower" />
            <span className={s.shelfFlag}>{t.audioHref === null && <Chip label="no audio" ghost />}</span>
            {mode.kind === "add" && <Button label="Add" size="sm" onPress={() => mode.onAdd(t)} />}
          </li>
        );
      })}
    </ul>
  );
}

/* ── import ───────────────────────────────────────────────────────────────── */

/** One piece of a file per action call: under the action core's 1 MB body cap (../importActs.ts). */
const PIECE = 768 * 1024;
const ACCEPT = "audio/*,.wav,.mp3,.flac,.m4a,.ogg";

type ImportState = "queued" | "sending" | "filed" | "already" | "refused" | "not filed";
interface ImportRow {
  readonly key: string;
  readonly name: string;
  readonly state: ImportState;
  readonly sent: number;
  readonly count: number;
  readonly reason: string | null;
}
const TONE = { queued: "neutral", sending: "cyan", filed: "emerald", already: "neutral", refused: "rose", "not filed": "neutral" } as const;

const uploadId = (): string => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Each file in order, in pieces; a refused piece ends that file with the door's sentence. */
async function send(file: File, key: string, set: (key: string, patch: Partial<ImportRow>) => void): Promise<boolean> {
  if (file.size === 0) {
    set(key, { state: "refused", reason: `${file.name} is empty` });
    return false;
  }
  const { importPieceAct } = await import("../importActs.ts");
  const count = Math.ceil(file.size / PIECE);
  const upload = uploadId();
  set(key, { state: "sending", count });
  for (let index = 0; index < count; index++) {
    const form = new FormData();
    form.set("upload", upload);
    form.set("index", String(index));
    form.set("count", String(count));
    form.set("size", String(file.size));
    form.set("name", file.name);
    form.set("bytes", file.slice(index * PIECE, (index + 1) * PIECE));
    const res = await importPieceAct(form);
    if (!res.ok) {
      set(key, { state: "refused", reason: res.error.error });
      return false;
    }
    if (res.value.kind === "filed") {
      set(key, { state: res.value.created ? "filed" : "already", sent: count });
      return true;
    }
    set(key, { sent: res.value.received });
  }
  return false;
}

/** Filed takes reach the shelf by the page reading it again (`onFiled`, by default a refresh of the server read). */
export function ShelfImport({ fixture, onFiled }: { readonly fixture: boolean; readonly onFiled?: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<readonly ImportRow[]>([]);
  const [over, setOver] = useState(false);
  const set = (key: string, patch: Partial<ImportRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const take = async (list: FileList | null) => {
    const files = list === null ? [] : Array.from(list);
    if (files.length === 0) return;
    const fresh = files.map((f): ImportRow => ({ key: uploadId(), name: f.name, state: fixture ? "not filed" : "queued", sent: 0, count: 0, reason: null }));
    setRows((rs) => [...fresh, ...rs]);
    if (fixture) return;
    let filed = false;
    for (const [i, f] of files.entries()) {
      const row = fresh[i];
      if (row === undefined) continue;
      try {
        filed = (await send(f, row.key, set)) || filed;
      } catch (e) {
        set(row.key, { state: "refused", reason: e instanceof Error ? e.message : String(e) });
      }
    }
    if (filed) (onFiled ?? router.refresh)();
  };
  return (
    <div className={im.import}>
      <label
        className={im.drop}
        data-over={over ? "" : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files);
        }}
      >
        <input
          type="file"
          multiple
          accept={ACCEPT}
          className={im.input}
          aria-label="import audio files to the shelf"
          onChange={(e) => {
            void take(e.currentTarget.files);
            e.currentTarget.value = "";
          }}
        />
        <span aria-hidden="true">Import WAVs</span>
      </label>
      {rows.length > 0 && (
        <ul className={im.rows} aria-label="imports">
          {rows.map((r) => (
            <li key={r.key} className={im.row}>
              <span className={im.name}>{r.name}</span>
              <Chip label={r.state} tone={TONE[r.state]} ghost={r.state === "not filed"} casing="lower" {...(r.state === "sending" && r.count > 0 ? { value: `${r.sent}/${r.count}` } : {})} />
              {r.reason !== null && <ErrorLine message={r.reason} live />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
