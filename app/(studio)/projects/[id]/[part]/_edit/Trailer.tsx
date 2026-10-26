"use client";

// SCRIPT · THE TRAILER CUT (STEPS-DESIGN §2; v1 TrailerScript, BeatEditor, ConnectorPick, the
// Structure panel). PRIMARY: the energy curve on top - a shape from the declared roles, never a
// measurement (cut.ts `energyPoints`) - then the cut, one block per beat: timecode, kind, the
// connector (but · therefore · and then; AND THEN is drawn as the defect it is), the label and
// what is on screen, each edited as an op. RAIL: the beats in cut order. INSPECTOR: the structure
// check's findings, the work's sentences only (no registry paths, no `magnitudeOf`), advisory
// rules folded under their own heading. Undo is the part's op log - v1's undo/redo buttons over
// a session CutLog are gone; the CutLog itself is kept inside the record (reset-beat uses it).
import { useState } from "react";

import type { Connector, PartView, ScriptData, TrailerBeatView } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { cx } from "@gt/ui/components/cx.ts";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Fold } from "@gt/ui/components/fold/Fold.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { RailList } from "@gt/ui/components/part/RailList.tsx";
import { clock, walk } from "@gt/ui/components/part/part.ts";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";
import { FIELD_ATTR } from "@gt/ui/keymap/target";

import { Findings } from "./Findings.tsx";
import type { EditorProps, Send } from "./PartEditor.tsx";
import s from "./Editors.module.css";

type Data = Extract<ScriptData, { face: "trailer" }>;
const CONNECTORS = ["BUT", "THEREFORE", "AND THEN"] as const;

function Curve({ d, sel }: { readonly d: Data; readonly sel: string | null }) {
  const W = 1000;
  const H = 120;
  const pts = d.energy.map((p) => ({ ...p, X: 16 + p.x * (W - 32), Y: H - 12 - p.y * (H - 28) }));
  return (
    <svg className={s.curve} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`energy shape over ${pts.length} beats`}>
      <line className={s.curveBase} x1={16} x2={W - 16} y1={H - 10} y2={H - 10} />
      <polyline className={s.curveLine} points={pts.map((p) => `${p.X},${p.Y}`).join(" ")} />
      {pts.map((p) => (
        <circle key={p.beatId} className={cx(s.curveDot, p.beatId === sel && s.on)} cx={p.X} cy={p.Y} r={5} />
      ))}
    </svg>
  );
}

function BeatBlock({ b, d, on, busy, send, onSelect }: { readonly b: TrailerBeatView; readonly d: Data; readonly on: boolean; readonly busy: boolean; readonly send: Send; readonly onSelect: () => void }) {
  const [label, setLabel] = useState(b.label);
  const [text, setText] = useState(b.text);
  const [base, setBase] = useState(b);
  if (base !== b) {
    setBase(b);
    setLabel(b.label);
    setText(b.text);
  }
  const first = d.beats[0]?.id === b.id;
  const mv = d.movements.find((m) => m.id === b.movement);
  return (
    <section className={s.tbeat} aria-label={`${b.at} ${b.label}`} data-beat={b.id} {...(on ? { "data-on": "" } : {})} onFocusCapture={onSelect} onClick={onSelect}>
      <div className={s.row}>
        <h3 className={cx(s.mvh, s.grow)}>{mv?.label ?? b.movement}</h3>
        <span className={s.blabel}>
          <span>{mv?.role}</span>
          {mv?.cue !== undefined && <span>{`cue ${mv.cue}`}</span>}
        </span>
      </div>
      {!first && (
        <Seg<Exclude<Connector, null>>
          label={`connector into ${b.label}`}
          options={CONNECTORS.map((c) => ({ value: c, label: c.toLowerCase() }))}
          value={b.connector ?? "AND THEN"}
          onChange={(connector) => (busy ? undefined : send({ op: "set-connector", beatId: b.id, connector }))}
        />
      )}
      <div className={s.row}>
        <span className={s.tc}>{b.at}</span>
        <Chip label={b.kind} casing="lower" />
        <input
          className={cx(s.input, s.grow)}
          aria-label={`label of ${b.id}`}
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          onBlur={() => label !== b.label && send({ op: "patch-beat", beatId: b.id, label })}
          {...{ [FIELD_ATTR]: "part-field" }}
        />
        {b.spends.map((x) => (
          <span key={x} className={s.missing}>{`spends ${x}`}</span>
        ))}
        {b.raises.map((x) => (
          <span key={x} className={s.on}>{`raises ${x}`}</span>
        ))}
      </div>
      <textarea className={s.area} aria-label={`on screen in ${b.id}`} value={text} onChange={(e) => setText(e.currentTarget.value)} onBlur={() => text !== b.text && send({ op: "patch-beat", beatId: b.id, text })} {...{ [FIELD_ATTR]: "part-text" }} />
      {b.edited && <Button label="reset to dealt" size="sm" disabled={busy} onPress={() => send({ op: "reset-beat", beatId: b.id })} />}
    </section>
  );
}

