"use client";

// Create / edit a project. The one place the user names the thing — the name
// they type here is the headline /studio renders, which is why title is the
// only required field and why the create button says where it goes.
//
// Four choices, in the order they depend on each other: discipline (what kind
// of video), template (which craft format inside it), style (a locked visual
// identity that fits the discipline), runtime. Template and target runtime
// come from the craft library (knowledge/templates/*): picking a template sets
// the runtime it measured, and the note under the pills is that template's own
// one-liner. A project should be creatable in eight seconds.

import { useEffect, useMemo, useState } from "react";

import { ArrowUpRight } from "lucide-react";

import Modal from "@/components/ui/Modal";
import { Eyebrow, Button } from "@/components/ui/Primitives";
import { Field, NumberInput, Segmented, TextArea, TextInput } from "@/components/ui/Field";
import { Hint } from "@/components/ui/signal";
import { DUR_MAX, DUR_MIN, RuntimeBand } from "./wizard/stages";
import {
  DISCIPLINES,
  DISCIPLINE_LABEL,
  DISCIPLINE_NOTE,
  PHASES,
  PHASE_TITLE,
  disciplineOf,
  projectContents,
  templateOf,
  templatesFor,
  type Discipline,
  type PhaseKey,
  type Project,
  type ProjectContents,
  type ProjectDraft,
  type TemplateId,
} from "@/lib/projects";
import { lockedOnly, projectStyle, STYLE_MISS_WORD, styleFits, type Theme } from "@/lib/themes";

const blank = (): ProjectDraft => ({
  title: "",
  logline: "",
  discipline: "educational",
  template: "short-educational-video",
  targetS: templateOf("short-educational-video").defaultS,
  themeId: undefined,
});

