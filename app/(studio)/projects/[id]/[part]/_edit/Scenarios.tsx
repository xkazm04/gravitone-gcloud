"use client";

// SCRIPT · THE AD'S SCENARIOS (STEPS-DESIGN §2; v1 AdsScenario). PRIMARY: one card per scenario
// - the logline, the shots as a proportional bar with the end card hatched, runtime against the
// template's band. RAIL: the scenarios. INSPECTOR: the scenario's shots (image, motion, super),
// its music bed and end card. HEADER: "generate scenarios" is a receipt (disarmed until an idea
// is picked); picking is an op that can be changed and undone.
import { useState } from "react";

import type { AdScenarioView, PartView, ScriptData } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { cx } from "@gt/ui/components/cx.ts";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { RailList } from "@gt/ui/components/part/RailList.tsx";
import { secs, walk } from "@gt/ui/components/part/part.ts";
import { Provenance } from "@gt/ui/components/provenance/Provenance.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import type { EditorProps } from "./PartEditor.tsx";
import s from "./Editors.module.css";

type Data = Extract<ScriptData, { face: "ads" }>;

function ShotBar({ sc }: { readonly sc: AdScenarioView }) {
  const total = sc.runtimeS || 1;
  return (
    <div className={s.shots} role="img" aria-label={`${sc.shots.length} shots and an end card, ${secs(sc.runtimeS)}`}>
      {sc.shots.map((sh) => (
        <span key={sh.id} className={s.shot} style={{ width: `${(sh.durationS / total) * 100}%` }} />
      ))}
      <span className={s.endcard} style={{ width: `${(sc.endCard.holdS / total) * 100}%` }} />
    </div>
  );
}

export function ScenariosEditor({ frame, send, busy, error, data: d }: EditorProps<PartView<"script">> & { readonly data: Data }) {
  // Untouched (undefined) follows the data - the first item, or what is picked - so a list that
  // lands after mount (an act's output) has a selection; null is the operator's Esc.
  const [chosen, setSel] = useState<string | null | undefined>(undefined);
  const sel = chosen === undefined ? d.picked ?? d.scenarios[0]?.id ?? null : chosen;
  const sc = d.scenarios.find((x) => x.id === sel);
  const pick = (): void | false => (sc === undefined || busy || sc.id === d.picked ? false : send({ op: "pick-scenario", scenarioId: sc.id }));
  const [lo, hi] = d.range;
  useKeys(
    "part.script",
    {
      item: ({ index }) => {
        const next = walk(d.scenarios.map((x) => x.id), sel, index === 0 ? 1 : -1);
        if (next === null) return false;
        setSel(next);
      },
      adopt: pick,
      deselect: () => setSel(null),
    },
    { facts: sc === undefined ? [] : ["item"] },
  );
  const acts = (
    <>
      {sc !== undefined && sc.id !== d.picked && <Button label="pick" size="sm" tone="emerald" shortcut={{ mode: "part.script", verb: "adopt" }} disabled={busy} onPress={() => void pick()} />}
      {frame.acts}
    </>
  );
  return (
    <PartWorkspace
      {...frame}
      acts={acts}
      mode="part.script"
      facts={sc === undefined ? [] : ["item"]}
      rail={{
        label: "scenarios",
        children:
          d.scenarios.length === 0 ? (
            <div className={s.railHead}>
              <Empty label="no scenarios" />
            </div>
          ) : (
            <RailList
              label="scenarios"
              items={d.scenarios}
              idOf={(x) => x.id}
              selected={sel}
              onSelect={setSel}
              row={(x) => (
                <div className={s.rr}>
                  <div className={s.rrTop}>
                    <span>{x.id === d.picked ? "●" : "○"}</span>
                    <span>{`${x.shots.length} shots · ${secs(x.runtimeS)}`}</span>
                  </div>
                  <div className={cx(s.rrTitle, s.clamp1)}>{x.title}</div>
                </div>
              )}
            />
          ),
      }}
      primary={{
        label: "scenarios",
        children: (
          <>
            {error !== null && (
              <div className={s.err}>
                <ErrorLine message={error} live />
              </div>
            )}
            <div className={s.bar}>
              {d.idea === null ? <Chip label="no idea picked" tone="amber" casing="lower" /> : <Chip label={d.idea.angle} value={d.idea.title} casing="lower" />}
              {d.ideaChanged && <Chip label="idea changed" tone="amber" casing="lower" />}
              <span className={s.mono}>{`band ${secs(lo)}–${secs(hi)}`}</span>
              {d.engine !== undefined && <Provenance model={d.engine.model} vendor={d.engine.provider} cost={d.engine.usd === null ? (d.engine.unpricedReason ?? "unpriced") : `$${d.engine.usd.toFixed(2)}`} />}
            </div>
            {d.scenarios.length === 0 ? (
              <Empty label="no scenarios" />
            ) : (
              <div className={s.well}>
                {d.scenarios.map((x) => (
                  <button key={x.id} type="button" className={s.idea} aria-pressed={x.id === d.picked} data-scenario={x.id} {...(x.id === sel ? { "data-on": "" } : {})} onClick={() => setSel(x.id)}>
                    <span className={s.ititle}>{x.title}</span>
                    <span className={s.work}>{x.logline}</span>
                    <ShotBar sc={x} />
                    <span className={cx(s.mono, (x.runtimeS < lo || x.runtimeS > hi) && s.missing)}>{`${secs(x.runtimeS)} / ${d.targetS === null ? "—" : secs(d.targetS)}`}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ),
      }}
      inspector={{
        label: "scenario",
        children:
          sc === undefined ? (
            <Empty label="no scenario selected" />
          ) : (
            <>
              <div className={s.sect}>
                <p className={s.claim}>{sc.title}</p>
                <p className={s.work}>{sc.logline}</p>
              </div>
              {sc.shots.map((sh, i) => (
                <div key={sh.id} className={s.finding}>
                  <span className={s.tc}>{`${i + 1} · ${secs(sh.durationS)}`}</span>
                  <div>
                    <p className={s.work}>{sh.image}</p>
                    <p className={s.fsub}>{sh.motion}</p>
                    {sh.super !== null && <Chip label="super" value={sh.super} casing="lower" />}
                  </div>
                </div>
              ))}
              <dl className={s.kv}>
                <dt>music</dt>
                <dd>{sc.musicMood}</dd>
                <dt>end card</dt>
                <dd>{[sc.endCard.line, sc.endCard.cta].filter((x) => x !== null).join(" · ")}</dd>
                <dt>hold</dt>
                <dd>{secs(sc.endCard.holdS)}</dd>
              </dl>
            </>
          ),
      }}
    />
  );
}
