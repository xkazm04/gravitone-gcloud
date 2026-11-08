"use client";

// ONE COVER ON THE CONSOLE (prototype v1): the cover's name and states on a master line, then five strips - song (and
// its brief), plan (section and score, the launch), takes, pick, remix. The strip the work stands at is open; every
// other strip is one line of its facts and opens on a click. The flow is the baseline's (../useCover.ts,
// ../useAB.ts) and so are the parts inside the strips, but for the takes (./Takes.tsx). Keys 1-5, Space, S and the
// arrows audition the takes (./keys.ts) while focus is in the desk.
import { useEffect, useMemo, useState } from "react";

import { COVER_TAKE_COUNT, type CoverCard } from "@gt/domain/cover";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Keycaps } from "@gt/ui/components/keycaps/Keycaps.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import { ChainPart, RemixPart, WinnerPart } from "../After.tsx";
import { BriefPart } from "../brief/Brief.tsx";
import { BRIEF_TONE, briefOffered } from "../brief/brief.ts";
import { SectionPart } from "../Score.tsx";
import { SourceFacts } from "../Source.tsx";
import { doneCount } from "../Takes.tsx";
import { useAB, type AB } from "../useAB.ts";
import { useCover, type CoverFlow } from "../useCover.ts";
import type { Desk } from "../useDesk.ts";
import { clock, RIGHTS_LABEL, RIGHTS_TONE, STATE_TONE } from "../words.ts";
import { AUDITION_MAP, AUDITION_MODE, useAudition } from "./keys.ts";
import { currentSteps, firstWords, phaseOf, spanWords, STEPS, winnerWords, type StepId } from "./steps.ts";
import { StateChip } from "./StateChip.tsx";
import { ScoreStrip } from "./Score.tsx";
import { TakesStrip } from "./Takes.tsx";
import { Strip } from "./Strip.tsx";
import c from "./console.module.css";

const TITLES: Readonly<Record<StepId, string>> = { song: "song", plan: "plan", takes: "takes", pick: "pick", remix: "remix" };
const DRAWN_FACTS: ReadonlySet<string> = new Set(["take"]);

function Facts({ id, flow }: { readonly id: StepId; readonly flow: CoverFlow }) {
  const r = flow.card.record;
  switch (id) {
    case "song":
      return (
        <>
          <span className={c.fact}>{r.source.name}</span>
          <span className={c.num}>{clock(flow.lenS)}</span>
          <Chip label={RIGHTS_LABEL[r.rights]} tone={RIGHTS_TONE[r.rights]} casing="lower" name={`rights ${RIGHTS_LABEL[r.rights]}`} />
          {r.brief === undefined ? <Chip label="no brief" casing="lower" ghost /> : <StateChip label="brief" value={r.brief.state} tone={BRIEF_TONE[r.brief.state]} name={`brief ${r.brief.state}`} />}
        </>
      );
    case "plan":
      return (
        <>
          <span className={c.num}>{spanWords(flow.span.startS, flow.span.endS)}</span>
          <span className={c.fact}>{flow.style.trim() === "" ? "" : firstWords(flow.style)}</span>
          {flow.style.trim() === "" && <Chip label="no style" tone="amber" casing="lower" />}
        </>
      );
    case "takes": {
      const failed = r.takes.filter((t) => t.state === "failed").length;
      return (
        <>
          <Tally value={doneCount(r.takes)} of={COVER_TAKE_COUNT} label="done" />
          {failed > 0 && <Chip label="failed" value={failed} tone="rose" casing="lower" />}
        </>
      );
    }
    case "pick": {
      const w = winnerWords(r);
      return w === null ? <span className={c.fact}>—</span> : <span className={c.num}>{w}</span>;
    }
    case "remix":
      return r.remix === undefined ? <span className={c.fact}>—</span> : (
        <>
          <span className={c.fact}>{r.remix.name}</span>
          <Chip label="chain" tone="emerald" casing="lower" dot />
        </>
      );
  }
}

function Body({ id, flow, ab }: { readonly id: StepId; readonly flow: CoverFlow; readonly ab: AB }) {
  switch (id) {
    case "song":
      return (
        <>
          <SourceFacts card={flow.card} lenS={flow.lenS} />
          <BriefPart flow={flow} />
        </>
      );
    case "plan":
      return (
        <>
          <SectionPart flow={flow} ab={ab} />
          <ScoreStrip flow={flow} />
        </>
      );
    case "takes":
      return <TakesStrip flow={flow} ab={ab} />;
    case "pick":
      return <WinnerPart flow={flow} />;
    case "remix":
      return (
        <>
          <RemixPart flow={flow} />
          <ChainPart flow={flow} quiet={ab.stop} />
        </>
      );
  }
}

export function Console({ card, desk }: { readonly card: CoverCard; readonly desk: Desk }) {
  const flow = useCover(card, desk.acts, desk.sender, desk.refresh);
  const { heard, span } = flow;
  const rms = useMemo(() => heard?.rms(span.startS, span.endS), [heard, span.startS, span.endS]);
  const ab = useAB(card.sourceUrl, span, rms);
  const r = card.record;

  // The strips the work stands at are open; when the record moves on, the console follows it (reset-on-prop).
  const now = currentSteps(r);
  const sig = now.join(",");
  const [open, setOpen] = useState<ReadonlySet<StepId>>(() => new Set(now));
  const [seen, setSeen] = useState(sig);
  if (seen !== sig) {
    setSeen(sig);
    setOpen(new Set(now));
  }
  const toggle = (id: StepId): void =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // A cover made from a link opens on its brief's receipt (desk.briefOnOpen): asked once, as it mounts.
  const askNow = desk.briefOnOpen === r.id;
  const { briefAsked } = desk;
  const ask = flow.brief.ask;
  useEffect(() => {
    if (!askNow) return;
    briefAsked();
    ask();
  }, [askNow, briefAsked, ask]);
  // A brief receipt waiting for its confirm, or its refusal, holds the song strip open.
  const held = (id: StepId): boolean => open.has(id) || (id === "song" && (flow.brief.launching !== null || flow.brief.error !== null));

  const keys = useAudition(flow, ab);
  const briefNow = briefOffered(r) && flow.brief.launching === null && !held("song");

  return (
    // tabIndex -1: a click anywhere on the console puts focus inside it, so the audition keys answer after it.
    <div className={c.console} onKeyDown={keys} tabIndex={-1}>
      <div className={c.master}>
        <h2 className={c.name}>{r.title}</h2>
        <StateChip label={r.state} tone={STATE_TONE[r.state]} />
        {r.jobId !== undefined && <span className={c.num}>{r.jobId}</span>}
      </div>
      {STEPS.map((id, i) => (
        <Strip
          key={id}
          n={i + 1}
          title={TITLES[id]}
          phase={phaseOf(id, r)}
          open={held(id)}
          onToggle={() => toggle(id)}
          facts={<Facts id={id} flow={flow} />}
          {...(id === "song" && briefNow
            ? {
                actions: (
                  <Button
                    label={flow.brief.busy ? "Reading receipt" : r.brief === undefined ? "Brief" : "Brief again"}
                    size="sm"
                    tone="cyan"
                    disabled={flow.brief.busy}
                    onPress={flow.brief.ask}
                  />
                ),
              }
            : {})}
          {...(id === "takes" && doneCount(r.takes) > 0 ? { tools: <Keycaps mode={AUDITION_MODE} label="audition keys" map={AUDITION_MAP} facts={DRAWN_FACTS} /> } : {})}
        >
          <Body id={id} flow={flow} ab={ab} />
        </Strip>
      ))}
    </div>
  );
}
