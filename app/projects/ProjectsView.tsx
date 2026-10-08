"use client";

// /projects — the shelf the studio opens from.
//
// Prototype round 1 ran three shelves behind a switcher: a ledger (a book of
// record, sortable by any column), a call sheet (queued by what needs you) and
// this matrix. The matrix won and the other two are gone — a list tells you
// what you have, and only the grid tells you where the whole shelf is jammed.
//
// ROUND 2 (platform-consolidation WP2, 2026-10-04) reopened it for scale: the
// shelf has to hold hundreds of projects and absorb StatReel's rundown. Three
// directions ran behind `?v=1|2|3` over one query model (app/_projects/shelf.ts)
// — a windowed ledger, a race sheet, a pivot board — and the race sheet won
// (operator verdict, 2026-10-05). The other two are gone and so is the switch.
// This host keeps what is not the sheet's: storage, the dialogs, the demo
// shelf, the style gap, and the dev-only synthetic shelf.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Upload, X, Zap } from "lucide-react";

import StudioFrame from "@/components/ui/StudioFrame";
import { Button } from "@/components/ui/Primitives";
import { Ghost, Tally } from "@/components/ui/signal";
import { errorText, importTallies } from "@/components/ui/archiveSummary";
import { importArchive, type ImportReport } from "@/lib/studioArchive";
import { useAnnounce } from "@/lib/announcer";
import { useAuth } from "@/lib/useAuth";
import { useProjects } from "@/lib/useProjects";
import { useThemes } from "@/lib/useThemes";
import { lockedOnly } from "@/lib/themes";
import { isSeeded } from "@/app/_studio/projectSeed";
import type { Project, ProjectContents, ProjectDraft } from "@/lib/projects";

import RaceSheet from "../_projects/RaceSheet";
import { DemoChip, EmptyShelf } from "../_projects/parts";
import type { SurfaceProps } from "../_projects/surface";
import { isSynthetic, syntheticProjects } from "../_projects/synthetic";

/* ── The two dialogs, out of the route chunk (Wave 1, 2026-10-08) ─────────
 *
 * The create/edit form and the delete confirm are on screen only once somebody
 * presses quick-create, a row's pencil or a row's bin, and the form pulls the
 * wizard's runtime band (./wizard/stages) in behind it. So they load as their
 * own chunk, and the page fetches it when the main thread is idle after the
 * shelf has painted — by the time a hand reaches a pencil it is already here.
 *
 * `loading: () => null`, not `pendingPanel`: a Modal holds no place in the
 * page's flow (it portals over it), so there is no box to keep from
 * collapsing, and a panel-sized placeholder in <main> would be a layout jump
 * for a few milliseconds. Both mount only while open — Modal renders nothing
 * closed, so an always-mounted closed dialog bought nothing but the import. */
const loadDialogs = () => import("../_projects/ProjectDialog");
const ProjectDialog = dynamic(loadDialogs, { loading: () => null });
const ConfirmDelete = dynamic(() => loadDialogs().then((m) => m.ConfirmDelete), { loading: () => null });

/** `?seed=N` is honoured only outside a production build. `NODE_ENV` is inlined
 *  at build time, so in production this is a constant 0 and the synthetic
 *  branch below is dead code. */
const seedOf = (raw: string | null): number =>
  process.env.NODE_ENV !== "production" ? Math.max(0, Math.floor(Number(raw) || 0)) : 0;

