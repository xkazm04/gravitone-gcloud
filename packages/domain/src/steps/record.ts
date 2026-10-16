import { z } from "zod";

import { err, ok, type Result } from "../errors.ts";

// A STEP RECORD'S DOOR - the server half of v1's record registry
// (app/_phases/_shared/records/registry.ts `defineRecord` / `decodeRecord`), for the part
// records the kernel's `parts` module stores (STEPS-DESIGN §3).
//
// v1's four rules are kept as written, because each closed a measured data loss:
//   1. an absent `v` is v1, permanently (a record written before versioning existed);
//   2. a `v` above the def's is REFUSED as future - a newer build wrote it, and saving over it
//      would downgrade somebody's work;
//   3. each lower `v` walks up through the def's pure migrations, one step at a time;
//   4. the result passes the schema, or is refused as malformed - never cast.
// UPGRADED: a v1 migration could only throw; here a step returns a Result, so a step that CANNOT
// be made pure (frames v2 carried base64 plates; turning them into blob refs needs the blob
// store) refuses with the reason instead of pretending, and the importer (wave D) is the road.
// The schemas are LOOSE objects (v1's "a parser keeps fields it does not know, so a patch never
// drops a field a sibling writer added"): the door checks what readers rely on and carries the
// rest through.

export const STEP_OWNERS = ["research", "script", "frames", "motion", "score", "cut"] as const;
export type StepOwner = (typeof STEP_OWNERS)[number];

/** One pure vN -> vN+1 step over the stored object. */
export type StepMigration = (raw: Readonly<Record<string, unknown>>) => Result<Record<string, unknown>>;

export type StepRecordDef<K extends string, S extends z.ZodType> = {
  readonly key: K;
  readonly owner: StepOwner;
  /** The current shape version; every write through the door stamps it. */
  readonly version: number;
  readonly schema: S;
  /** `migrate[n]` takes a vN object to vN+1; present for 1..version-1. */
  readonly migrate: Readonly<Record<number, StepMigration>>;
};

/** Declare a record. A def that cannot be honoured (a missing migration) is a programming error. */
export function defineStepRecord<const K extends string, S extends z.ZodType>(spec: {
  key: K;
  owner: StepOwner;
  version: number;
  schema: S;
  migrate?: Readonly<Record<number, StepMigration>>;
}): StepRecordDef<K, S> {
  const migrate = spec.migrate ?? {};
  if (!Number.isInteger(spec.version) || spec.version < 1) throw new TypeError(`step record ${spec.key}: version ${spec.version} is not a positive integer`);
  for (let n = 1; n < spec.version; n++) if (migrate[n] === undefined) throw new TypeError(`step record ${spec.key}: v${spec.version} needs a migration from v${n}`);
  return { key: spec.key, owner: spec.owner, version: spec.version, schema: spec.schema, migrate };
}

const plain = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** An optional key is absent, never present-as-undefined (the door's rule; canonical JSON
 *  refuses undefined). On a CLONE: a loose schema passes unknown fields through by reference,
 *  and the caller's objects (a module constant, a notebook) must not be edited by a read. */
function dropUndefined<T>(input: T): T {
  const x = structuredClone(input);
  strip(x);
  return x;
}

function strip(x: unknown): void {
  if (Array.isArray(x)) {
    for (const item of x) strip(item);
  } else if (plain(x)) {
    for (const k of Object.keys(x)) {
      if (x[k] === undefined) delete x[k];
      else strip(x[k]);
    }
  }
}

/** The detail every refusal carries, so a reader can tell "newer build" from "unreadable". */
export type Refusal = "future" | "malformed";

/** Stored data -> the record at the def's version. `refused` = future, `invalid` = malformed. */
export function decodeStep<K extends string, S extends z.ZodType>(def: StepRecordDef<K, S>, stored: unknown): Result<z.output<S>> {
  if (!plain(stored)) return err("invalid", `${def.key} is stored as ${Array.isArray(stored) ? "a list" : typeof stored}, not an object`, { detail: "malformed" });
  const v = stored["v"] ?? 1;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) return err("invalid", `${def.key}.v is ${String(v)}`, { detail: "malformed" });
  if (v > def.version) return err("refused", `${def.key} was written as v${v} by a newer build; this build reads up to v${def.version}`, { detail: "future" });
  let cur: Record<string, unknown> = { ...stored };
  for (let n = v; n < def.version; n++) {
    const step = def.migrate[n];
    if (step === undefined) return err("internal", `${def.key}: no migration from v${n}`);
    const next = step(cur);
    if (!next.ok) return err("invalid", `${def.key}: v${n} -> v${n + 1}: ${next.error.message}`, { detail: "malformed" });
    cur = { ...next.value, v: n + 1 };
  }
  // The schema's own parse, not parseAt: parseAt's `Parsed` flattens a loose object's index
  // signature over its named fields, and these records are loose on purpose (see the header).
  const parsed = def.schema.safeParse({ ...cur, v: def.version });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue === undefined || issue.path.length === 0 ? "(root)" : issue.path.map(String).join(".");
    return err("invalid", `${def.key}: ${path}: ${issue?.message ?? "invalid input"}`, { detail: "malformed" });
  }
  return ok(dropUndefined(parsed.data));
}

/** A record on its way to the store: through the same door, stamped with the current version. */
export function encodeStep<K extends string, S extends z.ZodType>(def: StepRecordDef<K, S>, data: unknown): Result<z.output<S>> {
  if (!plain(data)) return err("invalid", `${def.key} must be an object`, { detail: "malformed" });
  const v = data["v"];
  if (v !== undefined && v !== def.version) return err("invalid", `${def.key} is written at v${def.version}, not v${String(v)}`, { detail: "malformed" });
  return decodeStep(def, { ...data, v: def.version });
}

/* ── shapes several records share ─────────────────────────────────────────── */

export const versionField = { v: z.number().int().positive() };
export const text = z.string();
export const textOrNull = z.string().nullable();
/** A model turn's receipt as v1 stored it (provider, model, cost): carried, never interpreted here. */
export const engineField = z.looseObject({}).nullable();
