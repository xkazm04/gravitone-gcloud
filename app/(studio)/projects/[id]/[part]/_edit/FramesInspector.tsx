"use client";

// THE FRAMES INSPECTOR: the selected unit's fields (v1 FramesAssembly's 300 px right column and
// LayerPanel beneath the canvas), its alternatives as a contact sheet (v1 VariantContactSheet,
// a 68vh rail of its own - here a view of the unit it belongs to), and - on the shot lane - the
// shot list's review (reviewShotList, 13 rules, NOT_CHECKED listed). Texts bind to a notebook fact
// ("— unsourced —" when none: a figure nobody checked); a direction pass's refusal for this beat
// is shown in the validator's own words. Fields commit on blur or ⏎, each one op.
import { useState } from "react";

import type { FramesBoard, PartView, UnitView } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { layerKey } from "@gt/ui/components/part/FrameCanvas.tsx";
import { secs } from "@gt/ui/components/part/part.ts";
import { Provenance } from "@gt/ui/components/provenance/Provenance.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { FIELD_ATTR } from "@gt/ui/keymap/target";
import { cx } from "@gt/ui/components/cx.ts";

import { Findings } from "./Findings.tsx";
import type { EditorProps } from "./PartEditor.tsx";
import s from "./Frames.module.css";

export type InspectorView = "unit" | "alternatives" | "review";

type P = {
  readonly view: PartView<"frames">;
  readonly data: FramesBoard;
  readonly unit: UnitView;
  readonly layerSel: string | null;
  readonly onLayer: (key: string | null) => void;
  readonly send: EditorProps<unknown>["send"];
  readonly act: EditorProps<unknown>["act"];
  readonly busy: boolean;
  readonly mode: InspectorView;
  readonly onMode: (v: InspectorView) => void;
};

const field = { [FIELD_ATTR]: "part-field" };

