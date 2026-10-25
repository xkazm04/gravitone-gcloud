// Controls and containers: the state each exposes to assistive technology, the class each
// variant maps to, and what renders when.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Button } from "../../src/components/button/Button.tsx";
import btn from "../../src/components/button/Button.module.css";
import { Toggle } from "../../src/components/toggle/Toggle.tsx";
import { Seg } from "../../src/components/seg/Seg.tsx";
import { Field, Search, Select, TextArea } from "../../src/components/field/Field.tsx";
import { Fold } from "../../src/components/fold/Fold.tsx";
import { TabRail } from "../../src/components/tabrail/TabRail.tsx";
import { Crumbs } from "../../src/components/crumbs/Crumbs.tsx";
import { FacetRow } from "../../src/components/facet/FacetRow.tsx";
import facet from "../../src/components/facet/FacetRow.module.css";
import { Toast } from "../../src/components/toast/Toast.tsx";
import toast from "../../src/components/toast/Toast.module.css";
import { Panel } from "../../src/components/panel/Panel.tsx";
import { LevelSheet } from "../../src/components/sheet/LevelSheet.tsx";
import sheetCss from "../../src/components/sheet/LevelSheet.module.css";
import { CapsHeading } from "../../src/components/heading/CapsHeading.tsx";
import { Empty } from "../../src/components/empty/Empty.tsx";
import { Facts } from "../../src/components/facts/Facts.tsx";

const COMPONENTS = resolve(import.meta.dirname, "../../src/components");
/** The controls-and-shell directories (context-map `ui-controls-shell`). */
const SHELL_DIRS = ["button", "toggle", "seg", "field", "tabrail", "fold", "panel", "toast", "sheet"] as const;

