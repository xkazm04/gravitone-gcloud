"use client";

// ONE GENERATION ON THE TAKES BOARD (spark suno-advisor S1, composition c). The row head is the prompt:
// compact (number, name, model, where it came from and what came of it, the verdict's keep/drop, the
// style's first line, the fields it changed) and, opened, the whole SunoPromptCard with Copy all and
// Open Suno. Then three columns: the local sketch (play), take a, take b - each take with its measured
// and heard facts (TakeFacts), the verdicts about it, and its own verdict control (./TakeVerdict.tsx);
// an empty take column is a dashed slot with the attach for that clip.
import { useEffect, useMemo } from "react";

import type { StudioTasteLine } from "@gt/domain/audio.suno";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";
import { SunoPromptCard } from "@gt/ui/components/suno/SunoPromptCard.tsx";
import { TakeFacts } from "@gt/ui/components/suno/TakeFacts.tsx";
import { stamp } from "@gt/ui/components/suno/suno.ts";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";
import { Wave } from "@gt/ui/components/wave/Wave.tsx";

import { localPlay, soundKey } from "../_host/press.ts";
import type { SunoVerdict } from "../_host/suno.ts";
import type { VariantProps } from "../_host/types.ts";
import { changedFields, rowId, styleHead, takeSoundKey, type BoardRow, type PlacedTake, type TakeSlot } from "./board.ts";
import { TakeVerdict } from "./TakeVerdict.tsx";
import s from "./board.module.css";

const PEAKS = 120;
const WAVE_W = 480;
const WAVE_H = 40;

type Shared = {
  readonly v: VariantProps;
  readonly taste: readonly StudioTasteLine[];
  readonly copy: (text: string) => Promise<string | null>;
  readonly canSend: boolean;
};

export function Row({ row, open, onOpen, newest, shared }: { readonly row: BoardRow; readonly open: boolean; readonly onOpen: (open: boolean) => void; readonly newest: boolean; readonly shared: Shared }) {
  const { version } = row;
  const { transport } = shared.v;
  const hrefs = useMemo(() => [...(version.sketch !== undefined ? [version.sketch.node.mix.href] : []), ...row.slots.flatMap((x) => (x.take?.facts !== undefined ? [x.take.facts.href] : []))], [version.sketch, row.slots]);
  const { decode } = transport;
  useEffect(() => {
    if (hrefs.length > 0) decode(hrefs);
  }, [decode, hrefs]);
  const cardId = `board-prompt-${version.promptId}`;
  return (
    <li id={rowId(version.promptId)} className={s.row} data-newest={newest || undefined} aria-label={`generation ${row.n}, ${version.node.name ?? version.promptId}`}>
      <div className={s.head}>
        <PromptHead row={row} open={open} onOpen={onOpen} controls={cardId} />
        {open && (
          <div id={cardId} className={s.card}>
            <SunoPromptCard node={version.node} taste={shared.taste} copy={shared.copy} />
          </div>
        )}
      </div>
      <Sketch row={row} v={shared.v} />
      {row.slots.map((slot) => (
        <Take key={slot.clip} slot={slot} promptId={version.promptId} shared={shared} />
      ))}
      {row.extra.length > 0 && (
        <div className={s.extra}>
          <CapsHeading text="more takes" tally={{ value: row.extra.length }} level={4} />
          {row.extra.map((t) => (
            <Facts key={t.takeId} take={t} v={shared.v} />
          ))}
        </div>
      )}
    </li>
  );
}

function PromptHead({ row, open, onOpen, controls }: { readonly row: BoardRow; readonly open: boolean; readonly onOpen: (open: boolean) => void; readonly controls: string }) {
  const { node } = row.version;
  const fields = changedFields(row.version);
  return (
    <header className={s.prompt}>
      <div className={s.promptTop}>
        <span className={s.gen} aria-hidden="true">
          {row.n}
        </span>
        <h3 className={s.name}>{node.name ?? node.promptId}</h3>
        <Chip label="model" value={node.model} casing="lower" />
        {row.kept !== undefined && <Chip label={row.kept ? "kept" : "dropped"} tone={row.kept ? "emerald" : "rose"} casing="lower" />}
        <span className={s.grow} />
        <Toggle label="prompt" on={open} onToggle={onOpen} controls={controls} name={`${open ? "fold" : "open"} the prompt of ${node.name ?? node.promptId}`} />
      </div>
      {!open && <p className={s.style}>{styleHead(node.style)}</p>}
      <div className={s.chips}>
        <Chip label="id" value={node.promptId} ghost casing="lower" />
        {node.parent !== undefined && <Chip label="from" value={node.parent} ghost casing="lower" />}
        {row.children.map((c) => (
          <Chip key={c} label="next" value={c} ghost casing="lower" />
        ))}
        {!open && fields.map((f) => <Chip key={f.field} label={f.field} {...(f.n > 1 ? { value: f.n } : {})} tone="violet" casing="lower" name={`changed ${f.field}${f.n > 1 ? `, ${f.n} times` : ""}`} />)}
      </div>
      {!open && node.because !== undefined && <blockquote className={s.because}>{node.because}</blockquote>}
    </header>
  );
}

