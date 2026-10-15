// The desks' markup, rendered with react-dom/server: what a tile says aloud, that a blind pair
// draws no label and no machine pick before the operator's pick, that the commit button names
// what is still open, and that the consequence panel shows every outward act verbatim.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { Consequence, PacketView, PairView } from "@gt/domain/board";
import { parseAt } from "@gt/domain/door";
import { candidateIdSchema, packetIdSchema } from "@gt/domain/ids";
import { SOURCES } from "@gt/domain/source";
import type { Result } from "@gt/domain/errors";

import type { BoardPacket } from "../src/board/port.ts";
import { ConsequencePanel } from "../src/components/consequence/ConsequencePanel.tsx";
import { MatrixCull } from "../src/components/cull/MatrixCull.tsx";
import { railGroups } from "../src/components/desk/PacketRail.tsx";
import { BlindPair } from "../src/components/pair/BlindPair.tsx";

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw r.error;
  return r.value;
};
const cid = (s: string) => must(parseAt("test", candidateIdSchema, s));
const PID = must(parseAt("test", packetIdSchema, "pkt:test:1"));
const img = (id: string, row: string) => ({ id: cid(id), row, url: `/${id}.png`, media: { sha256: "0".repeat(64), bytes: 1, mime: "image/png" }, grades: [] });

function packet(over: Partial<PacketView>, present: BoardPacket["present"]): BoardPacket {
  const spec = SOURCES[over.source ?? "strips"];
  return {
    view: {
      id: PID,
      lane: "image",
      source: "strips",
      mode: "matrix-cull",
      state: "open",
      rev: 3,
      items: [],
      decisions: [],
      undecided: 0,
      canUndo: false,
      reasons: { list: spec.reasons, max: spec.maxReasons, noteMax: spec.noteMax },
      pairs: [],
      ...over,
    },
    present,
  };
}
const noop = () => undefined;

describe("the matrix cull", () => {
  const p = packet({ items: [img("a", "r"), img("b", "r")], title: "Strips 7" }, { items: { a: { label: "poster a" }, b: { label: "poster b" } }, rows: [{ id: "r", label: "concept a" }] });

  test("a decided tile says its verdict and reasons aloud; the commit button names what is open", () => {
    const html = renderToStaticMarkup(h(MatrixCull, { packet: p, verdicts: { a: { verdict: "reject", reasons: ["concept", "motion"] } }, decide: noop, undo: noop, onCommit: noop, keys: false }));
    expect(html).toContain('aria-label="poster a, reject: concept, motion"');
    expect(html).toContain('aria-label="poster b"');
    expect(html).toContain('aria-label="commit packet, 1 undecided"');
    expect(html).toContain(">concept<");
  });

  test("the key legend draws only the reason keys this source binds: four for a forge plate, none for Suno", () => {
    const keysOf = (html: string) => [...(/<span[^>]*>((?:<kbd[^>]*>[^<]*<\/kbd>)+) reason<\/span>/.exec(html)?.[1] ?? "").matchAll(/<kbd[^>]*>([^<]*)<\/kbd>/g)].map((m) => m[1]);
    const forge = packet({ source: "forge", items: [img("a", "r")] }, { items: {}, rows: [] });
    expect(keysOf(renderToStaticMarkup(h(MatrixCull, { packet: forge, verdicts: {}, decide: noop, undo: noop, onCommit: noop, keys: false })))).toEqual(["1", "2", "3", "4"]);
    const suno = packet({ source: "suno", lane: "audio", items: [img("a", "r")] }, { items: {}, rows: [] });
    expect(renderToStaticMarkup(h(MatrixCull, { packet: suno, verdicts: {}, decide: noop, undo: noop, onCommit: noop, keys: false }))).not.toContain(" reason</span>");
  });

  test("with nothing open the commit button waits for nothing", () => {
    const html = renderToStaticMarkup(h(MatrixCull, { packet: p, verdicts: { a: { verdict: "keep", reasons: [] }, b: { verdict: "keep", reasons: [] } }, decide: noop, undo: noop, onCommit: noop, keys: false }));
    expect(html).toContain('aria-label="commit packet"');
  });
});

describe("the blind pair", () => {
  const pairs: PairView[] = [{ row: "p1", a: cid("p1/a"), b: cid("p1/b"), outcome: null }];
  const p = packet({ source: "dojo", mode: "blind-pair", items: [img("p1/a", "p1"), img("p1/b", "p1")], pairs }, { items: {}, rows: [{ id: "p1", label: "pair 1" }], questions: { p1: "Which is lit?" } });

  test("before a pick: arms masked, no machine pick drawn, the question asked", () => {
    const html = renderToStaticMarkup(h(BlindPair, { packet: p, onPick: noop, undo: noop, onCommit: noop, keys: false }));
    expect(html).toContain("LEFT · ▒▒▒▒");
    expect(html).toContain("RIGHT · ▒▒▒▒");
    expect(html).not.toContain("machine pick<");
    expect(html).toContain("machine pick ▒▒ masked");
    expect(html).toContain("Which is lit?");
    expect(html).toContain('aria-label="commit packet, 1 left"');
  });
});

describe("the consequence panel", () => {
  const c: Consequence = {
    packetId: PID,
    rev: 4,
    counts: { kept: 1, rejected: 2, undecided: 0 },
    deletes: [{ target: "foundry-out/runs/r1/b.png", candidate: "b" }],
    writes: [{ kind: "index-row", target: "styles.json", candidate: "a" }],
    promotions: [{ target: "style Blueprint", detail: "candidate → proven" }],
    renames: [],
    nearDuplicates: [{ candidate: "a", of: "z", distance: 0.08 }],
    outward: [{ kind: "pull-request", sentence: "push branch article/retry-budgets to ai-registry and open a PR" }],
    v1Digest: "d",
    token: "abcdef0123456789",
  };

  test("every outward act verbatim, every delete by path, and the token it commits with", () => {
    const html = renderToStaticMarkup(h(ConsequencePanel, { consequence: c, refreshed: false, busy: false, onConfirm: noop, onCancel: noop, specimen: true }));
    expect(html).toContain("push branch article/retry-budgets to ai-registry and open a PR");
    expect(html).toContain("foundry-out/runs/r1/b.png · b");
    expect(html).toContain("index-row · styles.json · a");
    expect(html).toContain("a ≈ z · 0.08");
    expect(html).toContain("token abcdef012345");
    expect(html).not.toContain("moved · fresh preview");
  });

  test("a stale preview's replacement says it moved", () => {
    const html = renderToStaticMarkup(h(ConsequencePanel, { consequence: c, refreshed: true, busy: false, onConfirm: noop, onCancel: noop, specimen: true }));
    expect(html).toContain("moved · fresh preview");
  });
});

describe("the packet rail", () => {
  test("lanes in Floor order, desks within a lane, empty lanes left out", () => {
    const s = (id: string, lane: PacketView["lane"], mode: PacketView["mode"], state: PacketView["state"] = "open") => ({ id: must(parseAt("test", packetIdSchema, id)), lane, source: "forge" as const, mode, state, rev: 0, items: 2, decided: 0, openedAt: "2026-10-15T08:00:00.000Z" });
    const g = railGroups([s("pkt:x:3", "audio", "matrix-cull"), s("pkt:x:2", "image", "packet-review"), s("pkt:x:1", "image", "matrix-cull", "committed")]);
    expect(g.map((x) => [x.lane.id, x.open, x.packets.map((p) => p.id)])).toEqual([
      ["image", 1, ["pkt:x:1", "pkt:x:2"]],
      ["audio", 1, ["pkt:x:3"]],
    ]);
  });
});
