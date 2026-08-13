"use client";

// Loading, saving and mutating the signed-in account's themes.
//
// Mirrors useProjects: one hook, errors surface rather than being swallowed,
// and every mutation writes through to IndexedDB before touching local state —
// an approved proof sheet that vanishes on refresh would be the worst failure
// this surface could have.
//
// No seeding. /projects hands a new account a demo shelf because an empty
// studio has nothing to open; a *style* is the thing the user is here to make,
// and pre-filling it would be putting words in their mouth. The empty state
// says "start from a preset", which is the correct first move anyway.

import { useCallback, useEffect, useState } from "react";

import {
  deleteTheme as dbDelete,
  listThemes,
  newTheme,
  putTheme,
  type Proof,
  type Theme,
  type ThemeDraft,
} from "./themes";

export function useThemes(uid: string | null) {
  const [themes, setThemes] = useState<Theme[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      setThemes(await listThemes(uid));
      setError(null);
    } catch (e) {
      setThemes([]);
      setError(e instanceof Error ? e.message : "could not read your styles");
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setThemes(null);
      return;
    }
    void reload();
  }, [uid, reload]);

  /** Write a theme through and fold it into local state, newest-touched first. */
  const commit = useCallback(async (next: Theme): Promise<Theme | null> => {
    try {
      const stored = await putTheme(next);
      setThemes((ts) => {
        const rest = (ts ?? []).filter((t) => t.id !== stored.id);
        return [stored, ...rest].sort((a, b) => b.updatedAt - a.updatedAt);
      });
      setError(null);
      return stored;
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save the style");
      return null;
    }
  }, []);

  const create = useCallback(
    async (draft: ThemeDraft): Promise<Theme | null> => {
      if (!uid) return null;
      return commit(newTheme(uid, draft));
    },
    [uid, commit],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Theme>): Promise<Theme | null> => {
      const current = themes?.find((t) => t.id === id);
      if (!current) return null;
      return commit({ ...current, ...patch });
    },
    [themes, commit],
  );

  /** Append a freshly generated proof to a sheet. */
  const addProof = useCallback(
    async (id: string, proof: Proof): Promise<Theme | null> => {
      const current = themes?.find((t) => t.id === id);
      if (!current) return null;
      return commit({ ...current, proofs: [...current.proofs, proof] });
    },
    [themes, commit],
  );

  /** Approve or reject one proof. Rejections stay on the sheet — they are the
   *  record of what this style is NOT. */
  const judgeProof = useCallback(
    async (id: string, proofId: string, state: Proof["state"], note?: string) => {
      const current = themes?.find((t) => t.id === id);
      if (!current) return null;
      return commit({
        ...current,
        proofs: current.proofs.map((p) => (p.id === proofId ? { ...p, state, note: note ?? p.note } : p)),
      });
    },
    [themes, commit],
  );

  const lock = useCallback(
    async (id: string) => {
      const current = themes?.find((t) => t.id === id);
      if (!current) return null;
      return commit({ ...current, lockedAt: Date.now() });
    },
    [themes, commit],
  );

  const remove = useCallback(async (id: string) => {
    try {
      await dbDelete(id);
      setThemes((ts) => (ts ?? []).filter((t) => t.id !== id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not delete the style");
    }
  }, []);

  return {
    themes,
    error,
    loading: themes === null,
    reload,
    create,
    update,
    addProof,
    judgeProof,
    lock,
    remove,
  };
}
