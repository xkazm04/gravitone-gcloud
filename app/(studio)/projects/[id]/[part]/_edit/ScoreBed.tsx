"use client";

// SCORE · THE AD'S BED (v1 AdsScore + score/ads/bed.ts): one cue as long as the ad by
// construction - the scenario's shots and the hatched end card on one strip - its tempo, and its
// takes. The render is the header's act (the part's own act bar), priced before it runs.
import { useState } from "react";

import { BED_CUE, type BedData, type PartView } from "@gt/domain/partView";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { RailList } from "@gt/ui/components/part/RailList.tsx";
import { secs } from "@gt/ui/components/part/part.ts";

import type { EditorProps, Send } from "./PartEditor.tsx";
import { ScoreField as Field } from "./ScoreField.tsx";
import { ScoreTakes } from "./ScoreTakes.tsx";
import s from "./Cut.module.css";

export function ScoreBed(p: EditorProps<PartView<"score">> & { readonly data: BedData }) {
  const { frame, send, busy, error, act, data: d } = p;
  const [chosen, setSel] = useState<string | null>(null);
  const total = d.runtimeS > 0 ? d.runtimeS : 1;
  return (
    <PartWorkspace
      {...frame}
      // Its own mode, bound to nothing: the bed has no spotting clock, so part.score's rows
      // (play, shuttle, cue walk, add cue, zoom) would be a legend of keys nothing here answers.
      mode="part.bed"
      rail={{
        label: "shots",
        children:
          d.shots.length === 0 ? (
            <div className={s.railHead}>
              <Empty label="no scenario picked" />
            </div>
          ) : (
            <RailList
              label="shots"
              items={d.shots}
              idOf={(x) => x.id}
              selected={chosen}
              onSelect={setSel}
              row={(x) => (
                <div className={s.rr}>
                  <div className={s.rrTop}>{secs(x.durationS)}</div>
                  <div className={s.rrTitle}>{x.label}</div>
                </div>
              )}
            />
          ),
      }}
      primary={{
        label: "the bed",
        children: (
          <>
            {error !== null && (
              <div className={s.err}>
                <ErrorLine message={error} live />
              </div>
            )}
            {d.scenario === null ? (
              <Empty label="no scenario picked" />
            ) : (
              <>
                <div className={s.bar}>
                  <span className={s.read}>{secs(d.runtimeS)}</span>
                  <Chip label={d.scenario.title} value={d.scenario.musicMood} casing="lower" />
                  {d.stale && <Chip label="other scenario" tone="amber" casing="lower" />}
                </div>
                <div className={s.strip} role="img" aria-label={`${d.shots.length} shots and a ${secs(d.endCardS)} end card`}>
                  {d.shots.map((x) => (
                    <span key={x.id} className={s.stripShot} style={{ flex: x.durationS / total }}>
                      {secs(x.durationS)}
                    </span>
                  ))}
                  <span className={`${s.stripShot} ${s.stripEnd}`} style={{ flex: d.endCardS / total }}>
                    end
                  </span>
                </div>
                <div className={s.form}>
                  <ScoreFieldBpm bpm={d.bpm} send={send} />
                </div>
              </>
            )}
          </>
        ),
      }}
      inspector={{
        label: "bed takes",
        children:
          d.takes.length === 0 ? (
            <Empty label="no bed rendered" />
          ) : (
            <ScoreTakes
              takes={d.takes}
              busy={busy}
              acts={{
                use: (takeId) => send({ op: "take-use", cueId: BED_CUE, takeId }),
                mark: (takeId, mark) => send({ op: "take-mark", cueId: BED_CUE, takeId, mark }),
                note: (takeId, section, note) =>
                  send({
                    op: "take-note",
                    cueId: BED_CUE,
                    takeId,
                    section,
                    note,
                  }),
                revise: (t) => act("revise-take", `revise ${t.label}`, t.id),
              }}
            />
          ),
      }}
    />
  );
}

function ScoreFieldBpm({ bpm, send }: { readonly bpm: number | null; readonly send: Send }) {
  return (
    <Field
      label="tempo · bpm"
      type="number"
      narrow
      value={bpm === null ? "" : String(bpm)}
      commit={(v) =>
        send({
          op: "cue-bpm",
          cueId: BED_CUE,
          bpm: v.trim() === "" ? null : Number(v),
        })
      }
    />
  );
}