export default function ProjectDialog({
  open,
  project,
  themes,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Absent = create. Present = edit that record. */
  project: Project | null;
  /** EVERY visual identity on this account, not only the locked ones. Create
   *  offers the locked subset (and /projects does not open this dialog when
   *  that subset is empty); EDIT has to resolve the style a project already
   *  has, which is a different question — a style that is missing from this
   *  list is missing for a reason the user is owed. */
  themes: Theme[];
  onClose: () => void;
  /** Resolves once the write has landed. The dialog stays open until it does,
   *  so a failed save keeps the draft the user typed — see `submit` below. */
  onSubmit: (draft: ProjectDraft) => void | Promise<unknown>;
}) {
  const [draft, setDraft] = useState<ProjectDraft>(blank);
  // Whether the user has taken ownership of the runtime. Until they do,
  // switching template moves it; after they do, we never overwrite their number.
  const [ownDuration, setOwnDuration] = useState(false);

  const lockedThemes = useMemo(() => lockedOnly(themes), [themes]);

  useEffect(() => {
    if (!open) return;
    if (project) {
      const { title, logline, template, targetS, themeId } = project;
      setDraft({
        title,
        logline,
        discipline: project.discipline ?? disciplineOf(template),
        template,
        targetS,
        themeId,
      });
      setOwnDuration(true);
    } else {
      // Pre-select the most recently locked style. It is the one they almost
      // certainly just made, and a required field that starts empty is a
      // speed bump on the eight-second create this dialog promises.
      setDraft({ ...blank(), themeId: lockedThemes[0]?.id });
      setOwnDuration(false);
    }
  }, [open, project, lockedThemes]);

  const discipline: Discipline = draft.discipline ?? disciplineOf(draft.template);
  const templates = templatesFor(discipline);
  // Only styles that fit the discipline are offered: the SAME predicate
  // /library filters its wall with (lib/themes.ts#styleFits).
  const fittingThemes = useMemo(
    () => lockedThemes.filter((t) => styleFits(t, discipline)),
    [lockedThemes, discipline],
  );
  // The SAME resolver the studio renders with (lib/themes.ts) — so what this
  // dialog says a project's style is, and what its frames actually come back
  // in, cannot disagree.
  const chosen = projectStyle(themes, draft.themeId);
  // A style is required to CREATE and immutable on EDIT — reskinning a project
  // midway would orphan every frame already rendered against the old identity.
  const valid = draft.title.trim().length > 0 && (Boolean(project) || Boolean(draft.themeId));

  const pickTemplate = (template: TemplateId) =>
    setDraft((d) => ({
      ...d,
      template,
      targetS: ownDuration ? d.targetS : templateOf(template).defaultS,
    }));

  // Changing the discipline moves the template to the first of its own, so the
  // record can never carry a template outside its discipline (on edit too).
  // A chosen style that no longer fits is dropped on create; on edit the style
  // is immutable and stays, whatever it is tagged.
  const pickDiscipline = (next: Discipline) =>
    setDraft((d) => {
      const template = templatesFor(next)[0].id;
      return {
        ...d,
        discipline: next,
        template,
        targetS: ownDuration ? d.targetS : templateOf(template).defaultS,
        themeId:
          project || !d.themeId || themes.some((t) => t.id === d.themeId && styleFits(t, next))
            ? d.themeId
            : undefined,
      };
    });

  /** AWAIT THE WRITE, and hold the dialog open while it runs.
   *
   *  This used to be fire-and-forget, and the caller closed the dialog in the
   *  line before it. `ConfirmDelete`, twenty lines away in the same view,
   *  already argues the case at length: "closing a confirmation over work that
   *  was not done is the same small lie as a button that does nothing." Both
   *  writers report failure the same way — `create` and `update` resolve to
   *  null and raise the shelf's error banner — and only the delete flow read
   *  the answer. A quota or blocked-tab failure closed this dialog, discarded
   *  everything the user had typed, and left a banner explaining a loss that
   *  had already happened.
   *
   *  Holding it open needs the busy flag: the await opens a window the
   *  close-first version did not have, and without it a slow write takes two
   *  presses and makes two projects. */
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onSubmit(draft);
    } finally {
      // The caller closes on success; on failure this dialog is still mounted
      // and must be usable again. Setting it either way is safe — an unmounted
      // component's setState is a no-op in React 19, not a warning.
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? project.title : "New project"}
      eyebrow={<Eyebrow>{project ? "edit" : "create"}</Eyebrow>}
      className="max-w-xl"
      // The footer used to open with `saved to this browser` / `opens in the
      // studio` — a caption for the button standing beside it, which already
      // says "Save" and "Create & open". Where it saves is the `local` pill in
      // the nav; where it opens is the second word of the button. The arrow
      // does the one thing the words could not: draw the leaving.
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" className="cursor-pointer px-4 py-2" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="inline-flex cursor-pointer items-center gap-1.5 px-5 py-2"
            disabled={!valid || busy}
            onClick={() => void submit()}
          >
            {busy ? "Saving…" : project ? "Save" : "Create & open"}
            {!busy && !project && <ArrowUpRight aria-hidden className="h-4 w-4" />}
          </Button>
        </div>
      }
    >
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Project name" htmlFor="p-title">
          <TextInput
            id="p-title"
            autoFocus
            value={draft.title}
            placeholder="Glass Harbor"
            maxLength={80}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
        </Field>

        {/* `Optional` in the label, the rest deleted — the same move and the
            same reasoning as the wizard's logline field (wizard/stages.tsx),
            said once in each of the two faces so they cannot drift. */}
        <Field label="Logline · optional" htmlFor="p-logline">
          <TextArea
            id="p-logline"
            rows={2}
            value={draft.logline}
            placeholder="A crew that never breaks in — they wait for the one door every city leaves unlocked."
            maxLength={240}
            onChange={(e) => setDraft((d) => ({ ...d, logline: e.target.value }))}
          />
        </Field>

        <Segmented
          label="Discipline"
          value={discipline}
          options={DISCIPLINES.map((d) => ({ id: d, label: DISCIPLINE_LABEL[d], note: DISCIPLINE_NOTE[d] }))}
          onChange={pickDiscipline}
        />

        <Segmented
          label="Template"
          value={draft.template}
          options={templates.map((t) => ({ id: t.id, label: t.label, note: t.note }))}
          onChange={pickTemplate}
        />

        {project ? (
          // Immutable after creation. Shown rather than hidden, because "which
          // style is this on" is a question the shelf should always answer.
          //
          // The hint under it read "Fixed at creation — frames are rendered
          // against it." A lock is what a lock glyph means, and the disclosure
          // behind it carries the reason in five words. The fact itself is not
          // lost from the flow: the wizard's name stage states it in full at
          // the one moment it is still a decision (wizard/stages.tsx, bd2701e).
          <Field label="Visual style">
            {chosen.theme ? (
              <p className="font-hanken flex items-center gap-2.5 text-content text-slate-300">
                <StyleSwatch theme={chosen.theme} />
                {chosen.theme.name}
                <Hint variant="lock" label="Why this cannot be changed">
                  every frame was rendered against it
                </Hint>
              </p>
            ) : (
              // A style that cannot be resolved is SAID, and said accurately.
              // This line used to read "created before styles existed" for both
              // cases, which turned a deleted style into a reassuring sentence
              // about an old record.
              <p className="font-hanken text-content text-amber-200/90">
                Not available — {STYLE_MISS_WORD[chosen.miss]}. Its frames render on a fallback preset,
                and the Frames step names it.
              </p>
            )}
          </Field>
        ) : (
          // No hint on create: what a style is, is the row of swatched pills
          // under this label, and every one of them is a locked style from the
          // library. The permanence the old hint reached for is stated at the
          // point of commit instead — see the wizard's name stage.
          <Field label="Visual style">
            {/* A ROUTE, DRAWN AS THE PILL THAT IS MISSING. This was 45 words
                that printed `/projects/new` as literal text in the middle of a
                sentence — a URL for the user to read and retype, in an app
                where every other destination is a link. It is now the hollow
                twin of the pills beside it: the same shape, dashed, with an
                empty swatch, sitting in the row where a style would be. */}
            {!fittingThemes.length && (
              // The discipline is not named here: the Segmented control
              // directly above has it selected and highlighted, so "fits WHAT"
              // is answered two inches up. Naming it made the pill wrap.
              <a
                href="/projects/new"
                aria-label={`No style fits ${DISCIPLINE_LABEL[discipline].toLowerCase()} — pick a preset in the guided create`}
                className="font-jetbrains mb-2 inline-flex items-center gap-2 rounded-full border border-dashed border-amber-300/40 px-3 py-1.5 text-label whitespace-nowrap text-amber-200/90 transition hover:bg-amber-300/10"
              >
                <StyleSwatch />
                No style fits — pick a preset →
              </a>
            )}
            <div className="flex flex-wrap gap-1.5">
              {fittingThemes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, themeId: t.id }))}
                  className={`font-jetbrains flex items-center gap-2 rounded-full border px-3 py-1.5 text-label transition ${
                    draft.themeId === t.id
                      ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                      : "border-white/12 text-white/60 hover:text-white/85"
                  }`}
                >
                  <StyleSwatch theme={t} />
                  {t.name}
                </button>
              ))}
            </div>
          </Field>
        )}

        {/* The same band picture the wizard draws, from the same component —
            this hint was the wizard's paragraph minus the trailer branch, so
            the two faces of creation disagreed about whether a trailer's window
            had ever been measured. One drawing, one truth.

            Beside the Field rather than in its `hint`, for the reason stated
            where the wizard does the same: Field's hint is a <p> and BandTrack
            is a <div>. */}
        <div className="grid gap-1.5">
          <Field label="Target runtime" htmlFor="p-dur">
            <NumberInput
              id="p-dur"
              unit="s"
              min={DUR_MIN}
              max={DUR_MAX}
              value={draft.targetS}
              onChange={(e) => {
                setOwnDuration(true);
                setDraft((d) => ({ ...d, targetS: Number(e.target.value) || 0 }));
              }}
            />
          </Field>
          <RuntimeBand
            targetS={draft.targetS}
            discipline={discipline}
            template={draft.template}
          />
        </div>
      </form>
    </Modal>
  );
}

