"use client";

// One act in full (ledger.js `renderDetail`): what, who, when and how that time is known,
// the record it is about with the way to it, the error verbatim, every field, the acts
// around it, and the record as the agent reads it.
//
// Related acts are read on selection by a Server Action (the same subject, or the same
// run, counted exactly - read.ts readRelated). Only the newest request's answer is applied
// (client-state: async-race-guards): J held down fires one read per row it passes, and a
// slow answer for a row already left must not paint over the row now selected.

import { useEffect, useState } from "react";

import { errorMessage } from "@gt/domain/errors";
import type { Event } from "@gt/domain/event";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";
import { JsonBlock } from "@gt/ui/components/jsonl/Json.tsx";
import { LedgerLink } from "@gt/ui/components/ledgerlink/LedgerLink.tsx";
import { cx } from "@gt/ui/components/cx.ts";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { ledgerFor, subjectLink } from "../../_shell/links.ts";
import type { Related } from "./read.ts";
import { fieldsOf, isDerived, relative, shortTime, timeOf, toneOf } from "./vocab.ts";
import s from "./ledger.module.css";

export type DetailProps = {
  readonly event: Event | null;
  /** The selected seq when no act holds it (an `ev` link to an act this ledger lacks). */
  readonly missing?: number;
  readonly nowMs: number;
  readonly related: (input: { seq: number }) => Promise<ActionResult<Related & { readonly event: Event }>>;
  readonly onSelect: (e: Event) => void;
  readonly onQuery: (q: string) => void;
  readonly onClose: () => void;
  readonly onCopy: (text: string, done: string) => void;
};

/**
 * A read's answer, or the words of one that REJECTED - a Server Action whose request never
 * came back (a dropped connection, a redeploy) rejects rather than answering `ok: false`.
 * Never a rejection itself, so the caller's settle (a spinner off, an error drawn) runs.
 */
export function settled<T>(p: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  return p.catch((e: unknown): ActionResult<T> => ({ ok: false, error: { error: errorMessage(e), code: "unavailable" } }));
}

type Rel = { readonly seq: number; readonly value: Related } | { readonly seq: number; readonly error: string };

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export function Detail({ event: e, missing, nowMs, related, onSelect, onQuery, onClose, onCopy }: DetailProps) {
  const [rel, setRel] = useState<Rel | null>(null);
  const seq = e?.seq ?? null;
  useEffect(() => {
    if (seq === null) return;
    let latest = true;
    const t = window.setTimeout(() => {
      void settled(related({ seq })).then((r) => {
        if (latest) setRel(r.ok ? { seq, value: r.value } : { seq, error: r.error.error });
      });
    }, 120);
    return () => {
      latest = false;
      window.clearTimeout(t);
    };
  }, [seq, related]);

  const head = (
    <h2 className={s.dtHead}>
      event
      {e !== null && <span className={s.dtSeq}>#{e.seq}</span>}
      <span className={s.sp} />
      {e !== null && <LedgerLink href={ledgerFor(e.subject.id)} subject={e.subject.id} label="subject" />}
      <button type="button" className={s.close} onClick={onClose} aria-label="close detail">
        ×
      </button>
    </h2>
  );
  if (e === null) {
    return (
      <aside className={s.detail} aria-label="event detail">
        {head}
        {missing === undefined ? (
          <div className={s.dtEmpty}>0 selected</div>
        ) : (
          // The words actions.ts relatedEvents answers for the same seq.
          <div className={s.dt}>
            <ErrorLine message={`ledger: no event #${missing}`} />
          </div>
        )}
      </aside>
    );
  }
  const link = subjectLink(e);
  const t = timeOf(e);
  const err = text(e.data["error"]);
  const note = text(e.data["note"]) ?? text(e.data["reason"]);
  const mine = rel !== null && rel.seq === e.seq ? rel : null;
  const runId = text(e.data["runId"]);
  return (
    <aside className={s.detail} aria-label="event detail">
      {head}
      <div className={s.dt}>
        <div>
          <div className={cx(s.dtType, s[toneOf(e.type)])}>{e.type}</div>
          <div className={cx(s.dtActor, s[e.actor.kind])}>
            <Glyph name={e.actor.kind} className={s.dtGlyph} />
            <span className={s.kd}>{e.actor.kind}</span>
            <span>{e.actor.id}</span>
          </div>
        </div>
        <div className={s.dtTime}>
          <span>{t}</span>
          <div className={s.row}>
            <span className={s.rel}>{relative(t, nowMs)}</span>
            <Chip label={isDerived(e) ? "time derived ≈" : "time recorded"} casing="lower" />
          </div>
        </div>
        <div className={s.dtSubj}>
          <Chip label={e.subject.kind} casing="lower" />
          <div className={s.lbl}>{link.label}</div>
          <div className={s.id}>{e.subject.id}</div>
          <div className={s.acts}>
            <Button size="sm" tone="cyan" label="Open record" glyphAfter="chevR" href={link.href} />
            <Button size="sm" label="history" tally={{ value: mine !== null && "value" in mine ? mine.value.bySubject + 1 : 1 }} onPress={() => onQuery(e.subject.id)} />
          </div>
        </div>
        {err !== null && (
          <div>
            <CapsHeading text="error · verbatim" variant="section" level={4} />
            <ErrorLine message={err} />
          </div>
        )}
        {note !== null && <div className={s.dtNote}>{note}</div>}
        <Facts facts={fieldsOf(e)} />
        {mine !== null && "error" in mine && <ErrorLine message={`related: ${mine.error}`} />}
        {mine !== null && "value" in mine && mine.value.total > 0 && (
          <div>
            <CapsHeading text="related" variant="section" level={4} tally={{ value: mine.value.total }} />
            <div className={s.relList}>
              {mine.value.events.map((x) => (
                <button key={x.seq} type="button" onClick={() => onSelect(x)}>
                  <span className={s.n}>#{x.seq}</span>
                  <span className={s.t}>{shortTime(timeOf(x))}</span>
                  <span className={cx(s.ty, s[toneOf(x.type)])}>{x.type}</span>
                </button>
              ))}
            </div>
            {mine.value.total > mine.value.events.length && (
              <button type="button" className={s.relMore} onClick={() => onQuery(runId ?? e.subject.id)}>
                +{mine.value.total - mine.value.events.length} more
              </button>
            )}
          </div>
        )}
        <div>
          <div className={s.dtJsonH}>
            <CapsHeading text="raw · json" variant="section" level={4} />
            <Button size="sm" glyph="doc" label="copy" onPress={() => onCopy(JSON.stringify(e, null, 2), `event #${e.seq} copied`)} />
          </div>
          <JsonBlock text={JSON.stringify(e, null, 2)} label={`event ${e.seq} as JSON`} />
        </div>
      </div>
    </aside>
  );
}
