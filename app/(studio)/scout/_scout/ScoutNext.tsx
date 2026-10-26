"use client";

// The Scout header's NEXT: HeaderChips' NextButton over the oldest scout or seeds pile, opened on the
// Runs tab. A client island only because NextButton's plain click is a router push (a modified click
// keeps the link's own new-tab behaviour), which a Server Component cannot hand an anchor.
import { useRouter } from "next/navigation";

import { NextButton, type NextPile } from "@gt/ui/components/header/HeaderChips.tsx";

export function ScoutNext({ next }: { readonly next: NextPile }) {
  const router = useRouter();
  return <NextButton next={next} onOpen={(href) => router.push(href)} />;
}
