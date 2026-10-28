// PLACEHOLDER for the "canvas" variant (stacked playable result cards per turn). Its builder replaces this
// folder. It lists the visible turn's pieces and proposals by kind, with play marks wired through
// `dispatch`, so the host is exercised end to end before a real layout lands.
import { STUDIO_ACTION_GOES } from "@gt/domain/audio.studio.kinds";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { TransportRow } from "@gt/ui/components/audio/TransportRow.tsx";

import { localPlay, nodeSound } from "../../_host/press.ts";
import type { VariantProps } from "../../_host/types.ts";
import s from "./placeholder.module.css";

export function Variant({ session, dispatch, transport }: VariantProps) {
  const t = session.visible?.turn;
  if (t === undefined) return <p className={s.note}>The agent has not answered yet.</p>;
  const now = transport.sounding;
  return (
    <div className={s.wrap} data-variant="canvas">
      <TransportRow name={now?.name ?? "the first piece"} state={transport.state} clock={transport.clock} duration={transport.duration} failed={transport.failed} onToggle={() => (now === null ? dispatch(localPlay(t.show.find((n) => nodeSound(t, n) !== null)?.id ?? "track")) : transport.stop())} onSeek={transport.seek} onStop={transport.stop} />
      <section className={s.col} aria-label="pieces">
        <CapsHeading text="canvas placeholder: pieces" tally={{ value: t.show.length, label: "shown" }} />
        {t.show.map((n) => {
          const snd = nodeSound(t, n);
          return (
            <div key={n.id} className={s.piece} data-kind={n.kind}>
              {snd !== null && <EarButton state={transport.stateOf(snd.key)} name={snd.name} onPress={() => dispatch(localPlay(n.id))} />}
              <b>{n.kind}</b>
              <span>{n.title ?? n.id}</span>
              {n.source !== undefined && <SourceTag kind={n.source} />}
              {n.kind === "stems" &&
                n.rows.map((r) => {
                  const one = nodeSound(t, n, r.id);
                  return one === null ? (
                    <span key={r.id} className={s.stem}>{`${r.label} (no audio yet)`}</span>
                  ) : (
                    <span key={r.id} className={s.stem}>
                      <EarButton state={transport.stateOf(one.key)} name={r.label} onPress={() => dispatch(localPlay(n.id, r.id))} />
                      {r.label}
                    </span>
                  );
                })}
            </div>
          );
        })}
      </section>
      <section className={s.col} aria-label="next steps">
        <CapsHeading text="next steps" tally={{ value: t.actions.length, label: "proposed" }} />
        {t.actions.map((a) => (
          <div key={a.id} className={s.piece} data-kind={a.kind}>
            <Button label={a.label} size="sm" tone={STUDIO_ACTION_GOES[a.kind] === "agent" ? "cyan" : "neutral"} onPress={() => dispatch(a)} />
            <span>{`${a.kind}${a.why === undefined ? "" : ` · ${a.why}`}`}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
