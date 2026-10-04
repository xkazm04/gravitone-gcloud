// LANE — WHERE A SPOT COMES FROM, AND WHOSE FILM IT BRIEFS (dynamic).
//
// Two defects, one commit, and neither of them could be seen from a screenshot.
//
// 1 · SPOTS HAD NO UPSTREAM. `SPOTS` (app/_studio/score.ts) is a fixture whose
//     three rows name `sc-1 … sc-5`, so the moment the Score step started
//     spotting against the creator's OWN frames (ea98136) every spot in it was
//     unspottable and the screen correctly said so. Scenes had a parent;
//     musical intent did not. The doctrine says exactly where it comes from —
//     knowledge/templates/trailer/steps/03-score/PATTERNS.md §1, "The cue is the
//     parent", quoting 01-script §6, "Act boundaries are cue boundaries" — so a
//     spot is now DERIVED from a movement of the script's cut.
//
// 2 · `pictureFor` STAMPED GLASS HARBOR ONTO EVERY BRIEF. It read
//     `PROJECT.title` and `PROJECT.logline` — the fixture — into the
//     `CuePicture` of every cue, and `cueToPlan` puts both into
//     `positiveGlobalStyles`, which is what the vendor is told the music is FOR.
//     Unreachable only because no spot could be placed. This probe pins that a
//     project's own story reaches its own brief and that the fixture's does not
//     follow it there.
//
// WHAT THIS PROBE ALSO DOCUMENTS, because it is a finding rather than a
// fixture: the picture below is built BY HAND from the cut's own beats. No
// project in this build can produce both halves at once — `framesFor`
// (app/_phases/frames/frames.ts) derives frames only for the explainer fixture
// and returns `[]` for a trailer chain, while only a trailer project ever has a
// `script-trailer` record. So the mapping is proven here against the picture the
// frames→trailer seam WILL produce, and the surface says so honestly for every
// project that has one half and not the other.
//
// The import below has a SIDE EFFECT and must come first — it installs the
// storage engine on globalThis before any module under test reads `indexedDB`.
import "fake-indexeddb/auto";
import { test, expect } from "@playwright/test";
import * as React from "react";

import { PROJECT, SCENES } from "@/app/_studio/scenes";
import { SPOTS, cuesFrom, pictureFor } from "@/app/_studio/score";
import { GLASS_HARBOR_CUE } from "@/app/_studio/trailerFixtures";
import { composeCut } from "@/app/_phases/script/trailer/cut";
import { slotsFor } from "@/app/_phases/research/beats/beats";
import { atSeconds, type TrailerCut } from "@/app/_phases/script/trailer/types";
import { emptyClip, type Frame } from "@/app/_phases/frames/frames";
import { pictureFromFrames } from "@/app/_phases/score/picture";
import { proposeSpots, toCueSpots } from "@/app/_phases/score/spots";
import { useScoreSpots } from "@/app/_phases/score/useSpots";
import {
  readStep,
  saveStep,
  __resetSaveSlots,
  type ScoreStepData,
  type TrailerCutStepData,
} from "@/app/_phases/_shared/stepStore";
import { cueToPlan } from "@/lib/music/plan";
import { openDb, runTx, STEPS_STORE } from "@/lib/studioDb";

/* ────────────────────────────── the fixtures ─────────────────────────────── */

/** The whole spine, every slot's first variant — the cut Step 2 composes. */
function wholeCut(projectId = "p-score"): TrailerCut {
  const slots = slotsFor("trailer");
  return composeCut({
    projectId,
    title: "Glass Harbor — trailer",
    picks: Object.fromEntries(slots.map((s) => [s.id, s.variants[0].id])),
    slots,
    cue: GLASS_HARBOR_CUE,
  });
}

/**
 * The picture the frames→trailer seam will produce: one frame per beat, at the
 * beat's own timecode. Built here rather than read from `framesFor`, which
 * returns `[]` for a trailer chain today — see the header.
 */
function pictureOf(cut: TrailerCut, beats: number, targetS: number) {
  const frames: Frame[] = cut.beats.slice(0, beats).map((b, i) => ({
    id: `fr-${i}`,
    at: b.at,
    atS: atSeconds(b.at),
    kind: "movement",
    title: b.label,
    line: b.text,
    plate: { state: "empty" },
    clip: emptyClip(),
    elements: [],
    texts: [],
  }));
  return pictureFromFrames(frames, targetS);
}

/* ── 1 · a movement becomes a spot, and lands on the picture ────────────────── */

