"use client";

// THE CUT REVIEW (prototype index.html :685-725): the export in a player, its caption beats
// beside it (↑/↓ walks them and seeks the player), a note per beat (E),
// and Approve / Reject. The beat notes ride on the verdict as its note, one line per beat, so
// the reviewer's words reach the step that made the cut.
//
// Not here, and why: the prototype's "slot on approve" (channel toggles and a proposed time)
// and its StepTrack belong to the per-step studio sign-off, which moves to Phase 4 with the
// projects (decision 9); a cut packet here judges the cut.
import { useEffect, useMemo, useRef, useState } from "react";

import type { BoardPacket } from "../../board/port.ts";
import type { BoardVerdict } from "../../board/boardGate.ts";
import { FIELD_ATTR } from "../../keymap/target.ts";
import { useKeys } from "../../keymap/dispatch.ts";
import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { DeskFrame, OracleStrip } from "../desk/Desk.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { Keycaps } from "../keycaps/Keycaps.tsx";
import s from "./Cut.module.css";

/** `m:ss` from seconds (the prototype's fmt.dur). */
export function clock(t: number): string {
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** The beat notes as one verdict note: `beat 2 (0:04): tighter`, one per line, in beat order. */
export function beatNote(beats: readonly { readonly t0: number }[], notes: Readonly<Record<number, string>>): string | undefined {
  const lines = beats.flatMap((b, i) => {
    const n = notes[i];
    return n === undefined ? [] : [`beat ${i + 1} (${clock(b.t0)}): ${n}`];
  });
  return lines.length === 0 ? undefined : lines.join("\n");
}

export type CutReviewProps = {
  readonly packet: BoardPacket;
  readonly decide: (ids: readonly string[], v: BoardVerdict | null, label: string) => void;
  readonly onCommit: () => void;
  readonly busy?: boolean;
  readonly announce?: (message: string) => void;
  readonly keys?: boolean;
};

export function CutReview({ packet, decide, onCommit, busy = false, announce = () => undefined, keys = true }: CutReviewProps) {
  const { view, present } = packet;
  const cut = present.cut;
  const beats = useMemo(() => cut?.beats ?? [], [cut]);
  const item = view.items[0];
  const player = useRef<HTMLVideoElement | null>(null);
  const [focus, setFocus] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [notes, setNotes] = useState<Readonly<Record<number, string>>>({});

  useEffect(() => {
    const v = player.current;
    const b = beats[focus];
    if (v !== null && b !== undefined && v.readyState > 0) v.currentTime = b.t0;
  }, [focus, beats]);

  const end = (v: "keep" | "reject") => {
    // A second press while a write or a preview is in flight is the same act again, not a new one.
    if (item === undefined || busy) return;
    const note = beatNote(beats, notes);
    decide([item.id], note === undefined ? { verdict: v, reasons: [] } : { verdict: v, reasons: [], note }, view.title ?? view.id);
    onCommit();
  };
  const attach = () => {
    if (editing === null) return;
    const t = text.trim();
    if (t !== "") setNotes((n) => ({ ...n, [editing]: t }));
    setEditing(null);
    announce(`note on beat ${editing + 1}`);
  };

  useKeys(
    "board.cut",
    {
      play: () => {
        const v = player.current;
        if (v === null) return;
        if (v.paused) void v.play().catch((e: unknown) => announce(`cannot play: ${e instanceof Error ? e.message : "unknown"}`));
        else v.pause();
      },
      "prev-beat": () => setFocus((f) => Math.max(0, f - 1)),
      "next-beat": () => setFocus((f) => Math.min(Math.max(0, beats.length - 1), f + 1)),
      note: () => {
        setEditing(focus);
        setText(notes[focus] ?? "");
      },
      approve: () => end("keep"),
      reject: () => end("reject"),
      attach,
      "cancel-note": () => setEditing(null),
    },
    { facts: beats.length > 0 ? ["beats"] : [], enabled: keys },
  );


  return (
    <DeskFrame
      title={view.title ?? view.id}
      {...(present.meta !== undefined ? { meta: present.meta } : {})}
      marks={present.oracle !== undefined && <OracleStrip oracle={present.oracle} />}
      foot={
        <>
          <Keycaps mode="board.cut" label="cut keys" facts={new Set(beats.length > 0 ? ["beats"] : [])} />
          <div className={s.ends}>
            <Button label="Reject" tone="rose" shortcut={{ mode: "board.cut", verb: "reject" }} onPress={() => end("reject")} />
            <Button label="Approve" tone="emerald" shortcut={{ mode: "board.cut", verb: "approve" }} onPress={() => end("keep")} />
          </div>
        </>
      }
    >
      <div className={s.cut} data-component="CutReview">
        <div>
          <div className={s.player}>
            {cut !== undefined && <video ref={player} className={s.video} src={cut.video} poster={cut.poster} controls playsInline preload="metadata" />}
          </div>
          <div className={s.kv}>
            {item !== undefined && <Chip label={item.media.mime} casing="lower" />}
            {item !== undefined && <Chip label={item.media.sha256.slice(0, 8)} casing="lower" />}
          </div>
        </div>
        <div className={s.side}>
          <CapsHeading text="beats · captions" tally={{ value: beats.length }} />
          {beats.length === 0 ? (
            <Chip label="no captions" ghost />
          ) : (
            <div className={s.beats}>
              {beats.map((b, i) => (
                <div key={`${b.t0}:${i}`}>
                  <button type="button" className={cx(s.beat, focus === i && s.focus, notes[i] !== undefined && s.noted)} onClick={() => setFocus(i)}>
                    <span className={s.tc}>
                      {clock(b.t0)}–{clock(b.t1)}
                    </span>
                    <span>
                      {b.text}
                      {notes[i] !== undefined && (
                        <span className={s.noteChip}>
                          <Chip label="free_text" tone="amber" casing="lower" />
                          {notes[i]}
                        </span>
                      )}
                    </span>
                  </button>
                  {editing === i && (
                    <div className={s.editNote}>
                      {/* ⏎ attaches through the form's submit: the keymap gives Enter in a field to the field. */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          attach();
                        }}
                      >
                      <input className={s.noteText} aria-label={`note on beat ${i + 1}`} placeholder={`beat ${i + 1} · free_text`} value={text} onChange={(e) => setText(e.currentTarget.value)} autoFocus {...{ [FIELD_ATTR]: "note" }} />
                      </form>
                      <Keycaps mode="board.cut" field="note" label="note keys" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DeskFrame>
  );
}
