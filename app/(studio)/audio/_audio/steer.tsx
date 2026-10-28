"use client";

// STEER BY EAR - the state the composer's three new doors share, so they read as one surface:
//   say it   a sentence compiled into the seed (@gt/ui lexicon.ts), its words lit from the terms
//            they produced and back;
//   hear it  every instrument chip this machine can audition plays the SAME four bars at the
//            seed's tempo and key (/audio/audition), through ONE ear - a second press stops the
//            first, so a comparison is always two sounds in turn;
//   swap it  a chip's candidates heard in a strip (same register first, then the neighbours a
//            person confuses it with), alone or in the mix, the pick rewriting the seed's word and
//            leaving its move (`-rhodes +grand piano`) on the strip; a word with no samples here
//            is offered the playable sounds near it instead;
//   learn it every pick by ear joins a "learned" row under the sentence, a press saying it.
// The seed itself stays the lane's (./AudioLane.tsx): this hook only ever writes it through the
// setter it is handed, so the composer, the variations and the receipt all read one seed.
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ATLAS, atlasFor, AUDITION_KEY, auditionHref, nearFor, playableBpm, playableIds, sketchHref, swapsFor, type AtlasEntry } from "@gt/ui/components/audio/atlas.ts";
import { EarStrip } from "@gt/ui/components/audio/EarStrip.tsx";
import { provenanceOf, translate, type Produced, type PullSide, type TermList, type Translation } from "@gt/ui/components/audio/lexicon.ts";
import { addTo, type Seed } from "@gt/ui/components/audio/recipe.ts";
import type { SayItProps } from "@gt/ui/components/audio/SayIt.tsx";
import type { SeedEar } from "@gt/ui/components/audio/SeedComposer.tsx";
import type { Ear } from "@gt/ui/components/audio/useEar.ts";

type Open = { readonly kind: "swap"; readonly term: string } | { readonly kind: "add" } | null;
type Move = { readonly minus: string; readonly plus: string };

const NONE: ReadonlySet<number> = new Set();

