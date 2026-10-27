// THE /kit SHEET, HELD TO WHAT IT CLAIMS (app/(studio)/kit). The page says it is the design
// system as shipped: every token of source.json, every row of the one keymap, the motion the
// components play. tests/live/kit.live.spec.ts drives the assembled page in Chromium; these cases
// are the claims a node render or a read of the stylesheets can decide, so `npm run test:unit`
// sees them without a browser.
//
//   1. A scroller that glides (`scroll-behavior: smooth`) stops gliding under reduced motion.
//      globals.css's blanket rule reaches `html` and every animation and transition, never a
//      module's own `scroll-behavior` - the kit's body scrolled smoothly for a person who asked
//      for no motion on every nav click (WCAG 2.3.3).
//   2. Every keyed row of the keymap is drawn in a legend - its field's rows too. keyTable draws
//      a field's rows only when asked for that field, so one legend per mode hid every key that
//      fires inside a field (save a note, clear a search, rename): 21 of 170 rows.
//   3. An act the Motion card plays is the animation a component ships: the same keyframes and
//      the same timing. CSS modules scope keyframes, so the kit redefines them, and the copy
//      drifted - its fadeUp ran .35s where the Library detail's runs .22s. Acts nothing ships
//      are named in UNSHIPPED_ACTS, and the list can only shrink.
//   4. The token sheet draws every token of source.json exactly once, and the groups it says it
//      draws (DRAWN_GROUPS, which page.tsx checks the source against) are the source's groups -
//      no more, no fewer. `roles-component` was listed and is no group: a page check reading
//      that list could pass for a group nothing drew.
//   5. The nav marks a section that is still in view. KitNav set the mark only on a section
//      ENTERING its band and ignored one leaving it, so scrolling back up out of the section
//      below left the mark on that section while the reader looked at the one above.
//   6. Every picture a screen kit draws is a file git tracks. public/trials/**/*.jpg is
//      gitignored (a fresh clone lacks it); the style atelier's fixture was moved off it
//      (f03cf366) and the kit, its twin, still drew six plates a clone does not have. The case
//      reads `git ls-files`, not the disk, so the operator's own regenerated plates cannot hide it.
//   7. The Ledger strip's readout counts the bars it draws. The specimen passed a literal 212 for
//      a range whose days hold 127 events, and kept saying 212 after any drag picked another range.
//   8. A glyph drawn alone in a specimen cell has an accessible name. The glyphs are aria-hidden
//      (the control around one names it); the Library's kinds row named each cell role="img", the
//      Floor's marks row only carried a `title` on a generic span, which no reader is bound to read.
//   9. The Library's rail and its set summary count one set. The screen hands both the same
//      kindCounts (library/_library/Library.tsx); the kit handed them two objects that disagreed.
//  10. The Floor month's controls turn the month, as the header says they are live. Its ‹ › were
//      wired to nothing; they now turn it the way floor/_floor/Month.tsx does (and close the day).

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { usd } from "@gt/ui/components/eventrow/usd.ts";
import { BINDINGS } from "@gt/ui/keymap/bindings";
import { parseSource } from "@gt/ui/tokenSource";

import { AudioSection } from "../../app/(studio)/kit/AudioKit.tsx";
import { BoardSection } from "../../app/(studio)/kit/BoardKit.tsx";
import { boardKitData } from "../../app/(studio)/kit/boardKitData.ts";
import { FloorSection } from "../../app/(studio)/kit/FloorKit.tsx";
import { DAYS, LedgerSections, RANGE } from "../../app/(studio)/kit/LedgerKit.tsx";
import { LibrarySection } from "../../app/(studio)/kit/LibraryKit.tsx";
import { PartSection } from "../../app/(studio)/kit/PartKit.tsx";
import { ProduceSection } from "../../app/(studio)/kit/ProduceKit.tsx";
import { RunsSection } from "../../app/(studio)/kit/RunsKit.tsx";
import { StyleSection } from "../../app/(studio)/kit/StyleKit.tsx";
import { SignalSections } from "../../app/(studio)/kit/Signal.tsx";
import { DRAWN_GROUPS, TokenSections } from "../../app/(studio)/kit/Tokens.tsx";
import { KitNav } from "../../app/(studio)/kit/KitNav.tsx";
import { MonthCalendar } from "@gt/ui/components/floor/MonthCalendar.tsx";
import { ScheduleForm } from "@gt/ui/components/floor/ScheduleForm.tsx";
import { SLOT_HOLDS } from "@gt/domain/slot.machine";
import { harness } from "../golden-path/_studio/hooks.ts";

