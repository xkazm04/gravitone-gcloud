"use client";

// ONE JOB'S LAUNCH, RECEIPT FIRST (spark reel-studio WP4). The press reads the receipt and launches nothing; the
// Receipt's confirm sends its token back. A confirm the server finds stale answers the fresh receipt, drawn with
// what moved marked (receiptChanges), and waits for a second confirm. A job of that kind already open answers
// that job, never a second. Dry unless the operator arms live on the receipt: the live toggle re-reads the
// receipt in live mode, so the confirm that follows confirms what the operator is looking at; a process that may
// only run dry refuses that read, and its words are the error line.
//
// The confirm is disarmed synchronously (a ref): a second press that lands before the re-render cannot send a
// second confirm (async-ui-states/action-busy-states).

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { Receipt as ReceiptValue, ReceiptMode } from "@gt/domain/produce";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Receipt } from "@gt/ui/components/produce/Receipt.tsx";
import { receiptChanges, type ReceiptChanges } from "@gt/ui/components/produce/produce.ts";
import { StatusPill } from "@gt/ui/components/status/StatusPill.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";

import type { ReelJobKind, ReelJobLaunch } from "../../../../../lib/producers/reel.ts";
import type { ActionResult } from "../../../../_server/actionCore.ts";
import type { LaunchInput } from "../../_actions/steps.ts";
import s from "./Steps.module.css";

export type LaunchFn = (input: LaunchInput) => Promise<ActionResult<ReelJobLaunch>>;

type Reading = { readonly receipt: ReceiptValue; readonly changes?: ReceiptChanges; readonly readAtMs: number };
type Existing = { readonly jobId: string; readonly state: Extract<ReelJobLaunch, { kind: "existing" }>["state"] };

export function Launch({ kind, slug, label, launch, disabled = false }: { readonly kind: ReelJobKind; readonly slug: string; readonly label: string; readonly launch: LaunchFn; readonly disabled?: boolean }) {
  const router = useRouter();
  const [reading, setReading] = useState<Reading | null>(null);
  const [mode, setMode] = useState<ReceiptMode>("dry");
  const [ceiling, setCeiling] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [existing, setExisting] = useState<Existing | null>(null);
  const inflight = useRef(false);

  /** One call; every answer lands here. `before` is the receipt the operator read, for a stale answer's marks. */
  async function ask(m: ReceiptMode, token: string | undefined, before: ReceiptValue | undefined): Promise<void> {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const r = await launch({ kind, slug, mode: m, ...(token === undefined ? {} : { token }) });
      if (!r.ok) {
        setError(r.error.error);
        return;
      }
      const a = r.value;
      if (a.kind === "receipt") setReading({ receipt: a.receipt, readAtMs: Date.now() });
      else if (a.kind === "stale") setReading({ receipt: a.fresh, readAtMs: Date.now(), ...(before === undefined ? {} : { changes: receiptChanges(before, a.fresh) }) });
      else if (a.kind === "existing") {
        setReading(null);
        setExisting({ jobId: a.jobId, state: a.state });
      } else {
        setReading(null);
        setExisting({ jobId: a.jobId, state: "queued" });
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  const arm = (live: boolean): void => {
    const m: ReceiptMode = live ? "live" : "dry";
    setMode(m);
    void ask(m, undefined, undefined);
  };

  return (
    <div className={s.launch}>
      <div className={s.row}>
        <Button label={label} tone="cyan" size="sm" glyph="up" disabled={disabled} pending={busy && reading === null} onPress={() => void ask(mode, undefined, undefined)} />
        {reading !== null && <Toggle label="live" on={mode === "live"} onToggle={arm} />}
        {reading !== null && <Button label="Close" size="sm" onPress={() => setReading(null)} />}
        {existing !== null && (
          <span className={s.row}>
            <StatusPill machine="job" state={existing.state} />
            <span className={s.mono}>{existing.jobId}</span>
          </span>
        )}
      </div>
      {reading !== null && (
        <Receipt
          receipt={reading.receipt}
          {...(reading.changes === undefined ? {} : { changes: reading.changes })}
          ceiling={ceiling}
          onCeiling={setCeiling}
          onConfirm={() => void ask(reading.receipt.mode, reading.receipt.token, reading.receipt)}
          busy={busy}
          {...(error === undefined ? {} : { error })}
          nowMs={reading.readAtMs}
        />
      )}
      {reading === null && error !== undefined && <ErrorLine message={error} live />}
    </div>
  );
}