test("every movement of a whole spine is placed on the picture it was cut against", () => {
  const cut = wholeCut();
  const picture = pictureOf(cut, cut.beats.length, 120);
  const { spots, unplaced } = proposeSpots(cut, picture.scenes);

  console.log(
    `[spot] ${cut.movements.length} movements -> ${spots.length} placed, ${unplaced.length} unplaced`,
  );
  expect(picture.scenes.length, "the picture must have beats to place against").toBe(
    cut.movements.length,
  );
  // THE ACCEPTANCE FACT: at least one — in fact every one — of the movements is
  // ON the clock. A proposal that placed nothing would look identical on screen
  // to the fixture's three unspottable rows this commit exists to replace.
  expect(spots.length).toBe(cut.movements.length);
  expect(unplaced).toEqual([]);
  for (const spot of spots) expect(spot.sceneIds.length).toBeGreaterThan(0);
});

test("a spot's title is the movement's own label and its intent is the cue section, verbatim", () => {
  const cut = wholeCut();
  const { spots } = proposeSpots(cut, pictureOf(cut, cut.beats.length, 120).scenes);

  for (const spot of spots) {
    const movement = cut.movements.find((m) => m.id === spot.fromMovement)!;
    expect(spot.title, "a title invented here would be prose about somebody's film").toBe(
      movement.label,
    );
    const section = cut.cue!.sections.find((s) => s.id === movement.cueSection);
    // "The cue is the parent" — the intent is the cue's own words about this
    // movement, not a sentence this step wrote.
    expect(spot.note).toBe(section?.label ?? "");
  }
  console.log(`[spot] intents -> ${spots.map((s) => s.note).join(" | ")}`);
});

test("no proposed spot carries a tempo — the number is nowhere upstream and is not invented", () => {
  const cut = wholeCut();
  const { spots } = proposeSpots(cut, pictureOf(cut, cut.beats.length, 120).scenes);
  for (const spot of spots) {
    // 03-score/PATTERNS.md §8: "CANNOT REPLACE… tempo is chosen from the picture
    // by bar math." A plausible 84 here is four significant digits of authority
    // on a delivery gate.
    expect(spot.bpm, `${spot.id} invented a tempo`).toBeUndefined();
    expect(spot.proposed, `${spot.id} does not say it is a proposal`).toBe(true);
  }
  console.log(`[spot] ${spots.length} proposals, 0 tempos`);
});

/* ── 2 · a movement the picture cannot hold gets NO spot ────────────────────── */

test("movements past the end of the picture are reported unplaced, never spread over it", () => {
  const cut = wholeCut();
  // Only the first two beats have frames: the picture stops at 30s while the
  // cut runs to 1:50.
  const picture = pictureOf(cut, 2, 30);
  const { spots, unplaced } = proposeSpots(cut, picture.scenes);

  console.log(`[spot] short picture -> ${spots.length} placed, ${unplaced.length} unplaced`);
  console.log(`[spot] first reason -> ${unplaced[0]?.why}`);
  expect(spots.length).toBe(2);
  expect(unplaced.length).toBe(cut.movements.length - 2);
  // THE DEFECT THIS FORBIDS: distributing the remaining movements evenly across
  // the two scenes there are, which produces a screen that looks like it worked.
  const covered = new Set(spots.flatMap((s) => s.sceneIds));
  expect(covered.size).toBe(2);
  for (const u of unplaced) expect(u.why).toMatch(/no scene on this 30s of picture begins inside it/);
});

test("the scenes are PARTITIONED — no two cues claim the same seconds of film", () => {
  const cut = wholeCut();
  // A picture whose cuts do NOT line up with the cut's acts, which is the case
  // that produced two cues over one scene: sixteen even beats across the same
  // 120s the eight movements span.
  const frames: Frame[] = Array.from({ length: 16 }, (_, i) => ({
    id: `fr-${i}`,
    at: `0:${String(i * 7).padStart(2, "0")}`,
    atS: i * 7,
    kind: "movement",
    title: `beat ${i + 1}`,
    line: "",
    plate: { state: "empty" },
    clip: emptyClip(),
    elements: [],
    texts: [],
  }));
  const picture = pictureFromFrames(frames, 120);
  const { spots } = proposeSpots(cut, picture.scenes);

  const claimed = spots.flatMap((s) => s.sceneIds);
  console.log(`[spot] misaligned picture -> ${spots.length} spots claiming ${claimed.length} scenes`);
  // THE DEFECT: an overlap test gave a straddling scene to BOTH neighbours, so
  // two cues bought music for the same seconds and the timeline drew two spans
  // over one another.
  expect(new Set(claimed).size, "a scene is claimed twice").toBe(claimed.length);
  // And the spans are in clock order with no backwards step.
  const firstOf = (ids: string[]) => picture.scenes.findIndex((s) => s.id === ids[0]);
  const starts = spots.map((s) => firstOf(s.sceneIds));
  expect([...starts].sort((a, b) => a - b)).toEqual(starts);
});

