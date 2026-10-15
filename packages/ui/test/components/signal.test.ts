// The signal components' markup: roles, the spoken channel, and the class each variant maps
// to. Rendered with react-dom/server (Vitest runs without a DOM).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Chip } from "../../src/components/chip/Chip.tsx";
import chip from "../../src/components/chip/Chip.module.css";
import { TONES } from "../../src/components/chip/tone.ts";
import { Tally } from "../../src/components/tally/Tally.tsx";
import { StackBar, stackWeights } from "../../src/components/stackbar/StackBar.tsx";
import { PipRow, pipClasses } from "../../src/components/piprow/PipRow.tsx";
import pip from "../../src/components/piprow/PipRow.module.css";
import { SourceTag } from "../../src/components/source/SourceTag.tsx";
import src from "../../src/components/source/SourceTag.module.css";
import { ChannelBadge } from "../../src/components/channel/ChannelBadge.tsx";
import { Ghost } from "../../src/components/ghost/Ghost.tsx";
import { UpstreamBreak, nodeStates } from "../../src/components/upstream/UpstreamBreak.tsx";
import ub from "../../src/components/upstream/UpstreamBreak.module.css";
import { Provenance } from "../../src/components/provenance/Provenance.tsx";
import { ErrorLine } from "../../src/components/errorline/ErrorLine.tsx";
import { LedgerLink } from "../../src/components/ledgerlink/LedgerLink.tsx";
import { waveBars } from "../../src/components/wave/wave.ts";
import { Wave } from "../../src/components/wave/Wave.tsx";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(el);
const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;

describe("Chip", () => {
  test.each(TONES.filter((t) => t !== "neutral"))("tone %s maps to its class", (t) => {
    expect(html(h(Chip, { label: "x", tone: t }))).toContain(`class="${chip.chip} ${chip[t]}"`);
  });

  test("neutral carries no tone class; ghost, lower and door are their own bits", () => {
    expect(html(h(Chip, { label: "x" }))).toBe(`<span class="${chip.chip}">x</span>`);
    expect(html(h(Chip, { label: "x", ghost: true, casing: "lower" }))).toContain(`${chip.ghost} ${chip.lower}`);
  });

  test("a chip with onPress is a button with its pressed state; with href, a link", () => {
    const b = html(h(Chip, { label: "missed", value: 2, onPress: () => {}, pressed: true }));
    expect(b).toMatch(/^<button type="button" class="[^"]*" aria-pressed="true">missed<b[^>]*>2<\/b><\/button>$/);
    expect(html(h(Chip, { label: "ledger", href: "/ledger" }))).toMatch(/^<a class="[^"]*" href="\/ledger">/);
  });
});

describe("Tally", () => {
  test("the numerals and label are hidden and a sentence is spoken (12/36 is not 'twelve slash')", () => {
    const t = html(h(Tally, { value: 12, of: 36, label: "kept" }));
    expect(t).toContain(`<span aria-hidden="true">12/36</span>`);
    expect(t).toMatch(/<small [^>]*aria-hidden="true">kept<\/small>/);
    expect(t).toMatch(/>kept 12 of 36<\/span><\/span>$/);
  });

  test("a bare count speaks the count", () => {
    expect(html(h(Tally, { value: 20 }))).toMatch(/>20<\/span><\/span>$/);
  });
});

describe("StackBar", () => {
  test("one image, one name, three weighted segments", () => {
    const s = html(h(StackBar, { kept: 6, rejected: 5, undecided: 9, label: "sweep-01" }));
    expect(s).toContain(`role="img" aria-label="sweep-01 kept 6, rejected 5, undecided 9"`);
    expect(count(s, /<i /g)).toBe(3);
    expect(s).toContain("--n:6");
  });

  test("an untouched pile is whole-hatched; a decided one has no hatch", () => {
    expect(stackWeights({ kept: 0, rejected: 0, undecided: 0 })).toEqual([0, 0, 1]);
    expect(stackWeights({ kept: 8, rejected: 12, undecided: 0 })).toEqual([8, 12, 0]);
  });
});

