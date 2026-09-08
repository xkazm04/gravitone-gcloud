"use client";

// /library — the cross-project shelf. Everything a project is BUILT FROM lives
// here, as opposed to the studio's own shelves (app/_library), which hold what
// one project PRODUCED.
//
// Three modules, two of which exist:
//   Styles      visual identities — the gate every project stands behind
//   Assets      reusable source material — the trial grid, and every plate
//               promoted off a style's proof sheet
//   Animations  reusable motion                                 (not yet)
//
// The empty one is named rather than hidden on purpose. This shelf is where
// Step 3 will reach for it, so the slot is part of the map now — and a tab that
// says what is coming is a smaller lie than a surface that pretends the library
// is only ever about styles. It rides as a LOCKED tab rather than an openable
// one that lands on a placeholder page: `aria-disabled`, keyboard-reachable,
// with its reason behind the tab's own disclosure. A whole screen whose only
// content was three sentences about why it is blank was the placeholder saying
// out loud what the padlock says on sight.

import { useState } from "react";

import StudioFrame from "@/components/ui/StudioFrame";
import { Eyebrow } from "@/components/ui/Primitives";
import { TabRail } from "@/components/ui/signal";

import AssetsBrowser from "./AssetsBrowser";
import LibraryAtelier from "./LibraryAtelier";

type ModuleId = "styles" | "assets" | "animations";

/** What each tab's blurb was reaching for: the count. Reported UP by whichever
 *  pane holds the live array, rather than read a third time from IndexedDB
 *  here — a second copy of a number is a number that goes stale the first time
 *  the user makes something. The atelier reports assets too, because promoting
 *  a plate to the shelf happens on the Styles tab while Assets is unmounted. */
interface Counts {
  styles?: number;
  locked?: number;
  assets?: number;
}

export default function LibraryView() {
  const [module, setModule] = useState<ModuleId>("styles");
  /** A style the Assets tab has just created and wants opened. Consumed as the
   *  atelier's INITIAL selection: switching modules unmounts it, so the handoff
   *  needs no effect and cannot fight the user's later clicks. */
  const [focusStyle, setFocusStyle] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>({});

  return (
    <StudioFrame>
      {/* tabIndex={-1}: the landmark a closing dialog hands focus to when the
          control it was opened from did not survive it — a restore onto a
          detached node is silent, and focus falls to <body>. See
          components/ui/Modal.tsx#restoreFocus. */}
      <main tabIndex={-1} className="pb-16">
        <header className="pt-6">
          <Eyebrow>library</Eyebrow>
          <h1 className="font-instrument mt-3 text-4xl text-white">Library</h1>

          <TabRail
            className="mt-5"
            label="library modules"
            active={module}
            onSelect={(id) => {
              // A tab pressed by hand is not a handoff — drop any pending
              // focus so the atelier opens where the user left it.
              setFocusStyle(null);
              setModule(id);
            }}
            tabs={[
              {
                id: "styles",
                testId: "module-styles",
                label: "Styles",
                panelId: "library-panel",
                // Locked-of-total, not total: the gate this whole page exists
                // to enforce is "at least one locked style", so the ratio IS
                // the tab's news.
                ...(counts.styles === undefined
                  ? {}
                  : {
                      tally: {
                        value: counts.locked ?? 0,
                        of: counts.styles,
                        label: "locked",
                        tone: (counts.locked ?? 0) > 0 ? ("cyan" as const) : ("amber" as const),
                      },
                    }),
              },
              {
                id: "assets",
                testId: "module-assets",
                label: "Assets",
                panelId: "library-panel",
                ...(counts.assets === undefined ? {} : { tally: { value: counts.assets } }),
              },
              {
                id: "animations",
                testId: "module-animations",
                label: "Animations",
                disabled: true,
                disabledReason: "no engine yet",
              },
            ]}
          />
        </header>

        <section id="library-panel" role="tabpanel" className="mt-6">
          {module === "assets" ? (
            // The shelf fills from Styles, so its empty state needs a way back
            // there. The module is this component's state, so the handler is
            // this component's to pass — an empty state that can only describe
            // the next step is half a surface.
            <AssetsBrowser
              onCount={(assets) => setCounts((c) => (c.assets === assets ? c : { ...c, assets }))}
              onOpenStyles={(themeId) => {
                setFocusStyle(themeId ?? null);
                setModule("styles");
              }}
            />
          ) : (
            <LibraryAtelier
              initialSelectedId={focusStyle}
              onCounts={(next) =>
                setCounts((c) =>
                  c.styles === next.styles && c.locked === next.locked && c.assets === next.assets
                    ? c
                    : { ...c, ...next },
                )
              }
            />
          )}
        </section>
      </main>
    </StudioFrame>
  );
}
