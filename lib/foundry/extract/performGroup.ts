// PERFORM A GROUP — partition the readable sources into styles. With grouping
// "none" each readable source is its own style and no reasoning turn is made;
// otherwise the reasoning model proposes the grouping and the partition is the
// fallback when its answer is unusable.

import type { EngineIO } from "./engine";
import { log } from "./journal";
import { msg, setStage } from "./performCommon";
import { synthesisPrompt } from "./prompts";
import { SYNTHESIS_SCHEMA, deriveFamily, fallbackStyle, partition, slugify, validateSynthesis } from "./vocabulary";
import { book } from "./spend";
import { OBSERVABLE_FIELDS, type ExtractManifest, type ExtractedStyle, type Observables, type Readback } from "./types";

export async function performGroup(m: ExtractManifest, io: EngineIO): Promise<void> {
  setStage(m, "grouping");
  const readable = m.sources.filter((s) => s.readback) as { id: string; readback: Readback; name: string }[];
  if (m.options.grouping === "none") {
    // NO GROUPING: one style per readable source, entry written by the
    // vision model at read time. No reasoning turn at all.
    const ids = new Set<string>();
    m.styles = readable.map((s) => {
      let id = slugify(s.readback.style_name || s.readback.render_mode || "style") || "style";
      if (ids.has(id)) id = `${id}-${s.id}`;
      while (ids.has(id)) id = `${id}-x`;
      ids.add(id);
      const obs = {} as Observables;
      for (const f of OBSERVABLE_FIELDS) obs[f] = s.readback[f];
      const fb = fallbackStyle(0, [{ id: s.id, readback: s.readback }]);
      const recipe = s.readback.recipe && s.readback.recipe.trim().length >= 40 ? s.readback.recipe.trim() : fb.recipe;
      const negative = s.readback.negative?.trim() || fb.negative;
      return {
        id,
        name: s.readback.style_name?.trim() || fb.name,
        family: deriveFamily(obs),
        members: [s.id],
        observables: obs,
        recipe,
        negative: /\btext\b/i.test(negative) ? negative : `${negative}, text, watermark`,
        recipe_history: [recipe],
        grouped_by: "singleton" as const,
        replicas: [],
        transfers: [],
      };
    });
    log(m, io, `no grouping: ${m.styles.length} singleton style(s), entries written by the eye`);
    return;
  }
  const groups = partition(readable.map((s) => s.readback));
  const hint = groups.map((g) => g.map((i) => readable[i].id));
  let styles: Omit<ExtractedStyle, "replicas" | "transfers">[] | null = null;
  try {
    const r = await io.reason(synthesisPrompt(readable, hint), SYNTHESIS_SCHEMA);
    book(m, io, "group", "reason", r);
    m.engines.reasoner = r.model;
    const v = validateSynthesis(r.value, readable.map((s) => s.id));
    if ("styles" in v) {
      styles = v.styles;
      log(m, io, `grouped by the engine into ${styles.length} style(s): ${styles.map((s) => `${s.id} (${s.members.length})`).join(", ")}`);
    } else {
      log(m, io, `the engine's grouping was unusable (${v.error}); the partition stands`);
    }
  } catch (e) {
    log(m, io, `synthesis failed (${msg(e)}); the partition stands`);
  }
  if (!styles) {
    styles = groups.map((g, i) => fallbackStyle(i, g.map((k) => readable[k])));
    log(m, io, `partitioned into ${styles.length} style(s)`);
  }
  m.styles = styles.map((s) => ({ ...s, replicas: [], transfers: [] }));
}
