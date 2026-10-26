// THE LIBRARY PAGE'S ONE RENDER (app/(studio)/library/page.tsx), its error doors: the sides are
// stubbed so a refusal the fixture cannot make can be handed to it, and the client island is a
// recorder (its props are what the page decided).
//
//   1. A selected item whose detail is refused for any reason but not-found says so. The page
//      opened on the set and dropped `sel` from the address for every refusal, so a store or
//      projects-read failure on a shared link left no trace of why the item never opened.

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { err, ok, type Result } from "@gt/domain/errors";

vi.mock("server-only", () => ({}));

const side = vi.hoisted(() => ({ detail: (): unknown => undefined, seen: [] as unknown[] }));

vi.mock("../../lib/library/fresh.ts", () => ({ freshLibrary: () => ({ ok: true, value: undefined }) }));
vi.mock("../../app/(studio)/library/_port/handoff.ts", () => ({ styleHandoff: (s: string) => s }));
vi.mock("../../app/(studio)/library/_port/wire.ts", () => ({ LIBRARY_PORT: {} }));
vi.mock("../../app/(studio)/library/_port/port.ts", () => ({
  SIDE: "fixture",
  atelierOf: (s: string) => `/library/style/${s}`,
  serverLibrary: () => ({
    query: () => ({ ok: true, value: { items: [], total: 0, everything: 0, kindCounts: {}, groups: [], parsed: { words: [], tokens: [] } } }),
    detail: () => side.detail(),
  }),
}));
vi.mock("../../app/(studio)/library/_library/Library.tsx", () => ({
  Library: (p: unknown) => {
    side.seen.push(p);
    return null;
  },
}));

const { default: LibraryPage } = await import("../../app/(studio)/library/page.tsx");

const render = async (search: Record<string, string>): Promise<{ html: string; sel: unknown }> => {
  side.seen = [];
  const el = await LibraryPage({ searchParams: Promise.resolve(search) });
  const html = renderToStaticMarkup(el);
  const props = side.seen[0] as { url: { sel: unknown } } | undefined;
  return { html, sel: props?.url.sel };
};

beforeEach(() => {
  side.detail = () => ok({});
});

describe("1. a refused detail says why", () => {
  it("not-found opens on the set, silently: the index no longer holds it", async () => {
    side.detail = (): Result<never> => err("not-found", "no library item audio-7");
    const r = await render({ sel: "audio-7" });
    expect(r.sel).toBeNull();
    expect(r.html).not.toContain("no library item");
  });

  it("any other refusal opens on the set and draws the refusal in its own words", async () => {
    side.detail = (): Result<never> => err("unavailable", "database is locked");
    const r = await render({ sel: "audio-7" });
    expect(r.sel).toBeNull();
    expect(r.html).toContain("library audio-7: database is locked");
  });

  it("a detail that reads draws no error", async () => {
    const r = await render({ sel: "audio-7" });
    expect(r.sel).toBe("audio-7");
    expect(r.html).toBe("");
  });
});
