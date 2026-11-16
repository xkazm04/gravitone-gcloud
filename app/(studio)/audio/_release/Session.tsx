"use client";

// THE RELEASE SESSION (spark studio-to-release): the draft reducer over the stored records, handed to its children
// as one ReleaseSessionApi. WP0 STUB: edits and proposal answers are reduced on the page only (enough for the
// fixture and for the layouts to build against). WP4 makes it persist: each edit applied optimistically, sent to
// `acts.apply` with the record's version, the stored record taken back (re-based when `stale`); accept applies the
// proposal's value on the page before the store confirms it.
import { useReducer, useState, type ReactNode } from "react";

import type { ReleaseProposal, ReleaseRecord } from "@gt/domain/release.record";

import type { ReleaseRead } from "./_port/port.ts";
import type { ReleaseActs } from "./act.ts";
import { initialDraft, reduceDraft } from "./draft.ts";
import type { ReleaseSessionApi } from "./session.ts";

export interface ReleaseSessionProps {
  readonly read: ReleaseRead;
  /** The release open on first paint (the URL's `r`), or null for the picker. */
  readonly openId: string | null;
  /** The store's doors; null on the fixture side, where nothing is written. */
  readonly acts: ReleaseActs | null;
  readonly children: (session: ReleaseSessionApi) => ReactNode;
}

export function ReleaseSession({ read, openId, children }: ReleaseSessionProps) {
  const [state, dispatch] = useReducer(reduceDraft, initialDraft(read.records.map((r) => r.release), openId));
  const [pending, setPending] = useState<Readonly<Record<string, readonly ReleaseProposal[]>>>(() => Object.fromEntries(read.records.map((r) => [r.release.id, r.pending])));
  const drop = (ids: readonly string[]) => {
    if (state.openId === null) return;
    const id = state.openId;
    setPending((p) => ({ ...p, [id]: (p[id] ?? []).filter((x) => !ids.includes(x.id)) }));
  };
  const records: ReleaseRecord[] = read.records.map((r) => ({ ...r, release: state.releases.find((x) => x.id === r.release.id) ?? r.release, pending: pending[r.release.id] ?? [] }));
  const open = records.find((r) => r.release.id === state.openId) ?? null;
  return children({
    state,
    dispatch,
    records,
    open,
    pending: open?.pending ?? [],
    accept: drop,
    dismiss: drop,
    saving: false,
    notice: null,
  });
}