test("a movement whose beats carry no timecode is unplaced with that reason", () => {
  const cut = wholeCut();
  const broken: TrailerCut = {
    ...cut,
    beats: cut.beats.map((b) => (b.movement === cut.movements[1].id ? { ...b, at: "tbd" } : b)),
  };
  const { spots, unplaced } = proposeSpots(broken, pictureOf(cut, cut.beats.length, 120).scenes);
  console.log(`[spot] unparseable at -> ${unplaced[0]?.why}`);
  expect(unplaced).toHaveLength(1);
  expect(unplaced[0].movement.id).toBe(cut.movements[1].id);
  expect(unplaced[0].why).toContain("no beat in it carries a timecode");
  // "tbd" is not zero. A movement placed at the head of the cut because its
  // timecode did not parse is the failure `secondsOf` documents in full.
  expect(spots.some((s) => s.fromMovement === cut.movements[1].id)).toBe(false);
});

test("a project with no picture proposes nothing at all", () => {
  const cut = wholeCut();
  const { spots, unplaced } = proposeSpots(cut, []);
  console.log(`[spot] no picture -> ${spots.length} placed, ${unplaced.length} unplaced`);
  expect(spots).toEqual([]);
  expect(unplaced).toHaveLength(cut.movements.length);
});

/* ── 3 · the brief carries THIS project's story, not the fixture's ──────────── */

test("a cue's picture names the project it was built for", () => {
  const spot = { ...SPOTS[0] };
  const mine = pictureFor(spot, SCENES, { title: "Low Tide", logline: "A different film." })!;
  console.log(`[spot] briefed for -> ${mine.projectTitle}`);
  expect(mine.projectTitle).toBe("Low Tide");
  expect(mine.logline).toBe("A different film.");
  // THE DEFECT: these two fields were read off the fixture unconditionally.
  expect(JSON.stringify(mine)).not.toContain(PROJECT.title);
});

test("no vendor brief for another project carries Glass Harbor or its logline", () => {
  const cut = wholeCut();
  const picture = pictureOf(cut, cut.beats.length, 120);
  const { spots } = proposeSpots(cut, picture.scenes);
  const { cues } = cuesFrom(toCueSpots(spots), picture.scenes, {
    title: "Low Tide",
    logline: "A different film.",
  });
  expect(cues.length).toBeGreaterThan(0);

  const plan = cueToPlan({
    title: cues[0].title,
    intent: cues[0].note,
    // A tempo the CALLER supplied; the proposal has none, which is the point of
    // the test above. This one exists only so a plan can be built at all.
    bpm: 96,
    styleBlock: ["dark orchestral"],
    picture: cues[0].picture,
  });
  const wire = JSON.stringify(plan);
  console.log(`[spot] global styles -> ${plan.positiveGlobalStyles.join(" · ")}`);
  expect(wire).toContain("Low Tide");
  // The one that ships somebody else's film to the music vendor.
  expect(wire, "the fixture's title reached another project's brief").not.toContain(PROJECT.title);
  expect(wire, "the fixture's logline reached another project's brief").not.toContain(
    PROJECT.logline,
  );
});

test("the fixture path is unchanged — a caller that passes no project still gets the fixture", () => {
  const a = pictureFor(SPOTS[0]);
  expect(a!.projectTitle).toBe(PROJECT.title);
  expect(a!.logline).toBe(PROJECT.logline);
});

/* ────────────────────────── the hook, driven for real ───────────────────────
   The harness is `trailer-cut-lifecycle.probe.spec.ts`'s, plus `useRef` —
   `useScoreSpots` holds its save timer in one. Nothing else is implemented, so a
   hook the subject starts using is a TypeError naming it rather than a silent
   stub. What is NOT covered is React's scheduling; that is the renderer's, and
   this lane has no DOM. */

interface Internals {
  H: unknown;
}
const INTERNALS = (React as unknown as Record<string, Internals>)
  .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

