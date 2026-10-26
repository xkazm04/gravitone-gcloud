"use client";

// THE BOARD PARTS (prototype index.html :389-725: the level sheet, PacketRail, MatrixCull and
// CullTile with the zoom lens, BlindPair, the article PacketReview with its EditNote, the
// CutReview; Phase 3 lot 21), plus the consequence panel decision 6 added. Over literal packets
// (./boardKitData.ts, built on the server) and the repo's own preset plates, keys off (a specimen's K is not the kit's), so the sheet
// draws the same every time. Clicking a tile moves its cursor; nothing leaves the specimen.

import { useState } from "react";

import { reasonVocabulary } from "@gt/domain/source";
import { ConsequencePanel } from "@gt/ui/components/consequence/ConsequencePanel.tsx";
import { CullTile, Zoom } from "@gt/ui/components/cull/CullTile.tsx";
import { IdeaList } from "@gt/ui/components/cull/IdeaList.tsx";
import { VariantCard } from "@gt/ui/components/cull/VariantCard.tsx";
import { VerdictPick } from "@gt/ui/components/cull/VerdictPick.tsx";
import { MatrixCull } from "@gt/ui/components/cull/MatrixCull.tsx";
import { RunMosaic } from "@gt/ui/components/cull/RunMosaic.tsx";
import { RunView } from "@gt/ui/components/cull/RunView.tsx";
import { CutReview } from "@gt/ui/components/cut/CutReview.tsx";
import { BoardDesk, CommitButton, DeskFrame, OracleStrip } from "@gt/ui/components/desk/Desk.tsx";
import { PacketRail } from "@gt/ui/components/desk/PacketRail.tsx";
import { Plate } from "@gt/ui/components/desk/Plate.tsx";
import { StackBar } from "@gt/ui/components/stackbar/StackBar.tsx";
import { BlindPair } from "@gt/ui/components/pair/BlindPair.tsx";
import { EditNote } from "@gt/ui/components/review/ArticlePage.tsx";
import { PacketReview } from "@gt/ui/components/review/PacketReview.tsx";
import { LevelSheet } from "@gt/ui/components/sheet/LevelSheet.tsx";
import { ModelViewer } from "@gt/ui/components/model/ModelViewer.tsx";

import type { BoardKitData } from "./boardKitData.ts";
import { Row, Section, Spec } from "./Spec.tsx";
import b from "./BoardKit.module.css";
import k from "./kit.module.css";

const noop = (): void => undefined;

/** A scout night's two text cells (lib/decision/v1/sources/scoutPlan.ts): a finding, a watch line. */
const FINDING = { label: "Hold the subject still and let the camera do the moving", meta: "cinematic · 02-frames", prompt: "\"If the character and the lens both move, nobody knows where to look - pick one.\"" };
const WATCH = { label: "channel: lighting breakdowns - https://example.com/breakdowns", meta: "watchlist", prompt: "motivated key and practicals, measured contrast ratios" };
const TEXT_MEDIA = { url: "", mime: "text/plain" };
/** A /scout night's vocabulary: three still axes of eleven, with every reason's meaning. */
const SCOUT = reasonVocabulary("scout");
const STILL = { ...SCOUT, list: SCOUT.list.slice(0, 3) };

/**
 * A scout night's storyboard (spark scout-storyboards; lib/decision/v1/sources/scoutPlan.ts storyboardCells): four
 * frames, then its words - the paragraph and the bullets as `- ` lines - as one run judged whole.
 */
const BOARD_FRAMES = ["/presets/blueprint.jpg", "/presets/paper-relief.jpg", "/presets/chalk-argument.jpg", "/presets/data-neon.jpg"];
const BOARD_WORDS = [
  "A night watchman climbs a stairwell after a lantern that will not let him catch it. Each landing is darker than the last, the light always three steps up, until the top floor opens on a window.",
  "",
  "- beats: the lantern moves, the chase, the last landing, the window",
  "- format: a 30 s vertical short, one shot per beat",
  "- look: warm amber against cold slate, one held light",
].join("\n");
const BOARD_CELLS = [...BOARD_FRAMES.map((_, i) => ({ id: `c-10/panel-${i + 1}`, row: "c-10" })), { id: "c-10/words", row: "c-10" }];
const BOARD_RUN = { row: "c-10", words: { id: "c-10", label: "The lantern that keeps three steps ahead", group: "storyboards" }, members: BOARD_CELLS.map((_, i) => i), group: "storyboards" };
const boardMedia = (id: string) => {
  const i = BOARD_CELLS.findIndex((c) => c.id === id);
  return i >= 0 && i < BOARD_FRAMES.length ? { url: BOARD_FRAMES[i] ?? "", mime: "image/jpeg" } : TEXT_MEDIA;
};
const boardWords = (id: string) =>
  id === "c-10/words" ? { label: "The lantern that keeps three steps ahead", meta: "idea: Lantern-lit stairwell · 4 frames · local · free", prompt: BOARD_WORDS } : { label: `frame ${id.slice(id.lastIndexOf("-") + 1)}` };

