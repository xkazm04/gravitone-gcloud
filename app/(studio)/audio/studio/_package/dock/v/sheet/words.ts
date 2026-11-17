// The sheet's words for the model's values (variant "sheet"): one spelling each, shared by the page and its editors.
import type { AiCredits, Licence, RightsRecord, SleeveSource } from "@gt/domain/release";

export const LICENCE_LABEL: Readonly<Record<Licence, string>> = { commercial: "commercial", "cc-by-nc": "CC BY-NC", unknown: "unknown" };

export const RECORD_FIELDS: readonly { readonly key: Exclude<keyof RightsRecord, "licence">; readonly label: string; readonly example?: string; readonly code?: boolean }[] = [
  { key: "vendor", label: "generator", example: "suno" },
  { key: "model", label: "model", example: "v5" },
  { key: "planTier", label: "plan tier", example: "Pro" },
  { key: "generatedAt", label: "generated", example: "YYYY-MM-DD", code: true },
  { key: "briefDigest", label: "brief digest", example: "sha256:…", code: true },
  { key: "reference", label: "reference" },
];

export const SOURCE_LABEL: Readonly<Record<SleeveSource, string>> = { generated: "generated", upload: "upload", "mv-look": "MV still" };

export const aiLyrics = (ai: AiCredits): string => (ai.lyrics ? "AI-written" : "human-written");
export const aiMusic = (ai: AiCredits): string => (ai.music ? "AI-composed" : "human-composed");
export const aiPersona = (ai: AiCredits): string | null => (ai.persona === null ? null : ai.persona === "ai" ? "an AI persona" : "a human");
