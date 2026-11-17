"use client";

// THE FULL RIGHTS RECORD behind its door: the six facts the take was accepted with and its licence, each edited in
// place; what the record lacks is listed with the store's rule (verbatim) at the top.
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { LICENCES, type Licence, type ReleaseTrack, type RightsRecord } from "@gt/domain/release";
import { PROBLEM_TEXT, rightsWarnings } from "@gt/domain/release.problems";

import { orNull } from "../../../../../../_release/wizard/fmt.ts";
import { Door } from "../Door.tsx";
import s from "./steps.module.css";

const LICENCE_LABEL: Readonly<Record<Licence, string>> = { commercial: "commercial", "cc-by-nc": "CC BY-NC", unknown: "unknown" };
const FIELDS: readonly { readonly key: Exclude<keyof RightsRecord, "licence">; readonly label: string; readonly example?: string }[] = [
  { key: "vendor", label: "generator", example: "suno" },
  { key: "model", label: "model", example: "v5" },
  { key: "planTier", label: "plan tier at generation", example: "Pro" },
  { key: "generatedAt", label: "generated", example: "YYYY-MM-DD" },
  { key: "briefDigest", label: "brief digest", example: "sha256:…" },
  { key: "reference", label: "reference" },
];

export function RecordDoor({ t, i, patch }: { readonly t: ReleaseTrack; readonly i: number; readonly patch: (f: Partial<RightsRecord>) => void }) {
  const gaps = rightsWarnings(t.rights);
  return (
    <Door name={`rights record of track ${i + 1}, ${gaps.length} gaps`} title={`Rights record · ${i + 1} ${t.title}`} word="record" size="wide">
      <div className={s.recordSheet}>
        {gaps.length > 0 && (
          <ul className={s.rules} aria-label="gaps">
            {gaps.map((c) => (
              <li key={c}>
                <Chip label={c === "rights-nc-licence" ? "warn" : "gap"} tone="amber" dot />
                <span>{PROBLEM_TEXT[c]}</span>
              </li>
            ))}
          </ul>
        )}
        <div className={s.form}>
          {FIELDS.map((f) => (
            <label key={f.key} className={s.cell}>
              <span className={s.k}>{f.label}</span>
              <Field label={f.label} value={t.rights[f.key] ?? ""} placeholder={f.example} onChange={(v) => patch({ [f.key]: orNull(v) })} />
            </label>
          ))}
          <span className={s.cell} data-w="full">
            <span className={s.k}>licence</span>
            <Seg label="licence" options={LICENCES.map((l) => ({ value: l, label: LICENCE_LABEL[l] }))} value={t.rights.licence} onChange={(v) => patch({ licence: v })} />
          </span>
        </div>
      </div>
    </Door>
  );
}