// boardKitData is a server module (it mints ids at the zod door); the guard is Next's, not node's.
vi.mock("server-only", () => ({}));

const ROOT = path.resolve(import.meta.dirname, "../..");
const CSS_ROOTS = ["app", "components", "packages/ui/src"];

function cssFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".next")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...cssFiles(full));
    else if (name.endsWith(".css")) out.push(full);
  }
  return out;
}

/** CSS has block comments only, and they do not nest: this strip is sound. */
const css = (file: string): string => readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The bodies of every `@media (prefers-reduced-motion: reduce)` block, braces balanced. */
function reducedBlocks(text: string): string[] {
  const out: string[] = [];
  const open = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/g;
  for (let m = open.exec(text); m !== null; m = open.exec(text)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
    }
    out.push(text.slice(start, i - 1));
  }
  return out;
}

describe("/kit: motion honours reduced motion", () => {
  test("every stylesheet that scrolls smoothly turns it off under prefers-reduced-motion", () => {
    const files = CSS_ROOTS.flatMap((r) => cssFiles(path.join(ROOT, r)));
    expect(files.length, "the walk read no stylesheet").toBeGreaterThan(50);
    const smooth = files.filter((f) => /scroll-behavior\s*:\s*smooth/.test(css(f)));
    expect(smooth.length, "no stylesheet scrolls smoothly: the case has nothing to hold").toBeGreaterThan(0);
    const unguarded = smooth
      .filter((f) => !reducedBlocks(css(f)).some((b) => /scroll-behavior\s*:\s*auto/.test(b)))
      .map((f) => path.relative(ROOT, f).replaceAll("\\", "/"));
    expect(unguarded).toEqual([]);
  });
});

/** A rendered fragment's words: tags dropped, the five entities React writes decoded. */
const words = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&");

describe("/kit: the key legends draw the whole keymap", () => {
  test("every keyed row is drawn in its mode's legend, or its mode's legend for that field", () => {
    const html = renderToStaticMarkup(h(SignalSections));
    const legends = new Map<string, string>();
    for (const m of html.matchAll(/role="group" aria-label="([^"]+) keys">([\s\S]*?)<\/div>/g)) legends.set(m[1] ?? "", words(m[2] ?? ""));
    const keyed = BINDINGS.filter((b) => b.keys.length > 0);
    expect(keyed.length, "the keymap holds no keyed row").toBeGreaterThan(100);
    const missing = keyed
      .filter((b) => {
        const legend = legends.get(b.field === undefined ? b.mode : `${b.mode} · ${b.field}`);
        return legend === undefined || !legend.includes(b.does ?? b.verb);
      })
      .map((b) => `${b.mode}/${b.verb}${b.field === undefined ? "" : `@${b.field}`}`);
    expect(missing).toEqual([]);
  });
});

/**
 * OWED, NOT ALLOWED: the kit's acts no @gt/ui component plays (kit.js "acts" from the prototype;
 * nothing ratifies or re-routes with motion yet). The case fails on an unshipped act NOT listed
 * and on a listed act that now ships, so this list cannot outlive the decision.
 */
const UNSHIPPED_ACTS: readonly string[] = ["lockIn", "moved"];

/** `@keyframes name{...}` bodies in a stylesheet, braces balanced. */
function keyframes(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const open = /@keyframes\s+([\w-]+)\s*\{/g;
  for (let m = open.exec(text); m !== null; m = open.exec(text)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
    }
    out.set(m[1] ?? "", text.slice(start, i - 1).replace(/\s+/g, ""));
  }
  return out;
}

