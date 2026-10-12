// STUDIO NAVIGATION THROUGH ONE DOOR.
//
// Which step is on screen used to have four writers in StudioView — a rail
// click, `[`/`]`, a `?step=` that changed, the initial open — and two stores, the
// component's `phaseKey` and the address, reconciled by hand with a `seenWanted`
// state and an `initialWanted` ref. They drifted, and three defects lived in the
// gap (all measured on b08bc7e):
//   · a rail click never wrote the address, so after one the URL still named the
//     deep-linked step and a reload reopened the wrong one — contradicting the
//     bookmark the click had just parked;
//   · a hand-off Link to the step the address already named (ScriptStep's "Open
//     Research" after arriving at ?step=research) changed no search param and
//     was swallowed;
//   · a hand-off back to the first deep-linked step moved the rail but was
//     refused its park by an early return on `initialWanted`.
//
// Now every transition is `step(state, event)`, pure and React-free, and the
// ADDRESS IS THE MIRROR of the active step: a rail move replaces it (never
// pushes — this changes no history semantics), so the address and the bookmark
// cannot disagree, and a hand-off is simply an address that differs from the one
// we last wrote. StudioView is the runner: it dispatches events and executes the
// effects (park, replaceUrl, reread) in one place.
//
// THE ECHO. `router.replace` comes back as a `?step=` change a render or two
// later. `echoes` holds the keys we wrote and have not yet seen come back, so
// our own write is never mistaken for a hand-off (which would park twice). When
// the newest write echoes, every older one is moot and the queue clears; an echo
// Next skipped on the way therefore cannot linger and swallow a later hand-off.
//
// THE RECORD ORDERING. Five writers set the project (the open, the re-read after
// a rail move, the re-read after a hand-off, sign-off, reopen) and whichever
// promise resolved last used to win — a re-read issued before a sign-off could
// land after it and take the lock off the rail. The runner stamps each read or
// write with a sequence number when it is ISSUED; a result older than the one
// already applied is dropped.
import { PHASES, type PhaseKey, type Project } from "@/lib/projects";

/**
 * WHAT HAPPENED AT THE DOOR. Three different facts used to be one
 * `.catch(() => router.replace("/projects"))`, which threw away the message
 * lib/studioDb.ts had carefully built (quota, blocked tab, unavailable) and
 * bounced the user with no explanation — while the identical failure one route
 * over, on /projects, gets a banner.
 *
 * `absent` COVERS TWO CASES ON PURPOSE: no such project, and a project owned by
 * another account on this browser. They are presented identically, and the
 * choice is deliberate rather than lazy:
 *
 *  · There is no secret to keep from a determined reader. lib/projects.ts says
 *    it out loud — the uid scoping is a data-shape decision, not a security
 *    boundary, and any code on this page can read the whole store.
 *  · But the case that scoping exists for is TWO PEOPLE ON ONE MACHINE, and
 *    "this project belongs to someone else" is the one sentence that turns a
 *    shared laptop into a disclosure. It confirms a stranger's work exists to
 *    somebody with no claim on it.
 *  · And it buys the user nothing. Either way there is nothing here for THEM to
 *    open and the next move is the same. So the copy names both possibilities
 *    and refuses to say which — true, and it leaks nothing.
 *
 * `storage` is not merged into that, because it is the one of the three that is
 * NOT the user's fault, the work is on disk and merely out of reach, and the
 * thing to do about it is different.
 */
export type Door =
  | { kind: "opening" }
  | { kind: "open" }
  | { kind: "absent" }
  | { kind: "storage"; message: string };

export type NavState = {
  door: Door;
  /** The step on screen. Meaningful once the door is open. */
  active: PhaseKey;
  /** The `?step=` the address holds, as last observed or written. */
  url: string | null;
  /** Keys we replaced the address with and have not yet seen echo back. */
  echoes: readonly PhaseKey[];
  project: Project | null;
  /** The sequence number of the record currently applied. */
  seq: number;
};

export type NavEvent =
  | { type: "opened"; project: Project; url: string | null; seq: number }
  | { type: "door"; door: Exclude<Door, { kind: "open" }> }
  | { type: "railPicked"; key: PhaseKey }
  | { type: "bracket"; by: 1 | -1 }
  | { type: "urlChanged"; url: string | null }
  | { type: "refreshed"; project: Project; seq: number }
  | { type: "lockResult"; project: Project; seq: number };

export type NavEffect = { kind: "park"; key: PhaseKey } | { kind: "replaceUrl"; key: PhaseKey } | { kind: "reread" };

export type NavStep = { state: NavState; effects: NavEffect[] };

export const isPhase = (v: string | null | undefined): v is PhaseKey =>
  v != null && (PHASES as readonly string[]).includes(v);

/**
 * THE rail-adjacency rule: the step `by` places along, or null past either end.
 * `[`/`]` take the null as "nowhere to go"; the rail's arrows clamp on it.
 */
export function neighbour(key: PhaseKey, by: number): PhaseKey | null {
  const i = PHASES.findIndex((p) => p === key);
  return i < 0 ? null : (PHASES[i + by] ?? null);
}

export const initialNav = (url: string | null): NavState => ({
  door: { kind: "opening" },
  active: "script",
  url,
  echoes: [],
  project: null,
  seq: 0,
});

const same = (state: NavState): NavStep => ({ state, effects: [] });

/** The user moved the rail: park there, make the address say so, re-read the badges. */
function move(state: NavState, key: PhaseKey): NavStep {
  const effects: NavEffect[] = [{ kind: "park", key }];
  let echoes = state.echoes;
  if (state.url !== key) {
    effects.push({ kind: "replaceUrl", key });
    echoes = [...echoes, key];
  }
  effects.push({ kind: "reread" });
  return { state: { ...state, active: key, url: key, echoes }, effects };
}

function apply(state: NavState, project: Project, seq: number): NavStep {
  if (seq <= state.seq) return same(state);
  return same({ ...state, project, seq });
}

export function step(state: NavState, event: NavEvent): NavStep {
  switch (event.type) {
    case "opened":
      // The initial open does not park: a deep link is somebody else's
      // navigation arriving in this tab, and the bookmark already points
      // wherever the project was left.
      return same({
        ...state,
        door: { kind: "open" },
        project: event.project,
        seq: Math.max(state.seq, event.seq),
        url: event.url,
        echoes: [],
        active: isPhase(event.url) ? event.url : event.project.phase,
      });

    case "door":
      return same({ ...state, door: event.door });

    case "railPicked":
      if (state.door.kind !== "open") return same(state);
      return move(state, event.key);

    case "bracket": {
      if (state.door.kind !== "open") return same(state);
      const next = neighbour(state.active, event.by);
      return next ? move(state, next) : same(state);
    }

    case "urlChanged": {
      const { url } = event;
      const at = isPhase(url) ? state.echoes.lastIndexOf(url) : -1;
      if (at >= 0) {
        // Our own replace coming back. The newest echo clears the queue.
        const echoes = at === state.echoes.length - 1 ? [] : state.echoes.slice(at + 1);
        return same({ ...state, echoes });
      }
      if (url === state.url) return same(state);
      // Before the door opens the address is only recorded; `opened` reads it.
      if (state.door.kind !== "open" || !isPhase(url)) return same({ ...state, url });
      // A hand-off from inside a step: the user moving the rail from there. It
      // moves AND parks like a rail click; the address already says it.
      return {
        state: { ...state, url, echoes: [], active: url },
        effects: [{ kind: "park", key: url }, { kind: "reread" }],
      };
    }

    case "refreshed":
    case "lockResult":
      return apply(state, event.project, event.seq);
  }
}
