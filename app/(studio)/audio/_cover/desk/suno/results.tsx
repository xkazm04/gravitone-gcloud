"use client";

// WHAT A SEND ANSWERS (spark suno-covers): its receipt before it goes, its five steps while it runs, its two takes
// and the keep of one. Suno's own words (a read's answer, a refusal) are drawn verbatim. The compositions
// (./SunoA.tsx, ./SunoB.tsx, ./SunoC.tsx) place these; none writes a sentence of its own.
import { useState } from "react";

import type { CoverSunoSend, CoverSunoTake } from "@gt/domain/cover.suno";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Receipt } from "@gt/ui/components/produce/Receipt.tsx";
import { answerProse } from "@gt/ui/components/suno/reads.ts";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import { exportWarning } from "../words.ts";
import { ago, clockS, planFacts, SEND_TONE, stepsDone, stepsOf, STEP_TONE, TAKE_TONE } from "./suno.ts";
import type { SunoFlow } from "./useSunoSend.ts";
import s from "./suno.module.css";

/** The receipt a press answered, with the cover's consequence above its Confirm when the song is third-party and uncleared. */
export function ReceiptBlock({ flow }: { readonly flow: SunoFlow }) {
  const [ceiling, setCeiling] = useState("");
  const l = flow.launching;
  if (l === null) return null;
  const warning = exportWarning(flow.record.rights);
  return (
    <div className={s.receipt}>
      {warning !== undefined && (
        <div className={s.consequence} role="group" aria-label="export consequence">
          <p>{warning}</p>
        </div>
      )}
      <Receipt receipt={l.receipt} {...(l.changes === undefined ? {} : { changes: l.changes })} ceiling={ceiling} onCeiling={setCeiling} onConfirm={flow.confirm} busy={flow.busy} nowMs={l.readAtMs} />
      <div className={s.row}>
        <Button label="Back" size="sm" onPress={flow.cancel} />
        {flow.error !== null && <ErrorLine message={flow.error} live />}
      </div>
    </div>
  );
}

/** A send's five steps, each with where it stands. */
export function Steps({ send, flow }: { readonly send: CoverSunoSend; readonly flow: SunoFlow }) {
  const steps = stepsOf(send, flow.record.suno?.uploadClipId);
  return (
    <ol className={s.steps} aria-label={`send ${send.n} steps`}>
      {steps.map((x) => (
        <li key={x.key}>
          <Chip label={x.key} value={x.state} tone={STEP_TONE[x.state]} dot ghost={x.state === "pending"} casing="lower" name={`${x.key} ${x.state}`} />
        </li>
      ))}
    </ol>
  );
}

/** How many of a send's five steps are done. */
export function StepsTally({ send, flow }: { readonly send: CoverSunoSend; readonly flow: SunoFlow }) {
  const steps = stepsOf(send, flow.record.suno?.uploadClipId);
  return <Tally value={stepsDone(steps)} of={steps.length} label="steps" />;
}

/** A send's head: its place, its state, what it asked for and what it spent. */
export function SendHead({ send, flow }: { readonly send: CoverSunoSend; readonly flow: SunoFlow }) {
  const filed = flow.record.suno?.filed;
  return (
    <div className={s.row}>
      <Chip label={`send ${send.n}`} value={send.state} tone={SEND_TONE[send.state]} dot casing="lower" />
      <time className={s.time} dateTime={send.at}>
        {flow.readAtMs === null ? "" : ago(send.at, flow.readAtMs)}
      </time>
      {planFacts(send.plan).map((f) => (
        <Chip key={f.label} label={f.label} {...(f.value === undefined ? {} : { value: f.value })} ghost casing="lower" />
      ))}
      {send.creditsSpent !== undefined && <Tally value={send.creditsSpent} label="song credits" />}
      {filed?.send === send.n && <Chip label="remix" value={`take ${filed.take}`} tone="emerald" casing="lower" />}
      {send.error !== undefined && <ErrorLine message={send.error} />}
    </div>
  );
}