/** A style, at a glance: its three colours in their roles. Enough to tell two
 *  styles apart in a pill without spending a thumbnail on it. */
function StyleSwatch({ theme }: { theme?: Theme }) {
  if (!theme) return <span className="h-3 w-8 rounded-full border border-white/15" aria-hidden />;
  return (
    <span className="flex h-3 w-8 overflow-hidden rounded-full border border-white/20" aria-hidden>
      {theme.block.palette.map((c) => (
        <span key={c.name} className="flex-1" style={{ background: c.hex }} />
      ))}
    </span>
  );
}

/** Deleting is the one destructive act on this shelf; it asks first, and it
 *  names what it is about to take.
 *
 *  It now names ALL of it. The delete used to remove the project row and orphan
 *  every step record under it — which made this copy accidentally accurate ("the
 *  record goes") and the behaviour wrong. Now that the delete is a cascade, this
 *  sentence would be an understatement instead, so the dialog reads the project's
 *  own step keys and says which steps go with it.
 *
 *  Counting costs nothing: `projectContents` reads primary KEYS off the
 *  by-project index and never touches the records, which for a composed cut are
 *  several megabytes of base64. The Delete button waits for that count anyway —
 *  a confirmation that has not finished saying what it will destroy has not
 *  finished being a confirmation. */
