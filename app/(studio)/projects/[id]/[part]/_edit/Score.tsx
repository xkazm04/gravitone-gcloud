"use client";

// SCORE (STEPS-DESIGN §2 score; v1 ScoreSpotting, SpotList, CueTakes, AdsScore). PRIMARY: the
// spotting timeline on the cut's own clock - the PICTURE lane in readable cells, the MUSIC lane's
// spans trimmed at their edges and moved by their body, the drop snapped to scene marks (v1 had
// no drag: spans moved only through ordinal inputs). RAIL: the cues, proposed ones marked, the
// holes in the spotting counted. INSPECTOR: the cue - title, purpose, tempo, span - and its
// takes. The render is the header's act for the selected cue, priced before it runs. The ad's
// face is the bed: one cue, as long as the ad by construction.
import { useState } from "react";

import { type CueView, type PartView, type ScoreData, type SpottingData } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { RailList } from "@gt/ui/components/part/RailList.tsx";
import { clock, secs, walk } from "@gt/ui/components/part/part.ts";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import { CLOCK_ZOOM_OPTIONS, CutClock, useTransport, zoomStep, type ClockLane, type ClockZoom } from "./CutClock.tsx";
import type { EditorProps, Launch, Send } from "./PartEditor.tsx";
import { ScoreBed } from "./ScoreBed.tsx";
import { ScoreField as Field } from "./ScoreField.tsx";
import { ScoreTakes } from "./ScoreTakes.tsx";
import s from "./Cut.module.css";

type P = EditorProps<PartView<"score">>;


function CueInspector({ cue, d, send, busy, act }: { readonly cue: CueView; readonly d: SpottingData; readonly send: Send; readonly busy: boolean; readonly act: Launch }) {
  const first = cue.sceneIds[0] ?? "";
  const last = cue.sceneIds[cue.sceneIds.length - 1] ?? "";
  const span = (f: string, l: string): void => send({ op: "cue-span", cueId: cue.id, first: f, last: l });
  return (
    <>
      <div className={s.bar}>
        <span className={s.read}>{`${clock(cue.startS)} → ${clock(cue.startS + cue.durS)}`}</span>
        <span className={s.mono}>{secs(cue.durS)}</span>
        {cue.proposed && <Chip label="proposed" tone="amber" casing="lower" />}
      </div>
      <div className={s.sect}>
        <Field label="title" value={cue.title} commit={(value) => send({ op: "cue-field", cueId: cue.id, field: "title", value })} />
        <Field label="purpose" value={cue.note} area commit={(value) => send({ op: "cue-field", cueId: cue.id, field: "note", value })} />
        <Field
          label="tempo · bpm"
          type="number"
          narrow
          value={cue.bpm === null ? "" : String(cue.bpm)}
          commit={(v) =>
            send({
              op: "cue-bpm",
              cueId: cue.id,
              bpm: v.trim() === "" ? null : Number(v),
            })
          }
        />
        <div className={s.pair}>
          <label className={s.field}>
            first scene
            <select className={s.select} value={first} onChange={(e) => span(e.currentTarget.value, last)}>
              {d.scenes.map((x) => (
                <option key={x.id} value={x.id}>{`${x.index} · ${x.label}`}</option>
              ))}
            </select>
          </label>
          <label className={s.field}>
            last scene
            <select className={s.select} value={last} onChange={(e) => span(first, e.currentTarget.value)}>
              {d.scenes.map((x) => (
                <option key={x.id} value={x.id}>{`${x.index} · ${x.label}`}</option>
              ))}
            </select>
          </label>
        </div>
        <div className={s.row}>
          <Button label="delete cue" size="sm" tone="rose" disabled={busy} onPress={() => send({ op: "cue-delete", cueId: cue.id })} />
        </div>
      </div>
      <h3 className={s.h}>{`takes · ${cue.takes.length}`}</h3>
      {cue.takes.length === 0 ? (
        <Empty label="no take rendered" />
      ) : (
        <ScoreTakes
          takes={cue.takes}
          busy={busy}
          acts={{
            use: (takeId) => send({ op: "take-use", cueId: cue.id, takeId }),
            mark: (takeId, mark) => send({ op: "take-mark", cueId: cue.id, takeId, mark }),
            note: (takeId, section, note) => send({ op: "take-note", cueId: cue.id, takeId, section, note }),
            revise: (t) => act("revise-take", `revise ${t.label}`, t.id),
          }}
        />
      )}
    </>
  );
}

