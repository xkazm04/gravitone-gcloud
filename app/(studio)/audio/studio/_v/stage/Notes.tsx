// THE DIRECTOR'S NOTE CARD AND THE ENGINEER'S READOUT (variant "stage"). `heard` is a note pinned at
// the stage edge: what you asked, with the words the agent took and what it took them to mean, and
// the words it did not use. `pull` is the same card's question with its two answers as playable cues
// (each side's own sound) and, where the agent offered it, the press that settles it. `measures` is
// the sound engineer's readout in the corner: plain figures with an ok / check / problem mark.
import type { StudioNodeOf } from "@gt/domain/audio.studio";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";

import { soundKey } from "../../_host/press.ts";
import { disarmed, proposalsAt, type StageCtx } from "./ctx.ts";
import s from "./stage.module.css";

type Part = { readonly text: string; readonly to?: string };

/** The sentence cut into plain runs and the runs the agent linked, in order, never overlapping. */
export function linkedRuns(sentence: string, links: readonly { readonly words: string; readonly to: string }[]): readonly Part[] {
  const lower = sentence.toLowerCase();
  const hits = links
    .map((l) => ({ at: lower.indexOf(l.words.toLowerCase()), len: l.words.length, to: l.to }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at);
  const out: Part[] = [];
  let i = 0;
  for (const h of hits) {
    if (h.at < i) continue;
    if (h.at > i) out.push({ text: sentence.slice(i, h.at) });
    out.push({ text: sentence.slice(h.at, h.at + h.len), to: h.to });
    i = h.at + h.len;
  }
  if (i < sentence.length) out.push({ text: sentence.slice(i) });
  return out;
}

export function HeardCard({ node }: { readonly node: StudioNodeOf<"heard">; readonly ctx: StageCtx }) {
  const runs = linkedRuns(node.sentence, node.links);
  return (
    <section className={s.card} aria-label="what the agent heard">
      <span className={s.cardKicker}>
        director&apos;s note
        {node.source !== undefined && <SourceTag kind={node.source} />}
      </span>
      <p className={s.said}>
        {runs.map((r, i) =>
          r.to === undefined ? (
            <span key={i}>{r.text}</span>
          ) : (
            <mark key={i} className={s.took} title={r.to}>
              {r.text}
            </mark>
          ),
        )}
      </p>
      {node.links.length > 0 ? (
        <ul className={s.links}>
          {node.links.map((l) => (
            <li key={`${l.words}|${l.to}`}>
              <b>{l.words}</b>
              {` means ${l.to}`}
            </li>
          ))}
        </ul>
      ) : (
        <span className={s.cardQuiet}>The agent did not tie any of your words to a choice.</span>
      )}
      {node.unheard !== undefined && node.unheard.length > 0 && <span className={s.cardQuiet}>{`Not used: ${node.unheard.join(", ")}`}</span>}
    </section>
  );
}

export function PullCard({ node, ctx }: { readonly node: StudioNodeOf<"pull">; readonly ctx: StageCtx }) {
  const { turn, transport } = ctx;
  const settles = proposalsAt(turn, node.id);
  return (
    <section className={s.card} aria-label={`a question: ${node.question}`}>
      <span className={s.cardKicker}>
        two ways to go
        {node.source !== undefined && <SourceTag kind={node.source} />}
      </span>
      <b className={s.question}>{node.question}</b>
      <div className={s.cues}>
        {node.sides.map((side, i) => {
          const key = soundKey(turn.id, node.id, `side${i}`);
          const settle = settles.find((a) => a.kind === "settle_pull" && a.side === i);
          const why = settle === undefined ? null : disarmed(settle, ctx.offline, ctx.thinking);
          return (
            <div key={side.label} className={s.cue}>
              <span className={s.cueHead}>
                {side.audio !== undefined ? (
                  <EarButton state={transport.stateOf(key)} name={`how ${side.label} sounds`} onPress={() => side.audio !== undefined && transport.toggle(key, [{ id: `side${i}`, href: side.audio.href }], { name: `how ${side.label} sounds` })} />
                ) : (
                  <span className={s.cardQuiet}>no sound for this side</span>
                )}
                <b>{side.label}</b>
              </span>
              <span className={s.cueSays}>{side.says}</span>
              {settle !== undefined && <Button label={settle.label} tone="cyan" size="sm" disabled={why !== null} onPress={() => ctx.press(settle)} />}
              {why !== null && <span className={s.cardQuiet}>{why}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const TONE_WORDS = { ok: "fine", warn: "worth a look", bad: "a problem" } as const;

export function Readout({ node }: { readonly node: StudioNodeOf<"measures">; readonly ctx: StageCtx }) {
  return (
    <section className={s.readout} aria-label="the sound engineer's readout">
      <span className={s.readoutHead}>
        engineer&apos;s readout
        {node.source !== undefined && <SourceTag kind={node.source} />}
      </span>
      <dl className={s.readoutRows}>
        {node.rows.map((r) => (
          <div key={r.label} className={s.readoutRow} data-tone={r.tone}>
            <dt>{r.label}</dt>
            <dd>
              {r.tone !== undefined && <span className={s.readoutDot} role="img" aria-label={TONE_WORDS[r.tone]} />}
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
