"use client";

// THE RELEASE TAB (spark audio-distribution): the draft and the wizard that walks it. The draft is one
// reducer here, above the wizard (registry wizard-flows: one model owns every step), so a step never
// holds a field of the release and Back never loses one. The owner picked the wizard on 2026-11-16 over
// a one-page desk and a sleeve catalog (both retired; their commits are 8ca8443b and 147d8965).
import { useCallback, useReducer } from "react";

import type { ReleaseRead, ReleaseUrl } from "./_port/port.ts";
import { initialDraft, reduceDraft } from "./draft.ts";
import { Wizard } from "./wizard/Wizard.tsx";
import s from "./release.module.css";

const hex12 = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");

export function Release({ read, url }: { readonly read: ReleaseRead; readonly url: ReleaseUrl }) {
  const [state, dispatch] = useReducer(reduceDraft, initialDraft(read.releases, url.release));
  const newId = useCallback(() => `rel-${hex12()}`, []);
  return (
    <section className={s.tab}>
      <Wizard read={read} state={state} dispatch={dispatch} newId={newId} />
    </section>
  );
}
