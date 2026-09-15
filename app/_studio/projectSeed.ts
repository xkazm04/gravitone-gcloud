// Seed rows for a first-time account — the fixture seam for /projects.
//
// The rest of this folder mocks what a project CONTAINS (scenes, frames, cues).
// This mocks the shelf they sit on, and it is the last piece of mocked data a
// backend would replace: delete this file and the empty state is already
// correct — /projects renders "no projects yet" and the create dialog works.
//
// The states are deliberately uneven. Glass Harbor is the production the rest
// of app/_studio actually describes, so its progress reads the way those
// surfaces render it: script locked, one frame still unpicked and one clip
// rejected (both Frames' problem now that Motion is folded into it), a cue
// refused, gaps in the cut. The other
// four exist so the list has range — a project with nothing but a title, one
// stuck on a real blocker, one finished, one that never got past research —
// and a sixth, Glass Harbor's trailer, so the shelf carries a second
// discipline rather than reading as if every video were educational.
// Nothing here is a state the product could not reach.

import { emptyProgress, type Project } from "@/lib/projects";

const DAY = 24 * 60 * 60 * 1000;

/** The prefix every id below carries. Those ids were already load-bearing —
 *  `addProjects` relies on them being stable and content-addressed so a lost
 *  seed race writes nothing — and the prefix is now also what makes a demo row
 *  RECOGNISABLE on the shelf. A new seed row must keep it. */
const SEED_ID = "seed-";

/**
 * Was this row handed to the account by the seed below, rather than made by the
 * user? The shelf tags these so a stranger's first screen does not present six
 * fictional productions exactly the way it presents their own work.
 *
 * DERIVED FROM THE ID, not a stored flag, and deliberately:
 *  · a flag would be absent from every row already sitting in every existing
 *    account's IndexedDB, so the shelves that most need the tag are the ones
 *    that would never show it — and `migrateProject` could only backfill it by
 *    reading the id, which is this function with an extra write;
 *  · a flag is writable. `putProject` copies whole records so an edit would
 *    carry it, but any future path that rebuilds a record field-by-field could
 *    drop it and let a demo row claim to be the user's own work.
 * The id is minted once and no surface edits it, and `newProject` mints user
 * projects under `p-`, so this answer cannot drift from the truth — a demo the
 * user renames is still a demo, which is the honest reading.
 */
export function isSeeded(p: { id: string }): boolean {
  return p.id.startsWith(SEED_ID);
}

/** Seeded relative to `now` so a fresh account never shows 1970 timestamps. */
export function seedProjects(uid: string, now: number = Date.now()): Project[] {
  return [
    {
      id: "seed-glass-harbor",
      uid,
      title: "Glass Harbor",
      logline:
        "A crew that never breaks in — they wait for the one door every city leaves unlocked.",
      template: "short-form-clip",
      discipline: "educational",
      targetS: 31,
      createdAt: now - 9 * DAY,
      updatedAt: now - 2 * 60 * 60 * 1000,
      phase: "frames",
      progress: {
        research: "done",
        script: "done",
        frames: "review", // scene 5 unpicked, 1 clip rejected, 1 rendering
        score: "review", // a cue was refused
        cut: "working", // playable with gaps
      },
    },
    {
      id: "seed-why-bitcoin",
      uid,
      title: "Why the Bitcoin price does not rise",
      logline: "The supply story everyone repeats, and the demand it quietly assumes.",
      template: "mid-educational-video",
      discipline: "educational",
      targetS: 300,
      createdAt: now - 4 * DAY,
      updatedAt: now - 20 * 60 * 60 * 1000,
      phase: "script",
      progress: {
        research: "done",
        script: "working",
        frames: "empty",
        score: "empty",
        cut: "empty",
      },
    },
    {
      id: "seed-the-quiet-tariff",
      uid,
      title: "The quiet tariff",
      logline: "Nobody voted for it, everybody pays it.",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 120,
      createdAt: now - 16 * DAY,
      updatedAt: now - 3 * DAY,
      phase: "frames",
      progress: {
        research: "done",
        script: "done",
        // Every candidate for the archive scene came back refused — a real
        // wall, not a slow render, and the reason /projects has a blocked word.
        frames: "blocked",
        score: "empty",
        cut: "empty",
      },
    },
    {
      id: "seed-two-hundred-days",
      uid,
      title: "Two hundred days of rain",
      logline: "A city that budgets for weather, and the year the budget stopped working.",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 145,
      createdAt: now - 41 * DAY,
      updatedAt: now - 11 * DAY,
      phase: "cut",
      progress: {
        research: "done",
        script: "done",
        frames: "done",
        score: "done",
        cut: "done",
      },
    },
    {
      id: "seed-untitled",
      uid,
      title: "Untitled — the port strike one",
      logline: "",
      template: "short-form-clip",
      discipline: "educational",
      targetS: 30,
      createdAt: now - 6 * 60 * 60 * 1000,
      updatedAt: now - 6 * 60 * 60 * 1000,
      phase: "research",
      progress: emptyProgress(),
    },
    {
      id: "seed-glass-harbor-trailer",
      uid,
      title: "Glass Harbor — trailer",
      logline:
        "A crew that never breaks in — they wait for the one door every city leaves unlocked.",
      template: "trailer",
      discipline: "trailer",
      targetS: 120,
      createdAt: now - 1 * DAY,
      updatedAt: now - 5 * 60 * 60 * 1000,
      phase: "research",
      progress: {
        research: "working",
        script: "empty",
        frames: "empty",
        score: "empty",
        cut: "empty",
      },
    },
  ];
}

