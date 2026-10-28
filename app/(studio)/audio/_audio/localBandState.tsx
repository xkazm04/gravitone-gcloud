"use client";

// THE LOCAL BAND'S STATE ON /audio - the takes rendered this visit, the busy flag, the last error and
// the last audition, plus one handler per Server Action of ./localActs.ts. Split out of AudioLane when
// the e1 steer lane and the e2 local band merged (spark audio-agent-studio; the 400-line cap).
import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage } from "@gt/domain/errors";
import type { LocalAuditionState, LocalFxChain, LocalRole, LocalScoreDraft, LocalTakeView } from "@gt/ui/components/audio/localBand.ts";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { outcomeOf, type useReceipt } from "../../projects/_plan/receipt.tsx";
import { useShell } from "../../_shell/Providers.tsx";
import type { LocalBandActs } from "./AudioLane.tsx";
import type { LocalBandView } from "./localRead.ts";

type Flow = ReturnType<typeof useReceipt>;

export function useLocalBand(localBand: LocalBandView | undefined, localActs: LocalBandActs | undefined, flow: Flow) {
  const router = useRouter();
  const { toast } = useShell();
  const [localTakes, setLocalTakes] = useState<readonly LocalTakeView[]>(() => localBand?.takes ?? []);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localAudition, setLocalAudition] = useState<LocalAuditionState | null>(null);

  /** One act at a time: busy while it runs, its own error sentence on refusal, `done` on success. */
  const run = <T,>(call: () => Promise<ActionResult<T>>, done: (v: T) => void): void => {
    if (!localActs || localBusy) return;
    setLocalBusy(true);
    setLocalError(null);
    const fail = (msg: string): void => {
      setLocalError(msg);
      toast(msg);
    };
    void call().then(
      (r) => {
        setLocalBusy(false);
        if (!r.ok) fail(r.error.error);
        else done(r.value);
      },
      (e: unknown) => {
        setLocalBusy(false);
        fail(errorMessage(e));
      },
    );
  };
  const upsert = (v: LocalTakeView): void => setLocalTakes((cur) => [v, ...cur.filter((x) => x.id !== v.id)]);
  const rendered = (v: LocalTakeView): string => `local · rendered ${v.title} (${v.lufs?.toFixed(1) ?? "-14.0"} LUFS · $0)`;

  const onLocalRender = (spec: LocalScoreDraft): void =>
    run(
      () => localActs!.renderLocalScoreAct({ spec }),
      (v) => {
        upsert(v);
        toast(rendered(v));
        router.refresh();
      },
    );

  const onLocalReceipt = (spec: LocalScoreDraft): void => {
    if (!localActs?.localScoreReceiptAct || flow.reading || localBusy) return;
    void flow.open({
      trail: [{ label: "Audio", href: "/audio" }],
      here: "render local 4-stem score ($0)",
      read: (mode) => localActs.localScoreReceiptAct!({ spec, mode }),
      armable: false,
      confirm: async () =>
        outcomeOf(await localActs.renderLocalScoreAct({ spec }), (v) => {
          upsert(v);
          return { kind: "done", note: rendered(v) };
        }),
      done: (note) => {
        toast(note);
        router.refresh();
      },
      failed: (message) => toast(message),
    });
  };

  const onLocalSwap = (
    takeId: string,
    role: LocalRole,
    instrumentId: string,
    opts?: { readonly muted?: boolean; readonly solo?: boolean; readonly fx?: LocalFxChain },
  ): void =>
    run(
      () =>
        localActs!.swapLocalStemAct({
          takeId,
          role,
          instrumentId,
          ...(opts?.muted === undefined ? {} : { muted: opts.muted }),
          ...(opts?.solo === undefined ? {} : { solo: opts.solo }),
          ...(opts?.fx === undefined ? {} : { fx: opts.fx }),
        }),
      (v) => {
        upsert(v);
        toast(`local · swapped ${role} (${v.reusedRoles.length} stems reused bit-exact · ${v.totalRenderMs}ms)`);
        router.refresh();
      },
    );

  const onLocalAudition = (instrumentId: string): void =>
    run(
      () => localActs!.auditionLocalInstrumentAct({ instrumentId }),
      (v) => {
        setLocalAudition(v);
        toast(`audition · ${v.name}`);
      },
    );

  const onLocalPromote = (takeId: string): void =>
    run(
      () => localActs!.promoteLocalTakeAct({ takeId }),
      (v) => {
        setLocalTakes((cur) => cur.map((t) => (t.id === takeId ? { ...t, stage: v.stage, verdict: "kept" } : t)));
        toast(`local · sent ${takeId} to Arrange`);
        router.refresh();
      },
    );

  return { localTakes, localBusy, localError, localAudition, onLocalRender, onLocalReceipt, onLocalSwap, onLocalAudition, onLocalPromote };
}
