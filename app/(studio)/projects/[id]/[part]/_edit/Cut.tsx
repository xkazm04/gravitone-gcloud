"use client";

// CUT (STEPS-DESIGN §2 cut; v1 CutWorkbench -> ControlRoom: Monitor, Transport, Lanes, SyncBench,
// FinishLine, Inspector; AdsFinish). PRIMARY: the monitor (16:9 / 9:16, safe zone) over the lanes
// on the score's clock. RAIL: the FINISH LINE - seven checks, the deny sentences verbatim, each
// row opening the part that clears it. INSPECTOR: the selected block - its owner part, its sync
// (∓50 ms, snap to mark), its take. The export is the header's act, priced, and lands an mp4
// blob - v1 POSTed data: URLs with no job and no price. The ad's face is its finish: supers, the
// end card, an aspect per render, and finish.ts's checks with loudness.
import { useState } from "react";

import type { ClipView, CutData, FinishRow, PartView, TimelineData } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { cx } from "@gt/ui/components/cx.ts";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { clock, secs } from "@gt/ui/components/part/part.ts";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import { CLOCK_ZOOM_OPTIONS, CutClock, useTransport, zoomStep, type ClockLane, type ClockZoom } from "./CutClock.tsx";
import { CutFinish } from "./CutFinish.tsx";
import type { EditorProps, Send } from "./PartEditor.tsx";
import s from "./Cut.module.css";

type P = EditorProps<PartView<"cut">>;
const LANES = [
  { id: "video", label: "picture" },
  { id: "vo", label: "voice" },
  { id: "music", label: "music" },
] as const;

/** h:mm:ss:ff at the cut's frame rate (v1 Transport's readout, without its float tail). */
function tc(t: number, fps: number): string {
  const f = Math.round(t * fps);
  const ff = f % fps;
  const sec = Math.floor(f / fps);
  return `${clock(sec)}:${String(ff).padStart(2, "0")}`;
}

const partHref = (projectId: string, key: string): string => `/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(key)}`;

export function FinishRows({ rows, projectId }: { readonly rows: readonly FinishRow[]; readonly projectId: string }) {
  return (
    <div role="list" aria-label="finish line">
      {rows.map((r) => (
        <div key={r.id} className={s.check} role="listitem" data-check={r.id}>
          {r.owner === null ? <span className={s.checkLabel}>{r.label}</span> : <a className={s.checkLabel} href={partHref(projectId, r.owner)}>{r.label}</a>}
          <span className={s.checkVal}>{`${r.value} / ${r.target}`}</span>
          <span className={cx(s.v, s[r.verdict])}>{r.verdict}</span>
          {r.deny !== undefined && <p className={cx(s.deny, s.checkDeny)}>{r.deny}</p>}
        </div>
      ))}
    </div>
  );
}

function Monitor({ d, t, tall, safe }: { readonly d: TimelineData; readonly t: number; readonly tall: boolean; readonly safe: boolean }) {
  const i = d.scenes.findIndex((x) => t >= x.startS && t < x.startS + x.durS);
  const at = i < 0 ? d.scenes.length - 1 : i;
  const sc = d.scenes[at];
  const f = sc === undefined ? undefined : d.monitor[sc.id];
  return (
    <div className={cx(s.monitor, tall && s.tall)} role="img" aria-label={f === undefined ? "nothing on the clock" : `${f.title}${f.blob === undefined ? " · no plate" : ""}`}>
      {f?.blob !== undefined ? (
        // eslint-disable-next-line @next/next/no-img-element -- a kernel blob through /api/blob; nothing for next/image to optimise
        <img className={s.plate} src={`/api/blob/${f.blob}`} alt="" />
      ) : (
        <div className={s.slate}>
          <Ghost label={f?.placed === true ? "dry plate" : "no plate"} />
          {f !== undefined && <span className={s.slateKind}>{f.kind}</span>}
          {f !== undefined && f.line !== "" && <p className={s.slateLine}>{f.line}</p>}
        </div>
      )}
      <span className={s.counter}>
        <Chip label={tall ? "9:16" : "16:9"} value={sc === undefined ? "—" : `${at + 1}/${d.scenes.length}`} casing="lower" />
      </span>
      {f !== undefined && f.blob === undefined && (
        <span className={s.badge}>
          {/* A placed plate with no bytes is a dry stand-in; an unplaced one is the hole. */}
          {f.placed ? <Chip label="dry plate" casing="lower" /> : <Chip label="no plate" tone="rose" casing="lower" />}
        </span>
      )}
      {safe && <span className={s.safe} aria-hidden="true" />}
    </div>
  );
}

