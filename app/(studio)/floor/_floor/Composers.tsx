"use client";

// THE FLOOR'S COMPOSERS (prototype index.html `IdeaComposer`, `Estimate`, `S.comp`, `mechLabel`,
// the `launch` act :890-923): per media lane its own choices, the first sentence, the estimate
// and Launch - which opens the RECEIPT (../../projects/_plan/receipt.tsx), never the run.
//
// The estimate is the receipt's own totals, read from the port whenever a CHOICE changes (style,
// mechanism, topic, kind, subject) - not on every keystroke of the sentence, which prices
// nothing - and again whenever the Floor re-reads (a launch elsewhere moves the queue). Answers
// land latest-wins per lane (async-ui-states/state-model: a slow stale answer never overwrites
// a newer one).
//
// The choices are the port's (`composerChoices`): candidate and proven styles, registry topics,
// strip subjects. None is a hand list here.

import { useEffect, useRef, useState } from "react";

import type { MediaLane } from "@gt/domain/lane";
import type { ComposerInput, ImageMechanism, Receipt } from "@gt/domain/produce";
import { Composer, ComposerSelect, Estimate } from "@gt/ui/components/produce/Composer.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";

import type { ComposerChoices, ProducePort } from "../../projects/_port/contract.ts";

export const SWEEP = "__sweep";

/** A lane's choices - everything the estimate depends on. The sentence lives beside it, so typing
 *  keeps this object's identity and re-prices nothing. */
export type LaneChoice = {
  readonly style: string;
  readonly mechs: { readonly text: boolean; readonly "ref-early": boolean };
  readonly topic: string;
  readonly kind: "music" | "sfx";
  readonly subject: string;
};

export type LaneDraft = { readonly text: string; readonly choice: LaneChoice };

export function initialDrafts(c: ComposerChoices): Readonly<Record<MediaLane, LaneDraft>> {
  const choice: LaneChoice = {
    style: c.image.candidates[0]?.value ?? c.image.proven[0]?.value ?? SWEEP,
    mechs: { text: true, "ref-early": true },
    topic: c.article.topics[0]?.value ?? "",
    kind: "music",
    subject: c.video.subjects[0]?.value ?? "",
  };
  const base: LaneDraft = { text: "", choice };
  return { image: base, article: base, audio: base, video: base };
}

const mechanismsOf = (d: LaneChoice): ImageMechanism[] => (["text", "ref-early"] as const).filter((m) => d.mechs[m]);

/** The prototype's cycle: text+ref → text → ref-early → text+ref (index.html :1287). */
export function nextMechs(m: LaneChoice["mechs"]): LaneChoice["mechs"] {
  if (m.text && m["ref-early"]) return { text: true, "ref-early": false };
  if (m.text) return { text: false, "ref-early": true };
  return { text: true, "ref-early": true };
}
export const mechLabel = (m: LaneChoice["mechs"]): string => (m.text && m["ref-early"] ? "text+ref" : m.text ? "text" : "ref-early");

export function inputOf(lane: MediaLane, d: LaneChoice, text: string): ComposerInput {
  switch (lane) {
    case "image":
      return d.style === SWEEP ? { lane, text, mechanisms: mechanismsOf(d), sweep: true } : { lane, text, mechanisms: mechanismsOf(d), styleId: d.style };
    case "article":
      return { lane, text, topic: d.topic };
    case "audio":
      return { lane, text, kind: d.kind };
    case "video":
      return { lane, text, subject: d.subject };
  }
}

const NOUN: Readonly<Record<MediaLane, (d: LaneChoice) => string>> = { image: () => "plate", article: () => "run", audio: (d) => (d.kind === "music" ? "prompt" : "clip"), video: () => "card" };

const PLACEHOLDER: Readonly<Record<MediaLane, string>> = {
  image: "Riders crest the ridge at dawn, banners low…",
  article: "Angle: the budget is a clock, not a pool…",
  audio: "A bed that holds a full minute…",
  video: "Radar sweeps; one blip stays when the rest fade…",
};

