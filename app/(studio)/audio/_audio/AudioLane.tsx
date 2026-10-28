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
import { SeedComposer } from "@gt/ui/components/audio/SeedComposer.tsx";
import { LocalBandStudio } from "@gt/ui/components/audio/LocalBandStudio.tsx";
import type { LocalAuditionState, LocalRole, LocalScoreDraft, LocalTakeView } from "@gt/ui/components/audio/localBand.ts";
import { TermRail } from "@gt/ui/components/audio/TermRail.tsx";
import { VariationList } from "@gt/ui/components/audio/VariationList.tsx";
import { conceptFor, variationsOfSeed } from "@gt/ui/components/audio/variations.ts";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Select } from "@gt/ui/components/field/Field.tsx";

import { outcomeOf, useReceipt } from "../../projects/_plan/receipt.tsx";
import { useShell } from "../../_shell/Providers.tsx";
import { copyText } from "../../_shell/clipboard.ts";
import type { AudioView, SeedTake } from "./read.ts";
import type { setHand, sunoConfirm, sunoReceipt } from "./actions.ts";
import type { auditionLocalInstrumentAct, promoteLocalTakeAct, renderLocalScoreAct, swapLocalStemAct } from "./localActs.ts";
import type { LocalBandView } from "./localRead.ts";
import s from "./audio.module.css";

/** The page's Server Actions, handed over as props: a reference per action crosses to the client,
 *  never the module (the Board's and the Floor's wire shape, ../../projects/_port/wire.ts). */
export type AudioActs = { readonly setHand: typeof setHand; readonly sunoReceipt: typeof sunoReceipt; readonly sunoConfirm: typeof sunoConfirm };
export type LocalBandActs = {
  readonly renderLocalScoreAct: typeof renderLocalScoreAct;
  readonly swapLocalStemAct: typeof swapLocalStemAct;
  readonly auditionLocalInstrumentAct: typeof auditionLocalInstrumentAct;
  readonly promoteLocalTakeAct: typeof promoteLocalTakeAct;
};

const LIST_OF: Readonly<Record<string, SeedList>> = { genre: "genres", mood: "moods", instrument: "instruments" };
const BLANK = "__blank";

/** `engines`: the desk's registry rows (lib/sound/engines.ts); `canSend`: the registry says Suno composes here. */
export function AudioLane({
  view,
  nowMs,
  acts,
  engines,
  canSend,
  localBand,
  localActs,
}: {
  readonly view: AudioView;
  readonly nowMs: number;
  readonly acts: AudioActs;
  readonly engines: readonly EngineRow[];
  readonly canSend: boolean;
  readonly localBand?: LocalBandView;
  readonly localActs?: LocalBandActs;
}) {
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

  const send = (s0: Seed, label: string): void => {
    const fields = sunoFieldsOf(s0, hands, label === "blank" ? undefined : label);
    if (fields === null || flow.reading) return;
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

  const [localTakes, setLocalTakes] = useState<readonly LocalTakeView[]>(() => localBand?.takes ?? []);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localAudition, setLocalAudition] = useState<LocalAuditionState | null>(null);

  const onLocalRender = (spec: LocalScoreDraft): void => {
    if (!localActs || localBusy) return;
    setLocalBusy(true);
    setLocalError(null);
    void localActs.renderLocalScoreAct({ spec }).then(
      (r) => {
        setLocalBusy(false);
        if (!r.ok) {
          setLocalError(r.error.error);
          toast(r.error.error);
        } else {
          setLocalTakes((cur) => [r.value, ...cur.filter((x) => x.id !== r.value.id)]);
          toast(`local · rendered ${r.value.title} (${r.value.lufs?.toFixed(1) ?? "-14.0"} LUFS · $0)`);
          router.refresh();
        }
      },
      (e: unknown) => {
        setLocalBusy(false);
        const msg = errorMessage(e);
        setLocalError(msg);
        toast(msg);
      },
    );
  };

  const onLocalSwap = (takeId: string, role: LocalRole, instrumentId: string): void => {
    if (!localActs || localBusy) return;
    setLocalBusy(true);
    setLocalError(null);
    void localActs.swapLocalStemAct({ takeId, role, instrumentId }).then(
      (r) => {
        setLocalBusy(false);
        if (!r.ok) {
          setLocalError(r.error.error);
          toast(r.error.error);
        } else {
          setLocalTakes((cur) => [r.value, ...cur.filter((x) => x.id !== r.value.id)]);
          toast(`local · swapped ${role} (${r.value.reusedRoles.length} stems reused bit-exact · ${r.value.totalRenderMs}ms)`);
          router.refresh();
        }
      },
      (e: unknown) => {
        setLocalBusy(false);
        const msg = errorMessage(e);
        setLocalError(msg);
        toast(msg);
      },
    );
  };

  const onLocalAudition = (instrumentId: string): void => {
    if (!localActs || localBusy) return;
    setLocalBusy(true);
    setLocalError(null);
    void localActs.auditionLocalInstrumentAct({ instrumentId }).then(
      (r) => {
        setLocalBusy(false);
        if (!r.ok) {
          setLocalError(r.error.error);
          toast(r.error.error);
        } else {
          setLocalAudition(r.value);
          toast(`audition · ${r.value.name}`);
        }
      },
      (e: unknown) => {
        setLocalBusy(false);
        const msg = errorMessage(e);
        setLocalError(msg);
        toast(msg);
      },
    );
  };

  const onLocalPromote = (takeId: string): void => {
    if (!localActs || localBusy) return;
    setLocalBusy(true);
    setLocalError(null);
    void localActs.promoteLocalTakeAct({ takeId }).then(
      (r) => {
        setLocalBusy(false);
        if (!r.ok) {
          setLocalError(r.error.error);
          toast(r.error.error);
        } else {
          setLocalTakes((cur) => cur.map((t) => (t.id === takeId ? { ...t, stage: r.value.stage, verdict: "kept" } : t)));
          toast(`local · sent ${takeId} to Arrange`);
          router.refresh();
        }
      },
      (e: unknown) => {
        setLocalBusy(false);
        const msg = errorMessage(e);
        setLocalError(msg);
        toast(msg);
      },
    );
  };

  return (
    <div className={s.lane}>
      <aside className={s.rail} aria-label="terms">
        <CapsHeading text="terms" tally={{ value: terms.length }} level={2} />
        {!view.terms.ok && <ErrorLine message={`terms: ${view.terms.error}`} />}
        <TermRail terms={terms} onPick={onPick} onHand={onHand} />
      </aside>
      <main className={s.main}>
        <div className={s.from}>
          <Select
            label="seed from"
            value={from}
            onChange={seedFrom}
            options={[{ value: BLANK, label: "blank" }, ...takes.map((t) => ({ value: t.id, label: t.title }))]}
          />
          {!view.takes.ok && <ErrorLine message={`takes: ${view.takes.error}`} />}
        </div>
        <SeedComposer
          seed={seed}
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
        {localBand !== undefined && (
          <LocalBandStudio
            templates={localBand.templates}
            catalog={localBand.catalog}
            takes={localTakes}
            seed={seed}
            busy={localBusy}
            error={localError}
            audition={localAudition}
            onRender={onLocalRender}
            onSwapStem={onLocalSwap}
            onAudition={onLocalAudition}
            onPromote={onLocalPromote}
          />
        )}
        <VariationList
          list={variations}
          busy={flow.reading || !canSend}
          onLoad={(v) => {
            setSeed(v.seed);
            setLoaded(`${fromLabel} · ${v.axis}`);
          }}
          onSend={(v) => send(v.seed, `${fromLabel} · ${v.axis}`)}
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
