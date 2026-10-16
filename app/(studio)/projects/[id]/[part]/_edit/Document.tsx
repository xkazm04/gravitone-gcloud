"use client";

// SCRIPT · THE BEAT DOCUMENT (STEPS-DESIGN §2; v1 ExplainerScript, HypothesisColumn, GatePanel,
// ConstraintLedger, the _matrix tabs, StickyNotebook, RecalibrateControl, VersionBar). PRIMARY:
// the selected candidate's beats, with seconds per beat and the cards each beat states. RAIL:
// the candidates (runtime against the project's clock - v1 never read it), the version history
// (restore is forward), the notes. INSPECTOR: one view at a time - the render gate, the
// constraint ledger, coverage, spend, tracks - of the selected candidate (v1's page tabs).
// HEADER: adopt is an op; compose and recalibrate are receipts. A staged recalibration sits
// above the document with accept / accept over the gate (recorded) / discard.
//
// Gate, ledger and refusal sentences are the work and are drawn verbatim. Deleted from v1: the
// "your clock is not read" admission (the clock is read), the matrix explainer paragraph, the
// recalibrate hints, the band lines (INVENTORY §2, prose to delete).
import { useState } from "react";

import type { Candidate, NoteKind, PartView, ScriptData } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { cx } from "@gt/ui/components/cx.ts";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { RailList } from "@gt/ui/components/part/RailList.tsx";
import { clock, secs, walk } from "@gt/ui/components/part/part.ts";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import { Findings } from "./Findings.tsx";
import type { EditorProps, Send } from "./PartEditor.tsx";
import s from "./Editors.module.css";

type Data = Extract<ScriptData, { face: "document" }>;
const VIEWS = ["gate", "ledger", "coverage", "spend", "tracks"] as const;
type View = (typeof VIEWS)[number];

