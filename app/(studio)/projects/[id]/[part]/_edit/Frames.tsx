"use client";

// FRAMES (STEPS-DESIGN §2): the ledger of picture units in the RAIL, the selected unit's canvas as
// the PRIMARY (drag a layer, resize an element by its handle, nudge by arrows), the unit's fields
// in the INSPECTOR (./FramesInspector.tsx). One editor for the explainer's beats and a trailer's
// SHOTS - the shots render plates too (v1's ShotSheet was read-only). The ads face is the take
// grid (./Takes.tsx). Every count is the server's; the direction pass arrives as a PROPOSAL bar
// that is accepted or discarded by op, and reverted to its checkpoint by op - so ⌫ covers it.
import { useMemo, useState } from "react";

import { LOOK_MISS_WORDS, type FramesBoard, type LayerView, type PartView, type UnitView } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { FrameCanvas, layerKey } from "@gt/ui/components/part/FrameCanvas.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { RailList } from "@gt/ui/components/part/RailList.tsx";
import { clock, walk } from "@gt/ui/components/part/part.ts";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";
import { cx } from "@gt/ui/components/cx.ts";

import { FramesInspector, type InspectorView } from "./FramesInspector.tsx";
import type { EditorProps } from "./PartEditor.tsx";
import { AdsTakesEditor } from "./Takes.tsx";
import s from "./Frames.module.css";

type V = PartView<"frames">;

export function FramesEditor(p: EditorProps<V>) {
  const d = p.view.data;
  if (d.face === "takes") return <AdsTakesEditor {...p} data={d} />;
  return <FramesBoardEditor {...p} data={d} />;
}

/** The ledger's marks: plate, clip, layers - one line, never wrapping. */
function Marks({ u }: { readonly u: UnitView }) {
  const plate = u.plate.state === "ready" ? (u.plate.stale ? "owed" : "ready") : u.plate.state === "refused" || u.plate.state === "rejected" ? "bad" : "owed";
  const word = u.plate.state === "ready" ? (u.plate.stale ? "stale" : "plate") : u.plate.state;
  return (
    <span
      className={s.marks}
      aria-label={`${word} · ${u.clip.motion === "" ? "no motion" : "motion"} · ${u.pips.elements} elements · ${u.pips.texts} texts${u.pips.unsourced > 0 ? ` · ${u.pips.unsourced} unsourced` : ""}`}
    >
      <span className={cx(s.m, s[plate])} aria-hidden="true">
        {u.plate.state === "ready" ? (u.plate.stale ? "◐" : "■") : u.plate.state === "rejected" ? "✗" : u.plate.state === "refused" ? "▲" : "□"}
      </span>
      <span className={cx(s.m, u.clip.motion !== "" && s.moving)} aria-hidden="true">
        {u.clip.motion !== "" ? "➜" : "·"}
      </span>
      <span className={s.m} aria-hidden="true">
        {u.pips.elements + u.pips.texts}
      </span>
      {u.pips.unsourced > 0 && (
        <span className={cx(s.m, s.owed)} aria-hidden="true">
          ●
        </span>
      )}
    </span>
  );
}

function UnitRow({ u }: { readonly u: UnitView }) {
  return (
    <div className={s.row} data-unit={u.id} data-plate={u.plate.state}>
      <span className={s.tc}>{u.startS === null ? u.at : clock(u.startS)}</span>
      <span className={s.kind}>{u.grain === "shot" && u.staging !== undefined ? u.staging.size || u.beatKind : u.beatKind}</span>
      <span className={s.title}>{u.title}</span>
      <Marks u={u} />
    </div>
  );
}

const NUDGE = { "←": [-1, 0], "→": [1, 0], "↑": [0, -1], "↓": [0, 1] } as const;

