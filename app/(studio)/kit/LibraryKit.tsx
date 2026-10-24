"use client";

// THE LIBRARY'S PARTS, live (Phase 5, L50): the rail with its kinds and folds, the grid tile in
// each face it draws (picture, poster, waveform, paper, swatch, designed face, a slot not yet
// fetched, a media problem), the list row with its column head, the detail panel's parts and the
// set summary. A client island because each part takes callbacks and does what it shows: a facet
// presses, a fold folds, a tile selects. The words are the fixture library's
// (app/(studio)/library/_port/fixtureData.ts), so a specimen has the length of real work.
// The `data-role` wrappers are the style contract's hooks (docs/next/style-contract/roles.library.json).

import { useState } from "react";

import { DetailChips, DetailFacets, DetailPanel, DetailPreview, DetailSection, DetailTitle } from "@gt/ui/components/library/DetailPanel.tsx";
import { FaceView, type Face } from "@gt/ui/components/library/Face.tsx";
import { LibraryGlyph, KINDS } from "@gt/ui/components/library/LibraryGlyph.tsx";
import { ColumnsHead, LibraryColumns, LibraryRow, RowList } from "@gt/ui/components/library/LibraryRow.tsx";
import { LibraryTile, TileGrid, TileSlot, type LibraryCard } from "@gt/ui/components/library/LibraryTile.tsx";
import { Lineage } from "@gt/ui/components/library/Lineage.tsx";
import { LookStrip, type LookThumb } from "@gt/ui/components/library/LookStrip.tsx";
import { FacetGroup, Rail, type RailGroup } from "@gt/ui/components/library/Rail.tsx";
import { SetSummary } from "@gt/ui/components/library/SetSummary.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { StatusPill } from "@gt/ui/components/status/StatusPill.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";

import { Row, Section, Spec } from "./Spec.tsx";
import k from "./kit.module.css";

const card = (id: string, over: Partial<LibraryCard> & Pick<LibraryCard, "kind" | "title" | "face">): LibraryCard => ({ id, meta: "", state: "unjudged", source: "fixture", date: "2026-10-12", chips: [], ...over });

const CARDS: readonly LibraryCard[] = [
  card("image-0001", { kind: "image", title: "The exit · frame 0546", meta: "import · the-exit", state: "reference", face: { kind: "image", url: "/deck-art/template-cinematic.webp" }, chips: ["the exit", "deck-art"] }),
  card("plate-0256", { kind: "plate", title: "Chalk Argument · build key flip", meta: "prompt-only · s450", state: "ratified", face: { kind: "image", url: "/presets/chalk-argument.jpg" }, chips: ["hand made", "chalk", "dojo"] }),
  card("style-0006", { kind: "style", title: "Data Neon", meta: "graphic · extracted", state: "ratified", locked: true, face: { kind: "image", url: "/presets/data-neon.jpg" }, chips: ["graphic", "flat vector", "saturated vivid"] }),
  card("style-0008", { kind: "style", title: "Glass Harbor", meta: "cinematic · readback", state: "candidate", face: { kind: "swatch", name: "Glass Harbor", sub: "photoreal · complementary split", palette: ["#6a2d1f", "#1f5a43"] }, chips: ["cinematic", "photoreal"] }),
  card("audio-0457", { kind: "audio", title: "Melancholic risers · take 8", meta: "0:02", state: "ratified", source: "derived", face: { kind: "wave", peaks: Array.from({ length: 48 }, (_, i) => 0.25 + 0.7 * Math.abs(Math.sin(i * 0.41) * Math.cos(i * 0.13))) }, chips: ["melancholic", "sfx"] }),
  card("doc-0017", { kind: "doc", title: "Czech · note 17", meta: "localization · 17 techniques", state: "reference", date: null, face: { kind: "paper", title: "Czech · note 17", foot: "localization" }, chips: ["localization", "16+"] }),
  card("motion-0031", { kind: "motion", title: "Physics · E42 · clip", meta: "webm · edu-physics", face: { kind: "poster", url: "/clips/presets/blueprint.jpg", video: "/clips/presets/blueprint.webm" }, chips: ["physics", "clip"] }),
  card("character-0002", { kind: "character", title: "Sofia", meta: "aged 29 · slim build · 2 looks", state: "ratified", face: { kind: "image", url: "/presets/paper-relief.jpg" }, chips: ["under 30", "slim", "dating sim"] }),
  card("video-0003", { kind: "video", title: "Peak and Fall · ad spot 8", meta: "video-0003 · captions vtt", state: "rejected", attention: "unreadable", face: { kind: "designed", lead: "video", name: "Peak and Fall · ad spot 8", tail: "video-0003 · captions vtt", palette: ["#6a4220", "#1d3d63"] }, chips: ["ad", "vtt"] }),
];

