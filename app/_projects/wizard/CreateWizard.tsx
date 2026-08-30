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
import { lockedOnly, newTheme, putTheme, styleFits, type Proof } from "@/lib/themes";
import { PRESETS, thumbSrc, type Preset } from "@/app/library/presets";
import {
  DISCIPLINE_LABEL,
  templateOf,
  templatesFor,
  type Discipline,
  type TemplateId,
} from "@/lib/projects";

import {
  disciplineCards,
  templateCards,
  styleCards,
  presetCards,
  presetCardId,
  PRESET_CARD_PREFIX,
  EmptyStyleDeck,
  NameStage,
} from "./stages";

/** The preset's committed render, read back as proof bytes. The thumb IS a
 *  real render of the block on the canonical subject (public/presets/,
 *  pipeline/build-preset-thumbs.mts), which is what makes it honest as the
 *  minted theme's one approved proof — the user is looking at exactly the
 *  image that will serve as the style reference. */
async function proofFromThumb(p: Preset): Promise<Proof> {
  const res = await fetch(thumbSrc(p.id));
  if (!res.ok) throw new Error(`the preset's render did not load (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return {
    id: `pf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label: `${p.name} — the committed preset render (canonical subject)`,
    base64: btoa(bin),
    mime: "image/jpeg",
    state: "approved",
    createdAt: Date.now(),
  };
}

export default function CreateWizard() {
  const { user } = useAuth();
  const router = useRouter();
  const { create, error } = useProjects(user?.uid ?? null);
  const { themes } = useThemes(user?.uid ?? null);
  const lockedThemes = useMemo(() => lockedOnly(themes ?? []), [themes]);

  const [active, setActive] = useState(0);
  const [discipline, setDiscipline] = useState<Discipline | null>(null);
  const [template, setTemplate] = useState<TemplateId | null>(null);
  /** The style pick — a locked theme's id, or `preset:<id>` for a preset the
   *  finish step mints into a locked theme (stages.tsx#presetCardId). */
  const [styleId, setStyleId] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
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
  // Presets sit beside the locked themes on the style stage — a complete
  // four-slot block off the shelf is a real answer for a first project, and
  // the finish step mints it into a locked theme (same filter as PresetRail).
  const fittingPresets = useMemo(
    () => (discipline ? PRESETS.filter((p) => styleFits(p, discipline)) : PRESETS),
    [discipline],
  );
  const pickedPreset = styleId?.startsWith(PRESET_CARD_PREFIX)
    ? (fittingPresets.find((p) => presetCardId(p) === styleId) ?? null)
    : null;

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
    if (styleId) {
      const stillFits = styleId.startsWith(PRESET_CARD_PREFIX)
        ? PRESETS.some((p) => presetCardId(p) === styleId && styleFits(p, next))
        : lockedThemes.some((t) => t.id === styleId && styleFits(t, next));
      if (!stillFits) setStyleId(null);
    }
  };

  const pickTemplate = (id: string | null) => {
    const next = id as TemplateId | null;
    setTemplate(next);
    if (next && !ownDuration) setTargetS(templateOf(next).defaultS);
  };

  const finish = async () => {
    if (busy || !user || !discipline || !template || !styleId || !title.trim()) return;
    setBusy(true);
    setMintError(null);
    try {
      let themeId = styleId;
      if (pickedPreset) {
        // Mint the preset into a LOCKED theme, one write: the committed render
        // becomes the single approved proof (canLock's shape — one approved,
        // none pending), and lockedAt is set at birth. The user ratified the
        // style by choosing the card that IS that render; the library's
        // commission flow remains the path for styles that need arguing over.
        try {
          const proof = await proofFromThumb(pickedPreset);
          const minted = {
            ...newTheme(user.uid, {
              name: pickedPreset.name,
              block: pickedPreset.block,
              elements: pickedPreset.elements,
              origin: "preset" as const,
              presetId: pickedPreset.id,
              discipline: pickedPreset.discipline,
            }),
            proofs: [proof],
            lockedAt: Date.now(),
          };
          await putTheme(minted);
          themeId = minted.id;
        } catch (e) {
          // The style did not land → no project either. The wizard stays with
          // the pick intact and says which half failed.
          setMintError(e instanceof Error ? e.message : "the style could not be saved");
          return;
        }
      }
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
      sub: "A locked style from the library, or a preset off the shelf — a preset locks as this project's style when you create. Every frame renders against it, fixed at creation.",
      done: styleId !== null,
      summary: pickedPreset
        ? `${pickedPreset.name} (preset)`
        : styleId
          ? (lockedThemes.find((t) => t.id === styleId)?.name ?? undefined)
          : undefined,
      content:
        discipline && fittingThemes.length === 0 && fittingPresets.length === 0 ? (
          <EmptyStyleDeck discipline={discipline} />
        ) : (
          <DeckStage
            cards={[...styleCards(fittingThemes), ...presetCards(fittingPresets)]}
            pickedId={styleId}
            onPick={setStyleId}
          />
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
            mintError ? (
              <p className="rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-sm text-rose-200">
                {mintError} — the project was not created; your picks are kept.
              </p>
            ) : error ? (
              <p className="rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-sm text-rose-200">
                {error} — your projects live in this browser&rsquo;s storage, and it did not answer.
              </p>
            ) : undefined
          }
          exit={
            <Link
              href="/projects"
              className="font-jetbrains text-[11px] text-white/35 transition hover:text-white/60"
            >
              back to the shelf — nothing is kept
            </Link>
          }
        />
      </main>
    </StudioFrame>
  );
}
