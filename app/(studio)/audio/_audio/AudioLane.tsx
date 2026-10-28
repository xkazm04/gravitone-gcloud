"use client";

// THE AUDIO LANE'S COMPOSER SURFACE (owner ruling 2026-10-17: v1's Library Audio tab, "the Recipe
// Book", is REBUILT, not dropped). Three columns, as v1's workbench had them: the terms on the
// left, the composer with its variations in the middle, and on the right the take the seed came
// from (the same three components the Library detail draws for an audio item), the drafts sent
// out, and the references.
//
// What it is FOR changed with the lane. v1's composer ended in text pasted into suno.com by hand
// and a returned file dropped back; here a seed is SENT - Suno's form fields through a receipt
// (../../projects/_plan/receipt.tsx, the one flow every launch uses), confirmed into a box.chrome
// job - and its returns are the queue's clips, judged on the Board's audio triage. v1's keep /
// reject, rubric and reject box are not here: the Board owns that decision (the ruling's third
// clause), so this surface never writes a verdict.
//
// The page reads on the server (./read.ts); this island owns the seed (what a person is
// composing between renders), the hand they set optimistically, and the receipt sheet.
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { errorMessage } from "@gt/domain/errors";
import { AudioMeasures } from "@gt/ui/components/audio/AudioMeasures.tsx";
import { AudioPreview } from "@gt/ui/components/audio/AudioPreview.tsx";
import { AudioPrompt } from "@gt/ui/components/audio/AudioPrompt.tsx";
import { DraftList } from "@gt/ui/components/audio/DraftList.tsx";
import { EngineList, type EngineRow } from "@gt/ui/components/audio/EngineList.tsx";
import { ReferenceList } from "@gt/ui/components/audio/ReferenceList.tsx";
import { BLANK_SEED, FACET_OF, addTo, handsOf, sunoFieldsOf, type Hand, type Seed, type SeedList, type Term } from "@gt/ui/components/audio/recipe.ts";
import { playableAxes } from "@gt/ui/components/audio/duel.ts";
import { SayIt } from "@gt/ui/components/audio/SayIt.tsx";
import { useEar } from "@gt/ui/components/audio/useEar.ts";
import { SeedComposer } from "@gt/ui/components/audio/SeedComposer.tsx";
import { TermRail } from "@gt/ui/components/audio/TermRail.tsx";
import { VariationList } from "@gt/ui/components/audio/VariationList.tsx";
import { conceptFor, variationsOfSeed } from "@gt/ui/components/audio/variations.ts";
import { atlasFor, playableIds, sketchHref } from "@gt/ui/components/audio/atlas.ts";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Select } from "@gt/ui/components/field/Field.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";

import { outcomeOf, useReceipt } from "../../projects/_plan/receipt.tsx";
import { useShell } from "../../_shell/Providers.tsx";
import { copyText } from "../../_shell/clipboard.ts";
import type { AudioView, SeedTake } from "./read.ts";
import type { setHand, sunoConfirm, sunoReceipt } from "./actions.ts";
import { useDuel } from "./duelState.tsx";
import { useShape } from "./shapeState.tsx";
import { useTrack } from "./trackState.tsx";
import { explainAudition, useSteer } from "./steer.tsx";
import s from "./audio.module.css";

/** The page's Server Actions, handed over as props: a reference per action crosses to the client,
 *  never the module (the Board's and the Floor's wire shape, ../../projects/_port/wire.ts). */
export type AudioActs = { readonly setHand: typeof setHand; readonly sunoReceipt: typeof sunoReceipt; readonly sunoConfirm: typeof sunoConfirm };

const DOORS = [
  { value: "words", label: "say it" },
  { value: "ear", label: "by ear" },
  { value: "track", label: "from a track" },
] as const;
const LIST_OF: Readonly<Record<string, SeedList>> = { genre: "genres", mood: "moods", instrument: "instruments" };
const BLANK = "__blank";

/** `engines`: the desk's registry rows (lib/sound/engines.ts); `canSend`: the registry says Suno composes here;
 *  `audible`: the atlas instruments this machine's sample libraries can audition (lib/audio/atlas.ts). */
