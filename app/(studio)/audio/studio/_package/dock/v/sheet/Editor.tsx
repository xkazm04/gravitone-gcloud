"use client";

// A SECTION'S EDITOR, AS THE DIALOG DRAWS IT (variant "sheet"): for a per-track section the track it works on; then
// what the store says is wrong with the section, each rule verbatim (PROBLEM_TEXT); then the agent's proposals for its
// fields, each with accept / dismiss; then the form. The page shows none of this - it is the detail tier.
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import type { Release } from "@gt/domain/release";
import { PROBLEM_TEXT } from "@gt/domain/release.problems";
import { parseProposalPath } from "@gt/domain/release.record";

import { trackIndexOf, type StepProps } from "../../../../../_release/wizard/steps.ts";
import { EditAi, EditRecord } from "./EditRights.tsx";
import { EditChannels, EditShelf, EditSleeve, EditSplits, ViewPreviews } from "./EditMisc.tsx";
import { EditPrompt, EditRelease } from "./EditRelease.tsx";
import { EditPeople, EditTrack } from "./EditTrack.tsx";
import { PER_TRACK, SECTION_LABEL, sectionOfPath, sectionOfProblem, type SectionId } from "./model.ts";
import { ProposalRow } from "./Proposal.tsx";
import s from "./dialog.module.css";

const ON_TRACK: ReadonlySet<SectionId> = new Set([...PER_TRACK, "list"]);
/** The stop-gaps draw the wizard's own step layouts, which need the room of a page; every other editor is a form. */
const XL: ReadonlySet<SectionId> = new Set(["sleeve", "shelf", "previews", "splits"]);

export const editorWidth = (section: SectionId): "wide" | "xl" => (XL.has(section) ? "xl" : "wide");

export function editorTitle(section: SectionId, release: Release, track: number): string {
  const t = release.tracks[track];
  if (!ON_TRACK.has(section) || t === undefined || release.tracks.length < 2) return SECTION_LABEL[section];
  return `${SECTION_LABEL[section]} · ${track + 1} ${t.title.trim() === "" ? "untitled" : t.title}`;
}

function Body({ section, props }: { readonly section: SectionId; readonly props: StepProps }) {
  const { release: r, dispatch, track, setTrack } = props;
  switch (section) {
    case "list":
      return <EditTrack r={r} i={track} dispatch={dispatch} setTrack={setTrack} />;
    case "people":
      return <EditPeople r={r} i={track} dispatch={dispatch} setTrack={setTrack} />;
    case "ai":
      return <EditAi r={r} i={track} dispatch={dispatch} />;
    case "record":
      return <EditRecord r={r} i={track} dispatch={dispatch} />;
    case "release":
      return <EditRelease r={r} dispatch={dispatch} />;
    case "prompt":
      return <EditPrompt r={r} dispatch={dispatch} />;
    case "channels":
      return <EditChannels {...props} />;
    case "sleeve":
      return <EditSleeve {...props} />;
    case "shelf":
      return <EditShelf {...props} />;
    case "splits":
      return <EditSplits {...props} />;
    case "previews":
      return <ViewPreviews {...props} />;
  }
}

export function SectionEditor({ section, props }: { readonly section: SectionId; readonly props: StepProps }) {
  const { release: r, problems, session, track, setTrack } = props;
  const onTrack = ON_TRACK.has(section);
  const here = (ti: number | null) => !onTrack || ti === null || ti === track;
  // The stop-gaps draw their own problems and proposals (the wizard's components); the redesigned editors get them here.
  const stopGap = section === "sleeve" || section === "splits" || section === "previews";
  const rules = stopGap ? [] : problems.filter((p) => sectionOfProblem(p) === section && here(trackIndexOf(p)));
  const proposals = session.pending.filter((p) => {
    if (sectionOfPath(p.path) !== section) return false;
    const n = parseProposalPath(p.path)?.track ?? null;
    return here(n === null ? null : n - 1);
  });
  return (
    <div className={s.editor}>
      {onTrack && r.tracks.length > 1 && (
        <Seg label="track" options={r.tracks.map((_, i) => ({ value: String(i), label: String(i + 1) }))} value={String(track)} onChange={(v) => setTrack(Number(v))} />
      )}
      {rules.length > 0 && (
        <ul className={s.items} aria-label="what the store asks">
          {rules.map((p, i) => (
            <li key={`${p.code}:${p.at}:${i}`} className={s.item} data-tone={p.severity}>
              <span className={s.dot} aria-hidden="true" />
              <span className={s.rule}>{PROBLEM_TEXT[p.code]}</span>
            </li>
          ))}
        </ul>
      )}
      {proposals.length > 0 && (
        <ul className={s.items} aria-label="suggested">
          {proposals.map((p) => (
            <li key={p.id}>
              <ProposalRow p={p} session={session} />
            </li>
          ))}
        </ul>
      )}
      <Body section={section} props={props} />
    </div>
  );
}
