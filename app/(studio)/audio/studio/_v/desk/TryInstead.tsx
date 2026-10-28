// "TRY INSTEAD" (spark audio-agent-studio, variant "desk"): the candidates kind as a drawer docked
// under the lane it would replace - or under a dashed ghost lane when it offers a new part. Choosing
// an instrument by ear is the clearest thing on the desk: a row per candidate in big type, its plain
// words, two big play marks (on its own, inside the track) and one "use" that asks the agent. The
// part as it is now heads the drawer, so every candidate is heard against what it would replace.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { RoleMark, ROLE_WORDS } from "@gt/ui/components/studio-desk/RoleMark.tsx";
import { deskAct, proposal, type Placed } from "@gt/ui/components/studio-desk/desk.ts";

import { localPlay, nodeSound, soundKey } from "../../_host/press.ts";
import { turnOf, type DeskCtx } from "./ctx.ts";
import s from "./drawer.module.css";

type Ear = { readonly name: string; readonly key: string | null; readonly onPress: () => void };

function Hear({ ctx, ear, words }: { readonly ctx: DeskCtx; readonly ear: Ear; readonly words: string }) {
  if (ear.key === null)
    return (
      <span className={s.hear} data-none="true">
        <span className={s.noSound} aria-hidden="true" />
        {`${words}: no sound yet`}
      </span>
    );
  return (
    <span className={s.hear}>
      <EarButton state={ctx.v.transport.stateOf(ear.key)} name={ear.name} onPress={ear.onPress} big />
      {words}
    </span>
  );
}

/** The candidates kind. */
export function TryInstead({ placed, ctx }: { readonly placed: Placed<"candidates">; readonly ctx: DeskCtx }) {
  const { node, turnId } = placed;
  const stems = ctx.desk.stems[0];
  const forStem = "stem" in node.for ? node.for.stem : null;
  const row = forStem === null ? undefined : stems?.node.rows.find((r) => r.id === forStem);
  const role = "role" in node.for ? node.for.role : row?.role;
  const st = stems === undefined ? undefined : turnOf(ctx.v, stems.turnId);
  const nowAlone = stems === undefined || st === undefined || row === undefined ? null : nodeSound(st, stems.node, row.id);
  const track = ctx.desk.track[0];
  const tt = track === undefined ? undefined : turnOf(ctx.v, track.turnId);
  const nowMix = track === undefined || tt === undefined ? null : nodeSound(tt, track.node);
  const title = row !== undefined ? `Try instead of the ${row.label}` : forStem !== null ? `Try instead of the part "${forStem}"` : `A new part: ${role === undefined ? "" : ROLE_WORDS[role]}`;
  return (
    <div className={s.wrap} data-ghost={forStem === null}>
      {forStem === null && role !== undefined && (
        <div className={s.ghost}>
          <RoleMark role={role} />
          <b>{`new part: ${ROLE_WORDS[role]}`}</b>
          <span className={s.meta}>not in the track yet. Choose one below and the agent adds it.</span>
        </div>
      )}
      <section className={s.drawer} aria-label={title}>
        <header className={s.head}>
          <b className={s.title}>{title}</b>
          {node.prompt !== undefined && <span className={s.meta}>{`asked for: ${node.prompt}`}</span>}
          {node.source !== undefined && <SourceTag kind={node.source} />}
          <span className={s.meta}>{`${node.rows.length} to hear. Listen on its own, then inside the track, then choose.`}</span>
        </header>
        {row !== undefined && (
          <div className={s.row} data-now="true">
            <span className={s.who}>
              <span className={s.kicker}>playing now</span>
              <b className={s.name}>{row.label}</b>
            </span>
            <Hear ctx={ctx} words="on its own" ear={{ name: `${row.label} on its own`, key: nowAlone?.key ?? null, onPress: () => stems !== undefined && ctx.press(localPlay(stems.node.id, row.id), stems.turnId) }} />
            <Hear ctx={ctx} words="in the track" ear={{ name: "the track as it is now", key: nowMix?.key ?? null, onPress: () => track !== undefined && ctx.press(localPlay(track.node.id), track.turnId) }} />
            <span className={s.keepNote}>keep it by choosing nothing</span>
          </div>
        )}
        {node.rows.map((c) => {
          const hear = (mode: "alone" | "in_mix") => proposal(ctx.actions, "hear", (a) => a.node === node.id && a.candidate === c.id && a.mode === mode) ?? deskAct.hear(node.id, c.id, mode);
          const use = proposal(ctx.actions, "use_candidate", (a) => a.node === node.id && a.candidate === c.id) ?? deskAct.use(node.id, c.id, `use the ${c.name}`);
          return (
            <div key={c.id} className={s.row}>
              <span className={s.who}>
                <b className={s.name}>{c.name}</b>
                <span className={s.words}>
                  {c.words.map((w) => (
                    <Chip key={w} label={w} casing="lower" />
                  ))}
                </span>
                {c.measured !== undefined && <span className={s.meta}>{c.measured}</span>}
              </span>
              <Hear ctx={ctx} words="on its own" ear={{ name: `${c.name} on its own`, key: c.alone === undefined ? null : soundKey(turnId, node.id, `${c.id}:alone`), onPress: () => ctx.press(hear("alone"), turnId) }} />
              <Hear ctx={ctx} words="in the track" ear={{ name: `${c.name} inside the track`, key: c.inMix === undefined ? null : soundKey(turnId, node.id, `${c.id}:in_mix`), onPress: () => ctx.press(hear("in_mix"), turnId) }} />
              <span className={s.use}>
                <Button label={use.label} tone="cyan" disabled={!ctx.agentOpen} onPress={() => ctx.press(use, turnId)} />
                <span className={s.meta}>{ctx.agentOpen ? "asks the agent to swap it in" : "the agent is not listening"}</span>
              </span>
            </div>
          );
        })}
      </section>
    </div>
  );
}
