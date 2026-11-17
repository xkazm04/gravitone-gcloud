// ONE GROUP OF THE KIT, AS ITS OWN PAGE (design baseline P4, 2026-11-17): the kit's context column - its groups and
// nothing under them (../_shell/navModel.ts kitRooms) - beside that group's sections. /kit draws the tokens and every
// other group is /kit/<group> (./[group]/page.tsx); the sections and their specimens are the ones the single page
// drew, now split where the groups already split them (./sections.ts).
//
// The token file is read only where it is drawn: on the tokens page, through the one door (a file that cannot be
// read is the same Result as one that cannot be parsed), so either way the page draws one ErrorLine.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ReactNode } from "react";

import { err, errorMessage, type Result } from "@gt/domain/errors";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { parseSource, type TokenSource } from "@gt/ui/tokenSource";

import { ContextColumn } from "../_shell/ContextColumn.tsx";
import { kitRooms } from "../_shell/navModel.ts";
import { AudioSection } from "./AudioKit.tsx";
import { BoardSection } from "./BoardKit.tsx";
import { boardKitData } from "./boardKitData.ts";
import { ContractSection } from "./Contract.tsx";
import { ControlSections } from "./Controls.tsx";
import { EarSection } from "./EarKit.tsx";
import { FloorSection } from "./FloorKit.tsx";
import { GraphSection } from "./GraphKit.tsx";
import { LedgerSections } from "./LedgerKit.tsx";
import { LibrarySection } from "./LibraryKit.tsx";
import { PartSection } from "./PartKit.tsx";
import { ProduceSection } from "./ProduceKit.tsx";
import { RunsSection } from "./RunsKit.tsx";
import type { KitGroupId } from "./sections.ts";
import { SignalSections } from "./Signal.tsx";
import { SongLabSection } from "./SongLabKit.tsx";
import { StatusSection } from "./Status.tsx";
import { StructureSection } from "./Structure.tsx";
import { StudioSection } from "./StudioKit.tsx";
import { StyleSection } from "./StyleKit.tsx";
import { SunoSection } from "./SunoKit.tsx";
import { DRAWN_GROUPS, TokenSections } from "./Tokens.tsx";
import k from "./kit.module.css";

/** source.json through the one door: a file that cannot be read is the same Result as one that
 *  cannot be parsed, so either way the page draws one ErrorLine and every other section. */
function readSource(): Result<TokenSource> {
  try {
    return parseSource(readFileSync(join(process.cwd(), "packages/ui/tokens/source.json"), "utf8"));
  } catch (e) {
    return err("unavailable", errorMessage(e));
  }
}

function Tokens() {
  const source = readSource();
  // A group the sheet has no place for would be a token the kit silently omits: say so on
  // the page, where the next person to add a group will see it (zero-input is not green).
  const unplaced = source.ok ? source.value.groups.filter((g) => !DRAWN_GROUPS.includes(g.id)).map((g) => g.id) : [];
  return (
    <>
      {!source.ok && <ErrorLine message={`tokens/source.json: ${source.error.message}`} live />}
      {unplaced.length > 0 && <ErrorLine message={`token groups with no kit section: ${unplaced.join(", ")}`} live />}
      {source.ok && <TokenSections groups={source.value.groups} />}
    </>
  );
}

const BODIES: Readonly<Record<KitGroupId, () => ReactNode>> = {
  tokens: () => <Tokens />,
  signal: () => (
    <>
      <SignalSections />
      <StatusSection />
    </>
  ),
  controls: () => <ControlSections />,
  structure: () => <StructureSection />,
  operations: () => (
    <>
      <RunsSection />
      <LedgerSections />
      <FloorSection />
      <BoardSection data={boardKitData()} />
    </>
  ),
  production: () => (
    <>
      <ProduceSection />
      <PartSection />
    </>
  ),
  audio: () => (
    <>
      <AudioSection />
      <EarSection />
      <StudioSection />
      <SunoSection />
      <SongLabSection />
    </>
  ),
  library: () => (
    <>
      <GraphSection />
      <LibrarySection />
      <StyleSection />
    </>
  ),
  contract: () => <ContractSection />,
};

export function KitGroup({ group }: { readonly group: KitGroupId }) {
  return (
    <div className={k.kit} data-kit-group={group}>
      <ContextColumn rooms={kitRooms(group)} />
      <div className={k.body} id="kit-body">
        {BODIES[group]()}
      </div>
    </div>
  );
}
