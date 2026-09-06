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

import Modal from "@/components/ui/Modal";
import { Eyebrow, Button } from "@/components/ui/Primitives";
import { Field, NumberInput, Segmented, TextArea, TextInput } from "@/components/ui/Field";
import {
  DISCIPLINES,
  DISCIPLINE_LABEL,
  DISCIPLINE_NOTE,
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

  const tpl = templateOf(draft.template);
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
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="font-jetbrains text-label text-white/35">
            {project ? "saved to this browser" : "opens in the studio"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" className="cursor-pointer px-4 py-2" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              className="cursor-pointer px-5 py-2"
              disabled={!valid || busy}
              onClick={() => void submit()}
            >
              {busy ? "Saving…" : project ? "Save" : "Create & open"}
            </Button>
          </div>
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

        <Field
          label="Logline"
          htmlFor="p-logline"
          hint="Optional — one sentence. It is what the script step argues back against."
        >
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
          <Field label="Visual style" hint="Fixed at creation — frames are rendered against it.">
            {chosen.theme ? (
              <p className="font-hanken flex items-center gap-2.5 text-content text-slate-300">
                <StyleSwatch theme={chosen.theme} />
                {chosen.theme.name}
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
          <Field
            label="Visual style"
            hint="A locked style from the library. Every frame this project renders is built on it."
          >
            {!fittingThemes.length && (
              <p className="font-hanken text-sm text-amber-200/90">
                No locked style fits {DISCIPLINE_LABEL[discipline].toLowerCase()} yet. The guided
                wizard at{" "}
                <a href="/projects/new" className="underline decoration-amber-200/40 underline-offset-2">
                  /projects/new
                </a>{" "}
                offers presets that lock on create; or lock one in the library, or one from a brief,
                which fits every discipline.
              </p>
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

        <Field
          label="Target runtime"
          htmlFor="p-dur"
          hint={
            // Free form has no measured band — its `range` is only what the
            // input accepts — so the hint must not call it a measurement.
            discipline === "free"
              ? "Nothing was measured for a free-form video. There is no craft band here; the studio only keeps time."
              : `${tpl.label} was measured at ${tpl.range[0]}–${tpl.range[1]}s. Past that band the craft rules stop applying.`
          }
        >
          <NumberInput
            id="p-dur"
            unit="s"
            min={5}
            max={900}
            value={draft.targetS}
            onChange={(e) => {
              setOwnDuration(true);
              setDraft((d) => ({ ...d, targetS: Number(e.target.value) || 0 }));
            }}
          />
        </Field>
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
      <p className="font-hanken text-content text-slate-300">
        The record goes from this browser&rsquo;s storage and does not come back. Nothing is deleted
        anywhere else — there is nowhere else yet.
      </p>

      {holds && holds.steps > 0 && (
        <p
          data-testid="delete-takes"
          className="font-hanken mt-3 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] px-4 py-3 text-content leading-snug text-rose-100"
        >
          <span className="font-jetbrains text-label tracking-[0.14em] text-rose-200/80 uppercase">
            and its work goes with it
          </span>
          <br />
          {holds.steps} saved {holds.steps === 1 ? "step" : "steps"} — {named.join(", ")}.
          {paid && " The frames include generated plates, which cost real money to produce."} There
          is no undo.
        </p>
      )}

      {holds && holds.steps === 0 && (
        <p data-testid="delete-takes" className="font-hanken mt-3 text-content text-slate-400">
          Nothing has been saved into its steps yet, so the record is all there is to take.
        </p>
      )}
    </Modal>
  );
}
