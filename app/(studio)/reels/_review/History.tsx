"use client";

// The verdicts this reel holds, one per stop: the current one (of the film as it is now) lit, one whose film was
// made again since drawn as history. A film verdict's pinned notes are listed with their moments; a moment seeks.
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { mss } from "@gt/ui/components/filmstrip/Filmstrip.tsx";

import type { ReelDetail, ReelVerdictView } from "../_port/types.ts";
import r from "./review.module.css";

const WORD: Readonly<Record<string, Readonly<Record<ReelVerdictView["verdict"], string>>>> = {
  film: { keep: "taken", reject: "redo", drop: "dropped" },
  release: { keep: "kept", reject: "rejected", drop: "dropped" },
  data: { keep: "accepted", reject: "sent back", drop: "dropped" },
};

const day = (at: string): string => at.slice(0, 16).replace("T", " ");

export function History({ verdicts, onSeek }: { readonly verdicts: ReelDetail["verdicts"]; readonly onSeek: (t: number) => void }) {
  const rows = (Object.entries(verdicts) as [string, ReelVerdictView][]).sort((a, b) => (a[1].at < b[1].at ? 1 : -1));
  if (rows.length === 0) return null;
  return (
    <ol className={r.history} aria-label="verdicts">
      {rows.map(([stop, v]) => (
        <li key={stop} className={r.verdict} data-current={v.current ? "" : undefined}>
          <span className={r.vHead}>
            <span className={r.vStop}>{stop}</span>
            <Chip label={WORD[stop]?.[v.verdict] ?? v.verdict} tone={v.verdict === "keep" ? "emerald" : v.verdict === "reject" ? "rose" : "neutral"} />
            {v.reasons.map((w) => (
              <Chip key={w} label={w} casing="lower" ghost />
            ))}
            <span className={r.vMeta}>
              round {v.round} · {day(v.at)}
              {!v.current && " · history"}
            </span>
          </span>
          {v.note !== undefined && <span className={r.vNote}>{v.note}</span>}
          {v.pins !== undefined && v.pins.length > 0 && (
            <ol className={r.pins}>
              {v.pins.map((pin) => (
                <li key={`${pin.t}:${pin.text}`} className={r.pin}>
                  <button type="button" className={r.pinAt} onClick={() => onSeek(pin.t)} aria-label={`seek ${mss(pin.t)}`}>
                    {mss(pin.t)}
                  </button>
                  {pin.reasons.map((w) => (
                    <Chip key={w} label={w} casing="lower" tone="amber" ghost />
                  ))}
                  {pin.text !== "" && <span className={r.pinText}>{pin.text}</span>}
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ol>
  );
}