function ClipInspector({ c, projectId, send, busy }: { readonly c: ClipView; readonly projectId: string; readonly send: Send; readonly busy: boolean }) {
  return (
    <>
      <div className={s.bar}>
        <Chip label={c.track === "video" ? "picture" : c.track === "vo" ? "voice" : "music"} casing="lower" />
        <Chip label={c.status} tone={c.status === "ok" ? "emerald" : c.status === "drift" ? "amber" : "rose"} casing="lower" />
      </div>
      <div className={s.sect}>
        <p className={s.work}>{c.label}</p>
        {c.why !== undefined && <p className={s.deny}>{c.why}</p>}
        {c.note !== undefined && c.note !== c.label && <p className={s.why}>{c.note}</p>}
        <span className={s.mono}>{`${clock(c.startS)} → ${clock(c.startS + c.durS)} · ${secs(c.durS)}`}</span>
        {c.owner !== null && <Button label={`open ${c.owner}`} size="sm" href={partHref(projectId, c.owner)} />}
      </div>
      <h3 className={s.h}>sync</h3>
      <div className={s.sect}>
        <div className={s.row}>
          <Button label="−50 ms" size="sm" disabled={busy} onPress={() => send({ op: "nudge", clipId: c.id, ms: -50 })} />
          <span className={s.read}>{`${c.offsetMs >= 0 ? "+" : ""}${c.offsetMs} ms`}</span>
          <Button label="+50 ms" size="sm" disabled={busy} onPress={() => send({ op: "nudge", clipId: c.id, ms: 50 })} />
        </div>
        {c.offsetMs !== 0 && <Button label="snap to mark" size="sm" disabled={busy} onPress={() => send({ op: "snap", clipId: c.id })} />}
      </div>
      {c.blob !== undefined && c.track !== "video" && (
        <>
          <h3 className={s.h}>take</h3>
          <audio className={s.audio} controls preload="none" src={`/api/blob/${c.blob}`} aria-label={`play ${c.label}`} />
        </>
      )}
    </>
  );
}