const LOOKS: readonly LookThumb[] = [
  { key: "risograph-two-colour", image: "/presets/paper-relief.jpg", label: "risograph-two-colour", sub: "risograph two-colour print" },
  { key: "35mm-anamorphic", image: "/presets/newsprint-cutout.jpg", label: "35mm-anamorphic", sub: "ultra-photoreal portrait" },
  { key: "2026-10-23-2", image: "/presets/chalk-argument.jpg", label: "2026-10-23-2", sub: "ultra-photoreal portrait", inert: true },
];

const v = (value: string, count: number, selected = false) => ({ value, label: value.replace(/-/g, " "), count, selected });
const GROUPS: readonly RailGroup[] = [
  { key: "genre", label: "genre", section: "vocabulary", values: [v("industrial", 146), v("lo-fi", 137, true), v("trip-hop", 131), v("orchestral", 125), v("synthwave", 122), v("ambient", 111), v("drone", 64), v("breakbeat", 33), v("choral", 21), v("glitch", 9), v("dub", 0, true)] },
  { key: "mood", label: "mood", section: "vocabulary", values: [v("tense", 262), v("playful", 251), v("melancholic", 244)] },
  { key: "attention", label: "attention", section: "attention", values: [{ value: "missing", label: "media missing", count: 3, selected: false }] },
  { key: "state", label: "state", section: "state", values: [v("ratified", 312), v("rejected", 401), v("unjudged", 375)] },
  { key: "project", label: "projects", section: "collections", values: [{ value: "prj-night-drive", label: "Night Drive · album video", count: 40, selected: false }] },
  { key: "source", label: "source", section: "origin", values: [v("fixture", 1013), v("derived", 112)] },
];

const LINEAGE = [
  { role: "run", refs: [{ kind: "facet" as const, group: "run", value: "2026-09-01-dojo-cycle-7", label: "2026-09-01-dojo-cycle-7", ledger: "/ledger?q=2026-09-01-dojo-cycle-7", mono: true }] },
  { role: "this", self: true, refs: [{ kind: "text" as const, label: "plate" }] },
  { role: "style", refs: [{ kind: "item" as const, id: "style-0004", label: "Chalk Argument", itemKind: "style" as const, thumb: "/presets/chalk-argument.jpg" }, { kind: "text" as const, label: "not in catalogue", ghost: true }] },
  { role: "lesson", refs: [{ kind: "facet" as const, group: "lesson", value: "build-key-flip", label: "build key flip" }] },
];

