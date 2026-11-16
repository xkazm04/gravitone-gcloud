// PAGE TOOLS ARE THE STUDIO'S ALONE (gt-props, operator verdict 2026-11-11): next.config.ts sends
// `Permissions-Policy: tools=()` on every response outside app/(studio), whose shell registers the page tools
// (app/(studio)/_shell/AgentNav.tsx). The source is compiled the way Next compiles a custom header's source.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { tryToParsePath } from "next/dist/lib/try-to-parse-path.js";

import nextConfig, { NOT_STUDIO_SOURCE, STUDIO_ROUTES } from "../../next.config.ts";

const STUDIO = join(import.meta.dirname, "../../app/(studio)");

describe("Permissions-Policy: tools=()", () => {
  it("is one header rule on the not-studio source", async () => {
    expect(await nextConfig.headers?.()).toEqual([{ source: NOT_STUDIO_SOURCE, headers: [{ key: "Permissions-Policy", value: "tools=()" }] }]);
  });

  it("matches the landing, the API and the file doors, and no studio address", () => {
    const parsed = tryToParsePath(NOT_STUDIO_SOURCE);
    expect(parsed.error).toBeFalsy();
    const re = new RegExp(parsed.regexStr ?? "^$");
    for (const p of ["/", "/api/blob/abc", "/api/mcp", "/api/foundry/file", "/floorplan", "/favicon.ico"]) expect(re.test(p), p).toBe(true);
    for (const p of ["/floor", "/floor/", "/board/pkt:x", "/audio/studio/take", "/projects/p-1/part", "/studio/p-1", "/kit"]) expect(re.test(p), p).toBe(false);
  });

  it("names every studio route: a new one under app/(studio) must join the list", () => {
    const dirs = readdirSync(STUDIO).filter((n) => statSync(join(STUDIO, n)).isDirectory() && !n.startsWith("_") && !n.startsWith("@") && !n.startsWith("("));
    expect([...STUDIO_ROUTES].sort()).toEqual(dirs.sort());
  });
});
