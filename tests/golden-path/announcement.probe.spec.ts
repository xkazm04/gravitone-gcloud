// LANE — ANNOUNCEMENT-ACCESSIBILITY (dynamic).
//
// Registry: toasts-notifications / announcement-accessibility.
//
// WHAT WAS WRONG. NotificationBell is this app's primary feedback channel —
// every job completion, every failure and every storage problem lands there and
// nowhere else — and it had no live region anywhere in its tree. The badge
// changed, the tray filled, and a screen-reader user was told nothing. The only
// `role="status"` in the whole repo was on a research run's status word.
//
// WHAT THIS PROBE DRIVES. The announcement POLICY was extracted out of the React
// provider into `createAnnouncerQueue` precisely so it could be driven here:
// dedupe by event key, serial draining, the clear-before-write that stops a
// repeat being swallowed, assertive jumping the queue without erasing it, and
// bounded shedding of the oldest polite message under storm. All of it runs
// against a fake clock and a recording sink — no DOM, no renderer, no real time.
//
// WHAT IT CANNOT DRIVE, stated plainly rather than left for the next reader.
// This harness replaces React's own element factory with a component-testing
// shim, so nothing in this repo can be server-rendered inside a probe. Two
// properties therefore fall back to a source check, and they are exactly the two
// that fail SILENTLY while looking perfect in review: that both regions MOUNT
// EMPTY, and that the provider encloses the whole tree rather than sitting beside
// the news. The bell's own announce-on-transition effects need a DOM and are not
// covered here either; what IS covered is the copy they hand over.
import { test, expect } from "@playwright/test";
import { createAnnouncerQueue, politenessFor, type Announcement } from "@/lib/announcer";
import { troubleAnnouncement } from "@/components/ui/NotificationBell";
import type { StorageFailure } from "@/app/_phases/_shared/stepStore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const KINDS: StorageFailure[] = ["quota", "blocked", "unavailable", "missing-store", "failed"];

/** A queue over a fake clock and a recording sink, so the POLICY is driven
 *  without a DOM, a renderer or real time. Every `tick()` runs whatever the
 *  queue scheduled next. */
function harness() {
  const writes: [level: "polite" | "assertive", text: string][] = [];
  let scheduled: (() => void) | null = null;
  const q = createAnnouncerQueue(
    {
      polite: (t) => writes.push(["polite", t]),
      assertive: (t) => writes.push(["assertive", t]),
      schedule: (fn) => {
        scheduled = fn;
        return 1;
      },
      cancel: () => {
        scheduled = null;
      },
    },
    1000,
  );
  /** Non-empty writes, in order — the actual utterances. The empty write before
   *  each is the deliberate region clear, asserted separately. */
  const spoken = () => writes.filter(([, t]) => t !== "").map(([lvl, t]) => `${lvl}:${t}`);
  return {
    q,
    writes,
    spoken,
    tick() {
      const fn = scheduled;
      scheduled = null;
      fn?.();
    },
  };
}

const msg = (key: string, text: string, assertive = false): Announcement => ({ key, text, assertive });

test("queue: drains SERIALLY — one utterance per tick, not three in a frame", () => {
  // Writing three messages into one region in a single frame voices ONE of them:
  // the last mutation wins and the other two vanish with no trace. So the channel
  // keeps its own queue.
  const h = harness();
  h.q.announce(msg("a", "first"));
  h.q.announce(msg("b", "second"));
  h.q.announce(msg("c", "third"));

  expect(h.spoken()).toEqual(["polite:first"]);
  h.tick();
  expect(h.spoken()).toEqual(["polite:first", "polite:second"]);
  h.tick();
  expect(h.spoken()).toEqual(["polite:first", "polite:second", "polite:third"]);
  console.log(`[a11y] serial drain -> ${h.spoken().join(" | ")}`);
});

test("queue: each utterance CLEARS the region first", () => {
  // Writing an identical string into the same region is not a mutation, so a
  // repeat would be silently swallowed. Every drain is clear-then-write.
  const h = harness();
  h.q.announce(msg("a", "same"));
  h.q.announce(msg("b", "same"));
  h.tick();
  expect(h.writes).toEqual([
    ["polite", ""],
    ["polite", "same"],
    ["polite", ""],
    ["polite", "same"],
  ]);
});

