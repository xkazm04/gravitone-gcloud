// INTEGRATION PROBE for lib/imaging — the real vendors, no mocks.
//
// Run:  npx tsx pipeline/integration-imaging.mts
//       npx tsx pipeline/integration-imaging.mts --only leonardo
//       npx tsx pipeline/integration-imaging.mts --out ./somewhere
//
// Shaped like gate-regression.mts: OK/FAIL/SKIP per case, a count at the end,
// non-zero exit if anything failed. There is no test framework in this repo
// and this is not the place to introduce one.
//
// It costs real credits, so it generates the minimum that proves the path: one
// plate, one look at it, one edit of it. The checks are the ones that actually
// bite —
//   · did the image come back at the ASPECT we asked for (the silent 9:16 bug)
//   · did Leonardo's generation get DELETED afterwards (studio cleanliness)
//   · did recognition return JSON that SATISFIES the schema, not just prose
//   · does a refusal surface as `refused` rather than a generic failure
//
// Images are written to disk so a human can look at what the probe judged.

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

/* ── .env.local, by hand ──────────────────────────────────────────────────── */
// Next.js loads it; a standalone tsx process does not, and adding dotenv for
// eight lines would be the wrong trade.
function loadEnv(file = ".env.local") {
  const p = path.join(process.cwd(), file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv();

const { ImagingError } = await import("../lib/imaging/errors");
const { isConfigured, currentEnv } = await import("../lib/imaging/env");
const { planFor } = await import("../lib/imaging/router");
const { leonardoProvider } = await import("../lib/imaging/providers/leonardo");
const { googleProvider } = await import("../lib/imaging/providers/google");
const { qwenProvider } = await import("../lib/imaging/providers/qwen");
type ImageRef = import("../lib/imaging/types").ImageRef;

/* ── harness ──────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
const outDir = argv.includes("--out")
  ? argv[argv.indexOf("--out") + 1]
  : path.join(process.cwd(), "imaging-probe-out");

let passed = 0;
let failed = 0;
let skipped = 0;

/** A skip is thrown, not returned. Returning it once made every skipped case
 *  also print OK — a probe that reports a pass it never ran is worse than no
 *  probe, because it is the report you would trust. */
class Skipped extends Error {}
// The annotation is on the CONST, not just the arrow: TypeScript only narrows
// control flow through a never-returning call when the variable itself is
// explicitly typed. Without it, `if (!plate) skip(...)` fails to narrow `plate`.
const skip: (why: string) => never = (why) => {
  throw new Skipped(why);
};

async function check(name: string, fn: () => Promise<string | void>) {
  if (only && !name.startsWith(only)) return;
  try {
    const note = await fn();
    passed++;
    console.log(`OK    ${name}${note ? ` · ${note}` : ""}`);
  } catch (e) {
    if (e instanceof Skipped) {
      skipped++;
      console.log(`SKIP  ${name} · ${e.message}`);
      return;
    }
    failed++;
    console.log(
      `FAIL  ${name}\n         → ${e instanceof ImagingError ? `[${e.kind}] ${e.message}` : String(e)}`,
    );
  }
}

function save(name: string, img: ImageRef): string {
  mkdirSync(outDir, { recursive: true });
  const ext = img.mime.split("/")[1].replace("jpeg", "jpg");
  const p = path.join(outDir, `${name}.${ext}`);
  writeFileSync(p, Buffer.from(img.base64, "base64"));
  return p;
}

const kb = (img: ImageRef) => Math.round((img.base64.length * 3) / 4 / 1024);

/** Width/height of a PNG or JPEG, read from the header. Enough to prove the
 *  aspect contract held without pulling in an image library. */
function dimensions(buf: Buffer): { w: number; h: number } | null {
  if (buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG")
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/* ── the probe prompt (a trimmed pipeline/FRAMES-PROMPT.md) ───────────────── */

const STYLE =
  "Flat vector editorial infographic. Deep ink navy (#0B1B2B) ground; warm paper cream (#F5EFE0) objects; " +
  "bright cyan (#67E8F9) only on the arrows. Matte, hairline strokes, generous empty space. " +
  "No gradients, no shading, no photographic texture, no 3D.";
const SUBJECT =
  "Subject: a simple two-pan balance scale, centred; a tall plain office tower on the left pan, a single " +
  "oversized plain coin on the right pan, the tower's pan riding higher. Large simple shapes. " +
  "The bottom fifth of the frame is empty background.";
const NEGATIVE = "text, letters, numbers, watermark, logo, photorealistic, 3D render, gradient, clutter";

/** The recognition schema IS the probe rubric's first three checks — text
 *  leakage, palette obedience, flatness. Testing the integration and testing
 *  the use case are the same act. */
const PLATE_SCHEMA = {
  type: "object",
  required: ["hasText", "isFlat", "dominantColors"],
  properties: {
    hasText: { type: "boolean", description: "any letters, numbers or glyph-like marks" },
    isFlat: { type: "boolean", description: "flat vector, no gradients or 3D shading" },
    dominantColors: { type: "array", items: { type: "string" }, description: "plain colour names" },
  },
} as const;

/* ── run ──────────────────────────────────────────────────────────────────── */

console.log(`\nimaging integration probe · env=${currentEnv()}`);
console.log(
  `plan · generate=${planFor("generate").join(">")} · edit=${planFor("edit").join(">")} · recognize=${planFor("recognize").join(">")}`,
);
console.log(`keys · leonardo=${isConfigured("leonardo")} qwen=${isConfigured("qwen")} google=${isConfigured("google")}`);
console.log(`out  · ${outDir}\n`);

/** Shared across cases: the plate everything downstream looks at and edits. */
let plate: ImageRef | null = null;

await check("leonardo.generate", async () => {
  if (!isConfigured("leonardo")) skip("LEONARDO_API_KEY not set");

  const res = await leonardoProvider().generate!({
    prompt: `${STYLE}\n\n${SUBJECT}`,
    negativePrompt: NEGATIVE,
    aspect: "16:9",
    count: 1,
  });

  if (!res.images.length) throw new Error("no images returned");
  plate = res.images[0];
  const p = save("leonardo-plate", plate);

  const dim = dimensions(Buffer.from(plate.base64, "base64"));
  if (!dim) throw new Error("could not read image dimensions");
  const ratio = dim.w / dim.h;
  // The silent-9:16 guard. Tolerant of the vendor snapping to its own grid,
  // intolerant of it changing the RATIO.
  if (Math.abs(ratio - 16 / 9) > 0.02)
    throw new Error(`asked 16:9, got ${dim.w}x${dim.h} (ratio ${ratio.toFixed(3)})`);

  // The studio-cleanliness contract. A generation left behind is the failure
  // this check exists for, so it is an assertion and not a log line.
  if (res.provenance.cleanup !== "deleted")
    throw new Error(`generation was not deleted (cleanup=${res.provenance.cleanup}) — Leonardo studio will accumulate clutter`);

  return `${dim.w}x${dim.h}, ${kb(plate)}KB, deleted remotely, $${res.provenance.costUsd?.toFixed(4) ?? "?"} → ${p}`;
});

await check("qwen.recognize", async () => {
  if (!isConfigured("qwen")) skip("QWEN_API_KEY not set");
  if (!plate) skip("no plate to look at");

  const res = await qwenProvider().recognize!({
    image: plate,
    instruction:
      "You are grading a generated infographic plate against its brief. Answer only about what you can see.",
    schema: PLATE_SCHEMA as unknown as Record<string, unknown>,
  });

  if (res.json === undefined) throw new Error("a schema was sent but no json came back");
  const j = res.json as { hasText: boolean; isFlat: boolean; dominantColors: string[] };
  if (typeof j.hasText !== "boolean") throw new Error("hasText was not a boolean");
  if (!Array.isArray(j.dominantColors)) throw new Error("dominantColors was not an array");

  return `${res.provenance.model} · hasText=${j.hasText} isFlat=${j.isFlat} colors=[${j.dominantColors.slice(0, 4).join(", ")}]`;
});

await check("google.edit", async () => {
  if (!isConfigured("google")) skip("GOOGLE_AI_API_KEY not set");
  if (!plate) skip("no plate to edit");

  const res = await googleProvider().edit!({
    image: plate,
    instruction:
      "Keep the composition, the palette and the flat vector style exactly as they are. Change only the coin on the right pan into a simple flat cube.",
  });

  if (!res.images.length) throw new Error("no image returned");
  const p = save("google-edited", res.images[0]);
  return `${kb(res.images[0])}KB → ${p}`;
});

await check("google.generate", async () => {
  if (!isConfigured("google")) skip("GOOGLE_AI_API_KEY not set");

  const res = await googleProvider().generate!({
    prompt: `${STYLE}\n\n${SUBJECT}`,
    negativePrompt: NEGATIVE,
    aspect: "16:9",
    count: 1,
  });

  if (!res.images.length) throw new Error("no images returned");
  const img = res.images[0];
  const p = save("google-plate", img);
  const dim = dimensions(Buffer.from(img.base64, "base64"));
  if (dim) {
    const ratio = dim.w / dim.h;
    if (Math.abs(ratio - 16 / 9) > 0.02)
      throw new Error(`asked 16:9, got ${dim.w}x${dim.h} (ratio ${ratio.toFixed(3)})`);
  }
  return `${res.provenance.model} · ${dim ? `${dim.w}x${dim.h}, ` : ""}${kb(img)}KB → ${p}`;
});

await check("google.recognize", async () => {
  if (!isConfigured("google")) skip("GOOGLE_AI_API_KEY not set");
  if (!plate) skip("no plate to look at");

  const res = await googleProvider().recognize!({
    image: plate,
    instruction: "You are grading a generated infographic plate. Answer only about what you can see.",
    schema: PLATE_SCHEMA as unknown as Record<string, unknown>,
  });

  if (res.json === undefined) throw new Error("a schema was sent but no json came back");
  const j = res.json as { hasText: boolean };
  if (typeof j.hasText !== "boolean") throw new Error("hasText was not a boolean");
  return `${res.provenance.model} · ${JSON.stringify(res.json).slice(0, 90)}`;
});

/* ── style lock: the assertion /library actually rests on ─────────────────── */
//
// Everything above proves the plumbing. This proves the PRODUCT claim: that
// approving plates makes a later frame — of a different subject — come back in
// the same visual language.
//
// It is built as a controlled comparison rather than a vibe check, because
// "these look similar" is exactly the judgement a single generation will
// flatter. Three renders share one style block:
//
//   A   subject 1, unconditioned          the anchor
//   B   subject 2, conditioned on A       the claim
//   C   subject 2, unconditioned          the control
//
// A vision model then reads all three back through one schema, and we compare
// how much of A's palette survives into B versus into C. Without C the test
// could not tell style-lock from the style block already being specific enough
// on its own — which, given the block names three hex colours, is a genuinely
// plausible alternative explanation.

const LOCK_SCHEMA = {
  type: "object",
  required: ["dominantColors", "technique"],
  properties: {
    dominantColors: {
      type: "array",
      items: { type: "string" },
      description: "two to four plain lowercase colour names, most prominent first",
    },
    technique: { type: "string", description: "a short phrase naming the rendering technique" },
  },
} as const;

const SUBJECT_1 = "Three ascending bars on a ground line, with one arrow arcing over them.";
const SUBJECT_2 = "Two interlocking gears, the larger turning the smaller, on a plain ground.";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").trim();
/** Share of A's colours that also appear in X. Substring-tolerant, because a
 *  model may say "dark navy" where it earlier said "navy". */
function paletteOverlap(a: string[], x: string[]): number {
  if (!a.length) return 0;
  const xs = x.map(norm);
  const hit = a
    .map(norm)
    .filter((c) => xs.some((y) => y.includes(c) || c.includes(y))).length;
  return hit / a.length;
}

await check("style-lock.holds", async () => {
  if (!isConfigured("google")) skip("GOOGLE_AI_API_KEY not set");

  const google = googleProvider();
  const style = STYLE; // one block across all three renders

  const gen = async (subject: string, references?: ImageRef[]) =>
    references
      ? // Through the ROUTER on purpose: a referenced request must be moved off
        // Leonardo, and this is where that routing decision gets proved.
        (await import("../lib/imaging/router")).generate({
          prompt: `${style}\n\n${subject}`,
          negativePrompt: NEGATIVE,
          aspect: "16:9",
          count: 1,
          references,
        })
      : google.generate!({ prompt: `${style}\n\n${subject}`, negativePrompt: NEGATIVE, aspect: "16:9", count: 1 });

  const a = await gen(SUBJECT_1);
  if (!a.images.length) throw new Error("anchor produced no image");
  save("lock-a-anchor", a.images[0]);

  const b = await gen(SUBJECT_2, [a.images[0]]);
  if (!b.images.length) throw new Error("conditioned render produced no image");
  save("lock-b-conditioned", b.images[0]);
  if (b.provenance.provider !== "google")
    throw new Error(
      `a referenced request was routed to ${b.provenance.provider}, which cannot honour style references`,
    );

  const c = await gen(SUBJECT_2);
  if (!c.images.length) throw new Error("control produced no image");
  save("lock-c-control", c.images[0]);

  const read = async (img: ImageRef) => {
    const r = await google.recognize!({
      image: img,
      instruction: "Describe only what you can see of this image's visual style.",
      schema: LOCK_SCHEMA as unknown as Record<string, unknown>,
    });
    return r.json as { dominantColors: string[]; technique: string };
  };

  const [ra, rb, rc] = [await read(a.images[0]), await read(b.images[0]), await read(c.images[0])];
  const locked = paletteOverlap(ra.dominantColors, rb.dominantColors);
  const control = paletteOverlap(ra.dominantColors, rc.dominantColors);

  // The absolute bar is the assertion; the comparison is EVIDENCE, reported
  // either way. Failing on (locked > control) at n=1 would be a coin flip
  // dressed as a test — the block names three hex colours, so the control is
  // expected to score well too.
  const verdict =
    `anchor=[${ra.dominantColors.join("|")}] · locked ${(locked * 100).toFixed(0)}% ` +
    `vs control ${(control * 100).toFixed(0)}% · technique "${rb.technique}"` +
    (locked < control ? "  ⚠ conditioning scored WORSE than the control" : "");

  if (locked < 0.5)
    throw new Error(`style did not survive the subject change — only ${(locked * 100).toFixed(0)}% of the anchor palette held. ${verdict}`);

  return verdict;
});

/* ── summary ──────────────────────────────────────────────────────────────── */

console.log(
  `\n${passed} passed · ${failed} failed · ${skipped} skipped` +
    (failed ? "\n\nINTEGRATION FAILURE — see the FAIL lines above." : ""),
);
process.exit(failed ? 1 : 0);
