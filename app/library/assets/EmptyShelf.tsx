"use client";

import { ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/Primitives";
import { Ghost } from "@/components/ui/signal";

/**
 * The empty shelf used to read "Run pipeline/build-style-trials.mts, then
 * reload" — a terminal instruction given to somebody standing in a browser, for
 * a script most people looking at this screen cannot run and none of them asked
 * about. It named the mechanism that happens to fill the shelf instead of the
 * act that fills it, which is the one thing an empty state exists to say.
 *
 * What actually puts an asset here is approving a plate on a style's proof
 * sheet and keeping it on the shelf. That is a thing the user can do, from one
 * tab away, so the state offers the tab.
 *
 * The paragraph that defined what an asset IS went with the second rewrite: it
 * was the app explaining its own noun to somebody standing on the shelf. What
 * replaces it is the shape of the missing thing — a grid of tile outlines,
 * which is also the drop frame the section already accepts files into — plus
 * the one control that fills it.
 */
export default function EmptyShelf({ hasAny, onOpenStyles }: { hasAny: boolean; onOpenStyles?: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10">
      <p className="font-instrument mb-6 text-center text-2xl text-white">
        {hasAny ? "Nothing in this folder" : "The shelf is empty"}
      </p>
      <Ghost
        shape="tile"
        count={1}
        label={hasAny ? "This folder is empty" : "The shelf is empty"}
        glyph={<ImagePlus className="h-8 w-8" aria-hidden />}
        action={
          !hasAny && onOpenStyles ? (
            <Button variant="ghost" onClick={onOpenStyles}>
              open Styles
            </Button>
          ) : undefined
        }
        className="mx-auto max-w-xs"
      />
    </div>
  );
}

