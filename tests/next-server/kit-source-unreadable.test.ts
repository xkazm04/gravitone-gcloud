// /kit WITH A TOKEN FILE IT CANNOT READ (app/(studio)/kit/page.tsx). parseSource is a Result and
// the page draws its failure as a live ErrorLine; the read in front of it threw, so a moved
// source.json or a cwd that is not the repo root made the route an error boundary with no
// specimen at all. The read now goes through the same door: one red line carrying the
// filesystem's own sentence, every other section still drawn.
import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({ fail: false }));
vi.mock("node:fs", async (orig) => {
  const actual = await orig<typeof import("node:fs")>();
  const readFileSync = ((p: unknown, ...rest: unknown[]) => {
    if (gate.fail && String(p).split(String.fromCharCode(92)).join("/").endsWith("tokens/source.json")) {
      throw Object.assign(new Error("ENOENT: no such file or directory, open 'packages/ui/tokens/source.json'"), { code: "ENOENT" });
    }
    return (actual.readFileSync as (...a: unknown[]) => unknown)(p, ...rest);
  }) as typeof actual.readFileSync;
  return { ...actual, readFileSync, default: { ...actual, readFileSync } };
});
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => "/kit", useSearchParams: () => new URLSearchParams() }));
vi.mock("../../app/(studio)/_shell/Providers.tsx", () => ({ useShell: () => ({ toast: () => {} }) }));
vi.mock("@gt/ui/keymap/dispatch", async (orig) => ({ ...(await orig<object>()), useKeys: () => {} }));

import KitPage from "../../app/(studio)/kit/page.tsx";

describe("/kit with an unreadable token file", () => {
  it("draws the read failure as an ErrorLine and still draws the specimens", () => {
    gate.fail = true;
    const html = renderToStaticMarkup(h(KitPage));
    expect(html).toContain("tokens/source.json: ENOENT: no such file or directory");
    expect(html, "a non-token section is still drawn").toContain("Signal");
  });

  it("with a readable file, draws no source ErrorLine", () => {
    gate.fail = false;
    const html = renderToStaticMarkup(h(KitPage));
    expect(html).not.toContain("tokens/source.json: ");
  });
});
