// THE COMPOSE TURN'S HALVES - lifted out of app/api/script/route.ts (Phase 4 wave C, L37) so the
// script producer runs the SAME turn as a kernel job step: one prompt assembly, one door over the
// answer, two callers (the route, which still answers HTTP, and lib/producers/script.ts). Before
// the lift the whole assembly was inline in the route and nothing else could call it - which is
// why the script step never wrote a script (INVENTORY §2: "/api/script (turn compose) has no
// caller"). The route's header still explains every rule below; nothing here changed meaning.

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Conclusion } from "@/app/_phases/_shared/notebook/conclusions";
import { sourceOf } from "@/app/_phases/_shared/notebook/source";
import type { NotebookSource } from "@/lib/notebook/source";
import type { Notebook } from "@/lib/notebook/types";
import { asNotebook, cardsInScope, COMPOSE_TEMPLATE_RANGES, composeSchema, qualifyingEngines, templateBand, type ScopeRecord } from "@/lib/script/validate";

/** A prompt document that could not be read: the install is broken, nothing was reached. */
export class ComposePromptUnavailable extends Error {}

const cache = new Map<string, string>();
async function doc(...parts: string[]): Promise<string> {
  const at = path.join(process.cwd(), ...parts);
  const hit = cache.get(at);
  if (hit !== undefined) return hit;
  try {
    const text = await readFile(at, "utf8");
    cache.set(at, text);
    return text;
  } catch {
    throw new ComposePromptUnavailable(`The composition prompt could not be read from ${at}.`);
  }
}

/** The template's params, or null where the craft library measured none (free-form). */
async function templateParams(template: string): Promise<string | null> {
  try {
    return await readFile(path.join(process.cwd(), "knowledge", "templates", template, "steps", "01-script", "params.json"), "utf8");
  } catch {
    return null;
  }
}

/** The turn band, when the params state one as `structure.turns.{min,max}`. */
function turnBandOf(params: string | null): [number, number] | null {
  if (!params) return null;
  try {
    const t = (JSON.parse(params) as { structure?: { turns?: { min?: unknown; max?: unknown } } }).structure?.turns;
    return typeof t?.min === "number" && typeof t?.max === "number" ? [t.min, t.max] : null;
  } catch {
    return null;
  }
}

/** The sections of ENGINES.md for the engines this run may use, plus the choosing/arbitration
 *  section, matched on the engine's label ("## A · Reversal Chain"). */