export function TrailerEditor({ frame, send, busy, error, data: d }: EditorProps<PartView<"script">> & { readonly data: Data }) {
  // Untouched (undefined) follows the data - the first item, or what is picked - so a list that
  // lands after mount (an act's output) has a selection; null is the operator's Esc.
  const [chosen, setSel] = useState<string | null | undefined>(undefined);
  const sel = chosen === undefined ? d.beats[0]?.id ?? null : chosen;
  const [advisory, setAdvisory] = useState(false);
  const locate = (id: string): void => {
    setSel(id);
    document.querySelector(`[data-beat="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
  };
  useKeys(
    "part.trailer",
    {
      item: ({ index }) => {
        const next = walk(d.beats.map((b) => b.id), sel, index === 0 ? 1 : -1);
        if (next === null) return false;
        locate(next);
      },
      deselect: () => setSel(null),
    },
    { facts: sel === null ? [] : ["item"] },
  );
  const st = d.structure;
  const main = st.findings.filter((f) => !f.advisory);
  const adv = st.findings.filter((f) => f.advisory);
  return (
    <PartWorkspace
      {...frame}
      mode="part.trailer"
      facts={sel === null ? [] : ["item"]}
      rail={{
        label: "beats",
        children:
          d.beats.length === 0 ? (
            <div className={s.railHead}>
              <Empty label="no cut composed" />
            </div>
          ) : (
            <RailList
              label="beats"
              items={d.beats}
              idOf={(b) => b.id}
              selected={sel}
              onSelect={locate}
              row={(b) => (
                <div className={s.rr}>
                  <div className={s.rrTop}>
                    <span>{b.at}</span>
                    <span className={s.ell}>{b.kind}</span>
                    {b.edited && <span className={s.missing}>edited</span>}
                  </div>
                  <div className={cx(s.rrTitle, s.clamp1)}>{b.label}</div>
                </div>
              )}
            />
          ),
      }}
      primary={{
        label: "the cut",
        children: (
          <>
            {error !== null && (
              <div className={s.err}>
                <ErrorLine message={error} live />
              </div>
            )}
            <div className={s.bar}>
              <span className={s.mono}>{`${d.beats.length} beats · ${clock(d.runtimeS)} / ${clock(d.targetS)} · ${d.lane}`}</span>
              {d.cue !== undefined && <Chip label="cue" value={d.cue.title} casing="lower" tone={d.cue.frozen ? "neutral" : "amber"} />}
              {d.spineMoved && <Chip label="spine moved" tone="amber" casing="lower" />}
              <SourceTag kind={d.origin === "fixture" ? "illustrative" : "model"} />
            </div>
            {d.beats.length === 0 ? (
              <Empty label="no cut composed" />
            ) : (
              <>
                <Curve d={d} sel={sel} />
                {d.beats.map((b) => (
                  <BeatBlock key={b.id} b={b} d={d} on={b.id === sel} busy={busy} send={send} onSelect={() => setSel(b.id)} />
                ))}
              </>
            )}
          </>
        ),
      }}
      inspector={{
        label: "structure",
        children: (
          <>
            <div className={s.bar}>
              <Chip label={st.malformed === null ? "specialty lane" : st.malformed ? "malformed" : "well-formed"} tone={st.malformed === true ? "rose" : st.malformed === null ? "neutral" : "emerald"} casing="lower" />
              <Chip label="pass" value={st.passes} casing="lower" />
              <Chip label="violations" value={st.violations} casing="lower" />
              <Chip label="unmeasured" value={st.unmeasured} casing="lower" />
              <Chip label="enforced" value={`${st.enforced}%`} casing="lower" />
            </div>
            <Findings findings={main} onLocate={locate} />
            {adv.length > 0 && (
              <Fold title="advisory" open={advisory} onToggle={setAdvisory} total={adv.length}>
                <Findings findings={adv} onLocate={locate} />
              </Fold>
            )}
          </>
        ),
      }}
    />
  );
}
