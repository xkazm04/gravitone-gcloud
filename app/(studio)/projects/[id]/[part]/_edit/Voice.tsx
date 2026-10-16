"use client";

// EXPLAINER · VOICE (STEPS-DESIGN §2 "explainer parts"): lines x takes. RAIL: one line per strip
// card, recorded or not; PRIMARY: the selected line's words (an op when rewritten) and its takes
// (use · keep · reject · hear); the header prices recording the selected line. v1 had no speech
// engine at all - its cut drew every line "written, not recorded" - and this part is where that
// state is cleared, take by take.
import { useState } from "react";

import type { PartView, VoiceData } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { RailList } from "@gt/ui/components/part/RailList.tsx";
import { walk } from "@gt/ui/components/part/part.ts";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import type { EditorProps } from "./PartEditor.tsx";
import { ScoreField } from "./ScoreField.tsx";
import { ScoreTakes } from "./ScoreTakes.tsx";
import s from "./Cut.module.css";

export function VoiceEditor({ frame, send, busy, error, act, view }: EditorProps<PartView<"voice">>) {
  const d: VoiceData = view.data;
  const [chosen, setSel] = useState<string | null | undefined>(undefined);
  const sel = chosen === undefined ? (d.lines[0]?.id ?? null) : chosen;
  const line = d.lines.find((l) => l.id === sel) ?? null;
  const record = (id: string): void => act("record-line", "record line", id);
  useKeys(
    "part.voice",
    {
      item: ({ index }) => {
        const next = walk(d.lines.map((l) => l.id), sel, index === 0 ? 1 : -1);
        if (next === null) return false;
        setSel(next);
      },
      record: () => (line === null ? false : record(line.id)),
    },
    { facts: line === null ? [] : ["line"] },
  );
  const recorded = d.lines.filter((l) => l.takes.some((t) => t.active && t.held)).length;
  return (
    <PartWorkspace
      {...frame}
      acts={
        <>
          {frame.acts}
          {line !== null && <Button label="record line" size="sm" tone="cyan" shortcut={{ mode: "part.voice", verb: "record" }} onPress={() => record(line.id)} />}
        </>
      }
      mode="part.voice"
      facts={line === null ? [] : ["line"]}
      rail={{
        label: "lines",
        children: (
          <>
            <div className={s.railHead}>
              <Tally value={recorded} of={d.lines.length} label="lines recorded" />
            </div>
            {d.lines.length === 0 ? (
              <div className={s.railHead}>
                <Empty label="no lines to record" />
              </div>
            ) : (
              <RailList
                label="lines"
                items={d.lines}
                idOf={(l) => l.id}
                selected={sel}
                onSelect={setSel}
                row={(l) => (
                  <div className={s.rr}>
                    <div className={s.rrTop}>
                      <span>{l.card ?? l.id}</span>
                      <span className={l.activeTakeId === null ? s.rose : s.ok}>{l.takes.length === 0 ? "not recorded" : `${l.takes.length} take${l.takes.length === 1 ? "" : "s"}`}</span>
                    </div>
                    <div className={s.rrTitle}>{l.text}</div>
                  </div>
                )}
              />
            )}
          </>
        ),
      }}
      primary={{
        label: "line",
        children: (
          <>
            {error !== null && (
              <div className={s.err}>
                <ErrorLine message={error} live />
              </div>
            )}
            {line === null ? (
              <Empty label="no line selected" />
            ) : (
              <div className={s.form}>
                <ScoreField key={line.id} label="line" area value={line.text} commit={(text) => send({ op: "voice-line", lineId: line.id, text })} />
                <h3 className={s.h}>{`takes · ${line.takes.length} · ${d.voice}`}</h3>
                {line.takes.length === 0 ? (
                  <Empty label="not recorded" />
                ) : (
                  <ScoreTakes takes={line.takes} busy={busy} acts={{ use: (takeId) => send({ op: "voice-use", lineId: line.id, takeId }), mark: (takeId, mark) => send({ op: "voice-mark", lineId: line.id, takeId, mark }) }} />
                )}
              </div>
            )}
          </>
        ),
      }}
      inspector={null}
    />
  );
}