/* ── What a seeded project has already RESEARCHED ─────────────────────────── */

/** The topic each seeded project's Step 1 was run on.
 *
 *  THE FIXTURE WAS HALF-WRITTEN, and the half that was missing was the half the
 *  shelf was advertising (operator, 2026-09-09). Four of the rows above declare
 *  `progress.research: "done"`, and /projects prints that word — but the only
 *  project that shipped an actual research RECORD was the Bitcoin one, because
 *  `stepStore#seededFor` matched on `/bitcoin/i`. So opening Glass Harbor's
 *  Step 1 showed an empty topic field with the wizard parked on stage 1 and
 *  every later stage unreachable, under a rail that had just said Research was
 *  locked. The shelf and the step disagreed about the same project.
 *
 *  A topic per project rather than one shared string: the field is what the
 *  creator typed, and four demo projects that all claim to have researched
 *  Bitcoin would be a worse fiction than the one being fixed.
 *
 *  WHAT THIS DOES NOT CLAIM. The notebook itself is still the single shipped
 *  2026-08-11 Bitcoin run — there is one fixture notebook and these projects
 *  replay it. That substitution is disclosed where it happens, by `StandInNote`
 *  (research/guided/RunStage.tsx): the typed topic is struck through and the
 *  notebook's own topic is named beside it. Seeding a topic here makes that
 *  disclosure TRUE for these projects rather than vacuous — before, there was
 *  no typed topic for it to strike through.
 *
 *  Keyed by id and exported so `seededFor` reads it rather than pattern-matching
 *  a name, which is what let the other three rows fall through the gap. */
export const SEEDED_RESEARCH_TOPIC: Record<string, string> = {
  "seed-glass-harbor": "How a city's unlocked doors get chosen",
  "seed-why-bitcoin": "Why Bitcoin price does not rise",
  "seed-the-quiet-tariff": "Who actually pays an import tariff",
  "seed-two-hundred-days": "How a city budgets for weather it cannot predict",
};

/** True when a seed row DECLARES its research done, read off the seed itself.
 *
 *  The uid is irrelevant to `progress`, so this asks the same array the shelf is
 *  built from rather than keeping a second list beside it — the two cannot drift
 *  into disagreeing, which is the defect this whole block exists to close. */
export function seededResearchTopic(projectId: string): string | undefined {
  const topic = SEEDED_RESEARCH_TOPIC[projectId];
  if (!topic) return undefined;
  const row = seedProjects("").find((p) => p.id === projectId);
  return row?.progress.research === "done" ? topic : undefined;
}
