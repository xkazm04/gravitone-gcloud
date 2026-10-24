"use client";

// CUT · THE AD'S FINISH (v1 AdsFinish.tsx + cut/ads/finish.ts). RAIL: the picked scenario's shots,
// each with its clip state and its super. PRIMARY: the end card (CTA, line, hold) and the aspects
// - each on or off, each its own render behind its own receipt (v1 answered 202 and polled, with
// no price). INSPECTOR: finish.ts's checks - clips and the CTA block a render; the music bed is
// unmeasured without a take, never a fail; loudness is held to -14 LUFS ±1 once a render reports.
import { useState } from "react";

import type { AdFinishData, PartView } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { cx } from "@gt/ui/components/cx.ts";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { RailList } from "@gt/ui/components/part/RailList.tsx";
import { secs } from "@gt/ui/components/part/part.ts";

import type { EditorProps } from "./PartEditor.tsx";
import { ScoreField } from "./ScoreField.tsx";
import s from "./Cut.module.css";

export function CutFinish({ frame, send, busy, error, act, data: d }: EditorProps<PartView<"cut">> & { readonly data: AdFinishData }) {
  const [sel, setSel] = useState<string | null>(null);
  const shot = d.shots.find((x) => x.id === sel) ?? null;
  const blocking = d.checks.filter((c) => c.blocking && c.verdict === "fail");
  return (
    <PartWorkspace
      {...frame}
      // Its own mode, bound to nothing: the finish has no clock, so the timeline's part.cut rows
      // (play, shuttle, frame, edit, gap, zoom) would be a legend of keys nothing here answers.
      mode="part.finish"
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
              selected={sel}
              onSelect={setSel}
              row={(x) => (
                <div className={s.rr}>
                  <div className={s.rrTop}>
                    <span>{secs(x.durationS)}</span>
                    <span className={x.clip ? s.ok : s.rose}>{x.clip ? "clip" : "no clip"}</span>
                  </div>
                  <div className={s.rrTitle}>{x.super === "" ? x.image : x.super}</div>
                </div>
              )}
            />
          ),
      }}
      primary={{
        label: "finish",
        children: (
          <>
            {error !== null && (
              <div className={s.err}>
                <ErrorLine message={error} live />
              </div>
            )}
            <div className={s.bar}>
              <span className={s.read}>{secs(d.runtimeS)}</span>
              {d.targetS !== null && <span className={s.mono}>{`target ${secs(d.targetS)}`}</span>}
              {d.scenario !== null && <Chip label={d.scenario.title} casing="lower" />}
            </div>
            {d.scenario === null ? (
              <Empty label="no scenario picked" />
            ) : (
              <>
                {shot !== null && (
                  <div className={s.form}>
                    <ScoreField label={`super · ${shot.id}`} value={shot.super} commit={(text) => send({ op: "super", shotId: shot.id, text })} />
                  </div>
                )}
                <h3 className={s.h}>end card</h3>
                <div className={cx(s.form, s.sect)}>
                  <ScoreField label="call to action" value={d.endCard.cta} commit={(value) => send({ op: "end-card", field: "cta", value })} />
                  <ScoreField label="line" value={d.endCard.line} commit={(value) => send({ op: "end-card", field: "line", value })} />
                  <ScoreField label="hold · s" type="number" narrow value={String(d.endCard.holdS)} commit={(v) => send({ op: "end-hold", holdS: Number(v) })} />
                </div>
                <h3 className={s.h}>aspects</h3>
                <div className={s.aspects}>
                  {d.aspects.map((a) => (
                    <div key={a.aspect} className={s.aspect} {...(a.on ? { "data-on": "" } : {})} data-aspect={a.aspect}>
                      <div className={s.row}>
                        <strong className={s.grow}>{a.aspect}</strong>
                        <span className={s.mono}>{a.px}</span>
                      </div>
                      <Chip label={a.on ? "on" : "off"} casing="lower" pressed={a.on} onPress={() => !busy && send({ op: "aspect", aspect: a.aspect, on: !a.on })} />
                      {a.on &&
                        (blocking.length > 0 ? (
                          <Chip label="render" value="blocked" tone="amber" casing="lower" name={`render blocked: ${blocking.map((c) => c.deny ?? c.label).join(" · ")}`} />
                        ) : (
                          <Button label={a.export === null ? "render" : "render again"} size="sm" tone="cyan" onPress={() => act("render-aspect", `render ${a.aspect}`, a.aspect)} />
                        ))}
                      {a.export !== null && (
                        <div className={s.row}>
                          <span className={cx(s.grow, s.mono)}>{a.export.label}</span>
                          {a.export.mode === "dry" && <Chip label="dry" casing="lower" />}
                          {a.export.blob !== undefined && <Button label="mp4" size="sm" href={`/api/blob/${a.export.blob}`} />}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ),
      }}
      inspector={{
        label: "checks",
        children: (
          <div role="list" aria-label="checks">
            {d.checks.map((c) => (
              <div key={c.id} className={s.check} role="listitem" data-check={c.id}>
                <span className={s.checkLabel}>{c.label}</span>
                <span className={s.checkVal}>{c.value}</span>
                <span className={cx(s.v, s[c.verdict])}>{c.verdict}</span>
                {c.deny !== undefined && <p className={cx(s.deny, s.checkDeny)}>{c.deny}</p>}
              </div>
            ))}
          </div>
        ),
      }}
    />
  );
}
