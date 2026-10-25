// /kit - the design system as shipped (plan §2.1; owner decision 5, 2026-10-15: it replaces
// v1's Almanac kit outright). Its structure is the prototype's own kit page
// (docs/next/prototype/app/kit.html + kit.js + kit.css): an index of grouped sections on the
// left, specimen cards on the right, the tokens read back, every part in its states.
//
// What is not the prototype's: the tokens come from packages/ui/tokens/source.json (the
// generator's authority) instead of the stylesheet, the status vocabulary is the whole
// STATUS table instead of eight hand-picked words, and the key legends are drawn for every
// mode of the one keymap instead of one hand-typed list.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Metadata } from "next";

import { err, errorMessage, type Result } from "@gt/domain/errors";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { parseSource, type TokenSource } from "@gt/ui/tokenSource";

import { AudioSection } from "./AudioKit.tsx";
import { BoardSection } from "./BoardKit.tsx";
import { boardKitData } from "./boardKitData.ts";
import { ContractSection } from "./Contract.tsx";
import { ControlSections } from "./Controls.tsx";
import { FloorSection } from "./FloorKit.tsx";
import { GraphSection } from "./GraphKit.tsx";
import { KitNav } from "./KitNav.tsx";
import { LedgerSections } from "./LedgerKit.tsx";
import { LibrarySection } from "./LibraryKit.tsx";
import { SignalSections } from "./Signal.tsx";
import { StatusSection } from "./Status.tsx";
import { StyleSection } from "./StyleKit.tsx";
import { StructureSection } from "./Structure.tsx";
import { PartSection } from "./PartKit.tsx";
import { ProduceSection } from "./ProduceKit.tsx";
import { RunsSection } from "./RunsKit.tsx";
import { DRAWN_GROUPS, TokenSections } from "./Tokens.tsx";
import k from "./kit.module.css";

export const metadata: Metadata = { title: "Gravitone · Kit" };

const BODY = "kit-body";

/** source.json through the one door: a file that cannot be read is the same Result as one that
 *  cannot be parsed, so either way the page draws one ErrorLine and every other section. */
function readSource(): Result<TokenSource> {
  try {
    return parseSource(readFileSync(join(process.cwd(), "packages/ui/tokens/source.json"), "utf8"));
  } catch (e) {
    return err("unavailable", errorMessage(e));
  }
}

export default function KitPage() {
  const source = readSource();
  // A group the sheet has no place for would be a token the kit silently omits: say so on
  // the page, where the next person to add a group will see it (zero-input is not green).
  const unplaced = source.ok ? source.value.groups.filter((g) => !DRAWN_GROUPS.includes(g.id)).map((g) => g.id) : [];
  return (
    <div className={k.kit}>
      <KitNav bodyId={BODY} />
      <div className={k.body} id={BODY}>
        {!source.ok && <ErrorLine message={`tokens/source.json: ${source.error.message}`} live />}
        {unplaced.length > 0 && <ErrorLine message={`token groups with no kit section: ${unplaced.join(", ")}`} live />}
        {source.ok && <TokenSections groups={source.value.groups} />}
        <SignalSections />
        <StatusSection />
        <ControlSections />
        <StructureSection />
        <RunsSection />
        <LedgerSections />
        <FloorSection />
        <BoardSection data={boardKitData()} />
        <ProduceSection />
        <PartSection />
        <AudioSection />
        <GraphSection />
        <LibrarySection />
        <StyleSection />
        <ContractSection />
      </div>
    </div>
  );
}
