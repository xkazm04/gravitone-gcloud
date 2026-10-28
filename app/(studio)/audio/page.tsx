// /audio - the Audio lane's desk (owner rulings 2026-10-17: v1's Recipe Book rebuilt as the
// composer, Phase 5 L52; every Sound lab tool folded in, Phase 6). One page, its sections a table
// (./_audio/desk.ts) and its kind - music or sfx - in the URL beside the section; each section
// reads on the server and hands one client island its data and its Server Actions.
//
//   compose   terms, the composer and its variations, drafts and references (L52), and the
//             engines the desk can reach (lib/sound/engines.ts); effects have no composer here
//             until an engine on the desk makes them, and the page says which engines and why;
//   arrange   kept takes as version stacks, stages across and groups down: moves, finalize with
//             a library label, the Suno round trip, the rows (./_audio/Arrange.tsx);
//   hunt      an idea drafted into a map of axes and leaves, leaves priced in audio-seconds,
//             auditioned side by side, a crown that is a keep, the lesson signed (./_hunt);
//   lessons   "when X, brief Y, because Z", saved only on the operator's confirm (./_lessons);
//   strengths provider x facet, per provider, nothing printed under three takes (./_insight);
//   rubric    1-10 per dimension on a judged take, the ledger's own mean;
//   batch     N identical briefs priced through a receipt, to measure a provider's spread.
// What the desk does not do is judge: keep and reject belong to the Board's audio triage.
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { EngineList } from "@gt/ui/components/audio/EngineList.tsx";
import { TabRail } from "@gt/ui/components/tabrail/TabRail.tsx";

import { audibleIds } from "../../../lib/audio/atlas.ts";
import { makersOf } from "../../../lib/sound/engines.ts";
import { setHand, sunoConfirm, sunoReceipt } from "./_audio/actions.ts";
import { Arrange } from "./_audio/Arrange.tsx";
import { editRows, moveCard } from "./_audio/arrangeActs.ts";
import { deskEngines, engineRows, finalizedCount, readArrange } from "./_audio/arrangeRead.ts";
import { AudioLane } from "./_audio/AudioLane.tsx";
import { deskHref, KINDS, parseDeskUrl, SECTIONS } from "./_audio/desk.ts";
import { audioNow, readAudio } from "./_audio/read.ts";
import { crownTake, draftHuntLesson, draftHuntMap, renderLeaves } from "./_hunt/acts.ts";
import { Hunt } from "./_hunt/Hunt.tsx";
import { readHunt } from "./_hunt/read.ts";
import { huntParam } from "./_hunt/url.ts";
import { confirmLessonAct } from "./_lessons/acts.ts";
import { Lessons } from "./_lessons/Lessons.tsx";
import { readLessons } from "./_lessons/read.ts";
import { BatchDesk } from "./_insight/Batch.tsx";
import { RubricDesk } from "./_insight/Rubric.tsx";
import { StrengthsDesk } from "./_insight/Strengths.tsx";
import { batchConfirm, batchReceipt, scoreTake } from "./_insight/acts.ts";
import { readBatch, readRubricPile, readStrengths, unscoredCount } from "./_insight/read.ts";
import s from "./_audio/audio.module.css";

export const metadata: Metadata = { title: "Gravitone · Audio" };

type Search = Promise<Readonly<Record<string, string | string[] | undefined>>>;

export default async function AudioPage({ searchParams }: { readonly searchParams: Search }) {
  const q = await searchParams;
  const url = parseDeskUrl(q);
  const registry = deskEngines();
  const [final, unscored] = await Promise.all([finalizedCount(url.kind), unscoredCount(url.kind)]);
  const tabs = SECTIONS.map((x) => ({
    id: x.id,
    label: x.label,
    href: deskHref({ ...url, section: x.id }),
    ...(x.id === "arrange" && final.ok ? { tally: { value: final.value, label: "final" } } : {}),
    ...(x.id === "rubric" && unscored.ok ? { tally: { value: unscored.value, label: "unscored" } } : {}),
  }));
  const kinds = KINDS.map((k) => ({ id: k, label: k, href: deskHref({ ...url, kind: k }) }));
  let body: ReactNode;
  if (url.section === "arrange") body = <Arrange view={await readArrange(url.kind)} acts={{ moveCard, editRows }} />;
  else if (url.section === "hunt") body = <Hunt view={await readHunt(url.kind, huntParam(q))} acts={{ draftHuntMap, renderLeaves, crownTake, draftHuntLesson, confirmLessonAct }} nowMs={audioNow()} />;
  else if (url.section === "lessons") body = <Lessons view={await readLessons(url.kind)} />;
  else if (url.section === "strengths") body = <StrengthsDesk key={url.kind} view={await readStrengths(url.kind)} lessonDoor={confirmLessonAct} />;
  else if (url.section === "rubric") body = <RubricDesk key={url.kind} view={await readRubricPile(url.kind)} acts={{ scoreTake }} />;
  else if (url.section === "batch") body = <BatchDesk key={url.kind} view={readBatch(url.kind, registry)} nowMs={audioNow()} acts={{ batchReceipt, batchConfirm }} />;
  else if (url.kind === "music") body = <AudioLane view={await readAudio()} nowMs={audioNow()} acts={{ setHand, sunoReceipt, sunoConfirm }} engines={engineRows(registry)} canSend={makersOf(registry, "music").some((e) => e.id === "suno")} audible={await audibleIds()} />;
  else
    body = (
      <section className={s.makers} aria-label="effects">
        <CapsHeading text="effects" tally={{ value: makersOf(registry, "sfx").length, label: "engines" }} level={2} />
        <EngineList engines={engineRows(registry)} label="engines" />
      </section>
    );
  return (
    <div className={s.desk}>
      <div className={s.bar}>
        <TabRail label="audio desk" mode="audio" tabs={tabs} current={url.section} />
        <TabRail label="kind" mode="audio" tabs={kinds} current={url.kind} />
      </div>
      {body}
    </div>
  );
}
