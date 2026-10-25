// The desks' markup, rendered with react-dom/server: what a tile says aloud, that a blind pair
// draws no label and no machine pick before the operator's pick, that the commit button names
// what is still open, and that the consequence panel shows every outward act verbatim.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { Consequence, PacketView, PairView } from "@gt/domain/board";
import { parseAt } from "@gt/domain/door";
import { candidateIdSchema, packetIdSchema } from "@gt/domain/ids";
import { MEDIA_LANES } from "@gt/domain/lane";
import { reasonVocabulary } from "@gt/domain/source";
import type { Result } from "@gt/domain/errors";

import type { BoardPacket } from "../src/board/port.ts";
import { ConsequencePanel } from "../src/components/consequence/ConsequencePanel.tsx";
import { cullFacts } from "../src/components/cull/CullFoot.tsx";
import { SeriesBadge } from "../src/components/cull/SeriesBadge.tsx";
import { IdeaList } from "../src/components/cull/IdeaList.tsx";
import { MatrixCull } from "../src/components/cull/MatrixCull.tsx";
import { VariantCard } from "../src/components/cull/VariantCard.tsx";
import { beatNote, CutReview, withNote } from "../src/components/cut/CutReview.tsx";
import { CommitButton } from "../src/components/desk/Desk.tsx";
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
      reasons: reasonVocabulary(over.source ?? "strips"),
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
    // A variant in the opened run: its verdict spoken in its name, and decided by click - keep and
    // reject as pressed buttons, the source's reasons as toggles once rejected.
    const card = (v?: { verdict: "keep" | "reject"; reasons: string[] }) =>
      renderToStaticMarkup(h(VariantCard, { index: 0, words: { label: "poster a" }, media: { url: "/a.png", mime: "image/png" }, verdict: v, current: false, nudged: false, reasons: reasonVocabulary("strips"), onFocus: noop, onVerdict: noop }));
    const rejected = card({ verdict: "reject", reasons: ["concept", "motion"] });
    expect(rejected).toContain('aria-label="poster a, reject: concept, motion"');
    expect(rejected).toMatch(/aria-pressed="true"[^>]*>(<span[^>]*><\/span>)?reject/);
    expect(rejected).toMatch(/aria-pressed="true"[^>]*>concept</);
    expect(rejected).toMatch(/aria-pressed="false"[^>]*>legibility</);
    expect(card()).not.toContain(">concept<");
    // The whole packet's bar still names what is open.
    const html = renderToStaticMarkup(h(MatrixCull, { packet: p, verdicts: { a: { verdict: "reject", reasons: ["concept"] } }, decide: noop, undo: noop, onCommit: noop, keys: false }));
    expect(html).toContain('aria-label="commit packet, 1 undecided"');
  });

  test("words-only runs are decided in place, in the ideas list", () => {
    const run = { row: "r1", words: { id: "r1", label: "finding" }, members: [0], group: "notes" };
    const html = renderToStaticMarkup(
      h(IdeaList, {
        categories: [{ category: "notes", runs: [{ run, at: 0 }] }],
        cells: [{ id: "c1", row: "r1" }],
        verdicts: { c1: { verdict: "keep", reasons: [] } },
        wordsOf: () => ({ label: "Hold the wide until the subject settles.", prompt: "the push-in reads once the figure stops", meta: "cinematic · 02-frames" }),
        cur: 0,
        nudged: new Set<number>(),
        reasons: reasonVocabulary("suno"),
        onFocus: noop,
        onVerdict: noop,
      }),
    );
    expect(html).toContain("Hold the wide until the subject settles.");
    expect(html).toContain('aria-label="Hold the wide until the subject settles. cinematic · 02-frames, keep"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>(<span[^>]*><\/span>)?keep/);
  });

  test("the key legend draws only the reason keys that name a reason: 2-4 for a forge plate, none for Suno", () => {
    // A reason cap is wrapped in its tip (Tip): unwrap it, and drop the tip's words, to read the row.
    const bare = (html: string) => html.replace(/<span[^>]*role="tooltip"[^>]*>.*?<\/span>/g, "").replace(/<span class="[^"]*"[^>]*>(<kbd[^>]*>[^<]*<\/kbd>)<\/span>/g, "$1");
    const keysOf = (html: string) => [...(/<span[^>]*>((?:<kbd[^>]*>[^<]*<\/kbd>)+) reason<\/span>/.exec(bare(html))?.[1] ?? "").matchAll(/<kbd[^>]*>([^<]*)<\/kbd>/g)].map((m) => m[1]);
    const forge = packet({ source: "forge", items: [img("a", "r")] }, { items: {}, rows: [] });
    expect(keysOf(renderToStaticMarkup(h(MatrixCull, { packet: forge, verdicts: {}, decide: noop, undo: noop, onCommit: noop, keys: false })))).toEqual(["2", "3", "4"]);
    const suno = packet({ source: "suno", lane: "audio", items: [img("a", "r")] }, { items: {}, rows: [] });
    expect(renderToStaticMarkup(h(MatrixCull, { packet: suno, verdicts: {}, decide: noop, undo: noop, onCommit: noop, keys: false }))).not.toContain(" reason</span>");
  });

  test("the legend draws the keys the desk answers: an audio packet draws no Space play and no M spawn MV", () => {
    // useRunDesk binds no `play` and no `spawn-mv`, and arms its keys with the facts cullFacts names:
    // the legend reads the same facts, so it cannot draw a key that does nothing.
    const suno = packet({ source: "suno", lane: "audio", items: [img("a", "r")] }, { items: {}, rows: [] });
    const html = renderToStaticMarkup(h(MatrixCull, { packet: suno, verdicts: {}, decide: noop, undo: noop, onCommit: noop, keys: false }));
    expect(html).not.toContain("spawn MV");
    expect(html).not.toMatch(/<kbd[^>]*>Space<\/kbd>/);
    expect(html).toMatch(/<kbd[^>]*>1<\/kbd>/);
    expect(cullFacts({ noteMax: 0 })).toEqual([]);
    expect(cullFacts({ noteMax: 120 })).toEqual(["notes"]);
  });

  test("the mosaic files the run under its category and says how much of it is decided", () => {
    const html = renderToStaticMarkup(h(MatrixCull, { packet: p, verdicts: { a: { verdict: "reject", reasons: ["concept"] } }, decide: noop, undo: noop, onCommit: noop, keys: false }));
    expect(html).toContain('aria-label="art styles, 1 run"');
    expect(html).toContain('aria-label="concept a, 2 variants, 1 decided"');
    expect(html).toContain('aria-label="commit packet, 1 undecided"');
  });

  test("with nothing open the commit button waits for nothing", () => {
    const html = renderToStaticMarkup(h(MatrixCull, { packet: p, verdicts: { a: { verdict: "keep", reasons: [] }, b: { verdict: "keep", reasons: [] } }, decide: noop, undo: noop, onCommit: noop, keys: false }));
    expect(html).toContain('aria-label="commit packet"');
  });
});

