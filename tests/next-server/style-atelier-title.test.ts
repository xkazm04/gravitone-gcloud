// THE ATELIER'S TAB TITLE NAMES THE STYLE, NOT ITS URL ID. generateMetadata reads the same view
// the page reads (one cached read), so `painted-3d` is titled "Painted 3D" - the name the
// operator gave it - and an id the store does not know still gets a title (the id), because the
// page's own 404 is the page's to raise.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ENV = vi.hoisted(() => {
  process.env["GRAVITONE_PRODUCE_SIDE"] = "fixture";
  return true;
});

import { generateMetadata } from "../../app/(studio)/library/style/[id]/page.tsx";

const titleOf = async (id: string) => (await generateMetadata({ params: Promise.resolve({ id }) })).title;

describe("the atelier's tab title", () => {
  it("names the style by its name", async () => {
    expect(ENV).toBe(true);
    expect(await titleOf("painted-3d")).toBe("Gravitone · Painted 3D");
  });

  it("falls back to the id for a style the store does not know", async () => {
    expect(await titleOf("no-such-style")).toBe("Gravitone · no-such-style");
  });

  it("decodes an escaped id before it is read", async () => {
    expect(await titleOf("painted%2D3d")).toBe("Gravitone · Painted 3D");
  });
});
