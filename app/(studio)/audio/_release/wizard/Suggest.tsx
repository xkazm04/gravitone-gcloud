"use client";

// THE AGENT'S SUGGESTION ON ONE FIELD (spark studio-to-release): every pending proposal for `path`, its value as the
// field would show it, where it came from in the agent's words, and accept / dismiss. Nothing is written until the
// operator accepts (owner, wave 2: pending per field). Compact - it sits under the field it would set. The value is
// JSON from the agent, so every shape is checked before it is drawn; one that matches no field's shape is shown raw.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import type { ProposalPath, ReleaseProposal } from "@gt/domain/release.record";
import { parseProposalPath } from "@gt/domain/release.record";

import { fieldLabel } from "../pending.ts";
import type { ReleaseSessionApi } from "../session.ts";
import s from "./step.module.css";

export interface SuggestProps {
  readonly path: ProposalPath;
  readonly session: ReleaseSessionApi;
}

type Shown = { readonly kind: "text"; readonly text: string } | { readonly kind: "facts"; readonly facts: readonly { readonly k: string; readonly v: string }[] };

const isObj = (v: unknown): v is Readonly<Record<string, unknown>> => typeof v === "object" && v !== null && !Array.isArray(v);

const AI_WORDS = {
  lyrics: ["AI-written", "human-written"],
  music: ["AI-composed", "human-composed"],
} as const;
const PERSONA_WORDS: Readonly<Record<string, string>> = { human: "a human", ai: "an AI persona" };
const RIGHTS_KEYS: readonly (readonly [string, string])[] = [
  ["vendor", "generator"],
  ["model", "model"],
  ["planTier", "plan tier"],
  ["generatedAt", "generated"],
  ["briefDigest", "brief digest"],
  ["reference", "reference"],
  ["licence", "licence"],
];

function aiFacts(v: Readonly<Record<string, unknown>>): Shown {
  const facts: { k: string; v: string }[] = [];
  if (typeof v["lyrics"] === "boolean") facts.push({ k: "lyrics", v: AI_WORDS.lyrics[v["lyrics"] ? 0 : 1] });
  if (typeof v["music"] === "boolean") facts.push({ k: "music", v: AI_WORDS.music[v["music"] ? 0 : 1] });
  if (typeof v["audio"] === "string") facts.push({ k: "audio", v: v["audio"] });
  if (v["audio"] === "all") facts.push({ k: "artist is", v: typeof v["persona"] === "string" ? (PERSONA_WORDS[v["persona"]] ?? v["persona"]) : "unstated" });
  return { kind: "facts", facts };
}

function rightsFacts(v: Readonly<Record<string, unknown>>): Shown {
  return {
    kind: "facts",
    facts: RIGHTS_KEYS.flatMap(([key, k]) => {
      const x = v[key];
      return typeof x === "string" && x !== "" ? [{ k, v: x === "cc-by-nc" ? "CC BY-NC" : x }] : [];
    }),
  };
}

/** The proposal's value as its field would show it. */
export function shown(path: ProposalPath, value: unknown): Shown {
  const field = parseProposalPath(path)?.field ?? "";
  if (value === null) return { kind: "text", text: "—" };
  if (typeof value === "string") return { kind: "text", text: value };
  if (typeof value === "boolean") return { kind: "text", text: field === "explicit" ? (value ? "explicit" : "clean") : String(value) };
  if (Array.isArray(value) && value.every((x) => typeof x === "string")) return { kind: "text", text: value.join(", ") };
  if (Array.isArray(value) && value.every(isObj)) {
    return { kind: "facts", facts: value.map((c) => ({ k: typeof c["role"] === "string" ? c["role"] : "credit", v: typeof c["name"] === "string" ? c["name"] : JSON.stringify(c) })) };
  }
  if (isObj(value) && field === "ai") return aiFacts(value);
  if (isObj(value) && field === "rights") return rightsFacts(value);
  return { kind: "text", text: JSON.stringify(value) };
}

function One({ p, label, session }: { readonly p: ReleaseProposal; readonly label: string; readonly session: ReleaseSessionApi }) {
  const v = shown(p.path, p.value);
  return (
    <span className={s.suggest} role="group" aria-label={`suggested ${label}`}>
      <span className={s.sgHead}>
        <Chip label="suggested" tone="violet" dot />
        {v.kind === "text" ? (
          <span className={s.sgValue}>{v.text}</span>
        ) : (
          <span className={s.sgFacts}>
            {v.facts.map((f) => (
              <Chip key={`${f.k}:${f.v}`} label={f.v} casing="lower" name={`${f.k} ${f.v}`} />
            ))}
          </span>
        )}
      </span>
      <span className={s.sgFoot}>
        <span className={s.sgSource}>{p.source}</span>
        <span className={s.sgActs}>
          <Button label="Accept" size="sm" tone="emerald" onPress={() => session.accept([p.id])} />
          <Button label="Dismiss" size="sm" onPress={() => session.dismiss([p.id])} />
        </span>
      </span>
    </span>
  );
}

export function Suggest({ path, session }: SuggestProps) {
  const mine = session.pending.filter((p) => p.path === path);
  if (mine.length === 0) return null;
  const label = fieldLabel(path);
  return (
    <>
      {mine.map((p) => (
        <One key={p.id} p={p} label={label} session={session} />
      ))}
    </>
  );
}
