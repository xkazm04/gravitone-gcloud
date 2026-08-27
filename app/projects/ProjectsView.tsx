"use client";

// /projects — the shelf the studio opens from.
//
// Prototype round 1 ran three shelves behind a switcher: a ledger (a book of
// record, sortable by any column), a call sheet (queued by what needs you) and
// this matrix. The matrix won and the other two are gone — a list tells you
// what you have, and only the grid tells you where the whole shelf is jammed.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Link from "next/link";

import StudioFrame from "@/components/ui/StudioFrame";
import { Eyebrow } from "@/components/ui/Primitives";
import { useAuth } from "@/lib/useAuth";
import { useProjects } from "@/lib/useProjects";
import { useThemes } from "@/lib/useThemes";
import { lockedOnly } from "@/lib/themes";
import type { Project, ProjectDraft } from "@/lib/projects";

import ProjectDialog, { ConfirmDelete } from "../_projects/ProjectDialog";
import ProjectsMatrix from "../_projects/ProjectsMatrix";

export default function ProjectsView() {
  const { user } = useAuth();
  const router = useRouter();
  const { projects, error, loading, create, update, remove } = useProjects(user?.uid ?? null);
  // The gate: a project is rendered against a locked visual identity, so one
  // has to exist before there is anything to create. See /library.
  //
  // Memoised because the dialog reseeds its draft when this identity changes,
  // and a fresh array on every render is a fresh identity on every render.
  const { themes } = useThemes(user?.uid ?? null);
  const allThemes = useMemo(() => themes ?? [], [themes]);
  const lockedThemes = useMemo(() => lockedOnly(allThemes), [allThemes]);
  const gated = themes !== null && lockedThemes.length === 0;

  const [dialog, setDialog] = useState<{ open: boolean; project: Project | null }>({
    open: false,
    project: null,
  });
  const [doomed, setDoomed] = useState<Project | null>(null);

  // Create walks straight into the studio — a project with no work in it has
  // nothing to show on this page, and the name the user just typed is the
  // headline waiting for them one route over.
  const submit = async (draft: ProjectDraft) => {
    const editing = dialog.project;
    setDialog({ open: false, project: null });
    if (editing) {
      await update(editing.id, draft);
      return;
    }
    const made = await create(draft);
    if (made) router.push(`/studio/${made.id}`);
  };

  return (
    <StudioFrame>
      {/* tabIndex={-1}: the landmark a closing dialog hands focus to when the
          control it was opened from did not survive it — a restore onto a
          detached node is silent, and focus falls to <body>. See
          components/ui/Modal.tsx#restoreFocus. */}
      <main tabIndex={-1} className="pb-16">
        <header className="pt-6">
          <Eyebrow>projects</Eyebrow>
          <h1 className="font-instrument mt-3 text-4xl text-white">Projects</h1>
        </header>

        {gated && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-4 py-3">
            <p className="font-hanken text-sm text-amber-100">
              A project is rendered against a locked visual style, and this account has none yet.
            </p>
            <Link
              href="/library"
              className="font-jetbrains shrink-0 rounded-lg border border-amber-300/40 px-3 py-1.5 text-[12px] text-amber-100 transition hover:bg-amber-300/10"
            >
              make one in the library →
            </Link>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-sm text-rose-200">
            {error} — your projects live in this browser&rsquo;s storage, and it did not answer.
          </p>
        )}

        <section className="mt-6">
          {loading ? (
            <p className="font-jetbrains py-16 text-center text-[12px] tracking-[0.18em] text-white/30 uppercase">
              reading the shelf…
            </p>
          ) : (
            <ProjectsMatrix
              projects={projects ?? []}
              onOpen={(p, step) =>
                // The project is the RESOURCE and gets the path; the step is a
                // VIEW onto it and gets a query. Both are shareable, and a step
                // that no longer exists degrades to the project's own default
                // rather than 404ing a URL someone sent a colleague.
                router.push(`/studio/${p.id}${step ? `?step=${step}` : ""}`)
              }
              onEdit={(p) => setDialog({ open: true, project: p })}
              onDelete={(p) => setDoomed(p)}
              // Gated rather than disabled: a dead button teaches nothing,
              // whereas landing on /library is the actual next step.
              onCreate={() =>
                gated ? router.push("/library") : setDialog({ open: true, project: null })
              }
            />
          )}
        </section>
      </main>

      <ProjectDialog
        open={dialog.open}
        project={dialog.project}
        themes={allThemes}
        onClose={() => setDialog({ open: false, project: null })}
        onSubmit={submit}
      />
      <ConfirmDelete
        project={doomed}
        onClose={() => setDoomed(null)}
        /**
         * AWAIT THE REMOVAL, THEN CLOSE — because the ORDER decides where a
         * keyboard user's focus lands, and this used to lose that race.
         *
         * `Modal#restoreFocus` hands focus back to the opener when it is still
         * connected and to `<main>` when it is not. The opener here is the row's
         * own delete button. `useProjects.remove` awaits the IndexedDB
         * transaction BEFORE `setProjects`, so firing it and closing in the same
         * commit left the row mounted at the moment the modal tore down: focus
         * was restored onto a button that unmounted a tick later, and landed on
         * `<body>`. Measured, after the Modal fix — which cannot see this,
         * because from inside the dialog the opener is genuinely still there.
         *
         * Awaiting first makes the ordering true rather than lucky: by the time
         * the dialog closes the row is gone, `isConnected` is false, and focus
         * goes to the landmark. A failed delete keeps the row AND the dialog —
         * `remove` returns null and reports through the error banner, and
         * closing a confirmation over work that was not done is the same small
         * lie as a button that does nothing.
         */
        onConfirm={async () => {
          if (!doomed) return;
          const took = await remove(doomed.id);
          if (took) setDoomed(null);
        }}
      />
    </StudioFrame>
  );
}