function Timeline(p: P & { readonly data: TimelineData }) {
  const { frame, send, busy, error, view, data: d } = p;
  const [sel, setSel] = useState<string | null>(null);
  const [aspect, setAspect] = useState<"16:9" | "9:16">("16:9");
  const [safe, setSafe] = useState(false);
  const [zoom, setZoom] = useState<ClockZoom>("1");
  const tr = useTransport(d.totalS);
  const clip = d.clips.find((c) => c.id === sel) ?? null;
  const step = (dt: number): void => tr.seek(tr.t + dt);
  const edit = (dir: 1 | -1): number | undefined => (dir > 0 ? d.edits.find((x) => x > tr.t + 0.04) : [...d.edits].reverse().find((x) => x < tr.t - 0.04));
  const gap = (dir: 1 | -1): number | undefined => (dir > 0 ? d.gaps.find((g) => g.startS > tr.t + 0.04) : [...d.gaps].reverse().find((g) => g.startS < tr.t - 0.04))?.startS;
  const facts = clip === null ? [] : ["clip"];
  useKeys(
    "part.cut",
    {
      play: () => tr.toggle(),
      shuttle: ({ index }) => tr.shuttle([1, 2, 4][index] ?? 1),
      frame: ({ index }) => step((index === 0 ? -1 : 1) / d.fps),
      second: ({ index }) => step(index === 0 ? -1 : 1),
      edit: ({ index }) => {
        const x = edit(index === 0 ? -1 : 1);
        if (x === undefined) return false;
        tr.seek(x);
      },
      gap: ({ index }) => {
        const x = gap(index === 0 ? 1 : -1);
        if (x === undefined) return false;
        tr.seek(x);
      },
      edge: ({ index }) => tr.seek(index === 0 ? 0 : d.totalS),
      nudge: ({ index }) => (clip === null || busy ? false : send({ op: "nudge", clipId: clip.id, ms: index === 0 ? -50 : 50 })),
      zoom: ({ index }) => setZoom((z) => zoomStep(z, index)),
      deselect: () => setSel(null),
    },
    { facts },
  );
  const lanes: ClockLane[] = LANES.filter((l) => l.id !== "music" || d.music).map((l) => ({
    id: l.id,
    label: l.label,
    blocks: d.clips.filter((c) => c.track === l.id).map((c) => ({ id: c.id, startS: c.drawnS, durS: c.durS, label: c.label, look: c.status, ...(c.why === undefined ? {} : { title: c.why }) })),
  }));
  const open = d.finish.filter((r) => r.verdict === "fail").length;
  return (
    <PartWorkspace
      {...frame}
      mode="part.cut"
      facts={facts}
      rail={{
        label: "finish line",
        children: (
          <>
            <div className={s.railHead}>
              <h2 className={s.h}>finish line</h2>
              <Chip label="open" value={open} tone={open > 0 ? "rose" : "emerald"} casing="lower" />
            </div>
            <div className={s.grow}>
              <FinishRows rows={d.finish} projectId={view.projectId} />
            </div>
            {(d.exports.length > 0 || d.unplaced.length > 0) && (
              <div className={s.railSect}>
                {d.unplaced.map((u) => (
                  <p key={u.label} className={s.why}>
                    <strong>{u.label}</strong> {u.why}
                  </p>
                ))}
                {d.exports.map((e) => (
                  <div key={e.id} className={s.row}>
                    <span className={cx(s.grow, s.ell)}>{e.label}</span>
                    {e.mode === "dry" && <Chip label="dry" casing="lower" />}
                    {e.blob !== undefined && <Button label="mp4" size="sm" href={`/api/blob/${e.blob}`} />}
                  </div>
                ))}
              </div>
            )}
          </>
        ),
      }}
      primary={{
        label: "monitor and lanes",
        children: (
          <>
            {error !== null && (
              <div className={s.err}>
                <ErrorLine message={error} live />
              </div>
            )}
            {d.scenes.length === 0 ? (
              <Empty label="no picture on the clock" />
            ) : (
              <>
                <div className={s.monitorRow}>
                  <Monitor d={d} t={tr.t} tall={aspect === "9:16"} safe={safe} />
                  <div className={s.transport}>
                    <Seg label="aspect" options={[{ value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }]} value={aspect} onChange={setAspect} />
                    <Chip label="safe zone" casing="lower" pressed={safe} onPress={() => setSafe((x) => !x)} />
                    <Button label={tr.playing ? "pause" : "play"} size="sm" shortcut={{ mode: "part.cut", verb: "play" }} onPress={tr.toggle} />
                    <span className={s.read}>{tc(tr.t, d.fps)}</span>
                    <span className={s.mono}>{`/ ${tc(d.totalS, d.fps)} · ${d.fps}fps`}</span>
                    {d.targetS !== null && <span className={s.mono}>{`target ${clock(d.targetS)}`}</span>}
                    <Seg label="zoom" options={CLOCK_ZOOM_OPTIONS} value={zoom} onChange={setZoom} />
                  </div>
                </div>
                <CutClock label="lanes" totalS={d.totalS} scenes={d.scenes} lanes={lanes} zoom={Number(zoom)} t={tr.t} selected={sel} sceneLane={false} marks={d.turn === null ? [] : [{ atS: d.turn.atS, label: d.turn.label }]} onSeek={tr.seek} onSelect={setSel} />
              </>
            )}
          </>
        ),
      }}
      inspector={{ label: "block", children: clip === null ? <Empty label="no block selected" /> : <ClipInspector c={clip} projectId={view.projectId} send={send} busy={busy} /> }}
    />
  );
}

export function CutEditor(p: P) {
  const d: CutData = p.view.data;
  return d.face === "finish" ? <CutFinish {...p} data={d} /> : <Timeline {...p} data={d} />;
}
