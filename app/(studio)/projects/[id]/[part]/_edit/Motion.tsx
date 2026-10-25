"use client";

// MOTION (STEPS-DESIGN §2): RAIL = the plated units with their motion state (moving · proposed ·
// declined · none); PRIMARY = the plate with the proposal's movers drawn on it as arrows (and the
// rendered clip over it once there is one); INSPECTOR = the proposal's line (editable before it
// is accepted), its moves, what holds still, its Provenance, or the decline reason verbatim.
// Header-level acts are per unit, so they live with the unit: "direct" (⏎, a receipt - v1 ran the
// two recognize passes as a plain fetch with no price), "accept" (⌘⏎, an op), "render clip" (R,
// a receipt - the clip job v1 never had). Ads projects get the clip list (./Takes.tsx).
import { useState } from "react";

import type { MotionBoard, MotionUnitView, PartView } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { FrameCanvas } from "@gt/ui/components/part/FrameCanvas.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { RailList } from "@gt/ui/components/part/RailList.tsx";
import { walk } from "@gt/ui/components/part/part.ts";
import { Provenance } from "@gt/ui/components/provenance/Provenance.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";
import { FIELD_ATTR } from "@gt/ui/keymap/target";
import { cx } from "@gt/ui/components/cx.ts";

import type { EditorProps } from "./PartEditor.tsx";
import { AdsClipsEditor } from "./Takes.tsx";
import s from "./Frames.module.css";

type V = PartView<"motion">;

export function MotionEditor(p: EditorProps<V>) {
  const d = p.view.data;
  if (d.face === "clips") return <AdsClipsEditor {...p} data={d} />;
  return <MotionBoardEditor {...p} data={d} />;
}

const MARK: Readonly<Record<MotionUnitView["state"], string>> = { moving: "➜", proposed: "◇", declined: "✗", none: "·" };

function UnitRow({ u }: { readonly u: MotionUnitView }) {
  return (
    <div className={s.row} data-unit={u.id} data-motion={u.state}>
      <span className={s.tc}>{u.at}</span>
      <span className={s.kind}>{u.state}</span>
      <span className={s.title}>{u.title}</span>
      <span className={s.marks}>
        <span className={cx(s.m, u.plate.state === "ready" ? s.ready : s.owed)} aria-label={u.plate.state === "ready" ? "plate" : "no plate"}>
          {u.plate.state === "ready" ? "■" : "□"}
        </span>
        <span className={cx(s.m, u.state === "moving" && s.moving, u.state === "declined" && s.bad)} aria-hidden="true">
          {MARK[u.state]}
        </span>
        {u.clip.url !== null && (
          <span className={cx(s.m, s.ready)} aria-label="clip">
            ▶
          </span>
        )}
      </span>
    </div>
  );
}

function Inspector({ u, send, act, busy }: { readonly u: MotionUnitView; readonly send: EditorProps<V>["send"]; readonly act: EditorProps<V>["act"]; readonly busy: boolean }) {
  const [draft, setDraft] = useState(u.proposal?.text ?? u.motion);
  const [seen, setSeen] = useState(u);
  if (seen !== u) {
    setSeen(u);
    setDraft(u.proposal?.text ?? u.motion);
  }
  const plated = u.plate.state === "ready";
  return (
    <div data-region="inspector">
      <div className={s.head}>
        <Chip label={u.beatKind} casing="lower" />
        <Chip label={u.state} tone={u.state === "moving" ? "cyan" : u.state === "declined" ? "rose" : u.state === "proposed" ? "violet" : "neutral"} casing="lower" />
        {u.outcomeStale && <Chip label="plate changed" tone="amber" casing="lower" />}
      </div>
      {u.motion !== "" && (
        <div className={s.sect}>
          <h3 className={s.h}>in the clip</h3>
          <p className={s.work}>{u.motion}</p>
        </div>
      )}
      {u.declined !== undefined && <p className={s.risk}>{u.declined}</p>}
      {u.proposal !== undefined && (
        <div className={s.sect} role="region" aria-label="proposal">
          <h3 className={s.h}>proposal</h3>
          <textarea className={s.area} aria-label="motion line" value={draft} onChange={(e) => setDraft(e.currentTarget.value)} {...{ [FIELD_ATTR]: "motion" }} />
          <div className={s.moves}>
            {u.proposal.moves.map((m) => (
              <span key={`${m.element}:${m.verb}`} className={s.move}>
                <Chip label={m.element} tone="amber" casing="lower" />
                {m.verb}
              </span>
            ))}
            {u.proposal.holdsStill.length > 0 && <span className={s.move}>{`still · ${u.proposal.holdsStill.join(", ")}`}</span>}
          </div>
          <Provenance model={u.proposal.model} vendor={u.proposal.provider} />
        </div>
      )}
      <div className={s.acts}>
        {u.proposal !== undefined && (
          <Button
            label="accept"
            size="sm"
            tone="emerald"
            shortcut={{ mode: "part.motion", verb: "accept" }}
            disabled={busy}
            onPress={() => send({ op: "accept-motion", unitId: u.id, ...(draft.trim() !== "" && draft !== u.proposal?.text ? { motion: draft } : {}) })}
          />
        )}
        {plated && <Button label={u.state === "none" ? "direct" : "direct again"} size="sm" tone="cyan" shortcut={{ mode: "part.motion", verb: "direct" }} onPress={() => act("direct-motion", `direct ${u.at}`, u.id)} />}
        {u.motion !== "" && (
          <Button label={u.clip.url === null ? "render clip" : "render again"} size="sm" tone="cyan" shortcut={{ mode: "part.motion", verb: "render" }} onPress={() => act("render-clip", `clip ${u.at}`, u.id)} />
        )}
        {u.motion !== "" && <Button label="clear" size="sm" disabled={busy} onPress={() => send({ op: "clear-motion", unitId: u.id })} />}
      </div>
    </div>
  );
}

