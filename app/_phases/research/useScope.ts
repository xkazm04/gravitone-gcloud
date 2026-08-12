"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { loadStep, saveStep, type ScopeStepData } from "../_shared/stepStore";
import { buildCards, scopeSummary, stateOf, type Card, type Scope } from "./scope";

const PHASE = "research-scope";

/** Scope state for a project. Confirming freezes it — the Script step reads a
 *  confirmed scope, never a live one, so a script cannot quietly change under a
 *  decision made after it was written.
 *
 *  PERSISTED, and shared by both steps. It used to be per-mount React state,
 *  which meant Step 2 mounting its own copy would have shown an empty scope
 *  while Step 1 showed the real one — and any scope control in Step 2 would have
 *  been writing to a document nobody else could see. A decision the creator made
 *  on the triage board has to still be true when they open the matrix. */
export function useScope(projectId: string) {
  const cards = useMemo(() => buildCards(), []);
  const [scope, setScope] = useState<Scope>({});
  const [confirmed, setConfirmed] = useState<Scope | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let alive = true;
    setHydrated(false);
    void loadStep<ScopeStepData>(projectId, PHASE).then((saved) => {
      if (!alive) return;
      setScope(saved?.scope ?? {});
      setConfirmed(saved?.confirmed ?? null);
      setHydrated(true);
    });
    return () => { alive = false; };
  }, [projectId]);

  // Never before hydration — writing the initial {} over a stored record is the
  // exact bug that silently emptied the job store (see lib/jobs.tsx).
  useEffect(() => {
    if (!hydrated) return;
    void saveStep<ScopeStepData>(projectId, PHASE, { scope, confirmed });
  }, [projectId, scope, confirmed, hydrated]);

  const patch = useCallback(
    (id: string, p: Partial<{ descoped: boolean; liked: boolean; deepen: boolean }>) =>
      setScope((s) => ({ ...s, [id]: { ...stateOf(s, id), ...p } })),
    [],
  );

  const toggle = useCallback(
    (id: string, key: "descoped" | "liked" | "deepen") =>
      setScope((s) => ({ ...s, [id]: { ...stateOf(s, id), [key]: !stateOf(s, id)[key] } })),
    [],
  );

  const reset = useCallback(() => { setScope({}); setConfirmed(null); }, []);

  const summary = useMemo(() => scopeSummary(cards, scope), [cards, scope]);

  return {
    cards,
    scope,
    hydrated,
    patch,
    toggle,
    reset,
    summary,
    confirmed,
    confirm: useCallback(() => setConfirmed(scope), [scope]),
    unconfirm: useCallback(() => setConfirmed(null), []),
  };
}

export type ScopeApi = ReturnType<typeof useScope>;
export type { Card };