function Read({ take }: { readonly take: CoverSunoTake }) {
  const r = take.read;
  if (r === undefined) return null;
  const prose = r.answer === undefined ? "" : answerProse(r.answer);
  return (
    <div className={s.read}>
      <div className={s.chips}>
        {r.status !== "complete" && <Chip label={r.status} tone="amber" ghost casing="lower" />}
        {r.bpm !== undefined && <Chip label="bpm" value={Math.round(r.bpm)} casing="lower" />}
        {r.key !== undefined && <Chip label="key" value={r.key} casing="lower" />}
        {r.genre?.map((g) => <Chip key={`g-${g}`} label={g} tone="violet" ghost casing="lower" />)}
        {r.mood?.map((m) => <Chip key={`m-${m}`} label={m} ghost casing="lower" />)}
      </div>
      {prose !== "" && <blockquote className={s.quote}>{prose}</blockquote>}
    </div>
  );
}

/** The keep: a press, then Suno's price for the file and the one press that spends it. */
function Keep({ send, take, flow }: { readonly send: CoverSunoSend; readonly take: CoverSunoTake; readonly flow: SunoFlow }) {
  const k = flow.keeping;
  const mine = k !== null && k.send === send.n && k.take === take.take ? k : null;
  const refused = flow.keepError !== null && flow.keepError.send === send.n && flow.keepError.take === take.take ? flow.keepError.message : null;
  const q = mine?.quote ?? null;
  return (
    <div className={s.keep}>
      {q === null ? (
        <Button label="Keep" size="sm" tone="violet" disabled={flow.keepBusy} onPress={() => flow.keep(send.n, take.take)} />
      ) : (
        <span className={s.spend} role="group" aria-label={`keep ${take.title ?? `take ${take.take}`} for ${q.credits} suno download credit`}>
          <Chip label={`${q.credits} download credit`} {...(q.left === undefined ? {} : { value: `${q.left} left` })} tone="amber" casing="lower" name={q.left === undefined ? `${q.credits} download credit` : `${q.credits} download credit · ${q.left} left`} />
          <Button label={`Spend ${q.credits} credit · ${q.format}`} size="sm" tone="violet" disabled={flow.keepBusy} pending={flow.keepBusy} onPress={flow.spend} />
          <Button label="Cancel" size="sm" disabled={flow.keepBusy} onPress={flow.keepCancel} />
        </span>
      )}
      {refused !== null && <ErrorLine message={refused} live />}
    </div>
  );
}

/** One take: title, length, state, the link out, Suno's read, a refusal verbatim, the keep. `compact`: no read. */
export function TakeCard({ send, take, flow, compact = false }: { readonly send: CoverSunoSend; readonly take: CoverSunoTake; readonly flow: SunoFlow; readonly compact?: boolean }) {
  const filed = flow.record.suno?.filed;
  const isFiled = filed?.send === send.n && filed.take === take.take;
  const title = take.title ?? `take ${take.take}`;
  return (
    <article className={s.take} data-filed={isFiled ? "" : undefined} data-state={take.state} aria-label={`send ${send.n} take ${take.take}`}>
      <div className={s.row}>
        <span className={s.takeN}>{take.take}</span>
        <span className={s.takeTitle}>{title}</span>
        {take.durationS !== undefined && <span className={s.time}>{clockS(take.durationS)}</span>}
        <Chip label={take.state} tone={TAKE_TONE[take.state]} dot casing="lower" />
        {isFiled && <Chip label="remix" tone="emerald" casing="lower" />}
        {take.songUrl !== undefined && (
          <a className={s.out} href={take.songUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${title} on suno.com, new tab`}>
            suno.com
          </a>
        )}
      </div>
      {!compact && <Read take={take} />}
      {take.readRefused !== undefined && <ErrorLine message={take.readRefused} />}
      {take.error !== undefined && <ErrorLine message={take.error} />}
      {take.state === "complete" && !isFiled && <Keep send={send} take={take} flow={flow} />}
    </article>
  );
}

/** The two takes of a send, a pending row for one Suno has not answered yet. */
export function takesOf(send: CoverSunoSend): readonly CoverSunoTake[] {
  return ([1, 2] as const).map((n): CoverSunoTake => send.takes.find((t) => t.take === n) ?? { take: n, state: "pending" });
}
