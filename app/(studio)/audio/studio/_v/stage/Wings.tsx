// WAITING IN THE WINGS (variant "stage", kind `candidates`): the players who could take one spot,
// standing in the wing beside the player they would replace. Choosing an instrument by ear is the
// clearest thing on this stage: every candidate has two big play marks (on its own, a solo audition;
// with the band, it steps in and the stage shows it standing in) and one way to keep it, which is the
// agent's own proposal for that candidate - nothing is kept by a button the agent did not offer.
import { useState } from "react";

import type { StudioActionOf, StudioNodeOf, StudioRole } from "@gt/domain/audio.studio";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { RoleGlyph } from "@gt/ui/components/studio-stage/RoleGlyph.tsx";
import { ROLE_WORDS } from "@gt/ui/components/studio-stage/stage.ts";

import { soundKey } from "../../_host/press.ts";
import { disarmed, keepProposal, type StageCtx } from "./ctx.ts";
import s from "./stage.module.css";

type Mode = "alone" | "in_mix";

/** The player a candidates piece is about: its role and, when it replaces one, who stands there now. */
export function wingTarget(node: StudioNodeOf<"candidates">, ctx: StageCtx): { readonly role: StudioRole; readonly now: string | null } {
  if ("role" in node.for) return { role: node.for.role, now: null };
  const stemId = node.for.stem;
  const row = ctx.stems?.rows.find((r) => r.id === stemId);
  return { role: row?.role ?? "lead", now: row?.label ?? null };
}

export function Wings({ node, ctx }: { readonly node: StudioNodeOf<"candidates">; readonly ctx: StageCtx }) {
  const { turn, transport, audition } = ctx;
  const target = wingTarget(node, ctx);
  // The last audition pressed here: a play that failed says so on its own card, not only on the house row.
  const [tried, setTried] = useState<string | null>(null);
  const hear = (c: string, mode: Mode): StudioActionOf<"hear"> => ({ id: `local.hear.${node.id}.${c}.${mode}`, kind: "hear", label: "hear", node: node.id, candidate: c, mode });
  const ask = node.prompt ?? (target.now === null ? `a new ${ROLE_WORDS[target.role]}` : `another ${ROLE_WORDS[target.role]}`);
  return (
    <section className={s.wings} aria-label={`waiting in the wings: ${ask}`}>
      <div className={s.wingsHead}>
        <span className={s.wingsTitle}>
          <RoleGlyph role={target.role} />
          {`Who should play the ${ROLE_WORDS[target.role]}?`}
        </span>
        {node.source !== undefined && <SourceTag kind={node.source} />}
      </div>
      <p className={s.wingsWords}>
        {target.now === null ? `Looking for ${ask}. ` : `Now on stage: ${target.now}. Looking for ${ask}. `}
        Hear each one on its own, then with the band.
      </p>
      <ol className={s.cands}>
        {node.rows.map((c) => {
          const hearing = audition?.node === node.id && audition.candidate === c.id ? audition.mode : null;
          const keep = keepProposal(turn, node.id, c.id);
          const why = keep === null ? null : disarmed(keep, ctx.offline, ctx.thinking);
          const mark = (mode: Mode, words: string) => {
            const has = mode === "alone" ? c.alone !== undefined : c.inMix !== undefined;
            return has ? (
              <span className={s.candEar}>
                <EarButton
                  state={transport.stateOf(soundKey(turn.id, node.id, `${c.id}:${mode}`))}
                  name={`${c.name} ${words}`}
                  onPress={() => {
                    setTried(`${c.id}:${mode}`);
                    ctx.press(hear(c.id, mode));
                  }}
                  big
                />
                {words}
              </span>
            ) : (
              <span className={s.candNone}>{mode === "alone" ? "no solo take yet" : "not tried with the band yet"}</span>
            );
          };
          return (
            <li key={c.id} className={s.cand} data-hearing={hearing ?? undefined}>
              <div className={s.candHead}>
                <b className={s.candName}>{c.name}</b>
                {hearing !== null && <Chip label={hearing === "alone" ? "playing on its own" : "stepping in now"} tone="cyan" casing="lower" dot />}
              </div>
              {(c.words.length > 0 || c.measured !== undefined) && (
                <div className={s.candWords}>
                  {c.words.map((w) => (
                    <Chip key={w} label={w} casing="lower" />
                  ))}
                  {c.measured !== undefined && <span className={s.measured}>{c.measured}</span>}
                </div>
              )}
              <div className={s.candActs}>
                {mark("alone", "on its own")}
                {mark("in_mix", "with the band")}
              </div>
              {transport.failed !== null && transport.state === "idle" && tried?.startsWith(`${c.id}:`) === true && <ErrorLine message={`could not play it: ${transport.failed}`} />}
              {keep === null ? (
                <span className={s.candNone}>To keep this one, ask for it in the chat.</span>
              ) : (
                <span className={s.keep}>
                  <Button label={keep.label} tone="cyan" size="sm" disabled={why !== null} onPress={() => ctx.press(keep)} />
                  <span className={s.candNone}>{why ?? "asks the agent to put this player in the band"}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
