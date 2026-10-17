// /audio - the Audio lane's desk (owner rulings 2026-10-17: v1's Recipe Book rebuilt as the
// composer, Phase 5 L52; every Sound lab tool folded in, Phase 6). One page, its sections a table
// (./_audio/desk.ts) and its kind - music or sfx - in the URL beside the section; each section
// reads on the server and hands one client island its data and its Server Actions.
//
//   compose   terms, the composer and its variations, drafts and references (L52), and the
//             engines the desk can reach (lib/sound/engines.ts); effects have no composer here
//             until an engine on the desk makes them, and the page says which engines and why;
//   arrange   kept takes as version stacks, stages across and groups down: moves, finalize with
//             a library label, the Suno round trip, the rows (./_audio/Arrange.tsx).
// What the desk does not do is judge: keep and reject belong to the Board's audio triage.
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { EngineList } from "@gt/ui/components/audio/EngineList.tsx";
import { TabRail } from "@gt/ui/components/tabrail/TabRail.tsx";

import { makersOf } from "../../../lib/sound/engines.ts";
import { setHand, sunoConfirm, sunoReceipt } from "./_audio/actions.ts";
import { Arrange } from "./_audio/Arrange.tsx";
import { editRows, moveCard } from "./_audio/arrangeActs.ts";
import { deskEngines, engineRows, finalizedCount, readArrange } from "./_audio/arrangeRead.ts";
import { AudioLane } from "./_audio/AudioLane.tsx";
import { deskHref, KINDS, parseDeskUrl, SECTIONS } from "./_audio/desk.ts";
import { audioNow, readAudio } from "./_audio/read.ts";
import s from "./_audio/audio.module.css";

export const metadata: Metadata = { title: "Gravitone · Audio" };

type Search = Promise<Readonly<Record<string, string | string[] | undefined>>>;

export default async function AudioPage({ searchParams }: { readonly searchParams: Search }) {
  const url = parseDeskUrl(await searchParams);
  const registry = deskEngines();
  const final = await finalizedCount(url.kind);
  const tabs = SECTIONS.map((x) => ({ id: x.id, label: x.label, href: deskHref({ ...url, section: x.id }), ...(x.id === "arrange" && final.ok ? { tally: { value: final.value, label: "final" } } : {}) }));
  const kinds = KINDS.map((k) => ({ id: k, label: k, href: deskHref({ ...url, kind: k }) }));
  let body: ReactNode;
  if (url.section === "arrange") body = <Arrange view={await readArrange(url.kind)} acts={{ moveCard, editRows }} />;
  else if (url.kind === "music") body = <AudioLane view={await readAudio()} nowMs={audioNow()} acts={{ setHand, sunoReceipt, sunoConfirm }} engines={engineRows(registry)} canSend={makersOf(registry, "music").some((e) => e.id === "suno")} />;
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
