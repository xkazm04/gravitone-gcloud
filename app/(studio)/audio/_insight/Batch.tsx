"use client";

// THE OPERATOR BATCH SECTION OF THE AUDIO DESK (scout A.1 item 5; v1 app/playground/triage/
// Batch.tsx, dark since Phase 3): N identical briefs to the engine that makes this kind on the
// desk, so the takes differ only by the provider's variance. The price is a RECEIPT - the one
// flow every launch uses (../../projects/_plan/receipt.tsx): read, raised in the sheet, armed
// live only on the receipt, confirmed by its token; a moved queue answers the fresh receipt and
// launches nothing. v1 spent on the press.
//
// The takes land unjudged and are judged on the Board's audio triage like any other.
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BatchForm } from "@gt/ui/components/audio/BatchForm.tsx";
import { batchProblem, blankBatch, type BatchForm as Form } from "@gt/ui/components/audio/batch.ts";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { outcomeOf, useReceipt } from "../../projects/_plan/receipt.tsx";
import { useShell } from "../../_shell/Providers.tsx";
import type { batchConfirm, batchReceipt } from "./acts.ts";
import type { BatchView } from "./read.ts";
import s from "./insight.module.css";

export type BatchActs = { readonly batchReceipt: typeof batchReceipt; readonly batchConfirm: typeof batchConfirm };

export function BatchDesk({ view, nowMs, acts }: { readonly view: BatchView; readonly nowMs: number; readonly acts: BatchActs }) {
  const router = useRouter();
  const { toast } = useShell();
  const flow = useReceipt(nowMs);
  const [form, setForm] = useState<Form>(() => blankBatch(view.kind));
  const problem = batchProblem(view.kind, form);
  const engine = view.engine.ok ? view.engine.value.name : null;

  const price = (): void => {
    if (flow.reading || problem !== null || engine === null) return;
    const kind = view.kind;
    const sent = form;
    void flow.open({
      trail: [{ label: "Audio", href: "/audio" }],
      here: `${kind} batch × ${sent.count}`,
      read: (mode) => acts.batchReceipt({ kind, form: sent, mode }),
      armable: true,
      confirm: async (token, ceilingUsd, mode) =>
        outcomeOf(await acts.batchConfirm({ kind, form: sent, token, mode, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) }), (v) =>
          v.kind === "stale"
            ? { kind: "stale", fresh: v.fresh }
            : { kind: "done", note: `batch · ${v.value.engine} · ${v.value.jobIds.length} job${v.value.jobIds.length === 1 ? "" : "s"}`, ledger: { href: `/ledger?q=${encodeURIComponent(v.value.jobIds[0] ?? "")}`, subject: v.value.runIds[0] ?? "" } },
        ),
      done: (note, ledger) => {
        toast(note, ledger);
        router.refresh();
      },
      failed: (message) => toast(message),
    });
  };

  return (
    <section className={s.batch} aria-label="batch">
      <CapsHeading text="batch" level={2} />
      {!view.engine.ok && <ErrorLine message={view.engine.error} />}
      <BatchForm kind={view.kind} form={form} onForm={setForm} problem={problem} engine={engine} busy={flow.reading} onPrice={price} />
      {flow.sheet}
    </section>
  );
}