export function LibrarySection() {
  const [sel, setSel] = useState("plate-0256");
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("audio");
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set(["mood"]));
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [pressed, setPressed] = useState(false);
  const [look, setLook] = useState("35mm-anamorphic");
  const face: Face = { kind: "image", url: "/presets/chalk-argument.jpg" };
  return (
    <Section id="library">
      <Spec names={["Rail", "FacetGroup", "LibraryGlyph"]} source="library/Rail.tsx">
        <div className={k.frame} data-role="lib-rail" style={{ ["--frame" as string]: "17em" }}>
          <Rail
            kind={kind}
            kindCounts={{ all: 4875, image: 850, plate: 1841, style: 9, motion: 350, audio: 1125, video: 150, doc: 0 }}
            groups={GROUPS}
            closed={closed}
            expanded={expanded}
            onKind={setKind}
            onToggle={() => {}}
            onFold={(g, open) => setClosed((x) => (open ? new Set([...x].filter((y) => y !== g)) : new Set(x).add(g)))}
            onMore={(g, all) => setExpanded((x) => (all ? new Set(x).add(g) : new Set([...x].filter((y) => y !== g))))}
          />
        </div>
        <Row label="kinds">
          {KINDS.map((x) => (
            <span key={x.id} className={k.glyphCell} role="img" aria-label={x.label}>
              <LibraryGlyph name={x.id} className={k.glyph} />
            </span>
          ))}
        </Row>
        <div data-role="lib-fold" className={k.frame} style={{ ["--frame" as string]: "17em" }}>
          <FacetGroup g={{ key: "aspect", label: "aspect", section: "vocabulary", values: [v("16:9", 425), v("3:2", 425)] }} open all={false} onToggle={() => {}} onFold={() => {}} onMore={() => {}} />
        </div>
      </Spec>
      <Spec names={["LibraryTile", "TileGrid", "TileSlot"]} source="library/LibraryTile.tsx" wide>
        <div data-role="lib-tiles">
          <TileGrid width={1100} density="m" padTop={0} padBottom={0}>
            {CARDS.map((c, i) => (
              <LibraryTile key={c.id} card={c} selected={c.id === sel} domId={`kit-tile-${i}`} onSelect={() => setSel(c.id)} onOpen={() => setSel(c.id)} />
            ))}
            <TileSlot />
          </TileGrid>
        </div>
        <Row label="s · l">
          <div style={{ width: "34em" }}>
            <TileGrid width={520} density="s" padTop={0} padBottom={0}>
              {CARDS.slice(0, 3).map((c, i) => (
                <LibraryTile key={c.id} card={c} selected={false} domId={`kit-tile-s-${i}`} onSelect={() => setSel(c.id)} onOpen={() => {}} />
              ))}
            </TileGrid>
          </div>
        </Row>
      </Spec>
      <Spec names={["LibraryRow", "LibraryColumns", "ColumnsHead", "RowList"]} source="library/LibraryRow.tsx" wide>
        <div data-role="lib-rows" role="listbox" aria-label="library rows">
          <ColumnsHead density="m" />
          <RowList density="m" padTop={0} padBottom={0}>
            {CARDS.map((c, i) => (
              <LibraryRow key={c.id} card={c} selected={c.id === sel} domId={`kit-row-${i}`} onSelect={() => setSel(c.id)} onOpen={() => setSel(c.id)} />
            ))}
          </RowList>
        </div>
        <div aria-hidden="true" className={k.frame}>
          <LibraryColumns />
        </div>
      </Spec>
      <Spec names={["DetailPanel", "DetailPreview", "DetailTitle", "DetailChips", "DetailSection", "DetailFacets", "Lineage"]} source="library/DetailPanel.tsx" wide>
        <div className={k.frame} data-role="lib-detail" style={{ ["--frame" as string]: "25em", height: "52em" }}>
          <DetailPanel kind="plate" position={{ index: 0, total: 59 }} onStep={() => {}} onClose={() => {}}>
            <DetailPreview face={face} title="Chalk Argument · build key flip" />
            <DetailTitle title="Chalk Argument · build key flip" id="plate-0256" date="2026-10-12" />
            <DetailChips>
              <Chip label="plate" />
              <StatusPill machine="library" state="ratified" />
              <SourceTag kind="fixture" />
              <Chip label="dojo" casing="lower" />
            </DetailChips>
            <DetailSection title="Facets">
              <DetailFacets
                lines={[
                  { group: "style", label: "style", values: [{ value: "chalk-argument", label: "Chalk Argument", pressed }] },
                  { group: "station", label: "station", values: [{ value: "dojo", label: "dojo", pressed: true }] },
                ]}
                onPress={() => setPressed((x) => !x)}
              />
            </DetailSection>
            <DetailSection title="Lineage">
              <div data-role="lib-lineage">
                <Lineage nodes={LINEAGE} onItem={() => {}} onFacet={() => {}} />
              </div>
            </DetailSection>
          </DetailPanel>
        </div>
      </Spec>
      <Spec names={["SetSummary"]} source="library/SetSummary.tsx" wide>
        <div className={k.frame} style={{ ["--frame" as string]: "25em" }}>
          <SetSummary
            total={4875}
            of={4875}
            kind="all"
            states={{ reference: 1400, candidate: 3, ratified: 961, rejected: 1132, unjudged: 1379 }}
            kinds={{ image: 850, plate: 1841, style: 9, motion: 350, audio: 1125, video: 150, doc: 550 }}
            newest={CARDS.flatMap((c) => (c.face.kind === "image" ? [{ id: c.id, title: c.title, url: c.face.url }] : []))}
            onState={() => {}}
            onKind={setKind}
            onItem={setSel}
          />
        </div>
      </Spec>
      <Spec names={["LookStrip"]} source="library/LookStrip.tsx" wide>
        <Row label="doors · figure">
          <div data-role="lib-looks" style={{ width: "25em" }}>
            <LookStrip looks={LOOKS.map((l) => (l.key === look ? { ...l, pressed: true } : l))} onPress={(key) => setLook((x) => (x === key ? "" : key))} />
          </div>
        </Row>
      </Spec>
      <Spec names={["FaceView"]} source="library/Face.tsx" wide>
        <Row label="preview">
          <div style={{ position: "relative", width: "25em", aspectRatio: "16 / 10", overflow: "hidden", borderRadius: "var(--r)" }}>
            <FaceView face={{ kind: "designed", lead: "video", name: "Peak and Fall · ad spot 8", tail: "captions vtt", palette: ["#6a4220", "#1d3d63"] }} size="preview" />
          </div>
        </Row>
      </Spec>
    </Section>
  );
}
