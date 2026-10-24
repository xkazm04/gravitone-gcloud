// THE EXPLAINER'S CUT SHOWS THE CARDS A STRIP-CARDS JOB LANDED (spark explainer-real-article-strips
// WP-B, acceptance 5). A live strip-cards job on the fakes (./strip-cards-fakes.ts: a seat that
// writes a page and a 30-word caption, a capture that writes a flat grey poster.png per card) lands
// three drawn cards; the explainer's export-animatic job then cuts them with ffmpeg on this box ($0,
// no vendor) - the measurement tests/next-server/cut-export-explainer.test.ts made for WP5: the
// frame at each card's midpoint carries THAT card's poster's luma. No ffmpeg on PATH: the measured
// case skips locally and fails under CI.

import { disposeRoot, ROOT } from "./producer-strips-harness.ts";
import { cardCapture, cardSeat } from "./strip-cards-fakes.ts";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const DIR = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const p = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "gt-strip-cards-cut-"));
  process.env["SOUND_STORE_DIR"] = p.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = p.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = p.join(dir, "k.sqlite");
  process.env["PUBLISH_EXPORTS_DIR"] = p.join(dir, "exports");
  process.env["LOCAL_BINARIES"] = "on";
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  process.env["SPEND_STORE"] = "memory";
  return dir;
});

import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import { ok, type Result } from "@gt/domain/errors";
import { blobStore } from "@gt/kernel/blob";
import { runJob } from "@gt/kernel/job-run";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPart, writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { spokenS } from "../../lib/cut/explainer.ts";
import { cutProducer, cutUnits } from "../../lib/producers/cut.ts";
import { blobRootOf, driveStep, effectsOf, launchPartAct, partActReceipt, type UnitsFn } from "../../lib/producers/research.ts";
import { stripCardsProducer, stripCardsUnits } from "../../lib/producers/stripCards.ts";

const OP = { kind: "operator", id: "op" } as const;
const NOW = Date.parse("2026-10-24T09:00:00Z");
const ID = "ex-cut";

function onPath(bin: string): boolean {
  try {
    execFileSync(bin, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const HAVE_FFMPEG = onPath("ffmpeg");
if (!HAVE_FFMPEG && process.env["CI"]) throw new Error("CI is set and ffmpeg is not on PATH: the strip-cards cut may not skip here");

let kernel: Kernel | undefined;
afterAll(() => {
  kernel?.close();
  disposeRoot();
  rmSync(DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});
function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

const SECTIONS = [
  { id: "intro", heading: "Why scarcity", body: "Bitcoin is scarce by design." },
  { id: "supply", heading: "How supply falls", body: "Every four years the reward halves." },
  { id: "price", heading: "What price needs", body: "Scarcity alone does not make a price." },
];
const GREY: Record<string, number> = { "card-intro": 200, "card-supply": 120, "card-price": 60 };

/** The frame at `atS`, averaged to one grey pixel (cut-export-explainer.test.ts `lumaAt`). */
const lumaAt = (file: string, atS: number): number =>
  execFileSync("ffmpeg", ["-v", "error", "-ss", String(atS), "-i", file, "-vf", "scale=1:1:flags=area,format=gray", "-frames:v", "1", "-f", "rawvideo", "pipe:1"])[0] ?? -1;

async function act(s: Store, partId: string, actName: string, units: UnitsFn): Promise<string> {
  const ref = { projectId: ID, partId, act: actName };
  const r = must(partActReceipt(s, ref, units, { mode: "live", now: NOW }));
  const l = must(launchPartAct(s, ref, units, { mode: "live", now: NOW, token: r.token, actor: OP, dryOnly: false }));
  if (l.kind !== "launched") throw new Error("stale");
  return l.jobId;
}

describe.skipIf(!HAVE_FFMPEG)("the explainer's cut over landed strip cards", { timeout: 180_000 }, () => {
  it("shows each card's poster for its line's span", async () => {
    // The export reads plates from the process store's blob root: the store IS that one (a temp file).
    kernel = must(openKernel(path.join(DIR, "k.sqlite")));
    const store = kernel.store;
    must(compose(store, { recipe: "explainer", title: "Why bitcoin" }, OP, { id: ID }));
    const seed = (part: string, record: Record<string, unknown>) =>
      must(writePart(store, { projectId: ID, partId: `${ID}/${part}`, baseRev: "current", act: "land", op: { seed: part }, label: "seed", by: { kind: "machine", id: "seed" }, next: () => ok({ [part]: record }) }));
    seed("article", { title: "Why bitcoin", sections: SECTIONS });
    seed("voice", { text: {}, takes: {}, byLine: {} });

    const strips = await act(store, `${ID}/strips`, "draw-strips", stripCardsUnits);
    const drawn = must(await runJob(effectsOf(store), stripCardsProducer("seat.text", {}, { seat: cardSeat(() => 30).seat, capture: cardCapture((c) => GREY[c] ?? 0).capture }), strips, { dryOnly: false }));
    expect(drawn.outcome).toBe("done");
    const cards = (must(readPart(store, { projectId: ID, partId: `${ID}/strips` })).records.get("strips")?.["cards"] ?? []) as { id: string; state: string; caption: string; blob?: BlobRef }[];
    expect(cards.map((c) => [c.id, c.state])).toEqual(Object.keys(GREY).map((id) => [id, "drawn"]));

    const cut = await act(store, `${ID}/cut`, "export-animatic", cutUnits);
    const r = must(await driveStep((lane, h) => cutProducer(lane, h), store, cut, { dryOnly: false }));
    expect(r.job?.error?.message).toBeUndefined();
    expect(r.outcome).toBe("done");
    const [e] = (must(readPart(store, { projectId: ID, partId: `${ID}/cut` })).records.get("cut")?.["exports"] ?? []) as { blob: BlobRef; unreachable: unknown[] }[];
    expect(e?.unreachable).toEqual([]);
    const blobs = blobStore(blobRootOf(store));
    const mp4 = path.join(ROOT, "strip-cards-cut.mp4");
    writeFileSync(mp4, must(await blobs.read(e!.blob)));

    // Each card holds its caption's spoken length (no take: 30 words at 2.5 a second = 12 s).
    let at = 0;
    const seen: Record<string, [number, number]> = {};
    for (const c of cards) {
      const durS = spokenS(c.caption);
      const poster = path.join(ROOT, `${c.id}-poster.png`);
      writeFileSync(poster, must(await blobs.read(c.blob!)));
      seen[c.id] = [lumaAt(mp4, at + durS / 2), lumaAt(poster, 0)];
      at += durS;
    }
    console.log(`[strip-cards cut] luma at card midpoints vs the card's own poster ${JSON.stringify(seen)}`);
    for (const [frame, own] of Object.values(seen)) {
      expect(frame).toBeGreaterThan(16);
      // Within 20 of its own poster (the encode's range conversion moves a flat grey ~15); the
      // posters are >= 60 apart, so the frame is this card's, not a neighbour's.
      expect(Math.abs(frame - own)).toBeLessThanOrEqual(20);
    }
  });
});
