// The studio header, server half: it reads the numbers on the right (./headerFacts.ts - the
// last 24 hours' spend, and the jobs that need the operator) where the store is, and hands it to the client bar (./HeaderBar.tsx). Phase 1 drew Ghosts in their place; this is the change that feeds
// them (app-shell lazy-section-loading: the placeholder held the section's shape, so the data
// replaced it without rearranging the bar).
//
// The layout renders it on every (studio) page, and a page's `router.refresh()` (the live feed,
// ./liveFeed.ts) re-renders it with the page, so the spend moves when the ledger does.

import { readNeedsAction } from "./bellJobs.ts";
import { HeaderBar } from "./HeaderBar.tsx";
import { headerFacts, needsFacts } from "./headerFacts.ts";

export async function StudioHeader({ devAuth }: { readonly devAuth: boolean }) {
  const [facts, needs] = await Promise.all([headerFacts(), needsFacts()]);
  return <HeaderBar devAuth={devAuth} facts={facts} needs={needs} rereadNeeds={readNeedsAction} />;
}