function Spotting(p: P & { readonly data: SpottingData }) {
  const { frame, send, busy, error, act, data: d } = p;
  const [chosen, setSel] = useState<string | null | undefined>(undefined);
  const sel = chosen === undefined ? (d.cues[0]?.id ?? null) : chosen;
  const cue = d.cues.find((c) => c.id === sel) ?? null;
  const [zoom, setZoom] = useState<ClockZoom>("1");
  const tr = useTransport(d.totalS);
  const ids = d.cues.map((c) => c.id);
  const render = (c: CueView): void => act("render-cue", `render ${c.title}`, c.id);
  const shift = (c: CueView, dir: 1 | -1): void | false => {
    const i = d.scenes.findIndex((x) => x.id === c.sceneIds[0]);
    const j = d.scenes.findIndex((x) => x.id === c.sceneIds[c.sceneIds.length - 1]);
    const a = d.scenes[i + dir];
    const b = d.scenes[j + dir];
    if (i < 0 || a === undefined || b === undefined) return false;
    send({ op: "cue-span", cueId: c.id, first: a.id, last: b.id });
  };
  const facts = [...(cue === null ? [] : ["cue"]), ...(tr.playing ? ["playing"] : [])];
  useKeys(
    "part.score",
    {
      play: () => tr.toggle(),
      shuttle: ({ index }) => tr.shuttle([1, 2, 4][index] ?? 1),
      cue: ({ index }) => {
        const next = walk(ids, sel, index === 0 ? -1 : 1);
        if (next === null) return false;
        setSel(next);
        const c = d.cues.find((x) => x.id === next);
        if (c !== undefined) tr.seek(c.startS);
      },
      "nudge-span": ({ index }) => (cue === null ? false : shift(cue, index === 0 ? -1 : 1)),
      render: () => (cue === null || cue.bpm === null ? false : render(cue)),
      // The add cue button's own guard: with no picture the press used to reach the store, which
      // answered "every scene has a cue" of a film with no scenes.
      "add-cue": () => (busy || d.scenes.length === 0 ? false : send({ op: "cue-add" })),
      zoom: ({ index }) => setZoom((z) => zoomStep(z, index)),
      deselect: () => setSel(null),
    },
    { facts },
  );
  const lanes: ClockLane[] = [
    {
      id: "music",
      label: "music",
      drag: true,
      blocks: d.cues.map((c) => ({
        id: c.id,
        startS: c.startS,
        durS: c.durS,
        label: c.title,
        look: c.proposed ? "proposed" : c.activeTakeId === null ? "missing" : "ok",
        ...(c.bpm === null ? {} : { title: `${c.bpm} bpm` }),
      })),
    },
  ];
  const acts = (
    <>
      {frame.acts}
      {cue !== null &&
        (cue.bpm === null ? (
          <Chip label={`render ${cue.title}`} value="needs a tempo" tone="amber" casing="lower" />
        ) : (
          <Button label={`render ${cue.title}`} size="sm" tone="cyan" shortcut={{ mode: "part.score", verb: "render" }} onPress={() => render(cue)} />
        ))}
    </>
  );
  return (
    <PartWorkspace
      {...frame}
      acts={acts}
      mode="part.score"
      facts={facts}
      rail={{
        label: "cues",
        children: (
          <>
            <div className={s.railHead}>
              <Tally value={Math.round(d.coveredS)} of={Math.round(d.totalS)} label="seconds scored" />
              {d.proposal.pending && <Chip label="proposed" value={d.cues.length} tone="amber" casing="lower" />}
              {d.gaps.length > 0 && <Chip label="gaps" value={d.gaps.length} casing="lower" />}
              <Button label="add cue" size="sm" shortcut={{ mode: "part.score", verb: "add-cue" }} disabled={busy || d.scenes.length === 0} onPress={() => send({ op: "cue-add" })} />
            </div>
            {d.cues.length === 0 ? (
              <div className={s.railHead}>
                <Empty label="no cues spotted" />
              </div>
            ) : (
              <RailList
                label="cues"
                items={d.cues}
                idOf={(c) => c.id}
                selected={sel}
                onSelect={setSel}
                row={(c) => (
                  <div className={s.rr}>
                    <div className={s.rrTop}>
                      <span>{`${clock(c.startS)}–${clock(c.startS + c.durS)}`}</span>
                      {c.bpm !== null && <span>{`${c.bpm} bpm`}</span>}
                      {c.proposed && <span className={s.amber}>proposed</span>}
                      <span className={c.activeTakeId === null ? s.rose : s.ok}>{c.takes.length === 0 ? "no take" : `${c.takes.length} take${c.takes.length === 1 ? "" : "s"}`}</span>
                    </div>
                    <div className={s.rrTitle}>{c.title}</div>
                  </div>
                )}
              />
            )}
            {d.proposal.unplaced.length > 0 && (
              <div className={s.railSect}>
                <h3 className={s.h}>{`unplaced · ${d.proposal.unplaced.length}`}</h3>
                {d.proposal.unplaced.map((u) => (
                  <p key={u.label} className={s.why}>
                    <strong>{u.label}</strong> {u.why}
                  </p>
                ))}
              </div>
            )}
          </>
        ),
      }}
      primary={{
        label: "spotting timeline",
        children: (
          <>
            {error !== null && (
              <div className={s.err}>
                <ErrorLine message={error} live />
              </div>
            )}
            <div className={s.bar}>
              <span className={s.read}>{`${clock(tr.t)} / ${clock(d.totalS)}`}</span>
              {d.targetS !== null && <span className={s.mono}>{`target ${clock(d.targetS)}`}</span>}
              <span className={s.mono}>{`${d.scenes.length} scenes`}</span>
              <Button label={tr.playing ? "pause" : "play"} size="sm" shortcut={{ mode: "part.score", verb: "play" }} disabled={d.totalS === 0} onPress={tr.toggle} />
              <Seg label="zoom" options={CLOCK_ZOOM_OPTIONS} value={zoom} onChange={setZoom} />
            </div>
            {d.scenes.length === 0 ? (
              <Empty label="no picture on the clock" />
            ) : (
              <CutClock
                label="spotting timeline"
                totalS={d.totalS}
                scenes={d.scenes}
                lanes={lanes}
                zoom={Number(zoom)}
                t={tr.t}
                selected={sel}
                marks={d.turn === null ? [] : [{ atS: d.turn.atS, label: d.turn.label }]}
                onSeek={tr.seek}
                onSelect={setSel}
                onDrop={(x) => {
                  const a = d.scenes[x.first];
                  const b = d.scenes[x.last];
                  if (a !== undefined && b !== undefined)
                    send({
                      op: "cue-span",
                      cueId: x.blockId,
                      first: a.id,
                      last: b.id,
                    });
                }}
              />
            )}
          </>
        ),
      }}
      inspector={{
        label: "cue",
        children: cue === null ? <Empty label="no cue selected" /> : <CueInspector key={cue.id} cue={cue} d={d} send={send} busy={busy} act={act} />,
      }}
    />
  );
}


export function ScoreEditor(p: P) {
  const d: ScoreData = p.view.data;
  return d.face === "bed" ? <ScoreBed {...p} data={d} /> : <Spotting {...p} data={d} />;
}
