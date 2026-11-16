"use client";

// THE DIRECTOR'S BAND (the contest winner "Knockout", the owner's fourth why): the outside agent is
// the tournament director and the owner the only judge. One band across the desk holds whether the
// agent is listening, its newest line, the owner's one-line direction, up to three proposals - a
// rule, a launch or a post run, each with its reason and keep / remove - and RAN and LEARNED, two
// chips that open into the detail behind their one-line sums.
//
// Keep and remove are the taste chips' pattern (suno/TasteChips): each row holds its own press,
// pending while the write is on its way and the refusal verbatim under the band when it did not
// go. Keeping runs the act on the server; the agent never keeps and never votes.
import { useEffect, useRef, useState } from "react";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import type { DetailItem, DirectorView, ProposalView } from "./songlab.ts";
import s from "./DirectorBand.module.css";

export type Press = { readonly kind: "pending" } | { readonly kind: "refused"; readonly reason: string };

export type DirectorBandProps = {
  readonly view: DirectorView;
  /** The agent's turns are the fixture's script, not an agent's. */
  readonly scripted?: boolean;
  /** Directions offered under the field when it has focus. */
  readonly directions?: readonly string[];
  /** Each resolves with the refusal in words, or null when it went. */
  readonly onSay: (text: string) => Promise<string | null>;
  readonly onKeep: (p: ProposalView) => Promise<string | null>;
  readonly onDrop: (p: ProposalView) => Promise<string | null>;
  /** /kit only: a detail drawn open, rows drawn mid-press. */
  readonly seedPop?: "ran" | "learned";
  readonly seedPress?: Readonly<Record<string, Press>>;
};

const MAX_DIRECTION = 240;