function Usage({ c, d, view, send }: { readonly c: Candidate; readonly d: Data; readonly view: View; readonly send: Send }) {
  if (view === "tracks")
    return (
      <>
        {c.beats.map((b) => (
          <div key={b.at} className={s.use}>
            <span className={cx(s.ell, s.mono)}>{`${b.at} ${b.label}`}</span>
            <span className={s.mono}>{secs(b.seconds)}</span>
            <span className={s.faint}>{b.cards.length}</span>
          </div>
        ))}
      </>
    );
  const rows = view === "spend" ? [...c.usage].filter((u) => u.use === "spoken").sort((a, b) => b.seconds - a.seconds) : c.usage;
  const top = Math.max(1, ...rows.map((u) => u.seconds));
  return (
    <>
      {rows.map((u) => (
        <div key={u.cardId} className={s.use} data-usage={u.cardId}>
          <span className={cx(s.ell, u.use !== "spoken" && s.faint)}>{u.title}</span>
          {view === "spend" ? (
            <span className={s.spendTrack} aria-hidden="true">
              <span className={s.spend} style={{ width: `${(u.seconds / top) * 100}%` }} />
            </span>
          ) : (
            <span className={s.mono}>{u.use === "spoken" ? secs(u.seconds) : u.use}</span>
          )}
          <select
            className={s.select}
            aria-label={`note on ${u.cardId}`}
            value=""
           
            onChange={(e) => {
              const kind = e.currentTarget.value as NoteKind;
              if (kind !== "custom") send({ op: "note-add", cardId: u.cardId, kind });
            }}
          >
            <option value="">note</option>
            {d.noteKinds
              .filter((k) => k.kind !== "custom")
              .map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
          </select>
        </div>
      ))}
    </>
  );
}

export function DocumentEditor({ frame, send, busy, error, data: d }: EditorProps<PartView<"script">> & { readonly data: Data }) {
  // Untouched (undefined) follows the data - the first item, or what is picked - so a list that
  // lands after mount (an act's output) has a selection; null is the operator's Esc.
  const [chosen, setSel] = useState<string | null | undefined>(undefined);
  const sel = chosen === undefined ? d.adopted ?? d.candidates[0]?.id ?? null : chosen;
  const [tab, setTab] = useState<View>("gate");
  const c = d.candidates.find((x) => x.id === sel);
  const adopt = (): void | false => (c === undefined || busy ? false : send({ op: "adopt", candidateId: d.adopted === c.id ? null : c.id }));

  useKeys(
    "part.script",
    {
      item: ({ index }) => {
        const next = walk(d.candidates.map((x) => x.id), sel, index === 0 ? 1 : -1);
        if (next === null) return false;
        setSel(next);
      },
      adopt,
      view: () => setTab(VIEWS[(VIEWS.indexOf(tab) + 1) % VIEWS.length] ?? "gate"),
      deselect: () => setSel(null),
    },
    { facts: c === undefined ? [] : ["item"] },
  );

  const over = (x: Candidate): boolean => d.targetS !== null && x.durationS > d.targetS * 1.25;
  const acts = (
    <>
      {c !== undefined && <Button label={d.adopted === c.id ? "unadopt" : "adopt"} size="sm" tone="emerald" shortcut={{ mode: "part.script", verb: "adopt" }} onPress={() => void adopt()} />}
      {frame.acts}
    </>
  );
  return (
    <PartWorkspace
      {...frame}
      acts={acts}
      mode="part.script"
      facts={c === undefined ? [] : ["item"]}
      rail={{
        label: "candidates",
        children: (
          <>
            {d.candidates.length === 0 ? (
              <div className={s.railHead}>
                <Empty label="no candidates" />
              </div>
            ) : (
              <RailList
                label="candidates"
                items={d.candidates}
                idOf={(x) => x.id}
                selected={sel}
                onSelect={setSel}
                row={(x) => (
                  <div className={s.rr}>
                    <div className={s.rrTop}>
                      <span>{x.id === d.adopted ? "●" : "○"}</span>
                      <span className={s.ell}>{x.engine}</span>
                      <span className={cx(over(x) && s.missing)}>{`${clock(x.durationS)} / ${clock(d.targetS)}`}</span>
                      <span className={x.gate.blocked ? s.missing : s.on}>{x.gate.blocked ? `▲ ${x.gate.violations}` : "✓"}</span>
                    </div>
                    <div className={cx(s.rrTitle, s.clamp1)}>{x.title}</div>
                  </div>
                )}
              />
            )}
            <div className={s.railSect} role="region" aria-label="versions and notes">
              <h3 className={s.h}>versions</h3>
              {d.versions.map((v, i) => (
                <div key={v.id} className={s.row}>
                  <span className={cx(s.mono, s.grow, s.ell)}>{v.label}</span>
                  {v.override !== undefined && <Chip label="override" tone="amber" casing="lower" />}
                  {i < d.versions.length - 1 && d.staged === undefined && <Button label="restore" size="sm" onPress={() => send({ op: "restore-version", versionId: v.id })} />}
                </div>
              ))}
              <h3 className={s.h}>
                notes <Tally value={d.notes.length} />
              </h3>
              {d.notes.map((n) => (
                <div key={n.id} className={s.row} data-note={n.id}>
                  <span className={cx(s.grow, s.ell)}>{`${n.cardTitle} · ${n.label}`}</span>
                  <Button label="remove" size="sm" onPress={() => send({ op: "note-remove", noteId: n.id })} />
                </div>
              ))}
            </div>
          </>
        ),
      }}
      primary={{
        label: "beat document",
        children: (
          <>
            {error !== null && (
              <div className={s.err}>
                <ErrorLine message={error} live />
              </div>
            )}
            <div className={s.bar}>
              {d.writtenAgainst.claims > 0 && <span className={s.mono}>{`${d.writtenAgainst.claims} claims · ${d.writtenAgainst.loadBearing} load-bearing · ${d.writtenAgainst.mechanisms} mechanisms · ${d.writtenAgainst.reversals} reversals · ${d.writtenAgainst.kept} kept`}</span>}
              {d.conflicts.length > 0 && <Chip label="descoped but spoken" value={d.conflicts.length} tone="amber" />}
              {d.candidates.length > 0 && <Chip label="enforced" value={`${d.rollup.enforced}%`} casing="lower" />}
            </div>
            {d.staged !== undefined && (
              <div className={s.staged} data-staged={d.staged.id}>
                <div className={s.row}>
                  <Chip label={d.staged.label} tone="amber" casing="lower" />
                  <span className={cx(s.mono, s.grow)}>{d.staged.gate.blocked ? `gate blocks on ${d.staged.gate.blocking.join(", ")}` : "gate clean"}</span>
                  {d.staged.gate.blocked ? (
                    <Button label="accept over the gate" size="sm" tone="amber" onPress={() => send({ op: "accept-over-gate", versionId: d.staged?.id ?? "" })} />
                  ) : (
                    <Button label="accept" size="sm" tone="emerald" onPress={() => send({ op: "accept", versionId: d.staged?.id ?? "" })} />
                  )}
                  <Button label="discard" size="sm" onPress={() => send({ op: "discard-staged", versionId: d.staged?.id ?? "" })} />
                </div>
                {d.staged.refusals.map((r) => (
                  <p key={r} className={s.risk}>
                    {r}
                  </p>
                ))}
              </div>
            )}
            {c === undefined ? (
              <Empty label="no candidate selected" />
            ) : (
              <article className={s.doc} aria-label={c.title}>
                <h2 className={s.mvh}>{c.title}</h2>
                <p className={s.risk}>{`risk — ${c.weakness}`}</p>
                {c.beats.map((b) => (
                  <div key={b.at} className={s.beat} data-beat={b.at}>
                    <span className={s.tc}>{b.at}</span>
                    <div className={s.sect}>
                      <span className={s.blabel}>
                        {b.connector !== null && <span className={cx(s.conn, b.connector === "AND THEN" && s.defect)}>{b.connector.toLowerCase()}</span>}
                        <span>{b.kind}</span>
                        <span>{b.label}</span>
                        <span className={s.faint}>{secs(b.seconds)}</span>
                      </span>
                      <p className={s.work}>{b.text}</p>
                      {b.cards.length > 0 && (
                        <div className={s.chips}>
                          {b.cards.map((id) => (
                            <Chip key={id} label={id} casing="lower" />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </article>
            )}
          </>
        ),
      }}
      inspector={{
        label: "candidate checks",
        children:
          c === undefined ? (
            <Empty label="no candidate selected" />
          ) : (
            <>
              <div className={s.bar}>
                <Seg label="view" options={VIEWS.map((v) => ({ value: v, label: v }))} value={tab} onChange={setTab} />
              </div>
              {tab === "gate" && (
                <>
                  <div className={s.bar}>
                    <Chip label={c.gate.blocked ? "blocked" : "pass"} tone={c.gate.blocked ? "rose" : "emerald"} casing="lower" />
                    <Chip label="violations" value={c.gate.violations} casing="lower" />
                    <Chip label="unmeasured" value={c.gate.unmeasured} casing="lower" />
                    <Chip label="enforced" value={`${c.gate.enforced}%`} casing="lower" />
                  </div>
                  <Findings findings={c.gate.findings} />
                </>
              )}
              {tab === "ledger" &&
                c.ledger.map((r) => (
                  <div key={r.unknownId} className={s.finding}>
                    <span className={cx(s.v, r.state === "at-risk" ? s.violation : r.state === "honoured" ? s.pass : s.unmeasured)}>{r.state}</span>
                    <div>
                      <p className={s.work}>{r.unknown}</p>
                      {r.how !== "" && <p className={s.fsub}>{r.how}</p>}
                      {r.quote !== undefined && <p className={s.quote}>{`${r.at ?? ""} “${r.quote}”`}</p>}
                    </div>
                  </div>
                ))}
              {(tab === "coverage" || tab === "spend" || tab === "tracks") && <Usage c={c} d={d} view={tab} send={send} />}
            </>
          ),
      }}
    />
  );
}
