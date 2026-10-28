"use client";

// BY EAR - the composer's second door (@gt/ui duel.ts, DuelCard): for the person who starts with
// nothing but "I'll know it when I hear it". Pairs that differ on one axis, played by the same
// local engine as every audition (/audio/sketch), only the pairs this machine can play both sides
// of; the answers become the same seed the sentence door writes, each word with its reason.
import { useEffect, useState, type ReactNode } from "react";

import { sketchHref } from "@gt/ui/components/audio/atlas.ts";
import { DuelCard } from "@gt/ui/components/audio/DuelCard.tsx";
import { compileDuel, DUEL_MODE, nextAxis, playableAxes, type Answer, type DuelSound } from "@gt/ui/components/audio/duel.ts";
import type { Seed } from "@gt/ui/components/audio/recipe.ts";
import type { Ear } from "@gt/ui/components/audio/useEar.ts";
import { useKeys } from "@gt/ui/keymap/dispatch";

import { warm } from "./steer.tsx";

const hrefOf = (x: DuelSound): string => sketchHref(x.ids, x.levels, x.bpm, x.key);

export function useDuel(ear: Ear, can: ReadonlySet<string>, open: boolean, onUse: (seed: Seed) => void): ReactNode {
  const [answers, setAnswers] = useState<Readonly<Record<string, Answer>>>({});
  const axes = playableAxes(can);
  const at = nextAxis(axes, answers);
  // The pair on screen and the one after it are rendered ahead, so a press is a file read.
  const ahead = open ? axes.slice(at === null ? axes.length : axes.indexOf(at), (at === null ? axes.length : axes.indexOf(at)) + 2).flatMap((x) => [hrefOf(x.a.sound), hrefOf(x.b.sound)]) : [];
  const key = ahead.join(" ");
  useEffect(() => {
    if (key !== "") warm(key.split(" "));
  }, [key]);
  const answer = (a: Answer): false | undefined => {
    if (at === null) return false;
    ear.stop();
    setAnswers((m) => ({ ...m, [at.id]: a }));
    return undefined;
  };
  const play = (side: "a" | "b"): false | undefined => {
    if (at === null) return false;
    ear.toggle(hrefOf(at[side].sound));
    return undefined;
  };
  useKeys(DUEL_MODE, { "play-a": () => play("a"), "play-b": () => play("b"), "pick-a": () => answer("a"), "pick-b": () => answer("b"), same: () => answer("skip") }, { enabled: open && at !== null });
  if (!open || axes.length === 0) return null;
  return (
    <DuelCard
      axes={axes}
      answers={answers}
      hrefOf={hrefOf}
      stateOf={ear.stateOf}
      onPlay={ear.toggle}
      onAnswer={(axis, a) => {
        ear.stop();
        setAnswers((m) => ({ ...m, [axis]: a }));
      }}
      onUse={() => onUse(compileDuel(axes, answers).seed)}
      onAgain={() => setAnswers({})}
    />
  );
}