function engineSections(md: string, labels: string[]): string {
  const want = labels.map((l) => l.toLowerCase());
  return md
    .split(/^(?=## (?!#))/m)
    .filter((s) => {
      const head = s.split("\n", 1)[0]!.toLowerCase();
      return head.startsWith("## ") && (head.includes("choosing") || want.some((l) => head.includes(l)));
    })
    .join("\n");
}

export type ComposeBody = {
  readonly notebook?: unknown;
  readonly template?: unknown;
  readonly targetS?: unknown;
  readonly conclusions?: unknown;
  readonly scope?: unknown;
  readonly engines?: unknown;
};

/** Everything the turn and its door need, once the request was admitted. */
export type ComposeRun = {
  readonly notebook: Notebook;
  readonly source: NotebookSource;
  readonly scope: ScopeRecord;
  readonly template: string;
  readonly targetS: number;
  readonly engines: string[] | undefined;
  readonly fits: ReturnType<typeof qualifyingEngines>;
  readonly kept: Set<string>;
  readonly takenOut: string[];
  readonly conclusions: Conclusion[];
  readonly schema: ReturnType<typeof composeSchema>;
};

/** The request refused before anything is read or paid, in the route's own sentences: `bad` is
 *  its 400; `refused` is its 200 "no engine fits" answer (said before any engine is paid). */
export type ComposeAdmit = { readonly kind: "run"; readonly run: ComposeRun } | { readonly kind: "bad"; readonly detail: string } | { readonly kind: "refused"; readonly why: string; readonly considered: { engine: string; fit: string }[] };

export function admitCompose(body: ComposeBody): ComposeAdmit {
  const notebook = asNotebook(body.notebook);
  if (!notebook) return { kind: "bad", detail: "No readable notebook was sent, so there is nothing to compose from." };
  const template = typeof body.template === "string" ? body.template : "";
  if (!Object.prototype.hasOwnProperty.call(COMPOSE_TEMPLATE_RANGES, template))
    return { kind: "bad", detail: `Compose writes explainers (${Object.keys(COMPOSE_TEMPLATE_RANGES).join(", ")}); "${template}" is not one of them.` };
  const targetS = typeof body.targetS === "number" ? body.targetS : NaN;
  const band = templateBand(template, targetS);
  if (!band) {
    const [lo, hi] = COMPOSE_TEMPLATE_RANGES[template]!;
    return { kind: "bad", detail: `A ${template} runs ${lo}–${hi}s; a target of ${String(body.targetS)}s is a clock no render can meet.` };
  }
  if (body.conclusions !== undefined && !Array.isArray(body.conclusions)) return { kind: "bad", detail: "`conclusions` must be a list." };
  const conclusions = (Array.isArray(body.conclusions) ? body.conclusions : []) as Conclusion[];
  if (!conclusions.every((c) => c && typeof c.id === "string" && typeof c.claim === "string" && Array.isArray(c.restsOn)))
    return { kind: "bad", detail: "A conclusion was sent without an id, a claim and what it rests on." };
  const scope = (body.scope && typeof body.scope === "object" ? body.scope : {}) as ScopeRecord;
  const engines = Array.isArray(body.engines) ? body.engines.filter((e): e is string => typeof e === "string") : undefined;
  const fits = qualifyingEngines(notebook, engines);
  if (!fits.length)
    return {
      kind: "refused",
      why: engines?.length
        ? `None of the engines asked for (${engines.join(", ")}) is rated good or better by this notebook. Not a video in those shapes yet.`
        : "No engine in this notebook's engineFit is rated good or better, so the material has no shape to compose into yet — it is a topic. Find the tension, then compose.",
      considered: notebook.engineFit.map((e) => ({ engine: e.engine, fit: e.fit })),
    };
  const source = sourceOf(notebook, { conclusions });
  const { kept, known } = cardsInScope(source, scope);
  return { kind: "run", run: { notebook, source, scope, template, targetS, engines, fits, kept, takenOut: [...known].filter((id) => !kept.has(id)), conclusions, schema: composeSchema(fits.map((e) => e.engine)) } };
}

/** The prompt (read from disk) and the turn band the door checks against. */
export async function composePrompt(run: ComposeRun): Promise<{ prompt: string; turnBand: [number, number] | null }> {
  const { notebook, template, targetS, fits, kept, takenOut, conclusions } = run;
  const band = templateBand(template, targetS);
  const fitIds = new Set(fits.map((e) => e.engine));
  const params = await templateParams(template);
  const turnBand = turnBandOf(params);
  const prompt = [
    await doc("pipeline", "SCRIPT-PROMPT.md"),
    "",
    "---",
    "",
    "# THE RUN",
    "",
    "Return ONE JSON object and nothing else — no prose before or after, no code fence.",
    "",
    "## FORMAT",
    JSON.stringify({ template, targetS, band, turnBand }),
    "",
    "## TEMPLATE PARAMS",
    params ?? "NOT STATED — the craft library has measured nothing for this template. The band is all you have.",
    "",
    "## ENGINES YOU MAY USE",
    JSON.stringify(fits),
    "",
    engineSections(await doc("knowledge", "ENGINES.md"), fits.map((e) => e.label)),
    "",
    "## ENGINES YOU MAY NOT USE",
    JSON.stringify(notebook.engineFit.filter((e) => !fitIds.has(e.engine)).map((e) => ({ engine: e.engine, fit: e.fit }))),
    "",
    // engineFit travels above, as the engines; `sources` is a bibliography no beat can cite.
    "## NOTEBOOK",
    JSON.stringify({ ...notebook, engineFit: undefined, sources: undefined }),
    "",
    "## CONCLUSIONS IN SCOPE",
    JSON.stringify(conclusions.filter((c) => kept.has(c.id))),
    "",
    "## CONCLUSIONS NOT TAKEN",
    JSON.stringify(conclusions.filter((c) => !kept.has(c.id)).map((c) => c.id)),
    "",
    "## CARDS YOU MAY CITE",
    JSON.stringify([...kept]),
    "",
    "## CARDS TAKEN OUT",
    JSON.stringify(takenOut),
  ].join("\n");
  return { prompt, turnBand };
}