export function ConfirmDelete({
  project,
  onClose,
  onConfirm,
}: {
  project: Project | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [holds, setHolds] = useState<ProjectContents | null>(null);
  const id = project?.id ?? null;

  useEffect(() => {
    setHolds(null);
    if (!id) return;
    let alive = true;
    void projectContents(id).then((c) => {
      if (alive) setHolds(c);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // Step keys the app no longer knows a title for (a retired step, a future one)
  // are still named, in their raw form — under-naming what goes is the one thing
  // this dialog must not do.
  const named = (holds?.phases ?? []).map(
    (p) => PHASE_TITLE[p as PhaseKey] ?? p,
  );
  // Frames hold generated plates, and a plate is a vendor call that was paid for.
  const paid = (holds?.phases ?? []).includes("frames");

  return (
    <Modal
      open={Boolean(project)}
      onClose={onClose}
      title={project ? `Delete “${project.title}”?` : ""}
      className="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" className="cursor-pointer px-4 py-2" onClick={onClose}>
            Keep it
          </Button>
          <button
            onClick={onConfirm}
            disabled={!holds}
            data-testid="confirm-delete"
            className="font-jetbrains cursor-pointer rounded-full border border-rose-400/40 bg-rose-400/10 px-5 py-2 text-label text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-white/30"
          >
            {holds ? "Delete" : "reading…"}
          </button>
        </div>
      }
    >
      {/* THE PROSE ABOVE THE FIGURES IS GONE (2026-09-08). It read: "The record
          goes from this browser's storage and does not come back. Nothing is
          deleted anywhere else — there is nowhere else yet." A rose-bordered
          modal headed `Delete "X"?` with a rose Delete button and a "Keep it"
          beside it has already said every word of that. So has "There is no
          undo.", which followed the figures below.

          WHAT STAYS IS THE LEDGER, and it stays because it is the only thing on
          this dialog the user cannot work out for themselves: how many steps
          have work saved in them, which ones, and whether any of it was paid
          for. Those are figures about the work, and they are the reason this
          confirmation waits for `projectContents` before it will enable its own
          button. They are now drawn as the same five cells the shelf's matrix
          uses — filled rose where work exists, hollow where it does not — so
          the count has a shape as well as a number. */}
      {holds && (
        <div data-testid="delete-takes">
          {/* NUMBERS UNDER THE CELLS, NOT NAMES. This dialog is `max-w-md`, so
              five tracks are ~80px each and "1 Research" wraps to two lines in
              every one of them (measured 2026-09-08 — the fifth column ran past
              the panel). The names are not lost: the ones that carry work are
              spelled out in the line below, which is the only place they change
              anything, and every cell keeps its own `title` plus the sr-only
              key beneath. The numbers are the shelf's own column heads. */}
          <p className="sr-only">
            Steps holding saved work:{" "}
            {holds.steps > 0 ? named.join(", ") : "none"}.
          </p>
          <div aria-hidden className="grid grid-cols-5 gap-2">
            {PHASES.map((k, i) => {
              const has = (holds.phases ?? []).includes(k);
              return (
                <div key={k} title={PHASE_TITLE[k]}>
                  <div
                    className={`h-3 rounded-[3px] ${
                      has ? "bg-rose-400/55" : "border border-white/[0.09]"
                    }`}
                  />
                  <p
                    className={`font-jetbrains mt-1.5 text-center text-label ${
                      has ? "text-rose-200/80" : "text-white/30"
                    }`}
                  >
                    {i + 1}
                  </p>
                </div>
              );
            })}
          </div>

          {holds.steps > 0 ? (
            <p className="font-hanken mt-4 text-content leading-snug text-rose-100">
              {holds.steps} saved {holds.steps === 1 ? "step" : "steps"} — {named.join(", ")}.
              {paid && " The frames include generated plates, which cost real money to produce."}
            </p>
          ) : (
            <p className="font-hanken mt-4 text-content text-slate-400">No saved steps.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