function Detail({ kind, items, scripted }: { readonly kind: "ran" | "learned"; readonly items: readonly DetailItem[]; readonly scripted: boolean }) {
  return (
    <div className={s.pop} role="region" aria-label={kind} data-role="sl-pop">
      <h3 className={s.popHead}>
        <span className={s.caps}>{kind}</span>
        {scripted && <span className={s.scripted}>scripted</span>}
      </h3>
      {items.length === 0 ? (
        <div className={s.li}>
          <span className={s.k}>—</span>
          <div>nothing yet</div>
        </div>
      ) : (
        items.map((it, i) => (
          <div key={`${it.k}-${i}`} className={s.li}>
            <span className={cx(s.k, it.k === "ear" && s.ear)}>{it.k}</span>
            <div>
              {it.line}
              {it.detail !== undefined && <small>{it.detail}</small>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Proposal({ p, press, onKeep, onDrop }: { readonly p: ProposalView; readonly press: Press | undefined; readonly onKeep: () => void; readonly onDrop: () => void }) {
  const pending = press?.kind === "pending";
  return (
    <div className={cx(s.prop, p.state === "kept" && s.kept)} data-role="sl-prop" data-pending={pending || undefined}>
      <span className={s.kind} data-role="sl-prop-kind">
        {p.kind}
      </span>
      <span className={s.act} data-role="sl-prop-act">
        {p.label}
      </span>
      <span className={s.why} data-role="sl-prop-why" title={p.why}>
        {p.why}
      </span>
      <span className={s.ops} role="group" aria-label={p.label}>
        {p.state === "kept" ? (
          <span className={s.keptmark}>kept</span>
        ) : (
          <>
            <Button label={pending ? "keep…" : "keep"} tone="emerald" size="sm" disabled={pending} onPress={onKeep} />
            <Button label={pending ? "remove…" : "remove"} size="sm" disabled={pending} onPress={onDrop} />
          </>
        )}
      </span>
    </div>
  );
}

export function DirectorBand({ view, scripted = false, directions = [], onSay, onKeep, onDrop, seedPop, seedPress = {} }: DirectorBandProps) {
  const [pop, setPop] = useState<"ran" | "learned" | null>(seedPop ?? null);
  const [text, setText] = useState("");
  const [press, setPress] = useState<Readonly<Record<string, Press>>>(seedPress);
  const [said, setSaid] = useState<Press | null>(null);
  const band = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (pop === null || seedPop !== undefined) return;
    const away = (e: PointerEvent) => {
      if (e.target instanceof Node && band.current?.contains(e.target) === true) return;
      setPop(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [pop, seedPop]);

  const run = (key: string, act: () => Promise<string | null>) => {
    if (press[key]?.kind === "pending") return;
    setPress((p) => ({ ...p, [key]: { kind: "pending" } }));
    void act().then((reason) =>
      setPress((p) => {
        const rest = Object.fromEntries(Object.entries(p).filter(([k]) => k !== key));
        return reason === null ? rest : { ...rest, [key]: { kind: "refused", reason } };
      }),
    );
  };
  const say = (words: string) => {
    const t = words.trim().slice(0, MAX_DIRECTION);
    if (t === "" || said?.kind === "pending") return;
    setSaid({ kind: "pending" });
    void onSay(t).then((reason) => {
      setSaid(reason === null ? null : { kind: "refused", reason });
      if (reason === null) setText("");
    });
  };
  const listening = view.presence === "listening";
  const shown = view.proposals.filter((p) => p.state !== "dropped");
  const refusals = Object.entries(press).flatMap(([k, v]) => (v.kind === "refused" ? [{ k, reason: v.reason }] : []));

  return (
    <section ref={band} className={s.director} aria-label="director" data-role="sl-director">
      <div className={s.who}>
        <span className={cx(s.presence, listening && s.listening)} data-role="sl-presence" role="status">
          <span className={s.dot} aria-hidden="true" />
          {listening ? "listening" : "nobody listening yet"}
        </span>
        {scripted && <span className={s.scripted}>scripted</span>}
      </div>
      <p className={cx(s.say, !listening && s.away)} data-role="sl-say" aria-live="polite" title={view.line?.text}>
        {view.line !== undefined && <span className={s.at}>{view.line.at}</span>}
        {view.line?.text ?? ""}
        {view.waiting !== undefined && <span className={s.waiting}>“{view.waiting}” waits</span>}
      </p>
      <form
        className={s.dirform}
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          say(text);
        }}
      >
        <div className={s.dirwrap}>
          <input className={s.field} aria-label="direction" placeholder="direction · less chorus looping" value={text} maxLength={MAX_DIRECTION} onChange={(e) => setText(e.currentTarget.value)} />
          {directions.length > 0 && (
            <div className={s.suggest} role="group" aria-label="directions">
              {directions.map((d) => (
                <button key={d} type="button" onClick={() => say(d)}>
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button label={said?.kind === "pending" ? "Send…" : "Send"} tone="cyan" size="sm" submit disabled={said?.kind === "pending"} />
        {view.inbox > 0 && <Chip label="in inbox" value={view.inbox} tone="amber" casing="lower" />}
      </form>
      <span className={cx(s.caps, s.proposesCap)}>proposes</span>
      <div className={s.props}>
        {shown.length === 0 ? (
          <span className={s.none}>nothing proposed</span>
        ) : (
          shown.map((p) => <Proposal key={p.id} p={p} press={press[p.id]} onKeep={() => run(p.id, () => onKeep(p))} onDrop={() => run(p.id, () => onDrop(p))} />)
        )}
      </div>
      <div className={s.dchips}>
        {(["ran", "learned"] as const).map((k) => (
          <button key={k} type="button" className={s.dchip} aria-expanded={pop === k} onClick={() => setPop(pop === k ? null : k)} data-role="sl-dchip">
            <span className={s.caps}>{k}</span>
            <span>{k === "ran" ? view.ranSum : view.learnedSum}</span>
          </button>
        ))}
      </div>
      {pop !== null && <Detail kind={pop} items={pop === "ran" ? view.ran : view.learned} scripted={scripted} />}
      {(refusals.length > 0 || said?.kind === "refused") && (
        <div className={s.refused}>
          {said?.kind === "refused" && <ErrorLine message={said.reason} live />}
          {refusals.map((r) => (
            <ErrorLine key={r.k} message={r.reason} live />
          ))}
        </div>
      )}
    </section>
  );
}
