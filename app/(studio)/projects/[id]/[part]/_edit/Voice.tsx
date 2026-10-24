"use client";

// EXPLAINER · VOICE (STEPS-DESIGN §2 "explainer parts"): lines x takes. RAIL: one line per strip
// card, recorded or not; PRIMARY: the selected line's words (an op when rewritten) and its takes
// (use · keep · reject · hear); the header prices recording the selected line. v1 had no speech
// engine at all - its cut drew every line "written, not recorded" - and this part is where that
// state is cleared, take by take.
//
// VOICE FX (WP3): under the takes, the words a take is re-voiced as. Submitting them writes the
// ask (op `voice-fx-ask`) and, once that op has applied, opens the `fx-line` act's receipt for
// the line; the result is a new take beside the source, never made active. An ask that has not
// rendered yet (a declined receipt, a failed render) stays on the line as a chip with the act
// beside it, so the words are not lost and the operator can run it again.
import { useState } from "react";

import type { PartView, VoiceData, VoiceLineView } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Field, Select } from "@gt/ui/components/field/Field.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { RailList } from "@gt/ui/components/part/RailList.tsx";
import { walk } from "@gt/ui/components/part/part.ts";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import type { EditorProps, Launch, Send } from "./PartEditor.tsx";
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
                  <>
                    <ScoreTakes takes={line.takes} busy={busy} acts={{ use: (takeId) => send({ op: "voice-use", lineId: line.id, takeId }), mark: (takeId, mark) => send({ op: "voice-mark", lineId: line.id, takeId, mark }) }} />
                    <VoiceFx key={line.id} line={line} send={send} act={act} busy={busy} />
                  </>
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

/** The FX ask for one line: which take, what words; then the act that renders it. */
function VoiceFx({ line, send, act, busy }: { readonly line: VoiceLineView; readonly send: Send; readonly act: Launch; readonly busy: boolean }) {
  const [from, setFrom] = useState(line.activeTakeId ?? line.takes[0]?.id ?? "");
  const [words, setWords] = useState("");
  const run = (): void => act("fx-line", "voice fx", line.id);
  const take = line.takes.some((t) => t.id === from) ? from : (line.takes[0]?.id ?? "");
  const describe = words.trim();
  return (
    <div className={s.sect}>
      <h3 className={s.h}>voice fx</h3>
      {line.fxAsk !== undefined && (
        <div className={s.row}>
          <span className={`${s.grow} ${s.ell}`}>
            <Chip label="asked" value={line.fxAsk.describe} tone="amber" casing="lower" name={`voice fx asked: ${line.fxAsk.describe}`} />
          </span>
          <Button label="render fx" size="sm" tone="cyan" disabled={busy} onPress={run} />
        </div>
      )}
      <form
        className={s.fxAsk}
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || describe === "" || take === "") return;
          // The act reads the ask, so it opens only once the op has applied.
          send({ op: "voice-fx-ask", lineId: line.id, takeId: take, describe }, run);
          setWords("");
        }}
      >
        <Select label="voice fx from take" options={line.takes.map((t) => ({ value: t.id, label: t.label }))} value={take} onChange={setFrom} />
        <Field label="describe the voice" value={words} onChange={setWords} placeholder="a ghost in a stairwell" />
        <Button label="voice fx" size="sm" tone="cyan" submit disabled={busy} />
      </form>
    </div>
  );
}
