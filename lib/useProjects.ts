"use client";

// Loading, saving and seeding the signed-in account's projects.
//
// One hook so every /projects variant shares the same state machine — the
// variants differ in how they DRAW the list, never in how they get it.
//
// Errors surface, AND THEY CARRY A KIND. A store that will not open (private
// mode, quota, a second tab mid-upgrade) has to be sayable, because "your
// projects survive a refresh" is a promise the UI makes out loud — and "sayable"
// means more than a raw `e.message` string, which is what this hook used to keep.
//
// The classification already existed one layer down: app/_phases/_shared/stepStore
// built `StorageTrouble` + `classify()` + `useStorageTrouble()` for step content,
// studioDb propagates the real DOMException faithfully, and the notification bell
// already knows what each of the five kinds means for the user. Project writes
// threw all of that away at the last step. So this hook now reports THROUGH that
// channel rather than beside it: same five kinds, same subscriber, one vocabulary.
//
// (Importing from app/ into lib/ is a layering inversion, and a deliberate one —
// the same one `projectSeed` below already makes. Converging on the existing
// taxonomy is worth more than the import direction, and the alternative is a
// second `classify()` that drifts from the first.)

import { useCallback, useEffect, useState } from "react";

import { reportStorageTrouble, type StorageTrouble } from "@/app/_phases/_shared/stepStore";
import { seedProjects } from "@/app/_studio/projectSeed";
import {
  deleteProject as dbDelete,
  listProjects,
  newProject,
  putProject,
  putProjects,
  type Project,
  type ProjectContents,
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

/** The label the bell prints for a failure that is about the project RECORD
 *  rather than any one step's content. `StorageTrouble.phase` is the "where",
 *  and "projects" is where these happen. */
const PROJECT_SCOPE = "projects";

export function useProjects(uid: string | null) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** One place where a project-storage failure is CLASSIFIED and published,
   *  instead of four places that each kept a bare `e.message` and threw the
   *  reason away.
   *
   *  Two destinations, deliberately: the classified trouble goes to the shared
   *  channel (the bell reads it, and knows what each of the five kinds means for
   *  the user), and the raw sentence stays in `error` for this page's own
   *  banner, which is already written and already right. No new surface, no
   *  second vocabulary — just the kind no longer being discarded.
   *
   *  `projectId` is "" where there is not one yet: a create that never got an
   *  id, or a listing that spans the whole account. */
  const failed = useCallback(
    (op: "read" | "write", projectId: string, e: unknown, fallback: string): StorageTrouble => {
      const t = reportStorageTrouble(op, projectId, PROJECT_SCOPE, e);
      setError(e instanceof Error ? e.message : fallback);
      return t;
    },
    [],
  );

  const ok = useCallback(() => setError(null), []);

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
      ok();
    } catch (e) {
      setProjects([]);
      failed("read", "", e, "could not read your projects");
    }
  }, [uid, ok, failed]);

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
        ok();
        return stored;
      } catch (e) {
        failed("write", "", e, "could not save the project");
        return null;
      }
    },
    [uid, ok, failed],
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
        ok();
        return stored;
      } catch (e) {
        failed("write", id, e, "could not save the project");
        return null;
      }
    },
    [projects, ok, failed],
  );

  /** Delete the project AND everything it owned. Resolves to what actually went
   *  (see lib/projects#deleteProject), or null when nothing did — a caller that
   *  wants to say "and its four steps" reads the answer rather than the guess it
   *  showed in the confirmation. */
  const remove = useCallback(
    async (id: string): Promise<ProjectContents | null> => {
      try {
        const took = await dbDelete(id);
        setProjects((ps) => (ps ?? []).filter((p) => p.id !== id));
        ok();
        return took;
      } catch (e) {
        // The transaction is all-or-nothing, so a failure here means NOTHING was
        // deleted — the row is still on the shelf and the steps are still under
        // it. Leaving the project in the list is therefore the truthful render.
        failed("write", id, e, "could not delete the project");
        return null;
      }
    },
    [ok, failed],
  );

  return { projects, error, reload, create, update, remove, loading: projects === null };
}
