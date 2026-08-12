"use client";

// Create / edit a project. The one place the user names the thing — the name
// they type here is the headline /studio renders, which is why title is the
// only required field and why the create button says where it goes.
//
// Three fields, no more. Template and target runtime come from the craft
// library (knowledge/templates/*): picking a template sets the runtime it
// measured, and the note under the pills is that template's own one-liner. A
// project should be creatable in eight seconds.

import { useEffect, useState } from "react";

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

const blank = (): ProjectDraft => ({
  title: "",
  logline: "",
  template: "short-educational-video",
  targetS: templateOf("short-educational-video").defaultS,
});

export default function ProjectDialog({
  open,
  project,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Absent = create. Present = edit that record. */
  project: Project | null;
  onClose: () => void;
  onSubmit: (draft: ProjectDraft) => void;
}) {
  const [draft, setDraft] = useState<ProjectDraft>(blank);
  // Whether the user has taken ownership of the runtime. Until they do,
  // switching template moves it; after they do, we never overwrite their number.
  const [ownDuration, setOwnDuration] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (project) {
      const { title, logline, template, targetS } = project;
      setDraft({ title, logline, template, targetS });
      setOwnDuration(true);
    } else {
      setDraft(blank());
      setOwnDuration(false);
    }
  }, [open, project]);

  const tpl = templateOf(draft.template);
  const valid = draft.title.trim().length > 0;

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
