"use client";

// /projects/new — the guided face of project creation, on the deck engine.
//
// Four decisions, dealt as cards in the order they depend on each other:
// discipline → template → style → name & runtime. The SAME rules as the expert
// dialog (ProjectDialog stays untouched as the fast path), read from the same
// catalogues:
//  · templates re-filter when the discipline changes, and a picked template
//    that no longer fits is CLEARED rather than silently swapped — the wizard
//    asks the question again instead of answering it for you (the dialog's
//    pickDiscipline moves to first-of-discipline because a dropdown must always
//    render something; a stage can honestly reopen);
//  · a picked style that no longer fits the discipline is dropped, exactly as
//    the dialog drops it on create (ProjectDialog#pickDiscipline);
//  · the runtime is seeded from the template's default and never overwritten
//    once the user has taken ownership of it (the `ownDuration` latch,
//    ProjectDialog's rule verbatim).
//
// Finish awaits the same `useProjects.create` and closes on the ANSWER — a
// falsy answer keeps the wizard open with the storage banner, never a redirect
// over a write that did not land (the dialog-closes-on-success rule, held here
// by the same busy latch).

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Deck, { type DeckStageDef } from "@/components/ui/deck/Deck";
import DeckStage from "@/components/ui/deck/DeckStage";
import StudioFrame from "@/components/ui/StudioFrame";
import { Eyebrow } from "@/components/ui/Primitives";
import { useAuth } from "@/lib/useAuth";
import { useProjects } from "@/lib/useProjects";
import { useThemes } from "@/lib/useThemes";
import { lockedOnly, styleFits } from "@/lib/themes";
import {
  DISCIPLINE_LABEL,
  templateOf,
  templatesFor,
  type Discipline,
  type TemplateId,
} from "@/lib/projects";

import { disciplineCards, templateCards, styleCards, EmptyStyleDeck, NameStage } from "./stages";

export default function CreateWizard() {
  const { user } = useAuth();
  const router = useRouter();
  const { create, error } = useProjects(user?.uid ?? null);
  const { themes } = useThemes(user?.uid ?? null);
  const lockedThemes = useMemo(() => lockedOnly(themes ?? []), [themes]);

  const [active, setActive] = useState(0);
  const [discipline, setDiscipline] = useState<Discipline | null>(null);
  const [template, setTemplate] = useState<TemplateId | null>(null);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [logline, setLogline] = useState("");
  const [targetS, setTargetS] = useState(0);
  // Whether the user has taken ownership of the runtime — until they do,
  // picking a template moves it; after, it is never overwritten (the dialog's
  // ownDuration latch, same rule).
  const [ownDuration, setOwnDuration] = useState(false);
  const [busy, setBusy] = useState(false);

  const fittingThemes = useMemo(
    () => (discipline ? lockedThemes.filter((t) => styleFits(t, discipline)) : lockedThemes),
    [lockedThemes, discipline],
  );

  // The cascade, mirroring ProjectDialog#pickDiscipline's rules rather than
  // forking them: no record may carry a template outside its discipline, and a
  // chosen style that no longer fits is dropped. The one deliberate difference
  // is stated in the header comment — a non-fitting template is cleared (the
  // stage reopens) instead of moved to first-of-discipline.
  const pickDiscipline = (id: string | null) => {
    const next = id as Discipline | null;
    setDiscipline(next);
    if (!next) return;
    if (template && !templatesFor(next).some((t) => t.id === template)) {
      setTemplate(null);
      if (!ownDuration) setTargetS(0);
    }
    if (themeId && !lockedThemes.some((t) => t.id === themeId && styleFits(t, next))) {
      setThemeId(null);
    }
  };

  const pickTemplate = (id: string | null) => {
    const next = id as TemplateId | null;
    setTemplate(next);
    if (next && !ownDuration) setTargetS(templateOf(next).defaultS);
  };

  const finish = async () => {
    if (busy || !discipline || !template || !themeId || !title.trim()) return;
    setBusy(true);
    try {
      const made = await create({
        title,
        logline,
        discipline,
        template,
        targetS,
        themeId,
      });
      // Close on the answer: a falsy answer means nothing was stored — the
      // wizard stays, the draft stays, and the banner below says why.
      if (made) router.push(`/studio/${made.id}`);
    } finally {
      setBusy(false);
    }
  };

  const stages: DeckStageDef[] = [
    {
      id: "discipline",
      label: "discipline",
      headline: "What kind of video is this?",
      sub: "The question before the template: educational and promotional pieces are different contracts, and the craft library measured them separately.",
      done: discipline !== null,
      summary: discipline ? DISCIPLINE_LABEL[discipline] : undefined,
      content: (
        <DeckStage cards={disciplineCards()} pickedId={discipline} onPick={pickDiscipline} />
      ),
    },
    {
      id: "template",
      label: "template",
      headline: "Which craft format inside it?",
      sub: "Picking a template sets the runtime it measured — you can take ownership of the number at the last stage.",
      done: template !== null,
      summary: template ? templateOf(template).label : undefined,
      content: discipline ? (
        <DeckStage cards={templateCards(discipline)} pickedId={template} onPick={pickTemplate} />
      ) : null,
    },
    {
      id: "style",
      label: "style",
      headline: "Which visual identity does it render in?",
      sub: "A locked style from the library. Every frame this project renders is built on it, and it is fixed at creation.",
      done: themeId !== null,
      summary: themeId ? (lockedThemes.find((t) => t.id === themeId)?.name ?? undefined) : undefined,
      content:
        discipline && fittingThemes.length === 0 ? (
          <EmptyStyleDeck discipline={discipline} />
        ) : (
          <DeckStage cards={styleCards(fittingThemes)} pickedId={themeId} onPick={setThemeId} />
        ),
    },
    {
      id: "name",
      label: "name",
      headline: "Name it, and set the clock",
      sub: "The name you type is the headline the studio opens on. Only the name is required.",
      done: title.trim().length > 0,
      summary: title.trim() || undefined,
      content:
        discipline && template ? (
          <NameStage
            title={title}
            logline={logline}
            targetS={targetS}
            discipline={discipline}
            template={template}
            onTitle={setTitle}
            onLogline={setLogline}
            onDuration={(v) => {
              setOwnDuration(true);
              setTargetS(v);
            }}
          />
        ) : null,
    },
  ];

  return (
    <StudioFrame>
      {/* tabIndex={-1}: the landmark focus falls back to — same contract as
          ProjectsView's <main> (components/ui/Modal.tsx#restoreFocus). */}
      <main tabIndex={-1} className="pb-10">
        <Deck
          eyebrow={<Eyebrow>create</Eyebrow>}
          stages={stages}
          active={active}
          onNavigate={setActive}
          finishLabel="Create & open"
          onFinish={() => void finish()}
          busy={busy}
          notice={
            error ? (
              <p className="rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-sm text-rose-200">
                {error} — your projects live in this browser&rsquo;s storage, and it did not answer.
              </p>
            ) : undefined
          }
          exit={
            <Link
              href="/projects"
              className="font-jetbrains text-label text-white/35 transition hover:text-white/60"
            >
              back to the shelf — nothing is kept
            </Link>
          }
        />
      </main>
    </StudioFrame>
  );
}
