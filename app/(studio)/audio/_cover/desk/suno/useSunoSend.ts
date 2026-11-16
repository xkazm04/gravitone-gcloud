"use client";

// THE SUNO STATION'S ONE STATE (spark suno-covers): the form, the send's receipt and its confirm, and a take's
// keep (quote, then spend). The three compositions (./SunoA.tsx, ./SunoB.tsx, ./SunoC.tsx) draw the same flow.
// Every write is the server's, through the acts; after one the view is re-read. The record's `suno` is the rest.
//
// THE RECEIPT is the launch's (../useCover.ts): no token answers it and queues nothing, Confirm sends its token, a
// stale answer replaces it with the fresh one, its moved cells marked, and waits for a second Confirm.
// THE KEEP is the pull's (@gt/ui suno/SunoPicker): the first press answers Suno's quote for the file, only the
// second spends the download credit and files the take as the remix.
import { useRef, useState } from "react";

import type { CoverRecord } from "@gt/domain/cover";
import { sunoSendInFlight, type CoverSunoSend, type SunoCoverTakeN } from "@gt/domain/cover.suno";
import type { SunoDownloadQuote } from "@gt/domain/audio.suno";
import { receiptChanges } from "@gt/ui/components/produce/produce.ts";

import type { CoverActs } from "../../contract.ts";
import type { Launching } from "../coverFlow.ts";
import { failWords } from "../useAfterPick.ts";
import { formOf, newestFirst, planOf, sendable, type SunoForm } from "./suno.ts";

/** The take whose file is being asked for: its quote once Suno has answered it. */
export type Keeping = { readonly send: number; readonly take: SunoCoverTakeN; readonly quote: SunoDownloadQuote | null };
/** Suno's refusal of a keep, verbatim, and the take it was asked for. */
export type KeepRefused = { readonly send: number; readonly take: SunoCoverTakeN; readonly message: string };

export type SunoFlow = {
  readonly record: CoverRecord;
  /** When the view was last read: a send's age is measured against it. */
  readonly readAtMs: number | null;
  readonly form: SunoForm;
  readonly set: (patch: Partial<SunoForm>) => void;
  /** Back to the control's own default: not sent. */
  readonly untouch: (k: "audioInfluence" | "styleInfluence" | "weirdness" | "variety") => void;
  readonly sends: readonly CoverSunoSend[];
  readonly latest: CoverSunoSend | undefined;
  /** A send is queued or running: the form waits, the desk re-reads. */
  readonly sending: boolean;
  readonly canSend: boolean;
  readonly launching: Launching | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly ask: () => void;
  readonly confirm: () => void;
  readonly cancel: () => void;
  readonly keeping: Keeping | null;
  readonly keepBusy: boolean;
  readonly keepError: KeepRefused | null;
  readonly keep: (send: number, take: SunoCoverTakeN) => void;
  readonly spend: () => void;
  readonly keepCancel: () => void;
};

export function useSunoSend(r: CoverRecord, acts: CoverActs, refresh: () => void, readAtMs: number | null): SunoFlow {
  const [form, setForm] = useState<SunoForm>(() => formOf(r));
  const [launching, setLaunching] = useState<Launching | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keeping, setKeeping] = useState<Keeping | null>(null);
  const [keepBusy, setKeepBusy] = useState(false);
  const [keepError, setKeepError] = useState<KeepRefused | null>(null);
  const inflight = useRef(false);

  const sends = newestFirst(r.suno);
  const sending = sunoSendInFlight(r.suno);
  const canSend = !sending && sendable(form);

  // A change to the plan is a different plan: the receipt read for the old one no longer stands.
  const set = (patch: Partial<SunoForm>): void => {
    setForm((f) => ({ ...f, ...patch }));
    setLaunching(null);
  };
  const untouch = (k: "audioInfluence" | "styleInfluence" | "weirdness" | "variety"): void => {
    setForm((f) => {
      const { [k]: _gone, ...rest } = f;
      return rest;
    });
    setLaunching(null);
  };

  const once = async (f: () => Promise<void>, fail: (m: string) => void, on: (b: boolean) => void): Promise<void> => {
    if (inflight.current) return;
    inflight.current = true;
    on(true);
    try {
      await f();
    } catch (e) {
      fail(failWords(e));
    } finally {
      inflight.current = false;
      on(false);
    }
  };

  const ask = (): void =>
    void once(
      async () => {
        if (!canSend) return;
        setError(null);
        const a = await acts.sendSuno(planOf(r.id, form));
        if (!a.ok) return setError(a.error.error);
        if (a.value.kind === "receipt") setLaunching({ receipt: a.value.receipt, readAtMs: Date.now() });
        else refresh();
      },
      setError,
      setBusy,
    );

  const confirm = (): void =>
    void once(
      async () => {
        if (launching === null) return;
        setError(null);
        const a = await acts.sendSuno(planOf(r.id, form), launching.receipt.token);
        if (!a.ok) return setError(a.error.error);
        const v = a.value;
        if (v.kind === "stale") setLaunching({ receipt: v.fresh, changes: receiptChanges(launching.receipt, v.fresh), readAtMs: Date.now() });
        else if (v.kind === "receipt") setLaunching({ receipt: v.receipt, readAtMs: Date.now() });
        else {
          setLaunching(null);
          refresh();
        }
      },
      setError,
      setBusy,
    );

  const keep = (send: number, take: SunoCoverTakeN): void =>
    void once(
      async () => {
        setKeepError(null);
        const a = await acts.fileSuno({ id: r.id, send, take });
        if (!a.ok) return setKeepError({ send, take, message: a.error.error });
        if ("quote" in a.value) setKeeping({ send, take, quote: a.value.quote });
        else {
          setKeeping(null);
          refresh();
        }
      },
      (message) => setKeepError({ send, take, message }),
      setKeepBusy,
    );

  const spend = (): void =>
    void once(
      async () => {
        if (keeping === null) return;
        setKeepError(null);
        const a = await acts.fileSuno({ id: r.id, send: keeping.send, take: keeping.take, confirm: true });
        if (!a.ok) return setKeepError({ send: keeping.send, take: keeping.take, message: a.error.error });
        if ("quote" in a.value) setKeeping({ ...keeping, quote: a.value.quote });
        else {
          setKeeping(null);
          refresh();
        }
      },
      (message) => setKeepError(keeping === null ? null : { send: keeping.send, take: keeping.take, message }),
      setKeepBusy,
    );

  return { record: r, readAtMs, form, set, untouch, sends, latest: sends[0], sending, canSend, launching, busy, error, ask, confirm, cancel: () => setLaunching(null), keeping, keepBusy, keepError, keep, spend, keepCancel: () => setKeeping(null) };
}