export default function ProjectsView() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const stored = useProjects(user?.uid ?? null);
  const { error, loading, create, readFailed, reload } = stored;

  /* ── The synthetic shelf (dev only, never stored) ─────────────────────────
   *
   * `?seed=300` merges 300 fixture projects into the list (app/_projects/
   * synthetic.ts). Edits and deletes on them are applied here, in memory, so
   * every path the sheet drives can be exercised at volume without one row
   * reaching IndexedDB. `update` and `remove` below are the ONLY writers the
   * page calls, and they route a synthetic id away from storage. */
  const seedN = seedOf(params.get("seed"));
  const [synthEdits, setSynthEdits] = useState<ReadonlyMap<string, Project>>(new Map());
  const [synthGone, setSynthGone] = useState<ReadonlySet<string>>(new Set());
  const synthetic = useMemo(
    () =>
      seedN > 0
        ? syntheticProjects(seedN, user?.uid ?? "dev")
            .filter((p) => !synthGone.has(p.id))
            .map((p) => synthEdits.get(p.id) ?? p)
        : [],
    [seedN, user?.uid, synthGone, synthEdits],
  );
  const projects = useMemo(
    () => (stored.projects === null ? null : [...stored.projects, ...synthetic]),
    [stored.projects, synthetic],
  );

  const storedUpdate = stored.update;
  const update = useCallback(
    async (id: string, patch: Partial<Project>): Promise<Project | null> => {
      if (!isSynthetic({ id })) return storedUpdate(id, patch);
      const current = synthetic.find((p) => p.id === id);
      if (!current) return null;
      const next = { ...current, ...patch, updatedAt: Date.now() };
      setSynthEdits((m) => new Map(m).set(id, next));
      return next;
    },
    [storedUpdate, synthetic],
  );
  const storedRemove = stored.remove;
  const remove = useCallback(
    async (id: string): Promise<ProjectContents | null> => {
      if (!isSynthetic({ id })) return storedRemove(id);
      setSynthGone((g) => new Set(g).add(id));
      return { steps: 0, phases: [] };
    },
    [storedRemove],
  );
  // The gate: a project is rendered against a locked visual identity, so one
  // has to exist before there is anything to create. See /library.
  //
  // Memoised because the dialog reseeds its draft when this identity changes,
  // and a fresh array on every render is a fresh identity on every render.
  const { themes, reload: reloadThemes } = useThemes(user?.uid ?? null);
  const allThemes = useMemo(() => themes ?? [], [themes]);
  const lockedThemes = useMemo(() => lockedOnly(allThemes), [allThemes]);
  const gated = themes !== null && lockedThemes.length === 0;

  const [dialog, setDialog] = useState<{
    open: boolean;
    project: Project | null;
  }>({
    open: false,
    project: null,
  });
  const [doomed, setDoomed] = useState<Project | null>(null);
  // A write from a dialog failed. Set only after that dialog's own write
  // resolves null and cleared whenever a dialog opens, so a stale read error
  // never leaks into a fresh one. The banner above sits under the Modal scrim.
  const [writeFailed, setWriteFailed] = useState(false);

  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 600));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => void loadDialogs());
    return () => cancel(id);
  }, []);

  /* ── The demo shelf, said out loud ──────────────────────────────────────
   *
   * A brand-new account is handed six fictional productions (lib/useProjects
   * seeds them so the studio has something to open), and until 2026-09 they
   * were drawn exactly like work the user made: a stranger's real first screen
   * was six projects with progress and "2h ago" timestamps they had never
   * touched. The seeding stays — it is the product decision, and the genuinely
   * empty shelf is one confirm away instead of six deletes.
   *
   * It was a full-width strip with a sentence in it; since round 2 it is the
   * `demo 6` chip in the sheet's toolbar (parts.tsx#DemoChip), which owns the
   * question. This keeps the answer. The chip goes on its own once the
   * examples are gone. */
  const demos = useMemo(() => (projects ?? []).filter(isSeeded), [projects]);
  const [wiping, setWiping] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Sequential, not Promise.all: `remove` opens its own IndexedDB handle per
  // call and the shelf re-renders after each one, so the row count visibly
  // falls. A failure raises the banner above and stops nothing that already
  // went — the shelf shows exactly what survived, which is the truth.
  //
  // Then focus lands on the landmark, for the reason ConfirmDelete's own note
  // below states at length: the control this was fired from is the chip's
  // confirm, the chip is gone the moment the last example is, and a restore
  // onto a detached node is silent — focus falls to <body>.
  const clearExamples = async () => {
    setWiping(true);
    for (const p of demos) await remove(p.id);
    setWiping(false);
    mainRef.current?.focus();
  };

  /* ── Import archive (AUP-B) ────────────────────────────────────────────
   *
   * A `.gravitone` file — what the sign-out dialog and local mode's account
   * menu save — brought back into THIS account. `skip` is the default policy:
   * a row this account already holds stays as it is and the archive's copy is
   * dropped, so importing the same file twice changes nothing. Another
   * account's row is always re-minted (lib/studioArchive.ts, COLLISIONS).
   *
   * The result is drawn as counts; a refusal or a storage error is shown in
   * the archive code's own words. Verified in full before one write
   * transaction, so a refused file wrote nothing. */
  const announce = useAnnounce();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<ImportReport | null>(null);
  const [importFailure, setImportFailure] = useState<string | null>(null);
  const importFile = async (file: File) => {
    if (!user?.uid) return;
    setImporting(true);
    setImported(null);
    setImportFailure(null);
    try {
      const report = await importArchive(file, user.uid, { onCollision: "skip" });
      setImported(report);
      announce({
        key: `archive-imported:${Date.now()}`,
        text: `Archive imported: ${importTallies(report)
          .map((t) => `${t.n} ${t.label}`)
          .join(", ")}`,
      });
      await Promise.all([reload(), reloadThemes()]);
    } catch (e) {
      const text = errorText(e);
      setImportFailure(text);
      announce({ key: `archive-import-failed:${Date.now()}`, text });
    } finally {
      setImporting(false);
    }
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
      // Edit delegates through useProjects.update to atomic in-transaction editProject;
      // passes draft cleanly without clobbering background phase or progress writes.
      const saved = await update(editing.id, draft);
      setWriteFailed(!saved);
      if (saved) setDialog({ open: false, project: null });
      return;
    }
    const made = await create(draft);
    setWriteFailed(!made);
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
      <main ref={mainRef} tabIndex={-1} className="pt-6 pb-16">
        {/* NO EYEBROW, NO <h1> ON THE PIXELS, AND NO HEADER (2026-09-08). This
            page opened with `projects` / `Projects` over a nav whose Projects
            item is the active one — three labels naming one place, stacked. The
            nav has said which module you are in since 0ffc865 (`text-white` +
            aria-current), which is what made these two redundant rather than
            merely repetitive; with them gone the header band held one small
            button and 100px of nothing, so the band went too and the button
            moved next to the create control it is the shortcut for (`aside`,
            _projects/surface.ts#SurfaceProps).

            The heading stays as a landmark: `sr-only` keeps the document's
            outline intact for a screen reader and for anything that walks
            headings, which a deleted <h1> would have broken. */}
        <h1 className="sr-only">Projects</h1>

        {/* {error} ALONE. It used to be followed by "— your projects live in
            this browser's storage, and it did not answer", which restates the
            `local` pill standing in the nav two inches above it, on every
            failure, forever. The machine's own words are the finding; where
            the storage is, is chrome that is already on screen. */}
        {error && (
          <p className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-content text-rose-200">
            {error}
          </p>
        )}

        {/* Spoken through the announcer (lib/announcer.tsx rule 2: one
            writer), not by a live region of its own. */}
        {importFailure && (
          <p
            data-testid="import-failure"
            className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-content text-rose-200"
          >
            {importFailure}
          </p>
        )}
        {imported && (
          <div data-testid="import-result" className="mb-4 flex flex-wrap items-center gap-2 px-1">
            <Upload aria-hidden className="h-4 w-4 text-white/45" />
            <span className="sr-only">Archive imported:</span>
            {importTallies(imported).map((t) => (
              <Tally key={t.label} label={t.label} value={t.n} tone={t.tone} />
            ))}
            <button
              type="button"
              onClick={() => setImported(null)}
              aria-label="Dismiss import result"
              className="ml-1 cursor-pointer rounded-full p-1 text-white/45 transition hover:text-white/80"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
        )}

        <section>
          {loading ? (
            // Three ghost rows, not "reading the shelf…". The wait is short and
            // the sentence described the app's own errand; the outline is the
            // shape of what is coming, in the row height the matrix will fill.
            // `label` keeps it spoken — a dashed border says nothing to a
            // screen reader (components/ui/signal/Ghost.tsx).
            <Ghost shape="row" count={3} label="Reading the shelf" />
          ) : readFailed && (projects ?? []).length === 0 ? (
            // The list could not be read: that is not an empty shelf, and the
            // create control would invite a write into the store that just
            // failed. The banner above carries the machine's message.
            <Button variant="ghost" className="cursor-pointer px-4 py-2" onClick={() => void reload()}>
              Try again
            </Button>
          ) : (
            <Shelf
              projects={projects ?? []}
              onOpen={(p, step) =>
                // The project is the RESOURCE and gets the path; the step is a
                // VIEW onto it and gets a query. Both are shareable, and a step
                // that no longer exists degrades to the project's own default
                // rather than 404ing a URL someone sent a colleague.
                router.push(`/studio/${p.id}${step ? `?step=${step}` : ""}`)
              }
              onEdit={(p) => {
                setWriteFailed(false);
                setDialog({ open: true, project: p });
              }}
              onDelete={(p) => {
                setWriteFailed(false);
                setDoomed(p);
              }}
              // Always the wizard: its style stage offers presets (minted into
              // a locked theme at create) and an honest empty state that
              // routes, so there is no account state in which sending the user
              // to /library first is the better answer. The header's "quick
              // create" keeps the dialog as the expert path.
              onCreate={() => router.push("/projects/new")}
              /* The expert path: the old dialog, exactly as before, for whoever
                 knows the four answers already. The primary create walks the
                 guided wizard (/projects/new). NEITHER is theme-gated any more:
                 the wizard's style stage offers presets and mints a locked theme
                 at create, and the dialog explains an empty style shelf itself —
                 bouncing both buttons to /library was sending users away from
                 surfaces that can now answer them.

                 IT STAYS OUTLINED AND DIM, and that is the point: it is a
                 shortcut for somebody who has been here before, and it must not
                 compete with the create control beside it. Reachable, never
                 loudest.

                 ITS LABEL WAS `quick create — the expert form`: a button naming
                 its own audience, next to a filled cyan pill reading "New
                 project". Weight already says primary-vs-shortcut, so the words
                 only had to say WHICH ACT, and a glyph says that. The name
                 survives where a name belongs — on `aria-label`, which is what
                 a screen reader announces and what the two-word `title` echoes
                 for a mouse. */
              aside={
                <>
                  {demos.length > 0 && <DemoChip count={demos.length} busy={wiping} onClear={clearExamples} />}
                  {/* `hidden`: the visible control is the button below, and a
                      display:none file input still opens its picker on click(). */}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".gravitone,application/gzip,application/x-ndjson"
                    hidden
                    data-testid="import-archive-input"
                    onChange={(e) => {
                      const f = e.currentTarget.files?.[0];
                      e.currentTarget.value = "";
                      if (f) void importFile(f);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={importing}
                    aria-busy={importing}
                    data-testid="import-archive"
                    className="font-jetbrains flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-white/12 px-4 text-label text-white/45 transition hover:border-white/25 hover:text-white/75 disabled:cursor-wait disabled:opacity-60"
                  >
                    <Upload aria-hidden className="h-4 w-4" />
                    Import archive
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWriteFailed(false);
                      setDialog({ open: true, project: null });
                    }}
                    aria-label="Quick create"
                    title="Quick create"
                    className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/12 text-white/45 transition hover:border-white/25 hover:text-white/75"
                  >
                    <Zap aria-hidden className="h-4 w-4" />
                  </button>
                </>
              }
            />
          )}
        </section>

        {/* THE STYLE GAP — a fact, DRAWN, and it sits AFTER the shelf.

            It was an amber banner directly under the title once: the
            highest-contrast element on a first-run screen, ending in a button
            to /library. Amber is this app's warning colour (see the dev-auth
            banner in components/ui/StudioFrame), so the loudest thing on the
            screen was announcing a non-problem AND pointing away from the one
            action here. b49e8bd demoted it — below the shelf, neutral chrome —
            and added "Nothing is blocked by that" so it stopped reading as an
            error. BOTH OF THOSE DECISIONS STAND. What goes is the prose.

            Two sentences of app-narration ("Every project is rendered against
            a locked visual style… the create wizard offers presets that lock
            when you create") are the app explaining its own mechanism, and the
            second was there only to undo the alarm the first raised. The rules
            they stated are enforced in code and restated where they bear on a
            decision: lib/themes#lockedOnly gates this, and the wizard's style
            stage offers the presets and mints a locked theme at create
            (app/_projects/wizard/stages.tsx). Nothing is blocked here, which
            is why this is a chip and not a Notice — amber says "needs a call",
            rose would say "broken".

            So: the hollow swatch this app already uses for a style that is not
            there, the count, and the route. `of` is every style the account
            holds, because "0 locked" and "0 locked of 3 drafts" are different
            facts about what to do next, and only the ratio tells them apart.
            The link is an ACTION, not narration — /library is still one click
            from a shelf whose owner came to commission a style. */}
        {/* ROUND 2 (2026-10-05) took the box away: a bordered panel under a
            bordered sheet read as a second table with one cell in it. It is a
            line now, at the sheet's left edge — the same three facts. */}
        {gated && (
          <div className="mt-3 flex flex-wrap items-center gap-3 px-1">
            {/* The hollow twin of a style's face — the same absent-swatch shape
                ProjectDialog#StyleSwatch draws for "no style" and the wizard's
                EmptyStyleDeck draws where a style card would be. Dashed, so it
                reads as a slot rather than a rule. */}
            <span
              aria-hidden
              className="h-3.5 w-10 shrink-0 rounded-full border border-dashed border-amber-300/50"
            />
            <Tally
              label="locked styles"
              value={0}
              of={allThemes.length || undefined}
              tone="amber"
            />
            <Link
              href="/library"
              className="font-hanken rounded-sm text-label text-slate-300 underline underline-offset-4 transition hover:text-white"
            >
              Commission your own in the library →
            </Link>
          </div>
        )}
      </main>

      {dialog.open && (
        <ProjectDialog
          open={dialog.open}
          project={dialog.project}
          themes={allThemes}
          onClose={() => setDialog({ open: false, project: null })}
          onSubmit={submit}
          error={writeFailed ? error : null}
        />
      )}
      {doomed && (
        <ConfirmDelete
          project={doomed}
          onClose={() => setDoomed(null)}
          error={writeFailed ? error : null}
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
            setWriteFailed(!took);
            if (took) setDoomed(null);
          }}
        />
      )}
    </StudioFrame>
  );
}

/** An empty shelf has nothing to arrange, so the sheet is not mounted for it:
 *  no toolbar over nothing, one filled create control (parts.tsx#EmptyShelf). */
function Shelf(props: SurfaceProps) {
  if (props.projects.length === 0) return <EmptyShelf onCreate={props.onCreate} aside={props.aside} />;
  return <RaceSheet {...props} />;
}
