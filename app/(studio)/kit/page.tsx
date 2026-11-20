// /kit - the design system as shipped (plan §2.1; owner decision 5, 2026-10-15: it replaces
// v1's Almanac kit outright). Its structure is the prototype's own kit page
// (docs/next/prototype/app/kit.html + kit.js + kit.css): grouped sections, specimen cards, the
// tokens read back, every part in its states.
//
// What is not the prototype's: the tokens come from packages/ui/tokens/source.json (the
// generator's authority) instead of the stylesheet, the status vocabulary is the whole
// STATUS table instead of eight hand-picked words, and the key legends are drawn for every
// mode of the one keymap instead of one hand-typed list. Since the design baseline (P4,
// 2026-11-17) each group is its own page: this one is the tokens, ./[group]/page.tsx the rest
// (./KitGroup.tsx).
import type { Metadata } from "next";

import { KitGroup } from "./KitGroup.tsx";

export const metadata: Metadata = { title: "Gravitone · Kit" };

export default function KitPage() {
  return <KitGroup group="tokens" />;
}
