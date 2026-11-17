// The rights record's printed terms (side A3): one spelling for the side's stamp and the card's form. Pure.
import type { Licence, RightsRecord } from "@gt/domain/release";

export const LICENCE_LABEL: Readonly<Record<Licence, string>> = { commercial: "commercial", "cc-by-nc": "CC BY-NC", unknown: "unknown" };

export const RECORD_FIELDS: readonly { readonly key: Exclude<keyof RightsRecord, "licence">; readonly label: string; readonly example?: string }[] = [
  { key: "vendor", label: "generator", example: "suno" },
  { key: "model", label: "model", example: "v5" },
  { key: "planTier", label: "plan tier", example: "Pro" },
  { key: "generatedAt", label: "generated", example: "YYYY-MM-DD" },
  { key: "briefDigest", label: "brief digest", example: "sha256:…" },
  { key: "reference", label: "reference" },
];

export const PERSONA_LABEL: Readonly<Record<"human" | "ai", string>> = { human: "a human", ai: "an AI persona" };