function MotionBoardEditor({ frame, send, busy, error, act, data: d }: EditorProps<V> & { readonly data: MotionBoard }) {
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const sel = chosen === undefined ? (d.units.find((u) => u.plate.state === "ready")?.id ?? d.units[0]?.id ?? null) : chosen;
  const u = d.units.find((x) => x.id === sel);
  const facts = [...(u?.plate.state === "ready" ? ["plate"] : []), ...(u?.proposal !== undefined ? ["proposal"] : []), ...(u !== undefined && u.motion !== "" ? ["moving"] : [])];
  useKeys(
    "part.motion",
    {
      item: ({ index }) => {
        const next = walk(
          d.units.map((x) => x.id),
          sel,
          index === 0 ? 1 : -1,
        );
        if (next === null) return false;
        setChosen(next);
      },
      direct: () => (u === undefined || u.plate.state !== "ready" ? false : act("direct-motion", `direct ${u.at}`, u.id)),
      accept: () => (u?.proposal === undefined || busy ? false : send({ op: "accept-motion", unitId: u.id })),
      render: () => (u === undefined || u.motion === "" ? false : act("render-clip", `clip ${u.at}`, u.id)),
    },
    { facts },
  );
  const t = d.tally;
  return (
    <PartWorkspace
      {...frame}
      mode="part.motion"
      facts={facts}
      rail={{
        label: "units",
        children: (
          <>
            <div className={s.railHead}>
              <h3 className={s.h}>units</h3>
              <Tally value={t.moving} of={t.total} label="moving" />
            </div>
            <RailList label="units" items={d.units} idOf={(x) => x.id} selected={sel} onSelect={setChosen} row={(x) => <UnitRow u={x} />} />
          </>
        ),
      }}
      primary={{
        label: "plate",
        children: (
          <div className={s.stage}>
            {error !== null && <ErrorLine message={error} live />}
            <div className={s.bar} aria-label="motion">
              <span className={s.cell}>
                moving <Tally value={t.moving} of={t.total} />
              </span>
              <span className={s.cell}>
                declined <Tally value={t.declined} />
              </span>
              <span className={s.cell}>
                open <Tally value={t.open} />
              </span>
              <span className={s.cell}>
                clips <Tally value={t.clips} />
              </span>
            </div>
            {u === undefined ? (
              <Empty label="no plated unit" />
            ) : (
              <FrameCanvas
                label={`${u.at} ${u.title}`}
                plate={u.plate}
                layers={[]}
                selected={null}
                clip={u.clip.url}
                movers={(u.proposal?.moves ?? []).map((m) => ({ label: m.element, verb: m.verb, ...(m.x === undefined ? {} : { x: m.x }), ...(m.y === undefined ? {} : { y: m.y }) }))}
              />
            )}
          </div>
        ),
      }}
      inspector={{ label: "motion", children: u === undefined ? <Empty label="no unit selected" /> : <Inspector key={u.id} u={u} send={send} act={act} busy={busy} /> }}
    />
  );
}