/** `animation:<name> <rest>` declarations: name -> the rest (timing), whitespace collapsed. */
const animations = (text: string): [string, string][] =>
  [...text.matchAll(/animation\s*:\s*([\w-]+)\s+([^;}]+)/g)].map((m) => [m[1] ?? "", (m[2] ?? "").trim().replace(/\s+/g, " ")]);

describe("/kit: the Motion card plays what ships", () => {
  test("each act's keyframes and timing are a shipped component's", () => {
    const kit = css(path.join(ROOT, "app/(studio)/kit/kit.module.css"));
    const acts = animations(kit).filter(([name]) => keyframes(kit).has(name));
    expect(acts.length, "the kit plays no act").toBeGreaterThan(0);
    const shipped = cssFiles(path.join(ROOT, "packages/ui/src")).map(css);
    const drift: string[] = [];
    const unshipped: string[] = [];
    for (const [name, timing] of acts) {
      const bodies = shipped.flatMap((t) => {
        const body = keyframes(t).get(name);
        return body === undefined ? [] : [{ body, timings: animations(t).filter(([n]) => n === name).map(([, r]) => r) }];
      });
      if (bodies.length === 0) {
        unshipped.push(name);
        continue;
      }
      const ownBody = keyframes(kit).get(name);
      if (!bodies.some((b) => b.body === ownBody && b.timings.includes(timing))) drift.push(`${name} ${timing} vs ${bodies.flatMap((b) => b.timings).join(" | ")}`);
    }
    expect(drift).toEqual([]);
    expect(unshipped).toEqual(UNSHIPPED_ACTS);
  });
});

describe("/kit: the token sheet draws source.json whole", () => {
  test("every token is drawn exactly once, and the drawn groups are the source's groups", () => {
    const source = parseSource(readFileSync(path.join(ROOT, "packages/ui/tokens/source.json"), "utf8"));
    if (!source.ok) throw new Error(source.error.message);
    const groups = source.value.groups;
    expect([...DRAWN_GROUPS].sort()).toEqual(groups.map((g) => g.id).sort());
    const html = renderToStaticMarkup(h(TokenSections, { groups }));
    const drawn = [...html.matchAll(/data-token="([^"]+)"/g)].map((m) => m[1] ?? "");
    const tokens = groups.flatMap((g) => g.tokens.map((t) => t.name));
    expect(tokens.length, "source.json holds no token").toBeGreaterThan(100);
    expect(drawn.sort()).toEqual(tokens.sort());
  });
});

type Entry = { readonly target: { readonly id: string }; readonly isIntersecting: boolean };

describe("/kit: the nav marks the section in view", () => {
  test("a section leaving the band hands the mark back to the one still in it", async () => {
    let fire: (entries: readonly Entry[]) => void = () => undefined;
    const g = globalThis as Record<string, unknown>;
    const saved = { document: g.document, IntersectionObserver: g.IntersectionObserver };
    g.document = { getElementById: (id: string) => ({ id }) };
    g.IntersectionObserver = class {
      constructor(cb: (entries: readonly Entry[]) => void) {
        fire = cb;
      }
      observe(): void {}
      disconnect(): void {}
    };
    try {
      const nav = harness(() => KitNav({ bodyId: "kit-body" }), { settleWhen: "stable" });
      const marked = async (): Promise<string[]> => {
        const out = JSON.stringify(await nav.settleUp());
        return [...out.matchAll(/"href":"#([\w-]+)","aria-current":"location"/g)].map((m) => m[1] ?? "");
      };
      expect(await marked()).toEqual(["colour"]);
      // An observer's first callback reports every target it observes.
      fire([
        { target: { id: "colour" }, isIntersecting: true },
        { target: { id: "type" }, isIntersecting: false },
      ]);
      expect(await marked()).toEqual(["colour"]);
      fire([{ target: { id: "type" }, isIntersecting: true }]);
      expect(await marked(), "the section scrolled into the band").toEqual(["type"]);
      fire([{ target: { id: "type" }, isIntersecting: false }]);
      expect(await marked(), "scrolled back up: colour never left the band").toEqual(["colour"]);
      nav.unmount();
    } finally {
      g.document = saved.document;
      g.IntersectionObserver = saved.IntersectionObserver;
    }
  });
});

