"use client";

// Loading, saving and seeding the signed-in account's projects.
//
// One hook so every /projects variant shares the same state machine — the
// variants differ in how they DRAW the list, never in how they get it.
//
// Errors surface. A store that will not open (private mode, quota, a second tab
// mid-upgrade) has to be sayable, because "your projects survive a refresh" is
// a promise the UI makes out loud.

import { useCallback, useEffect, useState } from "react";

import { seedProjects } from "@/app/_studio/projectSeed";
import {
  deleteProject as dbDelete,
  listProjects,
  newProject,
  putProject,
  putProjects,
  type Project,
  type ProjectDraft,
} from "./projects";

/**
 * Marks an account as seeded. Kept OUT of IndexedDB on purpose: it must survive
 * the user deleting every seeded project, otherwise an empty shelf silently
 * refills itself and "delete" stops meaning delete.
 */
const seededKey = (uid: string) => `gravitone.seeded.${uid}`;

function alreadySeeded(uid: string): boolean {
  try {
    return localStorage.getItem(seededKey(uid)) === "1";
  } catch {
    // Storage off: treat as seeded. A demo shelf reappearing on every reload is
    // worse than never seeing one.
    return true;
  }
}

function markSeeded(uid: string): void {
  try {
    localStorage.setItem(seededKey(uid), "1");
  } catch {
    /* nothing to do — see above */
  }
}

export function useProjects(uid: string | null) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      let rows = await listProjects(uid);
      // First visit on this account: hand it the demo shelf so the studio has
      // something to open. See app/_studio/projectSeed.ts — deleting that file
      // leaves the empty state, which is already correct.
      if (rows.length === 0 && !alreadySeeded(uid)) {
        rows = seedProjects(uid);
        await putProjects(rows);
        markSeeded(uid);
        rows = await listProjects(uid);
      }
      setProjects(rows);
      setError(null);
    } catch (e) {
      setProjects([]);
      setError(e instanceof Error ? e.message : "could not read your projects");
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setProjects(null);
      return;
    }
    void reload();
  }, [uid, reload]);

  /** Create from the dialog's draft. Returns the stored record (it has the id). */
  const create = useCallback(
    async (draft: ProjectDraft): Promise<Project | null> => {
      if (!uid) return null;
      try {
        const stored = await putProject(newProject(uid, draft));
        setProjects((ps) => [stored, ...(ps ?? [])]);
        setError(null);
        return stored;
      } catch (e) {
        setError(e instanceof Error ? e.message : "could not save the project");
        return null;
      }
    },
    [uid],
  );

  /** Patch an existing record — the dialog's edit path. */
  const update = useCallback(
    async (id: string, patch: Partial<Project>): Promise<Project | null> => {
      const current = projects?.find((p) => p.id === id);
      if (!current) return null;
      try {
        const stored = await putProject({ ...current, ...patch });
        setProjects((ps) =>
          (ps ?? [])
            .map((p) => (p.id === id ? stored : p))
            .sort((a, b) => b.updatedAt - a.updatedAt),
        );
        setError(null);
        return stored;
      } catch (e) {
        setError(e instanceof Error ? e.message : "could not save the project");
        return null;
      }
    },
    [projects],
  );

  const remove = useCallback(async (id: string) => {
    try {
      await dbDelete(id);
      setProjects((ps) => (ps ?? []).filter((p) => p.id !== id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not delete the project");
    }
  }, []);

  return { projects, error, reload, create, update, remove, loading: projects === null };
}
