"use client";

// /projects — the shelf the studio opens from.
//
// Prototype round 1 ran three shelves behind a switcher: a ledger (a book of
// record, sortable by any column), a call sheet (queued by what needs you) and
// this matrix. The matrix won and the other two are gone — a list tells you
// what you have, and only the grid tells you where the whole shelf is jammed.

import { useState } from "react";
import { useRouter } from "next/navigation";

import StudioFrame from "@/components/ui/StudioFrame";
import { Eyebrow } from "@/components/ui/Primitives";
import { useAuth } from "@/lib/useAuth";
import { useProjects } from "@/lib/useProjects";
import type { Project, ProjectDraft } from "@/lib/projects";

import ProjectDialog, { ConfirmDelete } from "../_projects/ProjectDialog";
import ProjectsMatrix from "../_projects/ProjectsMatrix";

export default function ProjectsView() {
  const { user } = useAuth();
  const router = useRouter();
  const { projects, error, loading, create, update, remove } = useProjects(user?.uid ?? null);

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
      <main className="pb-16">
        <header className="pt-6">
          <Eyebrow>projects</Eyebrow>
          <h1 className="font-instrument mt-3 text-4xl text-white">Projects</h1>
        </header>

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
              onCreate={() => setDialog({ open: true, project: null })}
            />
          )}
        </section>
      </main>

      <ProjectDialog
        open={dialog.open}
        project={dialog.project}
        onClose={() => setDialog({ open: false, project: null })}
        onSubmit={submit}
      />
      <ConfirmDelete
        project={doomed}
        onClose={() => setDoomed(null)}
        onConfirm={() => {
          if (doomed) void remove(doomed.id);
          setDoomed(null);
        }}
      />
    </StudioFrame>
  );
}