/** The estimate for one lane: re-read when a choice or the Floor's read changes, latest wins. */
export function useEstimate(port: ProducePort, lane: MediaLane, choice: LaneChoice, epoch: number): { readonly receipt: Receipt | null; readonly error?: string } {
  const [st, setSt] = useState<{ readonly receipt: Receipt | null; readonly error?: string }>({ receipt: null });
  const ask = useRef(0);
  useEffect(() => {
    const mine = ++ask.current;
    let live = true;
    void port.composerReceipt({ input: inputOf(lane, choice, "") }).then((r) => {
      if (!live || mine !== ask.current) return;
      setSt(r.ok ? { receipt: r.value } : { receipt: null, error: r.error.error });
    });
    return () => {
      live = false;
    };
  }, [port, lane, choice, epoch]);
  return st;
}

export type FoundryComposerProps = {
  readonly lane: MediaLane;
  readonly name: string;
  readonly choices: ComposerChoices;
  readonly draft: LaneDraft;
  readonly onDraft: (d: LaneDraft) => void;
  readonly port: ProducePort;
  readonly epoch: number;
  readonly busy: boolean;
  readonly onLaunch: () => void;
  readonly onFocus: () => void;
};

function Controls({ lane, choices, draft, onDraft }: Pick<FoundryComposerProps, "lane" | "choices" | "draft" | "onDraft">) {
  const d = draft.choice;
  const set = (c: Partial<LaneChoice>): void => onDraft({ ...draft, choice: { ...d, ...c } });
  if (lane === "image") {
    return (
      <>
        <ComposerSelect
          label="style"
          value={d.style}
          onChange={(style) => set({ style })}
          groups={[
            { label: "candidate · lock trial", options: choices.image.candidates },
            { label: "proven · re-sweep", options: choices.image.proven },
          ]}
          tail={[{ value: SWEEP, label: `Sweep · all ${choices.image.sweep} forge styles` }]}
        />
        <Toggle label={mechLabel(d.mechs)} on name={`mechanism ${mechLabel(d.mechs)}`} onToggle={() => set({ mechs: nextMechs(d.mechs) })} />
      </>
    );
  }
  if (lane === "article") {
    const bundles = [...new Set(choices.article.topics.map((t) => t.bundle))];
    return (
      <ComposerSelect
        label={`topic, ${choices.article.topics.length} registry topics`}
        value={d.topic}
        onChange={(topic) => set({ topic })}
        groups={bundles.map((b) => ({ label: b, options: choices.article.topics.filter((t) => t.bundle === b) }))}
      />
    );
  }
  if (lane === "audio") {
    return (
      <>
        {(["music", "sfx"] as const).map((k) => (
          <Toggle key={k} label={k} on={d.kind === k} onToggle={() => set({ kind: k })} />
        ))}
      </>
    );
  }
  return <ComposerSelect label="strip subject" value={d.subject} onChange={(subject) => set({ subject })} groups={[{ label: "", options: choices.video.subjects }]} />;
}

export function FoundryComposer({ lane, name, choices, draft, onDraft, port, epoch, busy, onLaunch, onFocus }: FoundryComposerProps) {
  const est = useEstimate(port, lane, draft.choice, epoch);
  return (
    <Composer
      name={`${name} idea`}
      lane={lane}
      controls={<Controls lane={lane} choices={choices} draft={draft} onDraft={onDraft} />}
      text={draft.text}
      onText={(text) => onDraft({ ...draft, text })}
      placeholder={PLACEHOLDER[lane]}
      estimate={<Estimate receipt={est.receipt} noun={NOUN[lane](draft.choice)} {...(est.error === undefined ? {} : { error: est.error })} />}
      onLaunch={onLaunch}
      busy={busy}
      onFocus={onFocus}
    />
  );
}
