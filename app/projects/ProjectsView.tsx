"use client";

// /projects — the shelf the studio opens from.
//
// Prototype round 1 ran three shelves behind a switcher: a ledger (a book of
// record, sortable by any column), a call sheet (queued by what needs you) and
// this matrix. The matrix won and the other two are gone — a list tells you
// what you have, and only the grid tells you where the whole shelf is jammed.

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Link from "next/link";
import { Info } from "lucide-react";

import StudioFrame from "@/components/ui/StudioFrame";
import { Eyebrow } from "@/components/ui/Primitives";
import { useAuth } from "@/lib/useAuth";
import { useProjects } from "@/lib/useProjects";
import { useThemes } from "@/lib/useThemes";
import { lockedOnly } from "@/lib/themes";
import { isSeeded } from "@/app/_studio/projectSeed";
import type { Project, ProjectDraft } from "@/lib/projects";

import ProjectDialog, { ConfirmDelete } from "../_projects/ProjectDialog";
import ProjectsMatrix from "../_projects/ProjectsMatrix";
import { DemoTag } from "../_projects/parts";

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

  /* ── The demo shelf, said out loud ──────────────────────────────────────
   *
   * A brand-new account is handed six fictional productions (lib/useProjects
   * seeds them so the studio has something to open), and until now they were
   * drawn exactly like work the user made: a stranger's real first screen was
   * six projects with progress heat and "2h ago" timestamps that they had
   * never touched. The seeding stays — it is the product decision, and the
   * genuinely empty shelf is one click away now instead of six deletes.
   *
   * The strip is a NOTE, not a warning: same neutral chrome as the style note
   * at the foot of the page, and it disappears on its own once the examples
   * are gone. */
  const demos = useMemo(() => (projects ?? []).filter(isSeeded), [projects]);
  // Two-step, inline: this deletes several records at once, which no single
  // row's confirmation covers, and a modal for it would be louder than the
  // thing it guards. `clearing` is the question, `wiping` is the answer being
  // carried out.
  const [clearing, setClearing] = useState(false);
  const [wiping, setWiping] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Sequential, not Promise.all: `remove` opens its own IndexedDB handle per
  // call and the shelf re-renders after each one, so the row count visibly
  // falls. A failure raises the banner above and stops nothing that already
  // went — the shelf shows exactly what survived, which is the truth.
  //
  // Then focus lands on the landmark, for the reason ConfirmDelete's own note
  // below states at length: the control this was fired from is inside the
  // strip, the strip is gone the moment the last row is, and a restore onto a
  // detached node is silent — focus falls to <body>.
  const clearExamples = async () => {
    setWiping(true);
    for (const p of demos) await remove(p.id);
    setWiping(false);
    setClearing(false);
    mainRef.current?.focus();
  };

  // Create walks straight into the studio — a project with no work in it has
  // nothing to show on this page, and the name the user just typed is the
  // headline waiting for them one route over.
  // CLOSE ON SUCCESS, the way ConfirmDelete below already does — and for the
  // reason stated there: "closing a confirmation over work that was not done is
  // the same small lie as a button that does nothing."
  //
  // This closed FIRST and then wrote. Both writers resolve to null on failure
  // and raise the error banner above, so the answer was available and only the
  // delete flow read it; a quota or blocked-tab failure closed the dialog,
  // discarded the draft the user had typed, and left a banner explaining a loss
  // that had already happened. On a repo whose step store calls quota "a real
  // destination and not a theoretical one", that is the reachable case.
  //
  // The dialog holds itself open and disables its own control while this
  // resolves, so awaiting does not buy a double-submit.
  const submit = async (draft: ProjectDraft) => {
    const editing = dialog.project;
    if (editing) {
      const saved = await update(editing.id, draft);
      if (saved) setDialog({ open: false, project: null });
      return;
    }
    const made = await create(draft);
    if (!made) return;
    setDialog({ open: false, project: null });
    router.push(`/studio/${made.id}`);
  };

  return (
    <StudioFrame>
      {/* tabIndex={-1}: the landmark a closing dialog hands focus to when the
          control it was opened from did not survive it — a restore onto a
          detached node is silent, and focus falls to <body>. See
          components/ui/Modal.tsx#restoreFocus. */}
      <main ref={mainRef} tabIndex={-1} className="pb-16">
        <header className="flex flex-wrap items-end justify-between gap-4 pt-6">
          <div>
            <Eyebrow>projects</Eyebrow>
            <h1 className="font-instrument mt-3 text-4xl text-white">Projects</h1>
          </div>
          {/* The expert path: the old dialog, exactly as before, for whoever
              knows the four answers already. The primary create walks the
              guided wizard (/projects/new). NEITHER is theme-gated any more:
              the wizard's style stage offers presets and mints a locked theme
              at create, and the dialog explains an empty style shelf itself —
              bouncing both buttons to /library was sending users away from
              surfaces that can now answer them.

              IT STAYS OUTLINED AND DIM, and that is the point: it is a
              shortcut for somebody who has been here before, and on a first
              visit it must not compete with the filled create button in the
              panel below. Reachable, never loudest. */}
          <button
            type="button"
            onClick={() => setDialog({ open: true, project: null })}
            className="font-jetbrains rounded-full border border-white/12 px-3 py-1.5 text-label text-white/45 transition hover:border-white/25 hover:text-white/75"
          >
            quick create — the expert form
          </button>
        </header>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-sm text-rose-200">
            {error} — your projects live in this browser&rsquo;s storage, and it did not answer.
          </p>
        )}

        {demos.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-white/8 bg-white/[0.015] px-4 py-2.5">
            <p className="font-hanken flex flex-wrap items-center gap-2 text-label text-slate-400">
              <DemoTag />
              {demos.length === 1
                ? "One row on this shelf is an example this account was opened with"
                : `${demos.length} rows on this shelf are examples this account was opened with`}{" "}
              — open them, edit them, or clear them out.
            </p>
            {/* THE TRIGGER IS ALSO THE CANCEL, and it never unmounts — it
                changes its word. A confirm that swaps its own opener out drops
                a keyboard user on <body>, which is the failure Modal.tsx and
                ConfirmDelete below both spend paragraphs avoiding. The
                confirmation button `autoFocus`es instead (it only ever mounts
                from a click, so it cannot steal focus on load), and pressing
                the trigger again backs out with focus still on it. */}
            <span className="flex flex-wrap items-center gap-2">
              {clearing && (
                <>
                  <span className="font-hanken text-label text-slate-300">
                    Delete {demos.length === 1 ? "it" : `all ${demos.length}`}?
                  </span>
                  <button
                    type="button"
                    autoFocus
                    onClick={clearExamples}
                    disabled={wiping}
                    className="font-jetbrains cursor-pointer rounded-lg border border-rose-400/35 px-3 py-1 text-label text-rose-200 transition hover:bg-rose-400/10 disabled:cursor-default disabled:opacity-50"
                  >
                    {wiping ? "clearing…" : "yes, clear them"}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setClearing((c) => !c)}
                disabled={wiping}
                className="font-jetbrains shrink-0 cursor-pointer rounded-lg border border-white/12 px-3 py-1 text-label text-white/45 transition hover:border-white/25 hover:text-white/75 disabled:opacity-50"
              >
                {clearing ? "keep them" : "clear the examples"}
              </button>
            </span>
          </div>
        )}

        <section className="mt-6">
          {loading ? (
            <p className="font-jetbrains py-16 text-center text-label tracking-[0.18em] text-white/30 uppercase">
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
              // Always the wizard: its style stage offers presets (minted into
              // a locked theme at create) and an honest empty state that
              // routes, so there is no account state in which sending the user
              // to /library first is the better answer. The header's "quick
              // create" keeps the dialog as the expert path.
              onCreate={() => router.push("/projects/new")}
            />
          )}
        </section>

        {/* THE STYLE NOTE — a fact, and it sits AFTER the shelf.

            It used to be an amber banner directly under the title: the
            highest-contrast element on a first-run screen, ending in a button
            to /library. Amber is this app's warning colour (see the dev-auth
            banner in components/ui/StudioFrame), and the sentence's own second
            half says nothing is blocked — the wizard hands out presets that
            lock on create. So the loudest thing on the screen was announcing a
            non-problem AND pointing away from the one action here.

            Neutral chrome, and moved below the shelf, so the page reads
            primary action first and footnote second. The fact is kept rather
            than dropped: the wizard's style stage states it again where it
            actually bears on a decision, and /library is still one click from
            here for someone who came to commission a style. */}
        {gated && (
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-white/8 bg-white/[0.015] px-4 py-3">
            <Info aria-hidden className="mt-1 h-4 w-4 shrink-0 text-white/25" />
            <p className="font-hanken text-label text-slate-400">
              Every project is rendered against a locked visual style, and this account has none
              yet. Nothing is blocked by that — the create wizard offers presets that lock when you
              create.{" "}
              <Link
                href="/library"
                className="rounded-sm text-slate-300 underline underline-offset-4 transition hover:text-white"
              >
                Commission your own in the library →
              </Link>
            </p>
          </div>
        )}
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
