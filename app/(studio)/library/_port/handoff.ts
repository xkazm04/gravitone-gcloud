import "server-only";

// v1's `/library?style=<id>` handoff, resolved against the Style store. v1 opened a THEME by its
// IndexedDB id (`th-...`: the Foundry's adopt pushed it, app/foundry/StylesShelf.tsx), and the
// importer keeps a theme as the Style `v1-theme:<id>` (@gt/kernel/styles/v1theme `themeStyleId`).
// The store's own id wins (a catalogue style named directly); the imported name is tried next;
// an id neither names is passed through unchanged, so the atelier's 404 names what was asked for.

import { readStyle } from "@gt/kernel/styles/driver";
import { themeStyleId } from "@gt/kernel/styles/v1theme";

import { kernel } from "../../../../lib/kernelStore.ts";

export function styleHandoff(id: string): string {
  const k = kernel();
  if (!k.ok) return id;
  for (const candidate of [id, themeStyleId(id)]) if (readStyle(k.value.store, candidate).ok) return candidate;
  return id;
}