test("queue: the same EVENT is never announced twice (transitions, not renders)", () => {
  // The bell re-renders freely — on every job tick, on open, on close. None of
  // that is news, and hearing it again is expensive in a way a repainted pixel
  // is not. Identity is the key, so a re-render says nothing.
  const h = harness();
  h.q.announce(msg("event:1", "Research finished"));
  h.q.announce(msg("event:1", "Research finished"));
  h.q.announce(msg("event:1", "Research finished — rephrased, same event"));
  h.tick();
  h.tick();
  console.log(`[a11y] dedupe -> ${h.spoken().length} utterance(s) from 3 announces`);
  expect(h.spoken()).toEqual(["polite:Research finished"]);
});

test("queue: assertive JUMPS the queue and does not erase it", () => {
  const h = harness();
  h.q.announce(msg("a", "routine one"));
  h.q.announce(msg("b", "routine two"));
  // "routine one" is already draining; the interrupt goes in front of what is
  // still waiting, and the polite backlog resumes behind it.
  h.q.announce(msg("bad", "Not saved", true));
  h.tick();
  h.tick();
  console.log(`[a11y] jump -> ${h.spoken().join(" | ")}`);
  expect(h.spoken()).toEqual(["polite:routine one", "assertive:Not saved", "polite:routine two"]);
});

test("queue: under storm it sheds the OLDEST POLITE message, never an assertive one", () => {
  // An assistive user gets the same triage a sighted user gets from a visual
  // queue — not a backlog replayed minutes later.
  const h = harness();
  h.q.announce(msg("blocking", "Not saved", true)); // starts draining immediately
  for (let i = 0; i < 20; i++) h.q.announce(msg(`p${i}`, `polite ${i}`));

  const pending = h.q.peek().pending;
  console.log(`[a11y] storm -> pending=${pending.length} first=${pending[0]?.text}`);
  expect(pending.length).toBeLessThanOrEqual(8);
  // The oldest polite ones went; the newest survive.
  expect(pending.at(-1)?.text).toBe("polite 19");
  expect(pending.some((p) => p.text === "polite 0")).toBe(false);

  // And an assertive message queued behind a storm is never the one shed.
  const h2 = harness();
  h2.q.announce(msg("first", "occupying the drain"));
  h2.q.announce(msg("blocking", "Not saved", true));
  for (let i = 0; i < 20; i++) h2.q.announce(msg(`p${i}`, `polite ${i}`));
  expect(h2.q.peek().pending.some((p) => p.assertive)).toBe(true);
});

test("queue: an empty message is not an utterance", () => {
  const h = harness();
  h.q.announce(msg("empty", ""));
  expect(h.spoken()).toEqual([]);
  expect(h.q.peek().spoken).toBe(0);
});

test("queue: stop() ends the drain — no write after the channel is gone", () => {
  // The React wrapper calls this on unmount, so a drain scheduled a moment
  // earlier cannot write into a dead component.
  const h = harness();
  h.q.announce(msg("a", "one"));
  h.q.announce(msg("b", "two"));
  h.q.stop();
  h.tick();
  expect(h.spoken()).toEqual(["polite:one"]);
  h.q.announce(msg("c", "three"));
  expect(h.spoken()).toEqual(["polite:one"]);
});

test("regions: they mount EMPTY, and live in the app SHELL", () => {
  // TWO STRUCTURAL CHECKS, and the reason they are structural is worth stating
  // rather than leaving for the next reader. This harness replaces React's own
  // element factory with a component-testing shim, so NOTHING in this repo can be
  // server-rendered inside a probe — the descriptors are not React elements. The
  // two properties below are the ones that fail SILENTLY and look perfect in
  // review, so they are checked against the source rather than not at all.
  const announcer = readFileSync(resolve(__dirname, "../../lib/announcer.tsx"), "utf8");

  // (1) MOUNT EMPTY. Assistive technology announces mutations INSIDE a region it
  // is already observing; a region rendered with its text already in it announces
  // nowhere. Both regions render state that starts as the empty string.
  expect(announcer).toContain('const [polite, setPolite] = useState("")');
  expect(announcer).toContain('const [assertive, setAssertive] = useState("")');
  expect(announcer).toContain('aria-live="polite"');
  expect(announcer).toContain('aria-live="assertive"');
  // Voiced whole, not diffed against the previous utterance.
  expect(announcer.match(/aria-atomic="true"/g)?.length).toBe(2);

  // (2) IN THE SHELL. A live region mounted alongside the notification it
  // describes is the same silent failure with a component boundary drawn around
  // it, so the provider must enclose the whole tree — {children} included.
  const src = readFileSync(resolve(__dirname, "../../app/layout.tsx"), "utf8");
  const open = src.indexOf("<AnnouncerProvider>");
  const close = src.indexOf("</AnnouncerProvider>");
  const children = src.indexOf("{children}");
  console.log(`[a11y] layout: AnnouncerProvider at ${open}, {children} at ${children}, close at ${close}`);
  expect(open).toBeGreaterThan(-1);
  // The whole tree — including {children}, i.e. every route — is inside it.
  expect(children).toBeGreaterThan(open);
  expect(children).toBeLessThan(close);
});

