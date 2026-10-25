// A decided desk's foot must not claim `weir clear` when the rail failed to load
// (board-decision-desk): load.ts carries the store's sentence as railError and DecidedDesk draws
// it as an error line in place of the chip.
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PacketView } from "@gt/domain/board";
import { parseAt } from "@gt/domain/door";
import { packetIdSchema } from "@gt/domain/ids";
import { reasonVocabulary } from "@gt/domain/source";
import type { BoardPacket } from "@gt/ui/board/port";

import { DecidedDesk } from "../../app/(studio)/board/_board/DecidedDesk.tsx";

const id = parseAt("test", packetIdSchema, "pkt:test:1");
if (!id.ok) throw id.error;

const view: PacketView = {
  id: id.value,
  lane: "image",
  source: "strips",
  mode: "matrix-cull",
  state: "committed",
  rev: 4,
  items: [],
  decisions: [],
  undecided: 0,
  canUndo: false,
  reasons: reasonVocabulary("strips"),
  pairs: [],
};
const packet: BoardPacket = { view, present: { items: {}, rows: [] } };
const draw = (railError?: string): string =>
  renderToStaticMarkup(h(DecidedDesk, { packet, next: undefined, onNext: () => undefined, ...(railError === undefined ? {} : { railError }) }));
const code = (rel: string): string => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("the decided desk's foot", () => {
  it("says the Weir is clear when the rail read and holds nothing", () => {
    expect(draw()).toContain("weir clear");
  });
  it("says why, not `weir clear`, when the rail would not read", () => {
    const html = draw("board rail: the store is locked");
    expect(html).toContain("board rail: the store is locked");
    expect(html).not.toContain("weir clear");
  });
  it("loadBoard carries the rail's failure to the page", () => {
    expect(code("../../app/(studio)/board/_board/load.ts")).toMatch(/list\.ok \? \{\} : \{ railError:/);
  });
});
