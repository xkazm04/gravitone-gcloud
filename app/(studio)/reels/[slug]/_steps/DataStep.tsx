"use client";

// The data step: the table the seat researched as its numbers (unit, granularity, periods, entities, source and
// licence, the continuity gate's measures and its failure sentences verbatim), kept or sent back with a note.
// A sent-back table's note is what the next `reel-data` turn reads (the launch reads it from the record).
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { TextArea } from "@gt/ui/components/field/Field.tsx";

import type { ActionResult } from "../../../../_server/actionCore.ts";
import type { ReelDetail } from "../../_port/types.ts";
import { JobLine } from "./JobLine.tsx";
import { Launch, type LaunchFn } from "./Launch.tsx";
import { jobOf } from "./view.ts";
import s from "./Steps.module.css";

export type DataActs = {
  readonly launch: LaunchFn;
  readonly accept: (input: { readonly slug: string }) => Promise<ActionResult<string>>;
  readonly sendBack: (input: { readonly slug: string; readonly note: string }) => Promise<ActionResult<string>>;
};

export function DataStep({ detail, acts }: { readonly detail: ReelDetail; readonly acts: DataActs }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"keep" | "back" | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const t = detail.table;
  const v = detail.verdicts.data;
  const job = jobOf(detail.jobs, "reel-data");

  async function act(which: "keep" | "back"): Promise<void> {
    if (busy !== null) return;
    setBusy(which);
    setError(undefined);
    try {
      const r = which === "keep" ? await acts.accept({ slug: detail.slug }) : await acts.sendBack({ slug: detail.slug, note });
      if (!r.ok) setError(r.error.error);
      else {
        if (which === "back") setNote("");
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <JobLine job={job} />
      {t !== undefined && (
        <>
          <Facts
            facts={[
              { term: "unit", value: t.unit },
              { term: "granularity", value: t.granularity },
              { term: "periods", value: t.periods },
              { term: "entities", value: t.entities },
              { term: "source", value: t.source.name },
              { term: "licence", value: t.source.licence },
              { term: "fetched", value: t.source.fetchedAt },
            ]}
          />
          <a className={s.link} href={t.source.url} target="_blank" rel="noreferrer">
            {t.source.url}
          </a>
          <div className={s.row}>
            <Chip label={t.continuity.ok ? "continuity holds" : "under the gate"} tone={t.continuity.ok ? "emerald" : "rose"} dot />
            <Chip label="steps" value={t.continuity.steps} />
            <Chip label="lead changes" value={t.continuity.leadChanges} />
            <Chip label="overtakes" value={t.continuity.movements} />
            <Chip label="events" value={t.continuity.events} />
          </div>
          {t.continuity.failures.length > 0 && (
            <ul className={s.list} aria-label="continuity failures">
              {t.continuity.failures.map((f) => (
                <li key={f}>
                  <ErrorLine message={f} />
                </li>
              ))}
            </ul>
          )}
          {v !== undefined && (
            <div className={s.row}>
              <Chip label={v.verdict === "keep" ? "kept" : "sent back"} tone={v.verdict === "keep" ? "emerald" : "amber"} value={`round ${v.round}`} />
              {!v.current && <Chip label="history" ghost casing="lower" />}
              {v.note !== undefined && <p className={s.quote}>{v.note}</p>}
            </div>
          )}
          <div className={s.row}>
            <Button label="Keep the table" tone="emerald" size="sm" pending={busy === "keep"} disabled={v?.verdict === "keep" && v.current} onPress={() => void act("keep")} />
          </div>
          <TextArea label="what is wrong with the table" value={note} onChange={setNote} maxLength={2000} rows={2} />
          <div className={s.row}>
            <Button label="Send back" tone="rose" size="sm" pending={busy === "back"} disabled={note.trim() === ""} onPress={() => void act("back")} />
          </div>
          {error !== undefined && <ErrorLine message={error} live />}
        </>
      )}
      <Launch kind="reel-data" slug={detail.slug} label={t === undefined ? "Research" : "Research again"} launch={acts.launch} />
    </>
  );
}
