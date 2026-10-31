"use client";

// THE SUNO PIECES IN A THREAD CARD (spark suno-advisor, S1 composition "thread"): WP3's @gt/ui shapes
// placed where the card's reading order wants them (./thread.ts). The prompt is a SunoPromptCard with
// its lineage (Copy all, Open Suno; the confirmed dislikes join its exclude at copy time); a prompt
// carried in from an earlier answer folds to one line that opens in place; the person's uploaded take
// shows its TakeFacts under the track that answers it `as: "suno"`; a card's taste proposals are
// TasteChips; the confirmed profile stands in the side panel. A verdict the person sent reads as
// chips under their words. Presses go through `v.suno` (the host's), nothing here reaches suno.com.
import { useState, type ReactNode } from "react";

import type { StudioNodeOf } from "@gt/domain/audio.studio";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Panel } from "@gt/ui/components/panel/Panel.tsx";
import type { Placed } from "@gt/ui/components/studio-desk/desk.ts";
import { SunoPromptCard } from "@gt/ui/components/suno/SunoPromptCard.tsx";
import { TakeFacts } from "@gt/ui/components/suno/TakeFacts.tsx";
import { TasteChips } from "@gt/ui/components/suno/TasteChips.tsx";

import { copyText } from "../../../_shell/clipboard.ts";
import type { SunoHost } from "../_host/types.ts";
import type { CardCtx } from "./ctx.ts";
import { answerNumber, keptOfProposals, takeFactsOf, versionName, type VerdictChips } from "./thread.ts";
import x from "./suno.module.css";

/** The page's one copy act, answered in words (null when it went). */
const copy = async (text: string): Promise<string | null> => {
  const r = await copyText(text);
  return r.ok ? null : r.error;
};

/** The suno_prompt kind: the card's own version in full; one carried from an earlier answer as a line that opens. */
export function SunoPrompt({ placed, ctx }: { readonly placed: Placed<"suno_prompt">; readonly ctx: CardCtx }) {
  const card = <SunoPromptCard node={placed.node} taste={ctx.v.suno.taste} copy={copy} />;
  if (!placed.carried) return <div className={x.prompt}>{card}</div>;
  return <CarriedPrompt node={placed.node} from={answerNumber(ctx.v.session.turns, placed.turnId)}>{card}</CarriedPrompt>;
}

function CarriedPrompt({ node, from, children }: { readonly node: StudioNodeOf<"suno_prompt">; readonly from: number | null; readonly children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={x.carried} aria-label={`Suno prompt ${versionName(node)}, from an earlier answer`}>
      <div className={x.carriedHead}>
        <Chip label="prompt" value={versionName(node)} tone="violet" casing="lower" />
        <Chip label="model" value={node.model} casing="lower" />
        {from !== null && <span className={x.from}>{`from answer ${from}`}</span>}
        <span className={x.grow} />
        <Button label={open ? "hide" : "show"} size="sm" onPress={() => setOpen(!open)} />
      </div>
      {open && children}
    </section>
  );
}

/** The taste kind: this card's proposals; the ones already kept show once, as kept. */
export function Taste({ placed, ctx }: { readonly placed: Placed<"taste">; readonly ctx: CardCtx }) {
  const { suno } = ctx.v;
  return (
    <div className={x.taste}>
      <TasteChips proposed={placed.node.rows} kept={keptOfProposals(placed.node.rows, suno.taste)} onKeep={(row) => suno.keepTaste(row, placed.turnId)} onDrop={suno.dropTaste} />
    </div>
  );
}

/** Under a track that is the person's uploaded Suno take: what was measured and, after a Listen, heard. */
export function TakeRow({ node, ctx }: { readonly node: StudioNodeOf<"track">; readonly ctx: CardCtx }) {
  const facts = takeFactsOf(node, ctx.v.suno.takes);
  if (facts === null) return null;
  return (
    <div className={x.take}>
      <TakeFacts facts={facts} onListen={ctx.v.suno.listen} />
    </div>
  );
}

/** What a track is to a prompt: its local sketch, or a Suno take. */
export function AnswersChip({ node }: { readonly node: StudioNodeOf<"track"> }) {
  const a = node.answers;
  if (a === undefined) return null;
  if (a.as === "sketch") return <Chip label="sketch of" value={a.promptId} tone="violet" ghost casing="lower" />;
  return <Chip label="suno take" value={a.clip === undefined ? a.promptId : `${a.promptId} ${a.clip}`} tone="violet" casing="lower" />;
}

/** A verdict the person sent, under their words. */
export function VerdictLine({ chips }: { readonly chips: VerdictChips }) {
  return (
    <div className={x.verdict} role="group" aria-label={`verdict on ${chips.version}`}>
      <Chip label="verdict on" value={chips.version} tone="violet" casing="lower" />
      <Chip label="take" value={chips.clip} casing="lower" />
      {chips.call !== null && <Chip label={chips.call} tone={chips.call === "keep" ? "emerald" : "rose"} casing="lower" />}
      {chips.off.map((o) => (
        <Chip key={o} label={o} tone="amber" ghost casing="lower" name={`${o} is off`} />
      ))}
      {chips.take !== null && <Chip label="file" value={chips.take} tone="cyan" casing="lower" />}
    </div>
  );
}

/** The side panel's confirmed taste profile (the lines that seed the next prompt). */
export function TasteProfile({ suno }: { readonly suno: SunoHost }) {
  if (suno.taste.length === 0) return null;
  return (
    <Panel title="taste" tally={{ value: suno.taste.length, label: "kept" }}>
      <div className={x.profile}>
        <TasteChips proposed={[]} kept={suno.taste} onKeep={suno.keepTaste} onDrop={suno.dropTaste} />
      </div>
    </Panel>
  );
}
