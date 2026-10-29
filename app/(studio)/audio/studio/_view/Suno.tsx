"use client";

// WP0 STUBS for the two Suno kinds (spark suno-advisor): the contract compiles and a card can place
// them; WP3's @gt/ui pieces (packages/ui/src/components/suno/) replace these in the compositions.
import type { ReactNode } from "react";

import type { Placed } from "@gt/ui/components/studio-desk/desk.ts";

import type { CardCtx } from "./ctx.ts";

export function SunoPromptStub({ placed }: { readonly placed: Placed<"suno_prompt">; readonly ctx: CardCtx }): ReactNode {
  return <pre aria-label={`Suno prompt ${placed.node.promptId}`}>{placed.node.style}</pre>;
}

export function TasteStub({ placed }: { readonly placed: Placed<"taste">; readonly ctx: CardCtx }): ReactNode {
  return (
    <ul aria-label="taste">
      {placed.node.rows.map((r) => (
        <li key={r.id}>{`${r.lean}: ${r.line}`}</li>
      ))}
    </ul>
  );
}
