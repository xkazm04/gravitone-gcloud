"use client";

// STEER BY EAR - the state the composer's three new doors share, so they read as one surface:
//   say it   a sentence compiled into the seed (@gt/ui lexicon.ts), its words lit from the terms
//            they produced and back;
//   hear it  every instrument chip this machine can audition plays the SAME four bars at the
//            seed's tempo and key (/audio/audition), through ONE ear - a second press stops the
//            first, so a comparison is always two sounds in turn;
//   swap it  a chip's candidates heard in a strip (same register first, then the neighbours a
//            person confuses it with), the pick rewriting the seed's word and leaving its move
//            (`-rhodes +grand piano`) on the strip.
// The seed itself stays the lane's (./AudioLane.tsx): this hook only ever writes it through the
// setter it is handed, so the composer, the variations and the receipt all read one seed.
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ATLAS, atlasFor, auditionHref, swapsFor, type AtlasEntry } from "@gt/ui/components/audio/atlas.ts";
import { EarStrip } from "@gt/ui/components/audio/EarStrip.tsx";
import { provenanceOf, translate, type Produced, type TermList, type Translation } from "@gt/ui/components/audio/lexicon.ts";
import { addTo, type Seed } from "@gt/ui/components/audio/recipe.ts";
import type { SayItProps } from "@gt/ui/components/audio/SayIt.tsx";
import type { SeedEar } from "@gt/ui/components/audio/SeedComposer.tsx";
import type { Ear } from "@gt/ui/components/audio/useEar.ts";

type Open = { readonly kind: "swap"; readonly term: string } | { readonly kind: "add" } | null;
type Move = { readonly minus: string; readonly plus: string };

const NONE: ReadonlySet<number> = new Set();

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

function warm(hrefs: readonly string[]): void {
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
};

/** `onSaid` names where the seed came from when a sentence is composed into it. */
export function useSteer(seed: Seed, setSeed: (next: Seed) => void, ear: Ear, can: ReadonlySet<string>, onSaid: (sentence: string) => void, onHeard: (t: Translation) => void): Steer {
  const [sentence, setSentence] = useState("");
  const heard = useMemo(() => translate(sentence), [sentence]);
  const [said, setSaid] = useState<Translation | null>(null);
  const [lit, setLit] = useState<ReadonlySet<number>>(NONE);
  const [open, setOpen] = useState<Open>(null);
  const [blind, setBlind] = useState(false);
  const [move, setMove] = useState<Move | null>(null);

  const href = (e: AtlasEntry): string => auditionHref(e.id, seed.bpm, seed.key);
  const entryOf = (term: string): AtlasEntry | undefined => {
    const e = atlasFor(term);
    return e !== undefined && can.has(e.id) ? e : undefined;
  };
  // Provenance is drawn only while the sentence on screen is the one the seed was composed from.
  const live = said !== null && said.sentence === sentence ? said : null;

  const compose = (): void => {
    ear.stop();
    setOpen(null);
    setMove(null);
    setSaid(heard);
    setSeed(heard.seed);
    onHeard(heard);
    onSaid(sentence.trim());
  };

  const say: SayItProps = {
    value: sentence,
    onChange: setSentence,
    heard,
    lit: live === null ? NONE : lit,
    onTrace: (t) => setLit(t === null ? NONE : new Set(t)),
    onCompose: compose,
    onSpare: (p: Produced) => setSeed(addTo(seed, p.list, p.term)),
  };

  const swapTo = (old: string, e: AtlasEntry): void => {
    setSeed({ ...seed, instruments: seed.instruments.map((x) => (x === old ? e.term : x)) });
    setMove({ minus: old, plus: e.term });
    setOpen({ kind: "swap", term: e.term });
  };

  const seedEar: SeedEar = {
    playable: (t) => entryOf(t) !== undefined,
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
  const stripFor: readonly AtlasEntry[] =
    open?.kind === "swap" ? swapsFor(entryOf(open.term) ?? playable[0] ?? (ATLAS[0] as AtlasEntry), can, seed.instruments) : open?.kind === "add" ? ATLAS.filter((e) => can.has(e.id)) : [];
  const toWarm = [...playable, ...stripFor].map(href).join(" ");
  useEffect(() => {
    if (toWarm === "") return;
    const t = setTimeout(() => warm(toWarm.split(" ")), 700);
    return () => clearTimeout(t);
  }, [toWarm]);

  let strip: ReactNode = null;
  const common = { stateOf: (e: AtlasEntry) => ear.stateOf(href(e)), onPlay: (e: AtlasEntry) => ear.toggle(href(e)), onClose: () => setOpen(null), blind, onBlind: setBlind };
  if (open?.kind === "swap") {
    const now = entryOf(open.term);
    if (now !== undefined) {
      const title = move === null ? `swap ${now.term}` : `-${move.minus} +${move.plus}`;
      strip = <EarStrip title={title} now={now} candidates={swapsFor(now, can, seed.instruments)} onPick={(e) => swapTo(open.term, e)} {...common} />;
    }
  } else if (open?.kind === "add") {
    const held = new Set(seed.instruments.map((t) => atlasFor(t)?.id));
    const candidates = ATLAS.filter((e) => can.has(e.id) && !held.has(e.id));
    strip = (
      <EarStrip
        title="add by ear"
        candidates={candidates}
        onPick={(e) => {
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
  };
}
