"use client";

// A track's AI credits (DistroKid's step: lyrics, music, how much of the audio, and - when all of it
// is - whether the artist is a human or an AI persona) and its rights record, with the record's
// warnings drawn loud. A warning never blocks (owner, wave 2).
import { AI_AUDIO, LICENCES, type AiAudio, type Licence, type ReleaseTrack } from "@gt/domain/release";
import { PROBLEM_TEXT, rightsWarnings, type ReleaseProblem } from "@gt/domain/release.problems";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { Field, Select } from "@gt/ui/components/field/Field.tsx";
import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";

import type { TrackFields } from "../../draft.ts";
import { Cell } from "./Cell.tsx";
import { orNull, worst } from "./fmt.ts";
import t from "./sheet.module.css";

const LICENCE_LABEL: Readonly<Record<Licence, string>> = { commercial: "commercial", "cc-by-nc": "CC BY-NC", unknown: "unknown" };
const LICENCE_OPTIONS = LICENCES.map((l) => ({ value: l, label: LICENCE_LABEL[l] }));
const AUDIO_OPTIONS = AI_AUDIO.map((a) => ({ value: a, label: a }));
type Persona = "human" | "ai" | "unset";
const PERSONA_OPTIONS: readonly { value: Persona; label: string }[] = [
  { value: "human", label: "human" },
  { value: "ai", label: "AI persona" },
];

export type TrackRightsProps = {
  readonly track: ReleaseTrack;
  readonly n: number;
  readonly problems: readonly ReleaseProblem[];
  readonly onPatch: (fields: TrackFields) => void;
};

export function TrackRights({ track: x, n, problems, onPatch }: TrackRightsProps) {
  const ai = x.ai;
  const rights = x.rights;
  const warnings = rightsWarnings(rights);
  const setAudio = (audio: AiAudio) => onPatch({ ai: { ...ai, audio, persona: audio === "all" ? ai.persona : null } });
  return (
    <div className={t.part} role="group" aria-label={`track ${n} AI credits and rights`}>
      <CapsHeading text="AI credits" level={4} />
      <div className={t.row}>
        <Toggle label="lyrics" on={ai.lyrics} onToggle={(v) => onPatch({ ai: { ...ai, lyrics: v } })} name={`track ${n} lyrics AI`} />
        <Toggle label="music" on={ai.music} onToggle={(v) => onPatch({ ai: { ...ai, music: v } })} name={`track ${n} music AI`} />
      </div>
      <Cell label="audio">
        <Seg<AiAudio> label={`track ${n} AI audio`} options={AUDIO_OPTIONS} value={ai.audio} onChange={setAudio} />
      </Cell>
      {ai.audio === "all" && (
        <Cell label="artist is" mark={worst(problems, ["persona-unstated"])}>
          <Seg<Persona> label={`track ${n} artist persona`} options={PERSONA_OPTIONS} value={ai.persona ?? "unset"} onChange={(v) => onPatch({ ai: { ...ai, persona: v === "unset" ? null : v } })} />
        </Cell>
      )}

      <CapsHeading text="rights" level={4} />
      <Facts
        facts={[
          { term: "vendor", value: rights.vendor ?? "—" },
          { term: "model", value: rights.model ?? "—" },
          { term: "generated", value: rights.generatedAt ?? "—" },
          { term: "brief", value: rights.briefDigest ?? "—" },
          { term: "reference", value: rights.reference ?? "—" },
        ]}
      />
      <div className={t.grid2}>
        <Cell label="plan tier" mark={warnings.includes("rights-unknown-tier") ? "warn" : undefined}>
          <Field label={`track ${n} plan tier`} value={rights.planTier ?? ""} onChange={(v) => onPatch({ rights: { ...rights, planTier: orNull(v) } })} />
        </Cell>
        <Cell label="licence" mark={warnings.some((w) => w === "rights-nc-licence" || w === "rights-unknown-licence") ? "warn" : undefined}>
          <Select<Licence> label={`track ${n} licence`} options={LICENCE_OPTIONS} value={rights.licence} onChange={(v) => onPatch({ rights: { ...rights, licence: v } })} />
        </Cell>
      </div>
      {warnings.length > 0 && (
        <ul className={t.warns} aria-label={`track ${n} rights warnings`}>
          {warnings.map((w) => (
            <li key={w} className={t.warn}>
              <Glyph name="warn" className={t.warnGlyph} />
              <span>{PROBLEM_TEXT[w]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