const html = (el: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(el);
const noop = (): void => {};

describe("Button", () => {
  test("tone and size map to classes; the shortcut's caps come from the keymap", () => {
    const b = html(h(Button, { label: "Approve", tone: "emerald", size: "sm", shortcut: { mode: "board.review", verb: "approve" } }));
    expect(b).toContain(`class="${btn.btn} ${btn.sm} ${btn.emerald}"`);
    expect(b).toMatch(/Approve<kbd[^>]*>A<\/kbd><\/button>$/);
  });

  test("disabled stays a focusable button that says so and takes no press; a disabled link is a button", () => {
    const d = html(h(Button, { label: "Commit", disabled: true, onPress: noop, href: "/x" }));
    expect(d).toMatch(/^<button type="button"[^>]*aria-disabled="true">/);
    expect(d).not.toContain(" disabled");
    expect(d).not.toContain("href");
  });

  test("a disabled submit refuses its form: the press is cancelled, so neither a click nor ⏎ in a field submits", () => {
    // aria-disabled keeps the button in the tab order, which also keeps it the form's default
    // button; ⏎ in a field fires a click at it. Only a cancelled click stops the submission.
    let pressed = 0;
    let cancelled = 0;
    const click = (el: ReturnType<typeof Button>): void => {
      const on = (el.props as { onClick?: (e: { preventDefault: () => void }) => void }).onClick;
      on?.({ preventDefault: () => (cancelled += 1) });
    };
    click(Button({ label: "rename", submit: true, disabled: true, onPress: () => (pressed += 1) }));
    expect(cancelled).toBe(1);
    expect(pressed).toBe(0);
    click(Button({ label: "rename", submit: true, onPress: () => (pressed += 1) }));
    expect([cancelled, pressed]).toEqual([1, 1]);
  });

  test("a disabled button does not answer the pointer: every hover or press look skips aria-disabled", () => {
    const css = readFileSync(join(COMPONENTS, "button/Button.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: (m[1] ?? "").trim(), body: m[2] ?? "" }));
    const pointer = rules.filter((r) => /:(hover|active)\b/.test(r.sel) && !r.sel.includes("[aria-disabled=true]"));
    expect(pointer.length).toBeGreaterThan(0);
    const answered = pointer.filter((r) => {
      if (r.sel.includes(":not([aria-disabled=true])")) return false;
      const state = /:(hover|active)\b/.exec(r.sel)?.[1] ?? "";
      return !rules.some((o) => o.sel.includes("[aria-disabled=true]") && o.sel.includes(`:${state}`));
    });
    expect(answered.map((r) => r.sel)).toEqual([]);
  });

  test("a badge is a chip after the label", () => {
    expect(html(h(Button, { label: "Commit packet", badge: { label: "7 undecided" } }))).toMatch(/Commit packet<span[^>]*>7 undecided<\/span>/);
  });
});

describe("pressed controls", () => {
  test("Toggle exposes its state", () => {
    expect(html(h(Toggle, { label: "music", on: true, onToggle: noop }))).toContain(`aria-pressed="true"`);
    expect(html(h(Toggle, { label: "sfx", on: false, onToggle: noop }))).toContain(`aria-pressed="false"`);
  });

  test("a Toggle that shows a region is a disclosure: expanded, never also pressed", () => {
    for (const on of [true, false]) {
      const t = html(h(Toggle, { label: "facets", on, onToggle: noop, controls: "lg-facets" }));
      expect(t).toContain(`aria-expanded="${on}"`);
      expect(t).not.toContain("aria-pressed");
    }
  });

  test("Seg presses exactly its value and names the group", () => {
    const opts = [{ value: "12h", label: "12h" }, { value: "24h", label: "24h" }, { value: "3d", label: "3d" }] as const;
    const s = html(h(Seg<"12h" | "24h" | "3d">, { label: "window", options: opts, value: "24h", onChange: noop }));
    expect(s).toMatch(/^<div[^>]*role="group" aria-label="window">/);
    expect((s.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
    expect(s).toMatch(/aria-pressed="true">24h</);
  });

  test("FacetRow: the mark is a class, the count is spoken, zero dims", () => {
    const f = html(h(FacetRow, { label: "agent", count: 0, pressed: false, onToggle: noop, mark: "rail", share: 0.5 }));
    expect(f).toContain(`${facet.row} ${facet.rail} ${facet.zero}`);
    expect(f).toContain(">, 0</span>");
    expect(f).toContain("--share:0.5");
    expect(html(h(FacetRow, { label: "image", count: 12, pressed: true, onToggle: noop, mark: "check" }))).toContain(`class="${facet.box}"`);
  });
});

describe("fields", () => {
  test("every field is named; the keyfield reaches the keymap's attribute", () => {
    const f = html(h(Field, { label: "query", value: "", onChange: noop, keyfield: "search" }));
    expect(f).toContain(`aria-label="query"`);
    expect(f).toContain(`data-keyfield="search"`);
  });

  test("a busy field keeps its place in the tab order: aria-disabled and read-only, never `disabled`", () => {
    const f = html(h(Field, { label: "title", value: "a", onChange: noop, disabled: true }));
    expect(f).toContain('aria-disabled="true"');
    expect(f).toContain('readOnly=""');
    expect(f).not.toMatch(/\sdisabled(=|\s|>)/);
    expect(html(h(Field, { label: "title", value: "a", onChange: noop }))).not.toContain("aria-disabled");
  });

  test("a field says its type, length and description", () => {
    const f = html(h(Field, { label: "when", value: "", onChange: noop, type: "datetime-local", maxLength: 40, describedBy: "w" }));
    expect(f).toContain('type="datetime-local"');
    expect(f).toContain('maxLength="40"');
    expect(f).toContain('aria-describedby="w"');
  });

  test("TextArea is named, bounded and busy the way Field is", () => {
    const a = html(h(TextArea, { label: "description", value: "", onChange: noop, maxLength: 5000, disabled: true }));
    expect(a).toMatch(/^<textarea/);
    expect(a).toContain('aria-label="description"');
    expect(a).toContain('maxLength="5000"');
    expect(a).toContain('aria-disabled="true"');
    expect(a).toContain('rows="3"');
  });

  test("Search draws the search verb's caps from the mode", () => {
    expect(html(h(Search, { mode: "library", label: "search library", value: "", onChange: noop }))).toMatch(/<kbd[^>]*>\/<\/kbd>/);
  });

  test("Select marks its value", () => {
    const s = html(h(Select<"a" | "b">, { label: "model", options: [{ value: "a", label: "Flux" }, { value: "b", label: "Nano" }], value: "b", onChange: noop }));
    expect(s).toMatch(/<option value="b" selected="">Nano<\/option>/);
  });
});

describe("Fold", () => {
  test("closed: expanded=false and the body is not rendered", () => {
    const f = html(h(Fold, { title: "mood", open: false, onToggle: noop, total: 9, children: h("p", null, "rows") }));
    expect(f).toContain(`aria-expanded="false"`);
    expect(f).not.toContain("rows");
    expect(f).toContain("hidden");
  });

  test("open: the body renders under the id the button controls", () => {
    const f = html(h(Fold, { title: "mood", open: true, onToggle: noop, active: 2, children: h("p", null, "rows") }));
    const id = /aria-controls="([^"]+)"/.exec(f)?.[1] ?? "";
    expect(f).toContain(`<div id="${id}"><p>rows</p></div>`);
    expect(f).toContain(">, 2 selected</span>");
  });
});

describe("navigation", () => {
  test("TabRail is navigation with aria-current, keycaps from the keymap, a locked tab readable", () => {
    const t = html(
      h(TabRail<"plan" | "runs">, {
        label: "view",
        mode: "projects",
        current: "runs",
        tabs: [
          { id: "plan", label: "Plan", href: "#plan", verb: "plan", disabled: true },
          { id: "runs", label: "Runs", href: "#runs", verb: "runs" },
        ],
      }),
    );
    expect(t).toMatch(/^<nav[^>]*aria-label="view">/);
    expect(t).toMatch(/<a class="[^"]*" aria-disabled="true" role="link" tabindex="0">Plan<kbd[^>]*>P<\/kbd><\/a>/);
    expect((t.match(/tabindex=/g) ?? []).length).toBe(1);
    expect(t).toMatch(/href="#runs" aria-current="page">Runs<kbd[^>]*>R<\/kbd>/);
  });

  test("Crumbs: steps link back, the place is current", () => {
    const c = html(h(Crumbs, { trail: [{ label: "Floor", href: "/" }, { label: "Board", onPress: noop }], here: "sweep-01" }));
    expect(c).toContain(`<a class="`);
    expect(c).toContain(`<button type="button"`);
    expect(c).toMatch(/aria-current="page">sweep-01<\/span><\/nav>$/);
  });
});

describe("containers", () => {
  test("Toast is always a polite region, empty while closed", () => {
    expect(html(h(Toast, { message: "kept 12", open: false }))).toBe(`<div class="${toast.toast}" role="status" aria-live="polite"></div>`);
    expect(html(h(Toast, { message: "kept 12", open: true }))).toBe(`<div class="${toast.toast} ${toast.on}" role="status" aria-live="polite">kept 12</div>`);
  });

  test("Toast keys its words by the receipt's seq, so a repeat of the same words is a remount", () => {
    const keyOf = (seq: number): unknown => {
      const el = Toast({ message: "kept 12", open: true, seq }) as { props: { children: Array<{ key?: unknown } | false | string> } };
      const frag = el.props.children[0] as { key?: unknown };
      return frag.key;
    };
    expect(keyOf(1)).not.toBe(keyOf(2));
  });

  test("Panel is a named section with a heading and its tally", () => {
    const p = html(h(Panel, { title: "facets", tally: { value: 688 }, children: "x" }));
    expect(p).toMatch(/^<section[^>]*aria-label="facets"><h2[^>]*>facets<span/);
  });

  test("CapsHeading takes a level and a tally, Empty is a resting state with its act, never a live region, Facts is a dl", () => {
    expect(html(h(CapsHeading, { text: "after", tally: { value: 3 }, level: 4 }))).toMatch(/^<h4[^>]*>after<span/);
    expect(html(h(Empty<"no events match">, { label: "no events match", action: { label: "Clear" } }))).toMatch(/^<div class="[^"]*"><span>no events match<\/span><button/);
    // A region mounted with its words in it is never announced (lib/announcer.tsx rule 1), so a
    // resting empty carries no status role; a filter emptying a list is announced by its owner.
    expect(html(h(Empty<"no events match">, { label: "no events match" }))).not.toContain("role=");
    expect(html(h(Facts, { facts: [{ term: "model", value: "flux-2" }] }))).toMatch(/^<dl[^>]*><dt[^>]*>model<\/dt><dd[^>]*>flux-2<\/dd><\/dl>$/);
  });
});

describe("LevelSheet", () => {
  const trail = [{ label: "Floor", href: "/floor" }, { label: "Board", href: "/board" }];
  const sheet = (over: { full?: boolean; specimen?: boolean; fit?: boolean }): string =>
    html(h(LevelSheet, { trail, here: "sweep-01", mode: "board.cull", back: "Board", onClose: noop, ...over, children: h("p", null, "body") }));
  const cls = (out: string): string[] => (/<section class="([^"]*)"/.exec(out)?.[1] ?? "").split(" ");

  test("over the Floor it is a modal dialog named by its trail, with the scrim and the grab", () => {
    const out = sheet({});
    expect(out).toMatch(/role="dialog" aria-modal="true" aria-label="Floor › Board › sweep-01"/);
    expect(out).toContain(`class="${sheetCss.scrim}"`);
    expect(out).toContain(`class="${sheetCss.grab}"`);
    expect(out).toContain("<p>body</p>");
  });

  test("loaded as a page it is a region in flow: no scrim, no grab, not modal", () => {
    const out = sheet({ full: true, fit: true });
    expect(out).toMatch(/role="region" aria-label=/);
    expect(out).not.toContain("aria-modal");
    expect(out).not.toContain(sheetCss.scrim);
    expect(out).not.toContain(sheetCss.grab);
    expect(cls(out)).toContain(sheetCss.full);
    expect(cls(out)).not.toContain(sheetCss.fit);
  });

  test("fit hugs its body only over the Floor; a specimen is drawn risen with no scrim", () => {
    expect(cls(sheet({ fit: true }))).toContain(sheetCss.fit);
    const spec = sheet({ specimen: true, fit: true });
    expect(cls(spec)).toEqual(expect.arrayContaining([sheetCss.specimen, sheetCss.open]));
    expect(cls(spec)).not.toContain(sheetCss.fit);
    expect(spec).not.toContain(sheetCss.scrim);
  });
});

describe("reduced motion", () => {
  // A module MOVES when a transition carries transform (or `all` over a transform rule) or it
  // runs an animation; each such module holds a prefers-reduced-motion block. Walked off the
  // directories, so a new stylesheet in them is read without editing this list.
  const sheets = SHELL_DIRS.flatMap((d) =>
    readdirSync(join(COMPONENTS, d))
      .filter((f) => f.endsWith(".module.css"))
      .map((f) => ({ file: `${d}/${f}`, css: readFileSync(join(COMPONENTS, d, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "") })),
  );
  const moves = (css: string): boolean =>
    /transition:[^;}]*\btransform\b/.test(css) ||
    (/transition:[^;}]*\ball\b/.test(css) && /(^|[;{])\s*transform:/.test(css)) ||
    /animation:\s*(?!none)[a-z]/.test(css);

  test("the walk read the shell's stylesheets", () => {
    expect(sheets.length).toBeGreaterThanOrEqual(SHELL_DIRS.length);
  });

  test("every shell stylesheet that moves stops moving under prefers-reduced-motion", () => {
    const moving = sheets.filter((s) => moves(s.css));
    expect(moving.map((s) => s.file)).toEqual(expect.arrayContaining(["sheet/LevelSheet.module.css", "toast/Toast.module.css"]));
    expect(moving.filter((s) => !/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/.test(s.css)).map((s) => s.file)).toEqual([]);
  });

  test("the receipt keeps its fade when the rise is dropped (feedback replaced, not removed)", () => {
    const css = sheets.find((s) => s.file === "toast/Toast.module.css")?.css ?? "";
    const reduce = /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*)\}\s*$/.exec(css.trim())?.[1] ?? "";
    expect(reduce).toMatch(/transition:\s*opacity/);
    expect(reduce).not.toMatch(/transition:[^;}]*transform/);
  });
});