function Sketch({ row, v }: { readonly row: BoardRow; readonly v: VariantProps }) {
  const sk = row.version.sketch;
  const { transport, dispatch } = v;
  return (
    <section className={s.col} aria-label={`sketch of ${row.version.promptId}`}>
      <CapsHeading text="sketch" level={4} />
      {sk === undefined ? (
        <Ghost label="no local sketch of this prompt" />
      ) : (
        <>
          <div className={s.play}>
            <EarButton state={transport.stateOf(soundKey(sk.turnId, sk.node.id))} name={sk.node.title ?? "the sketch"} onPress={() => dispatch(localPlay(sk.node.id), sk.turnId)} />
            <span className={s.title}>{sk.node.title ?? "local sketch"}</span>
          </div>
          <div className={s.wave}>
            <Wave peaks={transport.peaks(sk.node.mix.href, PEAKS) ?? []} width={WAVE_W} height={WAVE_H} tone="violet" stretch />
          </div>
          <div className={s.chips}>
            {sk.node.bpm !== undefined && <Chip label="bpm" value={sk.node.bpm} casing="lower" />}
            {sk.node.key !== undefined && <Chip label="key" value={sk.node.key} casing="lower" />}
            {sk.node.source !== undefined && <Chip label={sk.node.source} ghost casing="lower" />}
          </div>
        </>
      )}
    </section>
  );
}

function Facts({ take, v }: { readonly take: PlacedTake; readonly v: VariantProps }) {
  const { transport, suno } = v;
  const f = take.facts;
  if (f === undefined) return <Chip label="take" value={take.takeId} ghost casing="lower" name={`take ${take.takeId}, no facts here`} />;
  const key = takeSoundKey(f.takeId);
  return (
    <>
      <div className={s.play}>
        <EarButton state={transport.stateOf(key)} name={f.name} onPress={() => transport.toggle(key, [{ id: "mix", href: f.href }], { name: f.name, spans: null })} />
        <div className={s.wave}>
          <Wave peaks={transport.peaks(f.href, PEAKS) ?? []} width={WAVE_W} height={WAVE_H} tone="cyan" stretch />
        </div>
      </div>
      <TakeFacts facts={f} onListen={suno.listen} />
    </>
  );
}

function Said({ verdict }: { readonly verdict: SunoVerdict }) {
  const { keep, off, clip } = verdict.verdict;
  return (
    <li className={s.said}>
      <span className={s.chips}>
        <span className={s.at}>{stamp(verdict.at)}</span>
        {clip === "both" && <Chip label="both" ghost casing="lower" />}
        {keep !== undefined && <Chip label={keep ? "keep" : "drop"} tone={keep ? "emerald" : "rose"} casing="lower" />}
        {(off ?? []).map((o) => (
          <Chip key={o} label={o} tone="amber" casing="lower" name={`off: ${o}`} />
        ))}
      </span>
      <q className={s.words}>{verdict.text}</q>
    </li>
  );
}

function Take({ slot, promptId, shared }: { readonly slot: TakeSlot; readonly promptId: string; readonly shared: Shared }) {
  return (
    <section className={s.col} aria-label={`take ${slot.clip} of ${promptId}`}>
      <CapsHeading text={`take ${slot.clip}`} {...(slot.verdicts.length > 0 ? { tally: { value: slot.verdicts.length, label: slot.verdicts.length === 1 ? "verdict" : "verdicts" } } : {})} level={4} />
      {slot.take === undefined ? <Ghost label={`take ${slot.clip} not attached`} /> : <Facts take={slot.take} v={shared.v} />}
      {slot.verdicts.length > 0 && (
        <ol className={s.saidList} aria-label={`verdicts on take ${slot.clip}`}>
          {slot.verdicts.map((x) => (
            <Said key={x.turnId} verdict={x} />
          ))}
        </ol>
      )}
      <TakeVerdict promptId={promptId} clip={slot.clip} send={shared.v.suno.sendVerdict} disabled={!shared.canSend} hasTake={slot.take !== undefined} />
    </section>
  );
}