describe("the commit button", () => {
  // A refused press replays the shake. A changed `key` would replay it by REMOUNTING the button,
  // and the node holding focus would be destroyed: a keyboard press refused drops focus to the
  // document (registry accessibility/keyboard-navigation-models). The button keeps its identity
  // across refusals and restarts the animation by alternating its class instead.
  type Btn = { readonly key: string | null; readonly props: { readonly className: string } };
  const at = (refusals: number) => CommitButton({ mode: "board.cull", waiting: "3 undecided", refusals, onPress: noop }) as unknown as Btn;

  test("a refusal replays the shake without remounting the button", () => {
    expect([0, 1, 2, 3].map((n) => at(n).key)).toEqual([null, null, null, null]);
    expect(at(0).props.className).not.toMatch(/refuse/);
    expect(at(1).props.className).toMatch(/refuse/);
    expect(at(2).props.className).toMatch(/refuse/);
    expect(at(1).props.className).not.toBe(at(2).props.className);
    expect(at(1).props.className).toBe(at(3).props.className);
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

describe("the cut review", () => {
  test("a beat's note is set by its words and taken back by a blank one, as a cull note is", () => {
    const noted = withNote({}, 1, "  tighter  ");
    expect(noted).toEqual({ 1: "tighter" });
    expect(withNote(noted, 1, "   ")).toEqual({});
    expect(withNote(noted, 0, "")).toEqual({ 1: "tighter" });
    expect(beatNote([{ t0: 0 }, { t0: 4.2 }], withNote(noted, 1, " "))).toBeUndefined();
    expect(beatNote([{ t0: 0 }, { t0: 4.2 }], noted)).toBe("beat 2 (0:04): tighter");
  });

  const cut = packet(
    { source: "step", mode: "packet-review", lane: "video", items: [{ ...img("c", "cut"), media: { sha256: "0".repeat(64), bytes: 1, mime: "video/mp4" } }] },
    { items: {}, rows: [], cut: { video: "/c.mp4", beats: [{ t0: 0, t1: 3, text: "the record high" }, { t0: 3, t1: 6, text: "half of it gone" }], channels: [] } },
  );
  const review = (busy: boolean) => renderToStaticMarkup(h(CutReview, { packet: cut, decide: noop, onCommit: noop, busy, keys: false }));

  test("a verdict in flight draws its buttons disabled, as the proof sheet's do", () => {
    const disabled = (html: string) => html.split('aria-disabled="true"').length - 1;
    expect(disabled(review(true))).toBe(2);
    expect(disabled(review(false))).toBe(0);
  });

  test("the beat under the cursor is named to a screen reader, not only tinted", () => {
    const html = review(false);
    expect(html.split('aria-current="true"').length - 1).toBe(1);
    expect(html).toMatch(/aria-current="true"[^>]*><span[^>]*>0:00–0:03<\/span>/);
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

  test("a preview that failed to read says why, and no longer says it is reading", () => {
    const html = renderToStaticMarkup(h(ConsequencePanel, { consequence: null, refreshed: false, busy: false, error: "could not prepare the commit plan", onConfirm: noop, onCancel: noop, specimen: true }));
    expect(html).toContain("could not prepare the commit plan");
    expect(html).not.toContain("reading the consequence");
    expect(html).not.toContain('aria-busy="true"');
  });

  test("a preview still reading says so", () => {
    const html = renderToStaticMarkup(h(ConsequencePanel, { consequence: null, refreshed: false, busy: true, onConfirm: noop, onCancel: noop, specimen: true }));
    expect(html).toContain("reading the consequence");
    expect(html).toContain('aria-busy="true"');
  });

  test("the button says Committing only for a commit, not while the preview reads", () => {
    const reading = renderToStaticMarkup(h(ConsequencePanel, { consequence: null, refreshed: false, busy: true, onConfirm: noop, onCancel: noop, specimen: true }));
    expect(reading).not.toContain("Committing");
    const committing = renderToStaticMarkup(h(ConsequencePanel, { consequence: c, refreshed: false, busy: true, onConfirm: noop, onCancel: noop, specimen: true }));
    expect(committing).toContain("Committing");
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

  test("every media lane the domain names has a rail group: the rail's own list is not the ground truth", () => {
    const g = railGroups(MEDIA_LANES.map((lane, i) => ({ id: must(parseAt("test", packetIdSchema, `pkt:x:${i}`)), lane, source: "forge" as const, mode: "matrix-cull" as const, state: "open" as const, rev: 0, items: 1, decided: 0, openedAt: "2026-10-15T08:00:00.000Z" })));
    expect(g.map((x) => x.lane.id)).toEqual([...MEDIA_LANES]);
  });
});

describe("the series badge", () => {
  test("a series mismatch is drawn with both series named; a match draws nothing", () => {
    const html = renderToStaticMarkup(h(SeriesBadge, { measured: "qwen3-vl@d2", graded: ["qwen3-vl@d1"] }));
    expect(html).toContain("qwen3-vl@d1");
    expect(html).toContain("calibration measured on qwen3-vl@d2");
    expect(renderToStaticMarkup(h(SeriesBadge, { measured: "qwen3-vl@d2", graded: [] }))).toBe("");
  });

  test("the matrix cull draws it when the packet names a mismatch", () => {
    const base = packet({ items: [{ ...img("a", "r") }] }, { items: {}, rows: [{ id: "r", label: "r" }] });
    const props = { verdicts: {}, decide: () => undefined, undo: () => undefined, onCommit: () => undefined, keys: false };
    const marked = renderToStaticMarkup(h(MatrixCull, { ...props, packet: { ...base, present: { ...base.present, series: { measured: "m@2", graded: ["m@1"] } } } }));
    const clean = renderToStaticMarkup(h(MatrixCull, { ...props, packet: base }));
    expect(marked).toContain("grades from m@1");
    expect(clean).not.toContain("grades from");
  });
});