describe("PipRow", () => {
  test("looks map to the design's pips; capacity draws bare pips", () => {
    expect(pipClasses({ looks: ["done", "running", "paused", "failed", "awaiting"], max: 7 })).toEqual(["done", "running", "idle", "failed", "awaiting", "bare", "bare"]);
  });

  test("the row is one named image and every pip is hidden", () => {
    const r = html(h(PipRow, { looks: ["done", "awaiting"], label: "1 of 2 shipped" }));
    expect(r).toMatch(/^<span class="[^"]*" role="img" aria-label="1 of 2 shipped">/);
    expect(count(r, /aria-hidden="true"/g)).toBe(2);
    expect(r).toContain(`${pip.pip} ${pip.done}`);
  });
});

describe("SourceTag, ChannelBadge, Ghost, ErrorLine, LedgerLink", () => {
  test("only real and illustrative carry a look; the kind is the text", () => {
    expect(html(h(SourceTag, { kind: "real" }))).toBe(`<span class="${src.src} ${src.real}">real</span>`);
    expect(html(h(SourceTag, { kind: "fixture" }))).toBe(`<span class="${src.src}">fixture</span>`);
  });

  test("a channel's two letters are hidden and its name is spoken", () => {
    const c = html(h(ChannelBadge, { channel: "youtube" }));
    expect(c).toContain(`<span aria-hidden="true">YT</span>`);
    expect(c).toContain(">youtube</span>");
  });

  test("a ghost draws its outlines hidden and speaks its label", () => {
    const g = html(h(Ghost, { count: 3, label: "no projects yet" }));
    expect(count(g, /aria-hidden="true"/g)).toBe(3);
    expect(g).toContain(">no projects yet</span>");
  });

  test("an error is verbatim, and alerts only when it arrives", () => {
    const msg = "publish · upload · OAuth token expired (401)";
    expect(html(h(ErrorLine, { message: msg }))).not.toContain("role=");
    expect(html(h(ErrorLine, { message: msg, live: true }))).toContain(`role="alert"`);
    expect(html(h(ErrorLine, { message: msg }))).toContain(`<span>${msg}</span>`);
  });

  test("a ledger link names its subject", () => {
    expect(html(h(LedgerLink, { href: "/ledger?q=pkt", subject: "pkt_audio" }))).toContain(`aria-label="ledger events for pkt_audio"`);
  });
});

describe("UpstreamBreak", () => {
  test("nodes before the break are done, the break is drawn, the rest unreached", () => {
    expect(nodeStates(["scheduled", "auth", "upload", "live"], 1)).toEqual(["done", "broke", "unreached", "unreached"]);
    const u = html(h(UpstreamBreak, { steps: ["scheduled", "auth", "upload", "live"], brokeAt: 1, detail: "OAuth token expired" }));
    expect(count(u, /role="listitem"/g)).toBe(4);
    expect(count(u, new RegExp(`class="${ub.link}"`, "g"))).toBe(1);
    expect(count(u, new RegExp(`class="${ub.link} ${ub.off}"`, "g"))).toBe(2);
    expect(u).toContain(`${ub.node} ${ub.brk}`);
    expect(u).toContain(">, broke</span>");
    expect(u).toContain(">OAuth token expired</div>");
  });
});

describe("Provenance", () => {
  test("fixed order, verbatim values, each chip named by its field", () => {
    const p = html(h(Provenance, { cost: "$0.04", model: "gpt-image-2", run: "r-17" }));
    expect([...p.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1])).toEqual(["model gpt-image-2", "run r-17", "cost $0.04"]);
  });

  test("an empty record renders nothing, not 'unknown'", () => {
    expect(html(h(Provenance, {}))).toBe("");
  });
});

describe("Wave", () => {
  test("one bar per peak, centred, floored at 1.5 tall, dimmed past the playhead", () => {
    const bars = waveBars([1, 0, 0.5, 0.5], 40, 34, 0.5);
    expect(bars.map((b) => b.x)).toEqual([0, 10, 20, 30]);
    expect(bars[0]).toEqual({ x: 0, y: 1, w: 9, h: 32, played: true });
    expect(bars[1]?.h).toBe(1.5);
    expect(bars.map((b) => b.played)).toEqual([true, true, true, false]);
  });

  test("no peaks draw a dashed midline, never an empty box", () => {
    expect(html(h(Wave, { peaks: [], width: 220, height: 34, tone: "violet" }))).toContain(`<line`);
  });
});
