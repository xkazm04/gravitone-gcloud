import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { verify } from "../src/events.ts";
import { openKernel } from "../src/kernel.ts";
import { readStyle } from "../src/styles/driver.ts";
import { exportStylesJson } from "../src/styles/export.ts";
import { recordForgeEvidenceIn } from "../src/styles/writers.ts";
import { findPython, must, scratch } from "./helpers.ts";

// spec/styles.json: the style store's Python door (py/styles.py, acquire.py's writer) against the
// Node kernel, scenario by scenario on one store FILE each - the two languages write the same
// rows and the same chained events, refuse the same overwrites, and the export a Python write
// triggers is Node's exporter (one implementation, so it cannot drift from itself).

const here = path.dirname(fileURLToPath(import.meta.url));
const specFile = path.join(here, "..", "spec", "styles.json");
const pySpec = path.join(here, "..", "py", "styles_spec.py");

const stepSchema = z.object({
  by: z.enum(["node", "py"]),
  op: z.enum(["put", "read", "forge", "events", "export"]),
  force: z.boolean().optional(),
  recipe: z.string().optional(),
  observables: z.record(z.string(), z.string()).optional(),
  kept: z.array(z.string()).optional(),
  expect: z.unknown(),
});
const specSchema = z.object({ entry: z.looseObject({ id: z.string() }), scenarios: z.array(z.object({ name: z.string(), steps: z.array(stepSchema) })) });
const spec = must(parseJsonAt(specFile, specSchema, readFileSync(specFile, "utf8")));
const entryId = must(parseAt("spec entry", z.object({ id: z.string() }), spec.entry)).id;

const python = findPython();
if (python === undefined) console.warn("[styles.spec] SKIPPED: no Python 3 on PATH; the Python half of the style door did not run");

const dir = scratch("styles-py");
afterAll(() => dir.dispose());
const pyOut = z.union([z.object({ result: z.string() }), z.object({ refused: z.string() })]);
const loose = z.looseObject({});

function py(args: readonly string[]): z.output<typeof pyOut> {
  const r = spawnSync(python ?? "python", ["-I", pySpec, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`styles_spec.py ${args[0] ?? ""} exited ${String(r.status)}: ${r.stderr}`);
  return must(parseJsonAt("styles_spec.py", pyOut, r.stdout.trim()));
}

describe.skipIf(python === undefined)("spec/styles.json: the Python door against the Node kernel", () => {
  spec.scenarios.forEach((sc, n) => {
    it(sc.name, () => {
      const file = path.join(dir.dir, `s${n}.sqlite`);
      const k = must(openKernel(file));
      try {
        for (const step of sc.steps) {
          const id = entryId;
          if (step.op === "put") {
            const entry = { ...spec.entry, ...(step.recipe === undefined ? {} : { recipe: step.recipe }), ...(step.observables === undefined ? {} : { observables: step.observables }) };
            const out = py(["put", file, JSON.stringify(entry), step.force === true ? "1" : "0"]);
            const want = must(parseAt("expect", pyOut, step.expect));
            if ("result" in want) expect(out).toEqual(want);
            else expect("refused" in out ? out.refused : `wrote: ${JSON.stringify(out)}`).toContain(want.refused);
          } else if (step.op === "read") {
            const row = must(readStyle(k.store, id));
            expect({ ...row.style, rev: row.rev }).toMatchObject(must(parseAt("expect", loose, step.expect)));
          } else if (step.op === "forge") {
            const rows = (step.kept ?? []).map((scene) => ({ style: id, scene, mechanism: "ref-early", verdict: "keep" as const }));
            const r = must(k.store.tx((t) => recordForgeEvidenceIn(t, "run-spec", t.at, rows, { kind: "machine", id: "spec" })));
            expect(r).toMatchObject(must(parseAt("expect", loose, step.expect)));
          } else if (step.op === "events") {
            const types = must(k.store.read((r) => r.all("SELECT type FROM events WHERE subject_kind = 'style' ORDER BY seq"))).map((e) => e["type"]);
            expect(types).toEqual(step.expect);
          } else {
            const out = path.join(dir.dir, `s${n}-styles.json`);
            expect(py(["export", file, out])).toEqual({ result: "exported" });
            expect(readFileSync(out, "utf8")).toBe(must(exportStylesJson(k.store)));
          }
        }
        expect(must(verify(k.store)).state).toBe("intact");
      } finally {
        k.close();
      }
    }, 30_000);
  });
});
