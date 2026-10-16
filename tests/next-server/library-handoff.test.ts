import { rmSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";

// THE PROCESS'S KERNEL IS A TEMP FILE, set before anything imports the store: styleHandoff reads
// the app's own kernel (lib/kernelStore.ts), and this test must never open foundry-out/.
const root = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-l53-handoff-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store.sqlite");
  return dir;
});

vi.mock("server-only", () => ({}));

import { PRESETS } from "@gt/catalog/presets";
import { draftFromV1Theme, importV1ThemeIn } from "@gt/kernel/styles/v1theme";

import { styleHandoff } from "../../app/(studio)/library/_port/handoff.ts";
import { closeKernel, kernel } from "../../lib/kernelStore.ts";

// v1's `/library?style=<id>` handoff (L53): a v1 theme id opens the Style it was imported as, a
// store id opens itself, and an id neither names is passed through for the atelier to refuse.

afterAll(() => {
  closeKernel();
  rmSync(root, { recursive: true, force: true });
});

describe("styleHandoff", () => {
  it("resolves a v1 theme id to its imported Style, keeps a store id, passes an unknown one through", () => {
    const k = kernel();
    if (!k.ok) throw k.error;
    expect(k.value.store.location).toBe(process.env["GRAVITONE_STORE_PATH"]);
    const block = PRESETS[0]?.block;
    if (block === undefined) throw new Error("no preset");
    const d = draftFromV1Theme({ id: "th-ink", name: "Ink Harbor", origin: "preset", block, elements: [], createdAt: 0, updatedAt: 0, proofs: [] }, () => undefined);
    if (!d.ok) throw d.error;
    const w = k.value.store.tx((t) => importV1ThemeIn(t, d.value, { kind: "operator", id: "op" }));
    if (!w.ok) throw w.error;
    expect(styleHandoff("th-ink")).toBe("v1-theme:th-ink");
    expect(styleHandoff("v1-theme:th-ink")).toBe("v1-theme:th-ink");
    expect(styleHandoff("th-never")).toBe("th-never");
  });
});
