// THE CINEMATOGRAPHY VOCABULARY, TypeScript reader — pure, no I/O, client-safe.
//
// The data is pipeline/vocab/cinematography.json; the Python reader is
// pipeline/vocab/vocab.py. Nothing outside those three files may keep its own
// literal enum for a field the file declares: pipeline/check-vocab.mjs fails
// the build when one does.

import raw from "../../pipeline/vocab/cinematography.json";

export type VocabKind = "enum" | "text" | "list";

export interface VocabEvidence {
  date: string;
  version: number;
  finding: string;
  values?: string[];
}

export interface VocabField {
  group: string;
  kind: VocabKind;
  enum?: string[];
  ordinal?: boolean;
  weight: number;
  description: string;
  passDescriptions?: Record<string, string>;
  maxItems?: number;
  evidence?: VocabEvidence[];
}

export interface CinematographyVocab {
  version: number;
  groups: Record<string, { description: string }>;
  fields: Record<string, VocabField>;
  subsets: Record<string, string[]>;
}

// The JSON import is typed structurally by the compiler; this widens it to the
// documented shape. Invariant: pipeline/check-vocab.mjs validates every field's
// kind / enum / evidence / subset membership on each `npm run verify`, so the
// shape asserted here is the shape the gate has already proven.
export const VOCAB = raw as unknown as CinematographyVocab;

/** Stamped onto every foundry readback and every probe row. */
export const VOCAB_VERSION: number = VOCAB.version;

/** Field names of a named subset, in the order the pass asks for them. */
export function vocabFields(subset: string): string[] {
  const s = VOCAB.subsets[subset];
  if (!s) throw new Error(`cinematography vocab: unknown subset "${subset}"`);
  return [...s];
}

export function vocabField(name: string): VocabField {
  const f = VOCAB.fields[name];
  if (!f) throw new Error(`cinematography vocab: undeclared field "${name}"`);
  return f;
}

export function vocabEnum(name: string): readonly string[] {
  const f = vocabField(name);
  if (!f.enum) throw new Error(`cinematography vocab: "${name}" is not an enum field`);
  return f.enum;
}

/** {field: enum} for a subset — what ENUMS is. */
export function subsetEnums<K extends string>(subset: string): Record<K, readonly string[]> {
  // Invariant: K is the caller's literal union of the subset's names; vocabEnum
  // throws on any name the file does not declare, so the keys cannot drift.
  return Object.fromEntries(vocabFields(subset).map((n) => [n, vocabEnum(n)])) as Record<K, readonly string[]>;
}

/** {field: description} for a subset, preferring the per-pass wording when the file has one. */
export function subsetDescriptions<K extends string>(subset: string): Record<K, string> {
  // Invariant: same as subsetEnums.
  return Object.fromEntries(
    vocabFields(subset).map((n) => {
      const f = vocabField(n);
      return [n, f.passDescriptions?.[subset] ?? f.description];
    }),
  ) as Record<K, string>;
}

export function subsetWeights<K extends string>(subset: string): Record<K, number> {
  // Invariant: same as subsetEnums.
  return Object.fromEntries(vocabFields(subset).map((n) => [n, vocabField(n).weight])) as Record<K, number>;
}

/** {field: ordered values} for the ordinal fields of a subset. Enum order IS the scale. */
export function subsetOrdinals(subset: string): Record<string, readonly string[]> {
  return Object.fromEntries(vocabFields(subset).filter((n) => vocabField(n).ordinal).map((n) => [n, vocabEnum(n)]));
}
