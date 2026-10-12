// THE TWO MEDIA THE PIPELINE TAB DRAWS — a leaf module, so the foundry's tab
// strip can name them without importing the board. ../PipelineTab.tsx is a
// next/dynamic boundary (../FoundryView.tsx); a value read from it statically
// would pull the whole engine back into the foundry's first chunk.

export type MediaId = "articles" | "audio";

export const MEDIA: ReadonlyArray<{ id: MediaId; label: string }> = [
  { id: "articles", label: "Articles" },
  { id: "audio", label: "Audio" },
];
