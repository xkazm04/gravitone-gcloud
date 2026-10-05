"use client";

// THE BRIEF — the creator's seven fields, above round 1.
//
// Typed into local state and written on blur (and on every chip change), so a
// keystroke is never a transaction. The labels are the brief's own words; the
// field caps are the route's own (lib/ads/validate.ts BRIEF_CAPS), applied as
// `maxLength` so the browser stops a paste the server would refuse.

import { useId, useState } from "react";

import { X } from "lucide-react";

import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Primitives";
import type { AdBrief } from "@/lib/ads/types";
import { BRIEF_CAPS as BRIEF_FIELD_CAPS } from "@/lib/ads/validate";

type TextKey = "product" | "audience" | "proposition" | "tone" | "cta" | "platform";

const FIELDS: { key: TextKey; label: string; area?: boolean; placeholder: string }[] = [
  { key: "product", label: "Product", placeholder: "Rainshell — a packable rain jacket" },
  { key: "audience", label: "Audience", placeholder: "city cyclists who commute all year" },
  { key: "proposition", label: "Proposition", area: true, placeholder: "This jacket keeps you dry in a downpour." },
  { key: "tone", label: "Tone", placeholder: "deadpan" },
  { key: "cta", label: "Call to action", placeholder: "Pack one today" },
  { key: "platform", label: "Platform", placeholder: "vertical feed" },
];

export default function BriefCard({
  brief,
  onChange,
  onCommit,
}: {
  brief: AdBrief;
  /** Every keystroke — the surface's state, not the store. */
  onChange: (b: AdBrief) => void;
  /** Write it. Called on blur and on chip changes. */
  onCommit: (b: AdBrief) => void;
}) {
  const base = useId();
  const [chip, setChip] = useState("");

  const set = (key: TextKey, value: string) => onChange({ ...brief, [key]: value });
  const addChip = () => {
    const t = chip.trim();
    if (!t || brief.mustInclude.includes(t) || brief.mustInclude.length >= BRIEF_FIELD_CAPS.mustIncludeItems) return;
    const next = { ...brief, mustInclude: [...brief.mustInclude, t] };
    setChip("");
    onChange(next);
    onCommit(next);
  };
  const dropChip = (t: string) => {
    const next = { ...brief, mustInclude: brief.mustInclude.filter((x) => x !== t) };
    onChange(next);
    onCommit(next);
  };

  return (
    <Panel className="p-5" as="section">
      <h2 className="font-instrument mb-4 text-2xl text-slate-100" id={`${base}-h`}>
        Brief
      </h2>
      <div className="grid gap-4 md:grid-cols-2" aria-labelledby={`${base}-h`} role="group">
        {FIELDS.map((f) => {
          const id = `${base}-${f.key}`;
          const common = {
            id,
            value: brief[f.key],
            maxLength: BRIEF_FIELD_CAPS[f.key],
            placeholder: f.placeholder,
            "data-testid": `brief-${f.key}`,
            onBlur: () => onCommit(brief),
          };
          return (
            <div key={f.key} className={f.area ? "md:col-span-2" : ""}>
              <Field label={f.label} htmlFor={id}>
                {f.area ? (
                  <TextArea {...common} rows={2} onChange={(e) => set(f.key, e.target.value)} />
                ) : (
                  <TextInput {...common} onChange={(e) => set(f.key, e.target.value)} />
                )}
              </Field>
            </div>
          );
        })}
        <div className="md:col-span-2">
          <Field label="Must include" htmlFor={`${base}-must`}>
            <div className="flex flex-wrap items-center gap-2">
              {brief.mustInclude.map((t) => (
                <span
                  key={t}
                  data-testid="brief-must-chip"
                  className="font-jetbrains inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/[0.06] py-0.5 pr-1 pl-2.5 text-label text-cyan-100"
                >
                  {t}
                  <button
                    type="button"
                    aria-label={`Remove ${t}`}
                    onClick={() => dropChip(t)}
                    className="rounded-full p-0.5 text-cyan-200/70 hover:bg-cyan-400/10 hover:text-cyan-100"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              ))}
              {brief.mustInclude.length < BRIEF_FIELD_CAPS.mustIncludeItems && (
                <TextInput
                  id={`${base}-must`}
                  data-testid="brief-must-input"
                  value={chip}
                  maxLength={BRIEF_FIELD_CAPS.mustIncludeChars}
                  placeholder="logo on the end card"
                  className="min-w-48 flex-1"
                  onChange={(e) => setChip(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addChip();
                    }
                  }}
                  onBlur={addChip}
                />
              )}
            </div>
          </Field>
        </div>
      </div>
    </Panel>
  );
}