/** A text field that commits once, on blur (⏎ blurs it: the `part` keymap's commit-field). */
function Commit({ value, label, area = false, onCommit }: { readonly value: string; readonly label: string; readonly area?: boolean; readonly onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const done = (): void => {
    if (draft !== value) onCommit(draft);
  };
  return area ? (
    <textarea className={s.area} aria-label={label} value={draft} onChange={(e) => setDraft(e.currentTarget.value)} onBlur={done} {...field} />
  ) : (
    <input className={s.input} aria-label={label} value={draft} onChange={(e) => setDraft(e.currentTarget.value)} onBlur={done} {...field} />
  );
}

function UnitFields({ data: d, unit: u, layerSel, onLayer, send, act, busy }: P) {
  const p = u.plate;
  const texts = u.layers.filter((l) => l.layer === "text");
  return (
    <>
      <div className={s.sect}>
        <div className={s.chips}>
          <Chip label={u.beatKind} casing="lower" />
          <Chip label={p.state === "ready" ? (p.stale ? "stale" : "plate") : p.state} tone={p.state === "ready" ? (p.stale ? "amber" : "emerald") : p.state === "empty" ? "neutral" : "rose"} casing="lower" />
          {u.holdS !== null && <Chip label="hold" value={secs(u.holdS)} casing="lower" />}
          {u.staging !== undefined && <Chip label={[u.staging.size, u.staging.angle, u.staging.pace].filter((x) => x !== "").join(" · ")} casing="lower" />}
        </div>
        {u.device !== undefined && <p className={s.work}>{u.device}</p>}
        {u.rationale !== undefined && <p className={s.why}>{u.rationale}</p>}
        {p.rejectedBy !== undefined && <p className={s.risk}>{`rejected at ${p.rejectedBy}`}</p>}
      </div>
      {u.proposal !== undefined && (
        <div className={s.sect} role="region" aria-label="proposal">
          <h3 className={s.h}>proposal</h3>
          {u.proposal.rejected !== undefined ? (
            <p className={s.risk}>{u.proposal.rejected}</p>
          ) : (
            <div className={s.chips}>
              {u.proposal.ops.map((o) => (
                <Chip key={o} label={o} tone="violet" casing="lower" />
              ))}
            </div>
          )}
          {u.proposal.subject !== undefined && <p className={s.work}>{u.proposal.subject}</p>}
          {u.proposal.conflicts > 0 && <Chip label="human layers" value={u.proposal.conflicts} tone="amber" />}
          {u.proposal.rejected === undefined && <Button label="accept row" size="sm" tone="emerald" disabled={busy} onPress={() => send({ op: "accept-direction", units: [u.id], overwrite: false })} />}
        </div>
      )}
      {d.checkpoint && (
        <div className={s.sect}>
          <Button label="revert row" size="sm" disabled={busy} onPress={() => send({ op: "revert-direction", unitId: u.id })} />
        </div>
      )}
      <div className={s.sect}>
        <h3 className={s.h}>plate subject</h3>
        <Commit area label="plate subject" value={p.subject} onCommit={(v) => send({ op: "set-subject", unitId: u.id, subject: v })} />
        <div className={s.acts}>
          <Button label={p.state === "ready" ? "render again" : "render"} size="sm" tone="cyan" shortcut={{ mode: "part.frames", verb: "render" }} onPress={() => act("render-plate", `render ${u.at}`, u.id)} />
          <Button label="+ alternative" size="sm" onPress={() => act("render-alternative", `alternative ${u.at}`, u.id)} />
        </div>
        <Provenance {...(p.model === undefined ? {} : { model: p.model })} {...(p.usd === undefined ? {} : { cost: `$${p.usd.toFixed(2)}` })} />
      </div>
      <div className={s.sect}>
        <h3 className={s.h}>clip motion</h3>
        <Commit area label="clip motion" value={u.clip.motion} onCommit={(v) => send({ op: "set-clip-motion", unitId: u.id, motion: v })} />
      </div>
      <div className={s.sect} role="region" aria-label="texts">
        <h3 className={s.h}>texts</h3>
        {texts.map((t) => (
          <div key={t.id} className={s.textRow} data-text={t.id}>
            <Chip label={t.role} casing="lower" tone={t.unsourced ? "amber" : "neutral"} />
            <Commit label={`${t.role} ${t.id}`} value={t.label} onCommit={(v) => send({ op: "set-text", unitId: u.id, textId: t.id, value: v })} />
            <Button label="×" size="sm" disabled={busy} onPress={() => send({ op: "remove-layer", unitId: u.id, layer: "text", layerId: t.id })} />
            <select
              className={cx(s.select, s.factRow)}
              aria-label={`fact for ${t.id}`}
              value={t.factId ?? ""}
              onChange={(e) => send({ op: "bind-fact", unitId: u.id, textId: t.id, factId: e.currentTarget.value === "" ? null : e.currentTarget.value })}
            >
              <option value="">— unsourced —</option>
              {d.facts.map((f) => (
                <option key={f.id} value={f.id}>{`${f.id} · ${f.confidence ?? "?"} · ${f.title.slice(0, 48)}`}</option>
              ))}
            </select>
          </div>
        ))}
        <div className={s.acts}>
          {(["caption", "figure", "label"] as const).map((role) => (
            <Button key={role} label={`+ ${role}`} size="sm" disabled={busy} onPress={() => send({ op: "add-text", unitId: u.id, role })} />
          ))}
        </div>
      </div>
      <div className={s.sect} role="region" aria-label="layers">
        <h3 className={s.h}>layers</h3>
        <div className={s.layers}>
          {[...u.layers].reverse().map((l) => {
            const k = layerKey(l);
            return (
              <div key={k} className={s.layer} data-selected={layerSel === k} data-layer={k}>
                <button type="button" className={s.pick} aria-pressed={layerSel === k} onClick={() => onLayer(layerSel === k ? null : k)}>
                  <span className={s.ell}>{`${l.unsourced ? "● " : ""}${l.role} · ${l.label || l.id}${l.by === "human" ? " · ✎" : ""}`}</span>
                </button>
                <span className={s.layerActs}>
                  <Button label={l.hidden ? "show" : "hide"} size="sm" disabled={busy} onPress={() => send({ op: "hide-layer", unitId: u.id, layer: l.layer, layerId: l.id, hidden: !l.hidden })} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Alternatives({ unit: u, send, act }: P) {
  return (
    <div className={s.sect} role="region" aria-label="alternatives">
      {u.alts.length === 0 ? (
        <Empty label="no alternatives" action={{ label: "+ alternative", size: "sm", tone: "cyan", onPress: () => act("render-alternative", `alternative ${u.at}`, u.id) }} />
      ) : (
        <>
          <div className={s.sheet}>
            {u.alts.map((a) => (
              <button
                key={a.id}
                type="button"
                className={s.take}
                aria-pressed={a.active}
                aria-label={`${a.id}${a.active ? " · in the cut" : ""}`}
                onClick={() => send({ op: "adopt-alt", unitId: u.id, altId: a.id })}
                data-alt={a.id}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {a.url === null ? <span className={s.blank} /> : <img src={a.url} alt="" />}
                <span className={s.takeFoot}>
                  <span>{a.id.split("~").pop()}</span>
                  {a.active && <Chip label="in the cut" tone="emerald" casing="lower" />}
                  {a.dry && <span className={s.key}>dry</span>}
                </span>
              </button>
            ))}
          </div>
          <Button label="+ alternative" size="sm" tone="cyan" onPress={() => act("render-alternative", `alternative ${u.at}`, u.id)} />
        </>
      )}
    </div>
  );
}

function Review({ data: d }: P) {
  const r = d.review;
  if (r === undefined) return <Empty label="no shot list" />;
  return (
    <div className={s.sect} role="region" aria-label="shot review">
      <div className={s.chips}>
        <Chip label="checks" value={r.checks} />
        <Chip label="violations" value={r.violations} tone={r.violations > 0 ? "rose" : "neutral"} />
        <Chip label="unmeasured" value={r.unmeasured} tone={r.unmeasured > 0 ? "amber" : "neutral"} />
        <Chip label="not engaged" value={r.notEngaged} />
      </div>
      <Findings findings={r.findings} />
      <h3 className={s.h}>not checked</h3>
      {r.notChecked.map((n) => (
        <p key={n} className={s.work}>
          {n}
        </p>
      ))}
    </div>
  );
}

export function FramesInspector(p: P) {
  const options = [
    { value: "unit" as const, label: "unit" },
    { value: "alternatives" as const, label: "alternatives", count: p.unit.alts.length },
    ...(p.data.review === undefined ? [] : [{ value: "review" as const, label: "review", count: p.data.review.violations }]),
  ];
  return (
    <div tabIndex={-1} data-region="inspector">
      <div className={s.bar}>
        <Seg label="inspector view" options={options} value={p.mode} onChange={p.onMode} />
      </div>
      {p.mode === "alternatives" ? <Alternatives {...p} /> : p.mode === "review" ? <Review {...p} /> : <UnitFields {...p} />}
    </div>
  );
}