export function BoardSection({ data }: { readonly data: BoardKitData }) {
  const { cull: CULL, cullVerdicts: CULL_VERDICTS, audio: AUDIO, pair: PAIR, review: REVIEW, cut: CUT, rail: RAIL, consequence: CONSEQUENCE, model: MODEL } = data;
  const modelWords = { label: MODEL.label, meta: MODEL.meta, ...(MODEL.poster === undefined ? {} : { poster: MODEL.poster }) };
  const modelMedia = { url: MODEL.glb, mime: "model/gltf-binary" };
  const [cur, setCur] = useState(0);
  const words = CULL.present.items["the-exit/signal-ledger"] ?? { label: "signal ledger" };
  return (
    <Section id="board">
      <Spec names={["LevelSheet", "BoardDesk", "PacketRail", "MatrixCull"]} source="index.html :389-572 · floor.css board desk" wide>
        <div className={b.stage}>
          <LevelSheet trail={[{ label: "Floor", onPress: noop }, { label: "Board", onPress: noop }, { label: "Image", onPress: noop }]} here="Forge sweep-01" mode="board.cull" back="Floor" onClose={noop} specimen>
            <BoardDesk rail={<PacketRail packets={RAIL} current="pkt:forge:sweep-01" hrefOf={(id) => `/board/${encodeURIComponent(id)}`} onOpen={noop} />}>
              <MatrixCull packet={CULL} verdicts={CULL_VERDICTS} decide={noop} undo={noop} onCommit={noop} keys={false} />
            </BoardDesk>
          </LevelSheet>
        </div>
      </Spec>
      <Spec names={["VariantCard", "VerdictPick", "VideoBar"]} source="the opened run · a verdict by click · a clip's bar (2026-10-22)" wide>
        <div className={b.tiles}>
          <VariantCard index={0} words={words} media={{ url: "/presets/signal-ledger.jpg", mime: "image/jpeg" }} verdict={{ verdict: "keep", reasons: [] }} current nudged={false} reasons={STILL} onFocus={noop} onVerdict={noop} />
          <VariantCard index={1} words={words} media={{ url: "/presets/signal-ledger.jpg", mime: "image/jpeg" }} verdict={{ verdict: "reject", reasons: ["craft"] }} current={false} nudged={false} reasons={STILL} onFocus={noop} onVerdict={noop} />
          <VariantCard index={2} words={{ label: "clip · replica-1", meta: "5s · local · free" }} media={{ url: "/clips/presets/blueprint.webm", mime: "video/webm" }} verdict={undefined} current={false} nudged={false} reasons={STILL} onFocus={noop} onVerdict={noop} />
        </div>
      </Spec>
      <Spec names={["RunMosaic", "RunView", "WordsBody"]} source="a storyboard: one run, its frames then its words · the storyboards tab (spark scout-storyboards)" wide>
        <RunMosaic tab="storyboards" categories={[{ category: "storyboards", runs: [{ run: BOARD_RUN, at: 0 }] }]} cells={BOARD_CELLS} verdicts={{}} mediaOf={boardMedia} wordsOf={boardWords} runIx={0} nudged={new Set<number>()} onOpen={noop} grid={{ current: null }} />
        <RunView run={BOARD_RUN} cells={BOARD_CELLS} verdicts={{ "c-10/panel-3": { verdict: "reject", reasons: ["story"] } }} mediaOf={boardMedia} wordsOf={boardWords} cur={4} nudged={new Set<number>()} reasons={{ ...SCOUT, list: ["story", "generic", "use case"] }} onFocus={noop} onVerdict={noop} />
      </Spec>
      <Spec names={["VerdictPick", "Tip"]} source="a reason's meaning, on hover and focus (2026-10-23) · keys 2-4 on the first three (2026-10-24)" wide>
        <div className={b.pick}>
          <VerdictPick label="replica 2" verdict={{ verdict: "reject", reasons: ["craft"] }} reasons={SCOUT} onChange={noop} seededTip="use case" keyed />
        </div>
      </Spec>
      <Spec names={["IdeaList"]} source="words-only runs, decided in place (2026-10-22)" wide>
        <IdeaList
          categories={[{ category: "notes", runs: [{ run: { row: "n1", words: { id: "n1", label: "finding" }, members: [0], group: "notes" }, at: 0 }] }]}
          cells={[{ id: "n1/text", row: "n1" }]}
          verdicts={{}}
          wordsOf={() => ({ label: "Hold a wide shot until the subject settles, then cut.", prompt: "the push-in only reads once the figure stops moving", meta: "cinematic · 02-frames" })}
          cur={0}
          nudged={new Set<number>()}
          reasons={reasonVocabulary("suno")}
          onFocus={noop}
          onVerdict={noop}
        />
      </Spec>
      <Spec names={["CullTile", "Plate"]} source="index.html CullTile · .cur .keep .reject .nudge · audio take">
        <div className={b.tiles}>
          {(["keep", "reject", undefined] as const).map((v, i) => (
            <CullTile
              key={i}
              index={i}
              words={words}
              media={{ url: "/presets/signal-ledger.jpg", mime: "image/jpeg" }}
              verdict={v === undefined ? undefined : v === "keep" ? { verdict: "keep", reasons: [] } : { verdict: "reject", reasons: ["style", "craft"] }}
              current={cur === i}
              nudged={v === undefined}
              onPress={setCur}
            />
          ))}
        </div>
        <Row label="audio">
          <div className={b.tiles}>
            <CullTile index={9} words={AUDIO.present.items["take-1"] ?? { label: "take" }} media={{ url: "", mime: "audio/wav" }} verdict={undefined} current={false} nudged={false} playing onPress={noop} />
          </div>
        </Row>
        <Row label="text">
          <div className={b.tiles}>
            <CullTile index={10} words={FINDING} media={TEXT_MEDIA} verdict={undefined} current={cur === 10} nudged={false} onPress={setCur} />
            <CullTile index={11} words={WATCH} media={TEXT_MEDIA} verdict={{ verdict: "keep", reasons: [] }} current={cur === 11} nudged={false} onPress={setCur} />
          </div>
        </Row>
        <Row label="model">
          <div className={b.tiles}>
            <CullTile index={12} words={modelWords} media={modelMedia} verdict={undefined} current={cur === 12} nudged={false} onPress={setCur} />
            <CullTile index={13} words={{ label: MODEL.label, meta: MODEL.meta }} media={modelMedia} verdict={{ verdict: "keep", reasons: [] }} current={cur === 13} nudged={false} onPress={setCur} />
          </div>
        </Row>
        <Row label="plate">
          <Plate className={b.thumb} src="/presets/blueprint.jpg" alt="blueprint" />
        </Row>
      </Spec>
      <Spec names={["Zoom"]} source="index.html Zoom · the Z lens">
        <div className={b.lens}>
          <Zoom words={words} media={{ url: "/presets/signal-ledger.jpg", mime: "image/jpeg" }} verdict={{ verdict: "reject", reasons: ["style"] }} position="1/8" onClose={noop} specimen />
        </div>
        <div className={b.lens}>
          <Zoom words={FINDING} media={TEXT_MEDIA} verdict={undefined} position="7/9" onClose={noop} specimen />
        </div>
        <div className={b.lens} data-kit="model-zoom">
          <Zoom words={modelWords} media={modelMedia} verdict={undefined} position="3/4" onClose={noop} specimen />
        </div>
      </Spec>
      <Spec names={["ModelViewer"]} source="spark game-3d-assets · three + r3f, lazy · loading · failed · no poster">
        <div className={b.models}>
          <ModelViewer src={MODEL.glb} title={MODEL.label} tris={MODEL.tris} bones={MODEL.bones} {...(MODEL.poster === undefined ? {} : { poster: MODEL.poster })} />
          <ModelViewer src="data:model/gltf-binary;base64,AAAA" title="a damaged glb" />
        </div>
      </Spec>
      <Spec names={["DeskFrame", "OracleStrip", "CommitButton"]} source="floor.css .desk-top · .desk-foot · .commit .wait .refuse">
        <div className={b.frame}>
          <DeskFrame title="Strips triage 07" meta="strips · 2 concepts" marks={<OracleStrip oracle={{ passed: false, summary: "1 decode error", digest: "grader 3a9", fixture: true }} />} foot={<CommitButton mode="board.cull" waiting="3 undecided" refusals={1} onPress={noop} />}>
            <div className={k.row}>
              <StackBar kept={3} rejected={2} undecided={3} label="Strips triage 07" />
            </div>
          </DeskFrame>
        </div>
        <Row label="ready">
          <CommitButton mode="board.cull" refusals={0} onPress={noop} />
        </Row>
        <Row label="committing">
          <CommitButton mode="board.cull" refusals={0} busy onPress={noop} />
        </Row>
      </Spec>
      <Spec names={["BlindPair"]} source="index.html :575-622 · masked until the operator picks" wide>
        <div className={b.desk}>
          <BlindPair packet={PAIR} onPick={noop} undo={noop} onCommit={noop} keys={false} />
        </div>
      </Spec>
      <Spec names={["PacketReview", "ArticlePage", "EditNote", "ApproveSchedule"]} source="index.html :625-682 · § sections · edit plan" wide>
        <div className={b.desk}>
          <PacketReview packet={REVIEW} verdicts={{}} decide={noop} onCommit={noop} onSendPlan={noop} keys={false} nowMs={Date.parse("2026-10-17T12:00:00Z")} />
        </div>
        <Row label="note">
          <div className={b.note}>
            <EditNote onAttach={noop} directive="less_weight" text="cut the anecdote" onDirective={noop} onText={noop} section={2} focus={false} />
          </div>
        </Row>
      </Spec>
      <Spec names={["CutReview"]} source="index.html :685-725 · player · beats · notes" wide>
        <div className={b.desk}>
          <CutReview packet={CUT} decide={noop} onCommit={noop} keys={false} />
        </div>
      </Spec>
      <Spec names={["ConsequencePanel"]} source="decision 6 · the blast radius before the commit" wide>
        <ConsequencePanel consequence={CONSEQUENCE} refreshed onConfirm={noop} onCancel={noop} busy={false} specimen />
      </Spec>
    </Section>
  );
}