/** Sentences offered on an empty field: one each of a scene, a use with a length, a story, a feeling. */
const EXAMPLES: readonly string[] = ["like a rainy café at night", "a 60 second trailer, epic but hopeful", "a sneaky cat stealing food", "lofi beats to study to", "a lullaby for a rave"];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** A failed audition's own sentence, read off the route's error envelope through a narrow check
 *  (./returnClient.ts's way: a client module never loads zod) - useEar's `explain`. */
export async function explainAudition(href: string): Promise<string | null> {
  try {
    const r = await fetch(href);
    if (r.ok) return null;
    const body: unknown = await r.json();
    return isObject(body) && typeof body["error"] === "string" ? body["error"] : null;
  } catch {
    return null; // the element's own code is already on screen; nothing better was said
  }
}

// WARMING. A first audition is rendered on request (seconds); a second is a file read. So what the
// person is about to compare - the seed's instruments, and a strip's candidates the moment it
// opens - is requested ahead, three renders at a time, each href once per page life. A press
// on one still warming joins its render (the server dedupes in-flight renders by file).
const warmed = new Set<string>();
const queue: string[] = [];
let running = 0;
const WARM_AT_ONCE = 3;

function pump(): void {
  while (running < WARM_AT_ONCE && queue.length > 0) {
    const href = queue.shift();
    if (href === undefined) break;
    running++;
    void fetch(href)
      .then((r) => r.arrayBuffer())
      .catch(() => undefined) // a warm that fails is retried by the press itself, in words
      .finally(() => {
        running--;
        pump();
      });
  }
}

export function warm(hrefs: readonly string[]): void {
  for (const h of hrefs) {
    if (warmed.has(h)) continue;
    warmed.add(h);
    queue.push(h);
  }
  pump();
}

export type Steer = {
  readonly say: SayItProps;
  readonly ear: SeedEar;
  readonly isLit: (list: TermList, term: string) => boolean;
  readonly onTrace: (list: TermList, term: string | null) => void;
  readonly strip: ReactNode;
  readonly failed: string | null;
  /** Instruments chosen by another door (the duel) join the learned row too. */
  readonly learnTerms: (terms: readonly string[]) => void;
};

/** `onSaid` names where the seed came from when a sentence is composed into it. */
export function useSteer(seed: Seed, setSeed: (next: Seed) => void, ear: Ear, can: ReadonlySet<string>, onSaid: (sentence: string) => void, onHeard: (t: Translation) => readonly number[] | null): Steer {
  const [sentence, setSentence] = useState("");
  const heard = useMemo(() => translate(sentence), [sentence]);
  const [said, setSaid] = useState<Translation | null>(null);
  const [lit, setLit] = useState<ReadonlySet<number>>(NONE);
  const [open, setOpen] = useState<Open>(null);
  const [blind, setBlind] = useState(false);
  // In the mix: a candidate plays with the rest of the seed (one full four bars of the sketch)
  // instead of alone - the swap heard where it will live.
  const [inMix, setInMix] = useState(false);
  // What was chosen by ear this visit: the words a person can now say for what they heard.
  const [learned, setLearned] = useState<readonly AtlasEntry[]>([]);
  const learn = (e: AtlasEntry): void => setLearned((l) => (l.some((x) => x.id === e.id) ? l : [...l, e]));
  const [move, setMove] = useState<Move | null>(null);

  const href = (e: AtlasEntry): string => auditionHref(e.id, seed.bpm, seed.key);
  const entryOf = (term: string): AtlasEntry | undefined => {
    const e = atlasFor(term);
    return e !== undefined && can.has(e.id) ? e : undefined;
  };
  // Provenance is drawn only while the sentence on screen is the one the seed was composed from.
  const live = said !== null && said.sentence === sentence ? said : null;

  // A compose answers with its sound - what the screen's own play mark would play: the shape when
  // the piece has one, else four bars of the instruments together (the press is the gesture a
  // browser asks before it plays). Nothing playable, nothing plays.
  const composeFrom = (t: Translation): void => {
    setOpen(null);
    setMove(null);
    setSaid(t);
    setSeed(t.seed);
    const levels = onHeard(t);
    onSaid(t.sentence.trim());
    const ids = playableIds(t.seed.instruments, can);
    if (ids.length > 0) ear.play(sketchHref(ids, levels ?? [3], t.seed.bpm, t.seed.key));
    else ear.stop();
  };
  const compose = (): void => composeFrom(heard);
  // A pull's side as sound: the sentence's own instruments, four bars together, at that side's
  // tempo or key - the two readings heard against each other before one is said.
  const pullIds = playableIds(heard.seed.instruments, can);
  const pullHref = (x: PullSide): string | null => (pullIds.length === 0 ? null : sketchHref(pullIds, [3], x.bpm ?? heard.seed.bpm, x.key ?? heard.seed.key));

  const say: SayItProps = {
    value: sentence,
    // The sentence's own traces (its words, tempo, key, pulls) read the sentence on screen, so they
    // light before a compose; a term chip's trace reads the composed one (isLit below).
    onChange: (v: string) => {
      setSentence(v);
      setLit(NONE);
    },
    heard,
    lit,
    onTrace: (t) => setLit(t === null ? NONE : new Set(t)),
    onCompose: compose,
    onSpare: (p: Produced) => setSeed(addTo(seed, p.list, p.term)),
    examples: EXAMPLES,
    learned: learned.map((e) => ({ term: e.term, plain: e.plain.join(" · ") })),
    // Said already means the compiler hears it as an instrument - not a substring ("no rhodes", "choirs").
    onLearned: (term: string) => setSentence((cur) => (translate(cur).seed.instruments.includes(term) ? cur : cur.trim() === "" ? term : `${cur.trim().replace(/[,.]$/, "")}, ${term}`)),
    onExample: (x: string) => {
      setSentence(x);
      composeFrom(translate(x));
    },
    hearPull: {
      stateOf: (x) => {
        const h = pullHref(x);
        return h === null ? null : ear.stateOf(h);
      },
      onPlay: (x) => {
        const h = pullHref(x);
        if (h !== null) ear.toggle(h);
      },
    },
  };

  const swapTo = (old: string, e: AtlasEntry): void => {
    learn(e);
    setSeed({ ...seed, instruments: seed.instruments.map((x) => (x === old ? e.term : x)) });
    setMove({ minus: old, plus: e.term });
    setOpen({ kind: "swap", term: e.term });
  };

  const seedEar: SeedEar = {
    playable: (t) => entryOf(t) !== undefined,
    near: (t) => entryOf(t) === undefined && nearFor(t, can, seed.instruments).length > 0,
    stateOf: (t) => {
      const e = entryOf(t);
      return e === undefined ? "idle" : ear.stateOf(href(e));
    },
    onPlay: (t) => {
      const e = entryOf(t);
      if (e !== undefined) ear.toggle(href(e));
    },
    onSwap: (t) => {
      setMove(null);
      setOpen(open?.kind === "swap" && open.term === t ? null : { kind: "swap", term: t });
    },
    onAdd: () => setOpen(open?.kind === "add" ? null : { kind: "add" }),
  };

  // What to warm: the seed's playable instruments, then the open strip's candidates. Keyed by
  // their hrefs, which carry tempo and key, so a tempo typed digit by digit warms once it settles.
  const playable = seed.instruments.map(entryOf).filter((e): e is AtlasEntry => e !== undefined);
  const swapping = open?.kind === "swap" ? entryOf(open.term) : undefined;
  const holding = new Set(seed.instruments.map((t) => atlasFor(t)?.id));
  // Exactly what the open strip shows: its swaps, or what the seed does not hold yet.
  const nearing = open?.kind === "swap" && swapping === undefined ? open.term : null;
  const stripFor: readonly AtlasEntry[] =
    swapping !== undefined ? swapsFor(swapping, can, seed.instruments) : nearing !== null ? nearFor(nearing, can, seed.instruments) : open?.kind === "add" ? ATLAS.filter((e) => can.has(e.id) && !holding.has(e.id)) : [];
  // A strip row's sound: alone, or in the mix - the seed's playable instruments with this one in
  // the swapped one's place (or added), all voices at the fullest level.
  const rowHref = (e: AtlasEntry): string => {
    if (!inMix) return href(e);
    const rest = swapping !== undefined ? seed.instruments.filter((t) => atlasFor(t)?.id !== swapping.id) : seed.instruments.filter((t) => t !== nearing);
    return sketchHref(playableIds(rest, can, e.id), [3], seed.bpm, seed.key);
  };
  const pulled = heard.pulls.flatMap((p) => [pullHref(p.a), pullHref(p.b)]).filter((h): h is string => h !== null);
  const toWarm = [...playable.map(href), ...stripFor.map(rowHref), ...pulled].join(" ");
  useEffect(() => {
    if (toWarm === "") return;
    const t = setTimeout(() => warm(toWarm.split(" ")), 700);
    return () => clearTimeout(t);
  }, [toWarm]);

  let strip: ReactNode = null;
  const held = ["4 bars", seed.key ?? AUDITION_KEY, `${playableBpm(seed.bpm)} bpm`, "−20 LUFS"];
  const common = { stateOf: (e: AtlasEntry) => ear.stateOf(rowHref(e)), onPlay: (e: AtlasEntry) => ear.toggle(rowHref(e)), onClose: () => setOpen(null), blind, onBlind: setBlind, held, inMix, onInMix: setInMix };
  if (open?.kind === "swap") {
    const now = entryOf(open.term);
    if (now !== undefined) {
      const title = move === null ? `swap ${now.term}` : `-${move.minus} +${move.plus}`;
      strip = <EarStrip title={title} now={now} candidates={swapsFor(now, can, seed.instruments)} onPick={(e) => swapTo(open.term, e)} {...common} />;
    } else if (stripFor.length > 0) {
      // A word with no samples here: the nearest sounds that can play, the word itself not drawn as if it could.
      strip = <EarStrip title={`near ${open.term}`} candidates={stripFor} onPick={(e) => swapTo(open.term, e)} {...common} />;
    }
  } else if (open?.kind === "add") {
    strip = (
      <EarStrip
        title="add by ear"
        candidates={stripFor}
        onPick={(e) => {
          learn(e);
          setSeed(addTo(seed, "instruments", e.term));
          setOpen(null);
        }}
        {...common}
      />
    );
  }

  return {
    say,
    ear: seedEar,
    isLit: (list, term) => {
      if (live === null || lit.size === 0) return false;
      return provenanceOf(live, list, term).some((i) => lit.has(i));
    },
    onTrace: (list, term) => setLit(term === null || live === null ? NONE : new Set(provenanceOf(live, list, term))),
    strip,
    failed: ear.failed,
    learnTerms: (terms) => {
      for (const t of terms) {
        const e = entryOf(t);
        if (e !== undefined) learn(e);
      }
    },
  };
}