function FramesBoardEditor({ view, frame, send, busy, error, act, data: d }: EditorProps<V> & { readonly data: FramesBoard }) {
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const sel = chosen === undefined ? (d.units[0]?.id ?? null) : chosen;
  const unit = d.units.find((u) => u.id === sel);
  const [layerSel, setLayer] = useState<string | null>(null);
  const layer: LayerView | undefined = unit?.layers.find((l) => layerKey(l) === layerSel);
  const [insp, setInsp] = useState<InspectorView>("unit");
  const byId = useMemo(() => new Map(d.units.map((u) => [u.id, u])), [d.units]);

  const select = (id: string | null): void => {
    setChosen(id);
    setLayer(null);
  };
  const moveLayer = (l: LayerView, x: number, y: number): void => {
    if (unit !== undefined) send({ op: "move-layer", unitId: unit.id, layer: l.layer, layerId: l.id, x, y });
  };
  const facts = [...(unit === undefined ? [] : ["unit"]), ...(layer === undefined ? [] : ["layer"]), ...(d.proposal !== null ? ["proposal"] : [])];

  useKeys(
    "part.frames",
    {
      item: ({ index }) => {
        const next = walk(
          d.units.map((u) => u.id),
          sel,
          index === 0 ? 1 : -1,
        );
        if (next === null) return false;
        select(next);
      },
      "next-missing": () => {
        const ids = d.units.filter((u) => u.plate.state !== "ready" || u.plate.stale).map((u) => u.id);
        const at = sel === null ? -1 : d.units.findIndex((u) => u.id === sel);
        const next = d.units.slice(at + 1).find((u) => ids.includes(u.id)) ?? byId.get(ids[0] ?? "");
        if (next === undefined) return false;
        select(next.id);
      },
      render: () => (unit === undefined ? false : act("render-plate", `render ${unit.at}`, unit.id)),
      nudge: ({ cap }) => nudge(cap, 1),
      "nudge-far": ({ cap }) => nudge(cap.replace("⇧", ""), 10),
      order: ({ index }) => (unit === undefined || layer === undefined || busy ? false : send({ op: "order-layer", unitId: unit.id, layer: layer.layer, layerId: layer.id, dir: index === 0 ? -1 : 1 })),
      hide: () => (unit === undefined || layer === undefined || busy ? false : send({ op: "hide-layer", unitId: unit.id, layer: layer.layer, layerId: layer.id, hidden: !layer.hidden })),
      view: () => setInsp((v) => (v === "unit" ? "alternatives" : v === "alternatives" && d.review !== undefined ? "review" : "unit")),
      accept: () => (d.proposal === null || busy ? false : send({ op: "accept-direction", units: "all", overwrite: false })),
      deselect: () => setLayer(null),
    },
    { facts },
  );
  function nudge(key: string, step: number): void | false {
    const v = NUDGE[key as keyof typeof NUDGE];
    if (unit === undefined || layer === undefined || v === undefined || busy) return false;
    moveLayer(layer, layer.x + v[0] * step, layer.y + v[1] * step);
  }

  const t = d.tally;
  const acts = (
    <>
      {d.checkpoint && <Button label="revert pass" size="sm" tone="rose" onPress={() => send({ op: "revert-direction" })} />}
      {frame.acts}
    </>
  );
  return (
    <PartWorkspace
      {...frame}
      acts={acts}
      mode="part.frames"
      facts={facts}
      rail={{
        label: "units",
        children: (
          <>
            <div className={s.railHead}>
              <h3 className={s.h}>{d.face === "shots" ? "shots" : "units"}</h3>
              <Tally value={t.composed} of={t.total} label="plates" />
            </div>
            <RailList label="units" items={d.units} idOf={(u) => u.id} selected={sel} onSelect={select} row={(u) => <UnitRow u={u} />} />
          </>
        ),
      }}
      primary={{
        label: "canvas",
        children: (
          <div className={s.stage}>
            {error !== null && (
              <div className={s.err}>
                <ErrorLine message={error} live />
              </div>
            )}
            <div className={s.bar} aria-label="frames">
              <span className={s.cell}>
                plates <Tally value={t.composed} of={t.total} />
              </span>
              {t.stale > 0 && (
                <span className={s.cell}>
                  stale <Tally value={t.stale} />
                </span>
              )}
              {t.rejected > 0 && (
                <span className={s.cell}>
                  rejected <Tally value={t.rejected} />
                </span>
              )}
              {t.unsourced > 0 && (
                <span className={s.cell}>
                  unsourced <Tally value={t.unsourced} />
                </span>
              )}
              <span className={s.cell}>
                motion <Tally value={t.clips} of={t.total} />
              </span>
              <Chip
                label={d.style.fallback ? "default style" : "style"}
                value={d.style.name}
                tone={d.style.fallback ? "amber" : "neutral"}
                casing="lower"
                name={d.style.miss === undefined ? `style ${d.style.name}, ${d.style.refs} references sent` : `default style ${d.style.name}: ${LOOK_MISS_WORDS[d.style.miss]}`}
              />
              {!d.style.fallback && (
                <span className={s.cell}>
                  refs <Tally value={d.style.refs} />
                </span>
              )}
              {d.direction.runs > 0 && <Chip label="direction" value={d.direction.unpriced > 0 ? `${d.direction.runs} · ${d.direction.unpriced} unpriced` : `$${d.direction.usd.toFixed(2)}`} casing="lower" />}
              {d.sourceMoved && <Button label="rederive" size="sm" tone="amber" badge={{ label: "cut moved", tone: "amber" }} onPress={() => send({ op: "rederive" })} />}
            </div>
            {d.proposal !== null && (
              <div className={s.proposal} role="region" aria-label="direction proposal">
                <Chip label="proposal" value={d.proposal.rows} tone="violet" />
                {d.proposal.conflicts > 0 && <Chip label="human layers" value={d.proposal.conflicts} tone="amber" />}
                {d.proposal.rejected > 0 && <Chip label="refused" value={d.proposal.rejected} tone="rose" />}
                {d.proposal.missing.length > 0 && <Chip label="unmentioned" value={d.proposal.missing.length} />}
                <Button label="accept" size="sm" tone="emerald" shortcut={{ mode: "part.frames", verb: "accept" }} onPress={() => send({ op: "accept-direction", units: "all", overwrite: false })} />
                {d.proposal.conflicts > 0 && <Button label="accept over human" size="sm" tone="amber" onPress={() => send({ op: "accept-direction", units: "all", overwrite: true })} />}
                <Button label="discard" size="sm" onPress={() => send({ op: "discard-direction" })} />
              </div>
            )}
            {unit === undefined ? (
              <Empty label={d.source === null ? "no adopted script" : "no unit selected"} />
            ) : (
              <>
                <FrameCanvas
                  label={`${unit.at} ${unit.title}`}
                  plate={unit.plate}
                  layers={unit.layers}
                  selected={layerSel}
                  onSelect={setLayer}
                  onMove={(l, x, y) => moveLayer(l as LayerView, x, y)}
                  onResize={(l, w, h) => send({ op: "resize-layer", unitId: unit.id, layer: l.layer, layerId: l.id, w, h })}
                />
                {unit.line !== "" && <p className={s.line}>{unit.line}</p>}
              </>
            )}
          </div>
        ),
      }}
      inspector={{
        label: "unit",
        children:
          unit === undefined ? (
            <Empty label="no unit selected" />
          ) : (
            <FramesInspector view={view} data={d} unit={unit} layerSel={layerSel} onLayer={setLayer} send={send} act={act} busy={busy} mode={insp} onMode={setInsp} />
          ),
      }}
    />
  );
}