/** The screen kits, each rendered as the page renders it. */
const SCREENS: readonly (readonly [string, () => ReturnType<typeof h>])[] = [
  ["runs", () => h(RunsSection)],
  ["ledger", () => h(LedgerSections)],
  ["floor", () => h(FloorSection)],
  ["board", () => h(BoardSection, { data: boardKitData() })],
  ["produce", () => h(ProduceSection)],
  ["part", () => h(PartSection)],
  ["audio", () => h(AudioSection)],
  ["library", () => h(LibrarySection)],
  ["style", () => h(StyleSection)],
];

describe("/kit: the screen kits draw only committed pictures", () => {
  test("every src, poster and url() a screen kit renders is a file git tracks", () => {
    const tracked = new Set(execFileSync("git", ["ls-files", "public"], { cwd: ROOT, encoding: "utf8" }).split(String.fromCharCode(10)).filter(Boolean));
    expect(tracked.size, "git tracks nothing under public").toBeGreaterThan(10);
    const named = new Map<string, string>();
    for (const [screen, el] of SCREENS) {
      const html = renderToStaticMarkup(el());
      for (const m of html.matchAll(/(?:src|poster)="(\/[^"?#]*)"|url\((?:&quot;|&#x27;|['"])?(\/[^)"'&?#]+)/g)) named.set(m[1] ?? m[2] ?? "", screen);
    }
    expect(named.size, "the screen kits draw no picture").toBeGreaterThan(5);
    const untracked = [...named].filter(([file]) => !tracked.has(`public${file}`)).map(([file, screen]) => `${screen}: ${file}`);
    expect(untracked).toEqual([]);
  });
});

describe("/kit: the Ledger strip's readout counts its own bars", () => {
  test("the range's event count is the sum of the days the range covers", () => {
    const sum = DAYS.filter((d) => d.day >= RANGE.from && d.day <= RANGE.to).reduce((a, d) => a + d.operator + d.agent + d.machine, 0);
    expect(sum, "the range covers no event").toBeGreaterThan(0);
    const html = renderToStaticMarkup(h(LedgerSections));
    expect(html.match(/(\d+) events/)?.[1]).toBe(String(sum));
  });
});

describe("/kit: a glyph drawn alone is named", () => {
  test("every glyph cell a screen kit draws is an image with a label", () => {
    const cells = SCREENS.flatMap(([screen, el]) => [...renderToStaticMarkup(el()).matchAll(/<span([^>]*class="[^"]*glyphCell[^"]*"[^>]*)>/g)].map((m) => [screen, m[1] ?? ""] as const));
    expect(cells.length, "no screen kit draws a glyph cell").toBeGreaterThan(10);
    const unnamed = cells.filter(([, attrs]) => !(/role="img"/.test(attrs) && /aria-label="[^"]+"/.test(attrs))).map(([screen, attrs]) => `${screen}:${attrs}`);
    expect(unnamed).toEqual([]);
  });
});

describe("/kit: the Library's rail and summary count one set", () => {
  test("the rail's All is the sum of its kinds, and each kind counts the same in both", () => {
    const html = renderToStaticMarkup(h(LibrarySection));
    const railAt = html.indexOf('aria-label="Kind"');
    const rail = new Map([...html.slice(railAt, html.indexOf("</section>", railAt)).matchAll(/class="_label_\w+">([^<]+)<\/span><span[^>]*aria-hidden="true">[^<]*<\/span><span class="[^"]+">, (\d+)<\/span>/g)].map((m) => [m[1] ?? "", Number(m[2])]));
    const summary = new Map([...html.matchAll(/class="_ell_\w+">([^<]+)<\/span><span class="_n_\w+">([\d,]+)<\/span>/g)].map((m) => [m[1] ?? "", Number((m[2] ?? "").replaceAll(",", ""))]));
    expect(rail.size, "the rail draws no kind").toBeGreaterThan(5);
    const shared = [...summary.keys()].filter((label) => rail.has(label));
    expect(shared.length, "the rail and the summary name no kind alike").toBeGreaterThan(5);
    const kinds = [...rail].filter(([label]) => label !== "All").reduce((a, [, n]) => a + n, 0);
    expect(rail.get("All"), "the rail's All against its kinds").toBe(kinds);
    expect(shared.filter((label) => rail.get(label) !== summary.get(label)).map((label) => `${label}: rail ${rail.get(label)}, summary ${summary.get(label)}`)).toEqual([]);
  });
});

/** The first element of `type` in a rendered tree (a shallow render: components are not called). */
function find(node: unknown, type: unknown): { readonly props: Record<string, unknown> } | undefined {
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = find(n, type);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  if (node === null || typeof node !== "object" || !("props" in node)) return undefined;
  const el = node as { readonly type: unknown; readonly props: Record<string, unknown> };
  return el.type === type ? el : find(el.props.children, type);
}

describe("/kit: the Floor month's controls are live", () => {
  test("the arrows turn the month and close the day; today comes back to NOW's month", async () => {
    const floor = harness(() => FloorSection(), { settleWhen: "stable" });
    const month = async () => {
      const el = find(await floor.settleUp(), MonthCalendar);
      if (el === undefined) throw new Error("the Floor kit draws no MonthCalendar");
      return el.props as { readonly month: unknown; readonly day: unknown; readonly onMonth: (by: number) => void; readonly onToday: () => void; readonly onDay: (d: string) => void };
    };
    expect((await month()).month).toEqual({ y: 2026, m: 9 });
    (await month()).onDay("2026-10-20");
    (await month()).onMonth(1);
    expect(await month()).toMatchObject({ month: { y: 2026, m: 10 }, day: null });
    (await month()).onMonth(3);
    expect((await month()).month, "past December").toEqual({ y: 2027, m: 1 });
    (await month()).onToday();
    expect(await month()).toMatchObject({ month: { y: 2026, m: 9 }, day: "2026-10-15" });
    floor.unmount();
  });
});

describe("/kit: the ScheduleForm refusal is one its rail could produce", () => {
  test("the slot the refusal names is in the specimen's slots, holding at the time it states", async () => {
    const floor = harness(() => FloorSection(), { settleWhen: "stable" });
    const form = find(await floor.settleUp(), ScheduleForm);
    if (form === undefined) throw new Error("the Floor kit draws no ScheduleForm");
    const { refusal, slots } = form.props as { readonly refusal: string; readonly slots: readonly { readonly id: string; readonly status: string; readonly publishAt: string }[] };
    const m = /\(slot (\w+), (\w+) for (\S+)\)/.exec(refusal);
    expect(m, refusal).not.toBeNull();
    const named = slots.find((s) => s.id === m?.[1]);
    expect(named, `slot ${m?.[1]} is not in the specimen's slots`).toBeDefined();
    expect(named?.status).toBe(m?.[2]);
    expect(named?.publishAt).toBe(m?.[3]);
    expect(SLOT_HOLDS, "a slot that holds nothing cannot refuse a second").toContain(named?.status);
    floor.unmount();
  });
});

describe("/kit: the header's spend chip is spelt the way usd() spells it", () => {
  // The specimen hand-wrote `$0.00`; the header's SpendChip draws usd(0), which is `$0`.
  test("no `spend 24h` chip on the sheet carries a figure usd() cannot produce", () => {
    const dir = path.join(process.cwd(), "app", "(studio)", "kit");
    const shown: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
      const src = readFileSync(path.join(dir, f), "utf8");
      for (const m of src.matchAll(/label="spend 24h"\s+value="([^"]*)"/g)) shown.push(`${f}: ${m[1]}`);
    }
    for (const m of words(renderToStaticMarkup(h(SignalSections))).matchAll(/spend 24h\s*(-?\$[\d.]+)/gi)) {
      const v = m[1] ?? "";
      if (usd(Number(v.replace("$", ""))) !== v) shown.push(`rendered: ${v}`);
    }
    expect(shown).toEqual([]);
  });
});
