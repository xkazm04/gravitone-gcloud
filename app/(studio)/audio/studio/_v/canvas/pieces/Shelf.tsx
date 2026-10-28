"use client";

// THE INSTRUMENT SHELF (canvas, WP3): the owner's "instrument guidance is critical" moment. Each
// candidate is a tile: its name, its timbre words, what was measured, and two big listen pills -
// "on its own" and "in the song" - then "use this one", which asks the agent. One ear for the page:
// pressing another pill switches straight to it, so comparing by ear is press, press, press. The
// tile that sounds lights up and says which way it is heard. Degraded: a candidate with no audio
// one way shows that pill disarmed with the reason; "use" is disarmed (with why) while no agent can
// answer. "Use" sends the turn's own proposal when it made one, so the agent hears its own words.
import { useState } from "react";

import type { StudioAction, StudioCandidate } from "@gt/domain/audio.studio";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { PlayMark } from "@gt/ui/components/audio/AudioPreview.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import type { EarState } from "@gt/ui/components/audio/useEar.ts";

import { soundKey } from "../../../_host/press.ts";
import type { PieceProps } from "../registry.tsx";
import s from "./shelf.module.css";

type Mode = "alone" | "in_mix";
const MODE_WORDS: Readonly<Record<Mode, string>> = { alone: "on its own", in_mix: "in the song" };

function Listen({ state, mode, name, missing, onPress }: { readonly state: EarState; readonly mode: Mode; readonly name: string; readonly missing: string | null; readonly onPress: () => void }) {
  const verb = state === "idle" ? "play" : "stop";
  return (
    <button
      type="button"
      className={s.listen}
      data-state={state}
      data-mode={mode}
      aria-label={missing ?? `${verb} ${name} ${MODE_WORDS[mode]}`}
      aria-busy={state === "loading"}
      disabled={missing !== null}
      onClick={onPress}
    >
      <PlayMark on={state === "playing"} className={s.mark} />
      <span>{MODE_WORDS[mode]}</span>
    </button>
  );
}

export function Shelf({ node, ctx }: PieceProps<"candidates">) {
  const { turn, transport } = ctx;
  const [pressed, setPressed] = useState<string | null>(null);
  const target = "stem" in node.for ? (ctx.stemName(node.for.stem) ?? node.for.stem) : null;
  const heading = target !== null ? `Choose by ear: a new sound for the ${target}` : `Choose by ear: a new ${"role" in node.for ? node.for.role : "part"}`;
  const hearKey = (c: StudioCandidate, mode: Mode): string => soundKey(turn.id, node.id, `${c.id}:${mode}`);
  const hear = (c: StudioCandidate, mode: Mode): StudioAction => ({ id: `local.hear.${c.id}.${mode}`, kind: "hear", label: `${c.name} ${MODE_WORDS[mode]}`, node: node.id, candidate: c.id, mode });
  const use = (c: StudioCandidate): StudioAction =>
    turn.actions.find((a) => a.kind === "use_candidate" && a.node === node.id && a.candidate === c.id) ?? { id: `ask.use.${c.id}`, kind: "use_candidate", label: `use ${c.name}`, node: node.id, candidate: c.id };
  const listen = (c: StudioCandidate, mode: Mode): void => {
    setPressed(hearKey(c, mode));
    ctx.press(hear(c, mode));
  };
  const failedHere = (c: StudioCandidate): boolean => transport.failed !== null && transport.state === "idle" && (pressed === hearKey(c, "alone") || pressed === hearKey(c, "in_mix"));
  const sounding = node.rows.find((c) => transport.stateOf(hearKey(c, "alone")) !== "idle" || transport.stateOf(hearKey(c, "in_mix")) !== "idle");
  return (
    <section className={s.shelf} aria-label={heading} data-provisional={node.source === "illustrative" || undefined}>
      <header className={s.head}>
        <h4 className={s.title}>{node.title ?? heading}</h4>
        {node.source !== undefined && <SourceTag kind={node.source} />}
        {node.prompt !== undefined && <p className={s.prompt}>{`You asked for ${node.prompt}.`}</p>}
        <p className={s.how}>{"Hear each one on its own, then inside the song, and keep the one you like."}</p>
      </header>
      <ul className={s.tiles}>
        {node.rows.map((c) => {
          const alone = transport.stateOf(hearKey(c, "alone"));
          const inMix = transport.stateOf(hearKey(c, "in_mix"));
          const on = alone !== "idle" ? "alone" : inMix !== "idle" ? "in_mix" : null;
          const act = use(c);
          return (
            <li key={c.id} className={s.tile} data-sounding={on ?? undefined}>
              <div className={s.tileHead}>
                <b className={s.name}>{c.name}</b>
                {on !== null && <Chip label="playing" value={MODE_WORDS[on]} tone="cyan" dot casing="lower" />}
              </div>
              <div className={s.words}>
                {c.words.length === 0 ? <span className={s.quiet}>no words for its sound yet</span> : c.words.map((w) => <Chip key={w} label={w} casing="lower" />)}
              </div>
              {c.measured !== undefined && <p className={s.measured}>{c.measured}</p>}
              <div className={s.pills}>
                <Listen state={alone} mode="alone" name={c.name} missing={c.alone === undefined ? `${c.name} has no sound on its own yet` : null} onPress={() => listen(c, "alone")} />
                <Listen state={inMix} mode="in_mix" name={c.name} missing={c.inMix === undefined ? `${c.name} has no version inside the song yet` : null} onPress={() => listen(c, "in_mix")} />
              </div>
              {failedHere(c) && <p className={s.failed}>{`That did not play: ${transport.failed ?? ""}`}</p>}
              {c.inMix === undefined && <p className={s.quiet}>{"No version inside the song yet: the agent can make one if you use it."}</p>}
              <div className={s.use}>
                <Button label="use this one" tone="cyan" size="sm" disabled={ctx.askBlocked !== null} onPress={() => ctx.press(act)} />
                {ctx.askBlocked !== null && <span className={s.quiet}>{ctx.askBlocked}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      {sounding === undefined && node.rows.length > 1 && <p className={s.quiet}>{"Tip: press another pill while one plays; it switches straight over, so you can compare."}</p>}
    </section>
  );
}
