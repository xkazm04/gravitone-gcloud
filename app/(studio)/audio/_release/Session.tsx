"use client";

// THE RELEASE SESSION (spark studio-to-release): the stored records and the operator's acts on them, handed to the
// children as one ReleaseSessionApi. With the store's doors (`acts`), every edit is shown at once and sent to
// `acts.apply` with the record's version, one release's acts strictly in order, each carrying the version the answer
// before it returned; the answer's record replaces the page's copy and the acts still queued are replayed on it.
// A stale answer shows the stored record and its notice; a refusal rolls back to the last stored record with the
// store's own sentence. Accept sets the proposal's value on the page at once (./applyLocal.ts, zod-free) - the store
// re-checks it through the release door. The model is pure (./sessionModel.ts); this component only sends.
// On the fixture (`acts === null`) nothing leaves the page.
//
// A later `read` (the studio refreshes its server components when the agent posts a turn) is merged by the model's
// `read` event, sent while rendering when the read's records are a new array - the model keeps the one it last merged,
// so the comparison is pure and settles in one extra render, with no effect. When a release made here takes the
// store's id while it is open, the address's `r` is replaced (no navigation) so a reload lands on it.
import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";

import type { ReleaseRead } from "./_port/port.ts";
import type { ReleaseAct, ReleaseActs } from "./act.ts";
import { isReleaseEdit, type DraftEvent } from "./draft.ts";
import { createIn, initialSession, pendingOf, pump, reduceSession, savingOf, viewOf } from "./sessionModel.ts";
import { releaseHref } from "./swap.ts";
import type { ReleaseSessionApi } from "./session.ts";

export interface ReleaseSessionProps {
  readonly read: ReleaseRead;
  /** The release open on first paint (the URL's `r`), or null for the picker. */
  readonly openId: string | null;
  /** The store's doors; null on the fixture side, where nothing is written. */
  readonly acts: ReleaseActs | null;
  readonly children: (session: ReleaseSessionApi) => ReactNode;
}

export function ReleaseSession({ read, openId, acts, children }: ReleaseSessionProps) {
  const [model, send] = useReducer(reduceSession, undefined, () => initialSession(read.records, openId));
  /** `<id>:<seq>` already handed to the store - a re-run effect (Strict Mode, a re-render) never sends twice. */
  const leaving = useRef(new Set<string>());
  if (model.source !== read.records) send({ type: "read", records: read.records });

  useEffect(() => {
    if (acts !== null) pump(model, acts, send, leaving.current);
  }, [model, acts]);

  const swapped = model.swapped;
  useEffect(() => {
    if (swapped !== null) window.history.replaceState(null, "", releaseHref(window.location.href, swapped.to));
  }, [swapped]);

  const act = useCallback((id: string, a: ReleaseAct) => send(acts === null ? { type: "local", id, act: a } : { type: "enqueue", id, act: a }), [acts]);

  const dispatch = useCallback(
    (e: DraftEvent) => {
      if (e.type === "open") return send({ type: "open", id: e.id });
      if (isReleaseEdit(e)) return act(e.id, { kind: "edit", edit: e });
      send({ type: "create", id: e.id, artist: e.artist, takes: e.takes, at: new Date().toISOString(), stored: acts === null });
      if (acts !== null) createIn(acts, e.id, e.takes, send);
    },
    [act, acts],
  );

  const opened = model.openId;
  const answerOpen = useCallback(
    (kind: "accept" | "dismiss", proposalIds: readonly string[]) => {
      if (opened !== null && proposalIds.length > 0) act(opened, { kind, proposalIds });
    },
    [act, opened],
  );
  const accept = useCallback((ids: readonly string[]) => answerOpen("accept", ids), [answerOpen]);
  const dismiss = useCallback((ids: readonly string[]) => answerOpen("dismiss", ids), [answerOpen]);

  const records = useMemo(() => viewOf(model), [model]);
  const state = useMemo(() => ({ releases: records.map((r) => r.release), openId: model.openId }), [records, model.openId]);
  return children({
    state,
    dispatch,
    records,
    open: records.find((r) => r.release.id === model.openId) ?? null,
    pending: pendingOf(records, model.openId),
    accept,
    dismiss,
    saving: savingOf(model),
    notice: model.notice,
  });
}