test("politeness: derives from severity, and only blocking news interrupts", () => {
  // Assertive interrupts mid-word. A stream of interruptions teaches a user to
  // pay LESS attention, so the assertive grade is reserved for the one case that
  // blocks what the user is doing right now: their work is not being saved.
  expect(politenessFor("ok")).toBe(false);
  expect(politenessFor("failure")).toBe(false);
  expect(politenessFor("blocking")).toBe(true);
});

test("copy: every storage failure has a self-contained spoken form", () => {
  for (const kind of KINDS) {
    const text = troubleAnnouncement(kind, "script");
    console.log(`[a11y] ${kind} -> ${text}`);
    // It arrives with no card, no heading and no phase line beside it, so it
    // carries its own subject...
    expect(text.startsWith("Not saved:")).toBe(true);
    // ...names WHERE it happened...
    expect(text).toContain("script");
    // ...and points at the tray, which is the operable backstop holding whatever
    // could not be caught in flight.
    expect(text).toContain("notifications");
    // Short enough to be read into the middle of someone's work. A paragraph
    // announced aloud is worse than silence.
    expect(text.length).toBeLessThan(180);
  }
  // Five kinds, five distinct sentences — a taxonomy that collapses in the
  // spoken channel is a taxonomy the assistive user does not have.
  expect(new Set(KINDS.map((k) => troubleAnnouncement(k, "script"))).size).toBe(5);
});

/* ── The error boundaries: a screen that failed to render must SAY so ───────── */

/** Source with comments removed.
 *
 *  Load-bearing, and the reason this helper exists rather than a bare `include`:
 *  every file in this repo explains its rule in prose directly above the code
 *  that implements it, so a matcher run over raw text is satisfied by a file
 *  that TALKS about announcing and does not announce. Both assertions below were
 *  watched failing against the pre-fix files with this stripping in place. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^\n]*?\/\/.*$/gm, "");

test("boundaries: the route boundary announces, and takes the focus its dead subtree dropped", () => {
  // Two silences, both invisible in review. React unmounts the subtree that
  // threw, so focus falls to <body>; and the replacement card is ordinary text,
  // so a reader mid-sentence elsewhere never learns the screen is gone.
  const src = stripComments(
    readFileSync(resolve(__dirname, "../../app/error.tsx"), "utf8"),
  );
  expect(src, "the route boundary does not reach the announcement channel").toMatch(
    /useAnnounce\s*\(\s*\)/,
  );
  // Assertive: a screen that no longer exists blocks what the user is doing RIGHT
  // NOW, which is the one case politenessFor() reserves interruption for.
  expect(src, "the boundary announces politely — this is the blocking case").toMatch(
    /assertive:\s*true/,
  );
  // Keyed on the ERROR, never on the render: the same failure re-rendering must
  // not speak twice, and a different failure must not be swallowed by the first
  // one's key.
  expect(src).toMatch(/key:\s*`boundary:\$\{error\.digest\s*\?\?\s*error\.message\}`/);
  expect(src, "focus is not handed to the card that replaced the dead tree").toMatch(
    /tabIndex=\{-1\}/,
  );
});

test("boundaries: the ROOT boundary carries its own alert — the provider is not above it", () => {
  // global-error.tsx REPLACES the root layout, so AnnouncerProvider is not in the
  // document and there is no live region to write into. `useAnnounce()` would
  // return its silent no-op fallback and look correct in review. The
  // dependency-free equivalent is an alert role, announced on insertion — which
  // is exactly what mounting this boundary does.
  const src = stripComments(
    readFileSync(resolve(__dirname, "../../app/global-error.tsx"), "utf8"),
  );
  expect(src, "the root boundary is silent to assistive technology").toMatch(/role="alert"/);
  expect(src, "focus stays on <body> in a document whose content was replaced").toMatch(
    /tabIndex=\{-1\}/,
  );
  expect(
    src.includes("useAnnounce"),
    "the root boundary reaches for a provider that cannot be above it",
  ).toBe(false);
});
