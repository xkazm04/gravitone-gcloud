"use client";

// Create / edit a project. The one place the user names the thing — the name
// they type here is the headline /studio renders, which is why title is the
// only required field and why the create button says where it goes.
//
// Three fields, no more. Template and target runtime come from the craft
// library (knowledge/templates/*): picking a template sets the runtime it
// measured, and the note under the pills is that template's own one-liner. A
// project should be creatable in eight seconds.

import { useEffect, useMemo, useState } from "react";

import Modal from "@/components/ui/Modal";
import { Eyebrow, Button } from "@/components/ui/Primitives";
import { Field, NumberInput, Segmented, TextArea, TextInput } from "@/components/ui/Field";
import {
  TEMPLATES,
  templateOf,
  type Project,
  type ProjectDraft,
  type TemplateId,
} from "@/lib/projects";
import { lockedOnly, projectStyle, STYLE_MISS_WORD, type Theme } from "@/lib/themes";

const blank = (): ProjectDraft => ({
  title: "",
  logline: "",
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
  onSubmit: (draft: ProjectDraft) => void;
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
      setDraft({ title, logline, template, targetS, themeId });
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

  const submit = () => {
    if (!valid) return;
    onSubmit(draft);
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
          <span className="font-jetbrains text-[11px] text-white/35">
            {project ? "saved to this browser" : "opens in the studio"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" className="cursor-pointer px-4 py-2" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="cursor-pointer px-5 py-2"
              disabled={!valid}
              onClick={submit}
            >
              {project ? "Save" : "Create & open"}
            </Button>
          </div>
        </div>
      }
    >
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
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
          label="Template"
          value={draft.template}
          options={TEMPLATES.map((t) => ({ id: t.id, label: t.label, note: t.note }))}
          onChange={pickTemplate}
        />

        {project ? (
          // Immutable after creation. Shown rather than hidden, because "which
          // style is this on" is a question the shelf should always answer.
          <Field label="Visual style" hint="Fixed at creation — frames are rendered against it.">
            {chosen.theme ? (
              <p className="font-hanken flex items-center gap-2.5 text-sm text-slate-300">
                <StyleSwatch theme={chosen.theme} />
                {chosen.theme.name}
              </p>
            ) : (
              // A style that cannot be resolved is SAID, and said accurately.
              // This line used to read "created before styles existed" for both
              // cases, which turned a deleted style into a reassuring sentence
              // about an old record.
              <p className="font-hanken text-sm text-amber-200/90">
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
            <div className="flex flex-wrap gap-1.5">
              {lockedThemes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, themeId: t.id }))}
                  className={`font-jetbrains flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition ${
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
          hint={`${tpl.label} was measured at ${tpl.range[0]}–${tpl.range[1]}s. Past that band the craft rules stop applying.`}
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
 *  names what it is about to take. */
export function ConfirmDelete({
  project,
  onClose,
  onConfirm,
}: {
  project: Project | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
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
            className="font-jetbrains cursor-pointer rounded-full border border-rose-400/40 bg-rose-400/10 px-5 py-2 text-[12px] text-rose-200 transition hover:bg-rose-400/20"
          >
            Delete
          </button>
        </div>
      }
    >
      <p className="font-hanken text-base text-slate-300">
        The record goes from this browser&rsquo;s storage and does not come back. Nothing is deleted
        anywhere else — there is nowhere else yet.
      </p>
    </Modal>
  );
}