const sameDeps = (a?: readonly unknown[], b?: readonly unknown[]) =>
  a !== undefined && b !== undefined && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
};

function harness<T>(run: () => T) {
  const cells: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const committed: { deps?: readonly unknown[]; cleanup?: () => void }[] = [];
  const memos: { deps?: readonly unknown[]; value: unknown }[] = [];
  let ci = 0;
  let ri = 0;
  let ei = 0;
  let mi = 0;
  let dirty = false;
  let queue: (() => void)[] = [];

  const dispatcher = {
    useState(init: unknown) {
      const k = ci++;
      if (!(k in cells)) cells[k] = typeof init === "function" ? (init as () => unknown)() : init;
      return [
        cells[k],
        (v: unknown) => {
          const next = typeof v === "function" ? (v as (p: unknown) => unknown)(cells[k]) : v;
          if (!Object.is(next, cells[k])) {
            cells[k] = next;
            dirty = true;
          }
        },
      ];
    },
    useRef(init: unknown) {
      const k = ri++;
      if (!(k in refs)) refs[k] = { current: init };
      return refs[k];
    },
    useEffect(fn: () => void | (() => void), deps?: readonly unknown[]) {
      const k = ei++;
      const prev = committed[k];
      if (prev && sameDeps(prev.deps, deps)) return;
      queue.push(() => {
        prev?.cleanup?.();
        const cleanup = fn();
        committed[k] = { deps, cleanup: typeof cleanup === "function" ? cleanup : undefined };
      });
    },
    useMemo(fn: () => unknown, deps?: readonly unknown[]) {
      const k = mi++;
      const prev = memos[k];
      if (prev && sameDeps(prev.deps, deps)) return prev.value;
      const value = fn();
      memos[k] = { deps, value };
      return value;
    },
    useCallback(fn: unknown, deps?: readonly unknown[]) {
      return dispatcher.useMemo(() => fn, deps);
    },
  };

  return {
    async settleUp(): Promise<T> {
      let out!: T;
      for (let pass = 0; pass < 40; pass++) {
        ci = 0;
        ri = 0;
        ei = 0;
        mi = 0;
        dirty = false;
        const before = INTERNALS.H;
        INTERNALS.H = dispatcher;
        try {
          out = run();
        } finally {
          INTERNALS.H = before;
        }
        const firing = queue;
        queue = [];
        for (const f of firing) f();
        await settle();
        // A PASS THAT CHANGED NO STATE IS THE SETTLE CONDITION, and "no effect
        // fired" deliberately is not: `useLoadFor` keeps its `load`/`apply` in
        // refs and syncs them in a DEP-LESS effect, which by design re-queues on
        // every render. The sibling harness in trailer-cut-lifecycle can use the
        // stricter condition because `useTrailerCut` has no such effect.
        void firing;
        if (!dirty) return out;
      }
      throw new Error("the hook never settled in 40 passes — a render loop, or deps that change every time");
    },
    unmount() {
      for (const c of committed) c.cleanup?.();
    },
  };
}

async function clearSteps() {
  const db = await openDb();
  await runTx(db, STEPS_STORE, "readwrite", (store) => {
    store.clear();
  });
  db.close();
}

/** Past the hook's 600ms save debounce, with room for the write to land. */
const afterSave = () => new Promise((r) => setTimeout(r, 1100));

test.beforeEach(async () => {
  __resetSaveSlots();
  await clearSteps();
});

test("the harness is installed on the dispatcher React actually reads", () => {
  expect(INTERNALS, "React's client internals are not where this harness expects").toBeTruthy();
  expect("H" in INTERNALS).toBe(true);
});