export function AudioLane({ view, nowMs, acts, engines, canSend, audible }: { readonly view: AudioView; readonly nowMs: number; readonly acts: AudioActs; readonly engines: readonly EngineRow[]; readonly canSend: boolean; readonly audible: readonly string[] }) {
  const { setHand, sunoReceipt, sunoConfirm } = acts;
  const router = useRouter();
  const { toast } = useShell();
  const flow = useReceipt(nowMs);
  const takes: readonly SeedTake[] = view.takes.ok ? view.takes.value : [];
  const [seed, setSeed] = useState<Seed>(() => takes[0]?.seed ?? BLANK_SEED);
  const [from, setFrom] = useState<string>(() => takes[0]?.id ?? BLANK);
  // The hand a person just set, laid over the server's terms until the refresh brings it back;
  // a hand the store refused (or whose request never came back) is taken off again, so the rail
  // never draws a stance the store does not hold.
  const [mine, setMine] = useState<Readonly<Record<string, Hand>>>({});
  const terms: readonly Term[] = useMemo(() => {
    const base = view.terms.ok ? view.terms.value : [];
    return base.map((t) => {
      const h = mine[t.id];
      return h === undefined ? t : { ...t, stance: h.stance ?? null, phrase: h.phrase ?? "" };
    });
  }, [view.terms, mine]);
  const hands = useMemo(() => handsOf(terms), [terms]);
  const variations = useMemo(() => variationsOfSeed(seed, terms), [seed, terms]);
  const take = takes.find((t) => t.id === from);
  // What the seed was last loaded from: a take's title, a variation's axis, a reference.
  const [loaded, setLoaded] = useState<string | null>(null);
  const fromLabel = loaded ?? take?.title ?? "blank";
  // One ear for the whole composer: a chip, a strip row and the sketch never sound at once.
  const ear = useEar(explainAudition);
  const can = useMemo(() => new Set(audible), [audible]);
  const shape = useShape(seed, ear, can);
  const steer = useSteer(
    seed,
    setSeed,
    ear,
    can,
    (said) => {
      setFrom(BLANK);
      setLoaded(said === "" ? "blank" : `“${said}”`);
    },
    shape.adopt,
  );
  // Two doors into the one seed: a sentence, or pairs heard by ear.
  const [door, setDoor] = useState<"words" | "ear" | "track">("words");
  // The ear door opens only where this machine can play both sides of at least one pair.
  const canDuel = playableAxes(can).length > 0;
  // Every door answers with its sound, as Compose does: the new seed's sketch over the shape it has.
  const sound = (next: Seed, levels: readonly number[] | null): void => {
    const ids = playableIds(next.instruments, can);
    if (ids.length > 0) ear.play(sketchHref(ids, levels ?? [3], next.bpm, next.key));
  };
  const duel = useDuel(ear, can, door === "ear", (next) => {
    setSeed(next);
    setFrom(BLANK);
    setLoaded("by ear");
    steer.learnTerms(next.instruments);
    const href = shape.sketchOf(next);
    if (href !== null) ear.play(href);
  });
  // A track keeps the seed's words and gives it the track's tempo, key and shape.
  const track = useTrack((read) => {
    const next = { ...seed, bpm: read.bpm ?? seed.bpm, key: read.key ?? seed.key };
    setSeed(next);
    shape.adoptLevels(read.levels);
    setLoaded(`track · ${read.name}`);
    sound(next, read.levels.length > 0 ? read.levels.slice(0, 32) : null);
  });

  const send = (s0: Seed, label: string): void => {
    const base = sunoFieldsOf(s0, hands, label === "blank" ? undefined : label);
    if (base === null || flow.reading) return;
    // The shape's section tags ride in Suno's lyrics field; with no shape it stays "[Instrumental]".
    const fields = shape.lyrics === undefined ? base : { ...base, lyrics: shape.lyrics };
    void flow.open({
      trail: [{ label: "Audio", href: "/audio" }],
      here: "send to suno",
      read: (mode) => sunoReceipt({ fields, mode }),
      armable: true,
      confirm: async (token, ceilingUsd, mode) =>
        outcomeOf(await sunoConfirm({ fields, token, mode, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) }), (v) =>
          v.kind === "stale" ? { kind: "stale", fresh: v.fresh } : { kind: "done", note: `suno · launched · ${v.runId}`, ledger: { href: `/ledger?q=${encodeURIComponent(v.jobId)}`, subject: v.runId } },
        ),
      done: (note, ledger) => {
        toast(note, ledger);
        router.refresh();
      },
      failed: (message) => toast(message),
    });
  };

  const onHand = (id: string, h: Hand): void => {
    setMine((m) => ({ ...m, [id]: h }));
    const undo = (words: string): void => {
      setMine((m) => {
        if (m[id] !== h) return m;
        const { [id]: _refused, ...rest } = m;
        return rest;
      });
      toast(words);
    };
    void setHand({ id, stance: h.stance ?? null, phrase: h.phrase ?? "" }).then(
      (r) => {
        if (!r.ok) undo(r.error.error);
        else router.refresh();
      },
      (e: unknown) => undo(errorMessage(e)),
    );
  };

  const onPick = (t: Term): void => {
    const list = LIST_OF[t.facet];
    if (list !== undefined && FACET_OF[list] === t.facet) setSeed((cur) => addTo(cur, list, t.term));
  };

  const copy = (text: string): void => {
    void copyText(text).then((r) => toast(r.ok ? "prompt copied" : `clipboard refused: ${r.error}`));
  };

  const seedFrom = (id: string): void => {
    setFrom(id);
    setLoaded(null);
    const t = takes.find((x) => x.id === id);
    setSeed(t === undefined ? BLANK_SEED : t.seed);
  };

  return (
    <div className={s.lane}>
      <aside className={s.rail} aria-label="terms">
        <CapsHeading text="terms" tally={{ value: terms.length }} level={2} />
        {!view.terms.ok && <ErrorLine message={`terms: ${view.terms.error}`} />}
        <TermRail terms={terms} onPick={onPick} onHand={onHand} />
      </aside>
      <main className={s.main}>
        {/* The ways into one seed, side by side: a sentence, pairs by ear, or a kept take. */}
        <div className={s.from}>
          <Seg label="start from" options={canDuel ? DOORS : DOORS.filter((d) => d.value !== "ear")} value={door} onChange={setDoor} />
          <span className={s.grow} />
          <Select
            label="seed from"
            value={from}
            onChange={seedFrom}
            options={[{ value: BLANK, label: "blank" }, ...takes.map((t) => ({ value: t.id, label: t.title }))]}
          />
          {!view.takes.ok && <ErrorLine message={`takes: ${view.takes.error}`} />}
        </div>
        {door === "track" ? track : door === "ear" && duel !== null ? duel : <SayIt {...steer.say} />}
        <SeedComposer
          seed={seed}
          ear={steer.ear}
          isLit={steer.isLit}
          onTrace={steer.onTrace}
          strip={steer.strip}
          shape={shape.node}
          {...(shape.lyrics === undefined ? {} : { lyrics: shape.lyrics })}
          {...(shape.plan === undefined ? {} : { plan: shape.plan })}
          terms={terms}
          hands={hands}
          from={fromLabel}
          keys={view.keys}
          onSeed={(next) => {
            setSeed(next);
            if (next === BLANK_SEED || (next.genres.length === 0 && next.moods.length === 0 && next.instruments.length === 0 && next.avoid.length === 0 && next.bpm === null && next.key === null)) setLoaded("blank");
          }}
          busy={flow.reading || !canSend}
          onSend={() => send(seed, fromLabel)}
          onCopy={copy}
        />
        {steer.failed !== null && <ErrorLine message={`audition: ${steer.failed}`} />}
        <VariationList
          list={variations}
          busy={flow.reading || !canSend}
          onLoad={(v) => {
            setSeed(v.seed);
            setLoaded(`${fromLabel} · ${v.axis}`);
          }}
          onSend={(v) => send(v.seed, `${fromLabel} · ${v.axis}`)}
          hear={{
            // A play mark only where the move itself can be heard: a sketch that differs from the
            // seed's own, with every instrument it adds playable here - a swap to a word this
            // machine has no samples for would play the seed minus its old instrument, a lie.
            stateOf: (v) => {
              const href = shape.sketchOf(v.seed);
              const heard = playableIds(v.seed.instruments, can);
              const added = v.seed.instruments.filter((t) => !seed.instruments.includes(t));
              if (href === null || href === shape.sketchOf(seed) || added.some((t) => !heard.includes(atlasFor(t)?.id ?? ""))) return null;
              return ear.stateOf(href);
            },
            onPlay: (v) => {
              const href = shape.sketchOf(v.seed);
              if (href !== null) ear.toggle(href);
            },
          }}
        />
      </main>
      <aside className={s.side} aria-label="take, drafts and references">
        <EngineList engines={engines} label="engines" />
        {take !== undefined && (
          <section className={s.take} aria-label="seed take">
            <CapsHeading text={take.title} variant="section" />
            <AudioPreview src={take.src} peaks={take.peaks} title={take.title} durationS={take.durationS} />
            <CapsHeading text="prompt" variant="section" level={4} />
            <AudioPrompt prompt={take.prompt} reasons={take.reasons} {...(take.negative === undefined ? {} : { negative: take.negative })} />
            <CapsHeading text="measured" variant="section" level={4} />
            <AudioMeasures facts={take.facts} />
          </section>
        )}
        {view.drafts.ok ? <DraftList drafts={view.drafts.value} triageHref="/board" /> : <ErrorLine message={`drafts: ${view.drafts.error}`} />}
        <ReferenceList
          refs={view.references}
          onSeed={(r, m) => {
            const c = conceptFor(r.id, { tempo: m.tempo, key: m.key }, view.concept);
            setSeed(c);
            setLoaded(`${r.artist} — ${r.title} · ${m.label}`);
          }}
        />
      </aside>
      {flow.sheet}
    </div>
  );
}
