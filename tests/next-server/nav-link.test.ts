// THE HEADER'S PENDING MARK (app/(studio)/_shell/NavLink.tsx): with prefetch off, a section click
// waits on the server, and until 2026-11-09 the old screen stood frozen with no sign the click was
// heard. These cases hold the mark's contract - always in the box (pending moves no pixel), drawn
// only while next/link says the navigation is pending, entering after --dur-fast so a quick commit
// never flashes it, and `aria-busy` on the link itself for assistive technology, removed when the
// navigation lands or the link goes away.
//
// The studio's not-found body (app/(studio)/_shell/frames/missing.ts) names the missing work by
// the id in its address, with the door back.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const status = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ href, prefetch: _p, children, ...rest }: { href: string; prefetch?: boolean; children?: unknown }) => createElement("a", { href, ...rest }, children as never),
    useLinkStatus: () => ({ pending: status.pending }),
  };
});

import { NavLink, PendingMark } from "../../app/(studio)/_shell/NavLink.tsx";
import shell from "../../app/(studio)/_shell/Shell.module.css";
import { missing } from "../../app/(studio)/_shell/frames/missing.ts";
import { harness } from "../golden-path/_studio/hooks.ts";

const ROOT = join(import.meta.dirname, "../..");

describe("NavLink's pending mark", () => {
  it("is always rendered, hidden from the reader, and marked only while pending", () => {
    status.pending = false;
    const idle = renderToStaticMarkup(h(NavLink, { href: "/floor", current: false, children: "Floor" }));
    expect(idle).toBe(`<a href="/floor">Floor<span class="${shell.pending}" aria-hidden="true"></span></a>`);
    status.pending = true;
    const busy = renderToStaticMarkup(h(NavLink, { href: "/floor", current: false, children: "Floor" }));
    expect(busy).toBe(`<a href="/floor">Floor<span class="${shell.pending}" data-pending="" aria-hidden="true"></span></a>`);
    // aria-current stays the caller's, from the pathname, pending or not.
    expect(renderToStaticMarkup(h(NavLink, { href: "/floor", current: true, children: "Floor" }))).toContain('aria-current="page"');
    status.pending = false;
  });

  it("puts aria-busy on its own link while pending and takes it off when the navigation lands", async () => {
    const attrs = new Map<string, string>();
    const link = { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k) };
    const node = { closest: (sel: string) => (sel === "a" ? link : null) };
    status.pending = false;
    const run = harness(() => PendingMark() as ReactElement<{ ref: { current: unknown } }>);
    const first = await run.settleUp();
    first.props.ref.current = node;
    expect(attrs.has("aria-busy")).toBe(false);
    status.pending = true;
    await run.settleUp();
    expect(attrs.get("aria-busy")).toBe("true");
    status.pending = false;
    await run.settleUp();
    expect(attrs.has("aria-busy")).toBe(false);
    status.pending = true;
    await run.settleUp();
    run.unmount();
    expect(attrs.has("aria-busy")).toBe(false);
    status.pending = false;
  });

  it("enters only after --dur-fast, on the one curve, sized by the link, and is drawn whole under reduced motion", () => {
    const css = readFileSync(join(ROOT, "app/(studio)/_shell/Shell.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const base = /\.pending\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(base).toMatch(/position:absolute/);
    expect(base).toMatch(/opacity:0/);
    expect(base).toMatch(/transform:scaleX\(0\)/);
    expect(css).toMatch(/\.pending\[data-pending\]\{animation:navPending var\(--dur-slow\) var\(--ease\) var\(--dur-fast\) both\}/);
    expect(css).toMatch(/\.nav a\{position:relative\}/);
    // Reduced motion: world.css drops every animation, so the pending mark must be whole without one.
    expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\.pending\[data-pending\]\{opacity:1;transform:none\}\}/);
  });
});

describe("the studio's not-found names the missing work", () => {
  it("a project, a part of one, a style - each by its id, each with its door back", () => {
    expect(missing("/projects/nope")).toEqual({ label: "no project nope", door: { label: "projects", href: "/projects" } });
    expect(missing("/projects/glass-harbor-trailer/nope")).toEqual({ label: "no part nope in glass-harbor-trailer", door: { label: "glass-harbor-trailer", href: "/projects/glass-harbor-trailer" } });
    expect(missing("/library/style/st%20x")).toEqual({ label: "no style st x", door: { label: "library", href: "/library" } });
  });

  it("anything else falls back to its last segment and its section", () => {
    expect(missing("/ledger/zzz")).toEqual({ label: "no zzz", door: { label: "ledger", href: "/ledger" } });
    expect(missing("/projects/runs/x").door).toEqual({ label: "runs", href: "/projects/runs" });
    expect(missing("/")).toEqual({ label: "nothing here", door: { label: "floor", href: "/floor" } });
  });
});