test("a project with a cut opens PROPOSED, and the session survives a reload as its own", async () => {
  const cut = wholeCut("p-live");
  await saveStep<TrailerCutStepData>("p-live", "script-trailer", {
    cut,
    budget: { campaignId: "c", assets: [] },
  });
  const scenes = pictureOf(cut, cut.beats.length, 120).scenes;

  const first = harness(() => useScoreSpots("p-live", scenes));
  const opened = await first.settleUp();
  console.log(`[spot] first open -> ${opened.origin?.kind}, ${opened.spots?.length} spots`);
  expect(opened.origin?.kind).toBe("proposed");
  expect(opened.spots?.length).toBe(cut.movements.length);
  expect(opened.spots?.every((s) => s.proposed)).toBe(true);

  await afterSave();
  const stored = await readStep<ScoreStepData>("p-live", "score");
  expect(stored.ok && stored.data?.spots.length, "the seed must reach the record").toBe(
    cut.movements.length,
  );
  // TAKES ARE NOT PERSISTED, and the record has no field for one. A `blob:` URL
  // stored here is dead on the next load; stepStore.ts:127-133 is the decision.
  expect(JSON.stringify(stored.ok ? stored.data : {})).not.toContain("blob:");
  first.unmount();

  // RELOAD. The stored session is the creator's and is never re-proposed over.
  const second = harness(() => useScoreSpots("p-live", scenes));
  const reopened = await second.settleUp();
  console.log(`[spot] reopened -> ${reopened.origin?.kind}, ${reopened.spots?.length} spots`);
  expect(reopened.origin?.kind).toBe("authored");
  expect(reopened.spots?.length).toBe(cut.movements.length);
  second.unmount();
});

test("editing a spot makes it the creator's — it stops calling itself a proposal", async () => {
  const cut = wholeCut("p-edit");
  await saveStep<TrailerCutStepData>("p-edit", "script-trailer", {
    cut,
    budget: { campaignId: "c", assets: [] },
  });
  const scenes = pictureOf(cut, cut.beats.length, 120).scenes;

  const h = harness(() => useScoreSpots("p-edit", scenes));
  const api = await h.settleUp();
  const target = api.spots![0].id;

  api.patchSpot(target, { title: "Low tide, held", bpm: 96 });
  const after = await h.settleUp();
  const edited = after.spots!.find((s) => s.id === target)!;
  console.log(`[spot] edited -> "${edited.title}" ${edited.bpm}bpm proposed=${edited.proposed}`);
  expect(edited.title).toBe("Low tide, held");
  expect(edited.bpm).toBe(96);
  expect(edited.proposed, "a row a human has had an opinion about is not a proposal").toBe(false);
  // Its neighbours are untouched — an edit is local, not a re-derivation.
  expect(after.spots!.filter((s) => s.proposed).length).toBe(cut.movements.length - 1);

  await afterSave();
  const stored = await readStep<ScoreStepData>("p-edit", "score");
  expect(stored.ok && stored.data?.spots.find((s) => s.id === target)?.bpm).toBe(96);
  h.unmount();
});

test("a spot can be deleted and one can be added, and both survive to the record", async () => {
  const cut = wholeCut("p-add");
  await saveStep<TrailerCutStepData>("p-add", "script-trailer", {
    cut,
    budget: { campaignId: "c", assets: [] },
  });
  const scenes = pictureOf(cut, cut.beats.length, 120).scenes;

  const h = harness(() => useScoreSpots("p-add", scenes));
  const api = await h.settleUp();
  const doomed = api.spots![0].id;

  api.removeSpot(doomed);
  api.addSpot([scenes[1].id, scenes[2].id]);
  const after = await h.settleUp();
  console.log(`[spot] after delete+add -> ${after.spots!.length} spots`);
  expect(after.spots!.some((s) => s.id === doomed)).toBe(false);
  expect(after.spots!.length).toBe(cut.movements.length);
  const added = after.spots![after.spots!.length - 1];
  // A hand-added spot is nobody's proposal and carries no tempo either.
  expect(added.proposed).toBeUndefined();
  expect(added.bpm).toBeUndefined();
  expect(added.sceneIds).toEqual([scenes[1].id, scenes[2].id]);

  await afterSave();
  const stored = await readStep<ScoreStepData>("p-add", "score");
  expect(stored.ok && stored.data?.spots.some((s) => s.id === doomed)).toBe(false);
  h.unmount();
});

test("a project with NO cut proposes nothing and writes nothing — the key stays absent", async () => {
  const scenes = pictureOf(wholeCut(), 4, 60).scenes;
  const h = harness(() => useScoreSpots("p-nocut", scenes));
  const api = await h.settleUp();
  console.log(`[spot] no cut -> origin=${api.origin?.kind}, ${api.spots?.length} spots`);
  expect(api.origin?.kind).toBe("no-cut");
  expect(api.spots).toEqual([]);

  await afterSave();
  const stored = await readStep<ScoreStepData>("p-nocut", "score");
  // AN EMPTY SEED IS NOT A DECISION. Writing `[]` here would read back as
  // "authored, and emptied" forever, and the proposal would never run again for
  // a project that later composes a spine.
  expect(stored.ok && stored.data, "an unseeded project must not be written").toBeUndefined();
  h.unmount();
});
