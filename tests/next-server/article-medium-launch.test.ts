// A BROWSER THAT CANNOT LAUNCH, AT THE LANDING (lib/articles/mediumPackage.ts). land() tolerates a
// figure that fails to render (`failedFigures` is logged) but chromium.launch() throwing escaped
// buildMediumPackage, so a human-approved run on a box with no Playwright browser went to
// `failed`. The registry copy carries no PNGs, so the landing's outcome rests on the registry
// gates: a launch failure now fails every figure by name instead.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { renderFigurePngs, renderTablePngs, type LaunchBrowser } from "../../lib/articles/mediumPackage.ts";

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(path.join(tmpdir(), "gt-medium-launch-"));
  made.push(d);
  return d;
};
const noBrowser: LaunchBrowser = () => Promise.reject(new Error("browserType.launch: Executable doesn't exist"));

describe("a browser that cannot launch", () => {
  it("fails every figure by name instead of throwing", async () => {
    const dir = tmp();
    const svgs = path.join(dir, "figures");
    mkdirSync(svgs);
    writeFileSync(path.join(svgs, "01-a.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    writeFileSync(path.join(svgs, "02-b.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    expect(await renderFigurePngs(svgs, path.join(dir, "out"), noBrowser)).toEqual({ written: [], failed: ["01-a.svg", "02-b.svg"] });
  });

  it("fails every table by name instead of throwing", async () => {
    const dir = tmp();
    const t = [{ name: "table-01.png", head: ["A"], rows: [["1"]] }];
    expect(await renderTablePngs(t, path.join(dir, "out"), noBrowser)).toEqual({ written: [], failed: ["table-01.png"] });
  });

  it("with no figures never asks for a browser", async () => {
    const dir = tmp();
    let launched = 0;
    const counting: LaunchBrowser = () => {
      launched++;
      return noBrowser();
    };
    expect(await renderFigurePngs(path.join(dir, "none"), path.join(dir, "out"), counting)).toEqual({ written: [], failed: [] });
    expect(launched).toBe(0);
  });
});
